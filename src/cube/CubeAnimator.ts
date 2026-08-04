/**
 * Rubik-style slice scrambles — multi-layer / multi-axis simultaneous turns.
 * Blocks decouple slightly mid-spin, then settle to exact lattice slots (no pop).
 */
import * as THREE from 'three';
import type { CubeManager } from './CubeManager';
import { bus } from '../core/EventBus';

export type RotationAxis = 'x' | 'y' | 'z';

export interface CubeAnimatorConfig {
  telegraphMin: number;
  telegraphMax: number;
  spinMin: number;
  spinMax: number;
  cooldownMin: number;
  cooldownMax: number;
  minLevel: number;
  reducedMotion: boolean;
  /** Peak outward expand (kept low — high values cause visible settle artifacts) */
  expandPeak: number;
}

const DEFAULT_CFG: CubeAnimatorConfig = {
  telegraphMin: 0.4,
  telegraphMax: 0.75,
  spinMin: 0.6,
  spinMax: 1.0,
  cooldownMin: 5.2,
  cooldownMax: 12,
  minLevel: 1,
  reducedMotion: false,
  expandPeak: 0.06,
};

type Phase = 'idle' | 'telegraph' | 'spin' | 'cooldown';

interface SliceMove {
  axis: RotationAxis;
  layer: number;
  sign: 1 | -1;
}

interface SliceAnimState {
  move: SliceMove;
  ids: number[];
  startPos: THREE.Vector3[];
  endPos: THREE.Vector3[];
  scales: THREE.Vector3[];
}

export class CubeAnimator {
  readonly group = new THREE.Group();
  private cube: CubeManager | null = null;
  private cfg: CubeAnimatorConfig;
  private phase: Phase = 'idle';
  private timer = 0;
  private phaseDuration = 1;
  private levelId = 1;
  private damagePressure = 0;
  private enabled = true;

  private active: SliceAnimState[] = [];
  private pendingMoves: SliceMove[] = [];

  private planePool: THREE.Mesh[] = [];
  private axisHelper: THREE.Group;
  private _axis = new THREE.Vector3();
  private _pos = new THREE.Vector3();
  private _end = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _claimedIds = new Set<number>();

  constructor(cfg: Partial<CubeAnimatorConfig> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg };

    for (let i = 0; i < 4; i++) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x00f0ff : 0xff00aa,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      plane.visible = false;
      this.planePool.push(plane);
      this.group.add(plane);
    }

    this.axisHelper = new THREE.Group();
    this.axisHelper.visible = false;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.axisHelper.add(tube);
    this.group.add(this.axisHelper);
  }

  bind(cube: CubeManager): void {
    this.cube = cube;
  }

  setLevel(levelId: number): void {
    this.levelId = levelId;
    this.reset();
  }

  setReducedMotion(on: boolean): void {
    this.cfg.reducedMotion = on;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Force faster scrambles (menu demo). */
  setDemoMode(on: boolean): void {
    if (on) {
      this.cfg.cooldownMin = 2.4;
      this.cfg.cooldownMax = 4.8;
      this.cfg.telegraphMin = 0.35;
      this.cfg.telegraphMax = 0.55;
      this.cfg.spinMin = 0.55;
      this.cfg.spinMax = 0.85;
    } else {
      this.cfg = { ...DEFAULT_CFG };
    }
  }

  beginCinematicBurst(): void {
    this.setDemoMode(true);
    this.damagePressure = 4;
    this.enabled = true;
    if (this.phase === 'idle' || this.phase === 'cooldown') {
      this.timer = this.phaseDuration;
    }
  }

  endCinematicBurst(): void {
    this.setDemoMode(false);
    this.damagePressure = 0;
  }

  forceQuickShift(_intensity = 1): void {
    this.damagePressure = Math.min(4.5, this.damagePressure + 2 * Math.max(0.5, _intensity));
    if (this.phase === 'cooldown' || this.phase === 'idle') {
      this.planConcurrentMoves();
      this.beginTelegraph();
    }
  }

  notifyDamage(amount: number): void {
    this.damagePressure = Math.min(4.5, this.damagePressure + amount * 0.0045);
  }

  get isRotating(): boolean {
    return this.phase === 'telegraph' || this.phase === 'spin';
  }

  update(dt: number): void {
    if (!this.cube || !this.enabled) return;
    if (this.levelId < this.cfg.minLevel) return;
    if (this.cube.aliveBlocks <= 0) return;

    this.damagePressure = Math.max(0, this.damagePressure - dt * 0.12);
    this.timer += dt;

    switch (this.phase) {
      case 'idle':
        this.enterCooldown();
        break;
      case 'cooldown':
        if (this.timer >= this.phaseDuration) {
          this.planConcurrentMoves();
          this.beginTelegraph();
        }
        break;
      case 'telegraph':
        this.updateTelegraph();
        if (this.timer >= this.phaseDuration) this.beginSpin();
        break;
      case 'spin':
        this.updateSpin();
        if (this.timer >= this.phaseDuration) this.completeSpin();
        break;
    }
  }

  private sizeFactor(): number {
    const n = Math.max(4, this.cube?.size ?? 6);
    return Math.max(0.48, 1 - (n - 6) * 0.038);
  }

  private enterCooldown(): void {
    this.phase = 'cooldown';
    this.timer = 0;
    let gap =
      this.cfg.cooldownMin +
      Math.random() * (this.cfg.cooldownMax - this.cfg.cooldownMin);
    gap *= this.sizeFactor();
    gap *= Math.max(0.5, 1 - (this.levelId - 1) * 0.018);
    const urgency = 1 + this.damagePressure * 0.6;
    this.phaseDuration = Math.max(1.4, gap / urgency);
  }

  private planConcurrentMoves(): void {
    this.pendingMoves = [];
    if (!this.cube) return;
    const n = Math.max(1, this.cube.size);

    let count = 1;
    if (Math.random() < 0.45 + this.damagePressure * 0.1) count++;
    if (n >= 8 && Math.random() < 0.4 + this.damagePressure * 0.08) count++;
    if (n >= 12 && Math.random() < 0.32 + this.damagePressure * 0.07) count++;
    if (n >= 16 && Math.random() < 0.25 + this.damagePressure * 0.06) count++;
    count = Math.min(3, count);

    const used = new Set<string>();
    for (let i = 0; i < count * 4 && this.pendingMoves.length < count; i++) {
      const move = this.pickRandomSlice();
      if (!move) continue;
      const key = `${move.axis}:${move.layer}`;
      if (used.has(key)) continue;
      if (
        this.pendingMoves.some((m) => m.axis === move.axis) &&
        this.pendingMoves.length < count &&
        Math.random() < 0.55
      ) {
        continue;
      }
      used.add(key);
      this.pendingMoves.push(move);
    }
    if (this.pendingMoves.length === 0) {
      this.pendingMoves.push({ axis: 'y', layer: Math.floor(n / 2), sign: 1 });
    }
  }

  private pickRandomSlice(): SliceMove | null {
    if (!this.cube) return null;
    const axes: RotationAxis[] = ['x', 'y', 'z'];
    for (let a = axes.length - 1; a > 0; a--) {
      const j = Math.floor(Math.random() * (a + 1));
      [axes[a], axes[j]] = [axes[j], axes[a]];
    }
    for (const axis of axes) {
      const layers = this.cube.populatedLayers(axis);
      if (!layers.length) continue;
      const layer = layers[Math.floor(Math.random() * layers.length)];
      return { axis, layer, sign: Math.random() < 0.5 ? 1 : -1 };
    }
    return null;
  }

  private beginTelegraph(): void {
    if (!this.cube || !this.pendingMoves.length) {
      this.enterCooldown();
      return;
    }
    this.phase = 'telegraph';
    this.timer = 0;
    const tScale = Math.max(0.5, 1 - this.damagePressure * 0.12);
    this.phaseDuration =
      (this.cfg.telegraphMin +
        Math.random() * (this.cfg.telegraphMax - this.cfg.telegraphMin)) *
      tScale;

    this.hidePlanes();
    this.pendingMoves.forEach((m, i) => this.layoutSliceVisual(m, i));
    this.axisHelper.visible = true;

    bus.emit('cube-rotation-telegraph', {
      moves: this.pendingMoves,
      duration: this.phaseDuration,
    });
  }

  private layoutSliceVisual(move: SliceMove, index: number): void {
    if (!this.cube) return;
    const plane = this.planePool[index];
    if (!plane) return;
    const n = this.cube.size;
    const bs = this.cube.blockSize;
    const half = (n * bs) / 2;
    const extent = n * bs * 1.08;
    const layerCenter = (move.layer + 0.5) * bs - half;

    plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(extent, extent);
    plane.position.set(0, 0, 0);
    plane.rotation.set(0, 0, 0);
    plane.visible = true;

    if (move.axis === 'x') {
      plane.position.x = layerCenter;
      plane.rotation.y = Math.PI / 2;
    } else if (move.axis === 'y') {
      plane.position.y = layerCenter;
      plane.rotation.x = -Math.PI / 2;
    } else {
      plane.position.z = layerCenter;
    }
  }

  private updateTelegraph(): void {
    const t = this.timer / Math.max(1e-4, this.phaseDuration);
    for (const plane of this.planePool) {
      if (!plane.visible) continue;
      const pulse = 0.1 + Math.sin(this.timer * 16) * 0.08 + t * 0.22;
      (plane.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    this.axisHelper.rotation.y += 0.05;
  }

  private beginSpin(): void {
    if (!this.cube || !this.pendingMoves.length) {
      this.enterCooldown();
      return;
    }
    this.phase = 'spin';
    this.timer = 0;
    const sScale = Math.max(0.55, 1 - this.damagePressure * 0.1);
    this.phaseDuration =
      (this.cfg.spinMin + Math.random() * (this.cfg.spinMax - this.cfg.spinMin)) *
      sScale;

    this.active = [];
    this._claimedIds.clear();
    for (const move of this.pendingMoves) {
      const rawIds = this.cube.collectSliceIds(move.axis, move.layer);
      // Exclusive ownership — no block in two concurrent slices
      const ids = rawIds.filter((id) => {
        if (this._claimedIds.has(id)) return false;
        this._claimedIds.add(id);
        return true;
      });
      const startPos: THREE.Vector3[] = [];
      const endPos: THREE.Vector3[] = [];
      const scales: THREE.Vector3[] = [];
      for (const id of ids) {
        const start = this.cube.getInstanceWorldPos(id, new THREE.Vector3());
        startPos.push(start);
        scales.push(this.cube.getInstanceScale(id, new THREE.Vector3()));
        const L = this.cube.worldToLattice(start);
        const R = this.cube.rotateLatticeCoord(L.ix, L.iy, L.iz, move.axis, move.sign);
        endPos.push(this.cube.latticeToWorld(R.ix, R.iy, R.iz, new THREE.Vector3()));
      }
      if (ids.length) this.active.push({ move, ids, startPos, endPos, scales });
    }

    if (this.cfg.reducedMotion || !this.active.length) {
      for (const a of this.active) {
        this.cube.commitSliceFromStarts(
          a.ids,
          a.startPos,
          a.scales,
          a.move.axis,
          a.move.sign
        );
      }
      this.finishVisuals();
      bus.emit('cube-rotation-complete', { moves: this.pendingMoves, instant: true });
      this.pendingMoves = [];
      this.active = [];
      this.enterCooldown();
      return;
    }

    bus.emit('cube-rotation-start', {
      moves: this.pendingMoves,
      duration: this.phaseDuration,
      concurrent: this.active.length,
    });
  }

  private axisVector(axis: RotationAxis, out: THREE.Vector3): THREE.Vector3 {
    if (axis === 'x') return out.set(1, 0, 0);
    if (axis === 'y') return out.set(0, 1, 0);
    return out.set(0, 0, 1);
  }

  private updateSpin(): void {
    if (!this.cube) return;
    const t = Math.min(1, this.timer / Math.max(1e-4, this.phaseDuration));
    // Smoothstep rotation 0 → 90°
    const e = t * t * (3 - 2 * t);
    // Expand peaks mid-spin and returns EXACTLY to 0 at t=0 and t=1 (sin envelope)
    const expandWave = Math.sin(t * Math.PI);
    const expand = 1 + expandWave * this.cfg.expandPeak;
    // Final 20%: hard blend to exact lattice end (kills any float / expand residual)
    const settleT = t < 0.8 ? 0 : (t - 0.8) / 0.2;
    const settleE = settleT * settleT * (3 - 2 * settleT);

    for (const slice of this.active) {
      const ang = e * (slice.move.sign * (Math.PI / 2));
      this.axisVector(slice.move.axis, this._axis);
      this._q.setFromAxisAngle(this._axis, ang);

      for (let i = 0; i < slice.ids.length; i++) {
        this._pos.copy(slice.startPos[i]).applyQuaternion(this._q);
        this._pos.multiplyScalar(expand);
        this._end.copy(slice.endPos[i]);
        if (settleE > 0) {
          this._pos.lerp(this._end, settleE);
        }

        const s = slice.scales[i];
        // Scale pulse also fully gone by t=1
        const sc = 1 + expandWave * 0.04 * (1 - settleE);
        this.cube.setInstanceWorldPos(
          slice.ids[i],
          this._pos,
          new THREE.Vector3(s.x * sc, s.y * sc, s.z * sc)
        );
      }
    }
    this.cube.markInstanceMatrixDirty();

    for (const plane of this.planePool) {
      if (!plane.visible) continue;
      (plane.material as THREE.MeshBasicMaterial).opacity = 0.2 * (1 - t);
    }
  }

  private completeSpin(): void {
    if (!this.cube) {
      this.enterCooldown();
      return;
    }
    // Authoritative lattice commit from original starts (no residual float error)
    for (const a of this.active) {
      this.cube.commitSliceFromStarts(
        a.ids,
        a.startPos,
        a.scales,
        a.move.axis,
        a.move.sign
      );
    }
    this.finishVisuals();
    bus.emit('cube-rotation-complete', {
      moves: this.pendingMoves,
      concurrent: this.active.length,
      instant: false,
    });
    bus.emit('camera-shake-request', { amount: 0.06 + this.active.length * 0.02 });
    this.pendingMoves = [];
    this.active = [];
    this._claimedIds.clear();
    this.enterCooldown();
  }

  private hidePlanes(): void {
    for (const p of this.planePool) {
      p.visible = false;
      (p.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  private finishVisuals(): void {
    this.hidePlanes();
    this.axisHelper.visible = false;
  }

  reset(): void {
    // If a spin was mid-flight, snap active slices to their ends first
    if (this.cube && this.active.length) {
      for (const a of this.active) {
        this.cube.commitSliceFromStarts(
          a.ids,
          a.startPos,
          a.scales,
          a.move.axis,
          a.move.sign
        );
      }
    }
    this.phase = 'idle';
    this.timer = 0;
    this.damagePressure = 0;
    this.pendingMoves = [];
    this.active = [];
    this._claimedIds.clear();
    this.finishVisuals();
  }

  dispose(): void {
    this.reset();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
  }
}
