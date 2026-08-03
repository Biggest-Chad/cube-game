/**
 * Rubik-style whole-cube 90° rotations with telegraph ≥0.6s.
 * Emits bus events for audio / camera shake.
 */
import * as THREE from 'three';
import type { CubeManager } from './CubeManager';
import { bus } from '../core/EventBus';

export type RotationAxis = 'x' | 'y' | 'z';

export interface CubeAnimatorConfig {
  /** Min seconds of telegraph before spin */
  telegraphMin: number;
  telegraphMax: number;
  /** Spin duration seconds */
  spinMin: number;
  spinMax: number;
  /** Base seconds between rotation attempts */
  cooldownMin: number;
  cooldownMax: number;
  /** Level band where rotations begin */
  minLevel: number;
  /** Reduced motion: snap without interpolation */
  reducedMotion: boolean;
}

const DEFAULT_CFG: CubeAnimatorConfig = {
  telegraphMin: 0.65,
  telegraphMax: 1.1,
  spinMin: 0.85,
  spinMax: 1.35,
  cooldownMin: 14,
  cooldownMax: 28,
  minLevel: 6,
  reducedMotion: false,
};

type Phase = 'idle' | 'telegraph' | 'spin' | 'cooldown';

export class CubeAnimator {
  readonly group = new THREE.Group();
  private cube: CubeManager | null = null;
  private cfg: CubeAnimatorConfig;
  private phase: Phase = 'idle';
  private timer = 0;
  private phaseDuration = 1;
  private axis: RotationAxis = 'y';
  private sign: 1 | -1 = 1;
  private levelId = 1;
  private damagePressure = 0;
  private enabled = true;
  private axisHelper: THREE.Group;
  private ghostShell: THREE.Mesh;
  private fromQuat = new THREE.Quaternion();
  private toQuat = new THREE.Quaternion();
  private _q = new THREE.Quaternion();
  private _e = new THREE.Euler();

  constructor(cfg: Partial<CubeAnimatorConfig> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg };

    this.axisHelper = new THREE.Group();
    this.axisHelper.visible = false;
    // Axis glyph — glowing tube
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1, 8),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.axisHelper.add(tube);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.4, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    arrow.position.y = 0.7;
    this.axisHelper.add(arrow);
    this.group.add(this.axisHelper);

    this.ghostShell = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.ghostShell.visible = false;
    this.group.add(this.ghostShell);
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

  /** Call when blocks take damage to raise rotation chance. */
  notifyDamage(amount: number): void {
    this.damagePressure = Math.min(3, this.damagePressure + amount * 0.002);
  }

  get isRotating(): boolean {
    return this.phase === 'telegraph' || this.phase === 'spin';
  }

  get phaseName(): Phase {
    return this.phase;
  }

  update(dt: number): void {
    if (!this.cube || !this.enabled) return;
    if (this.levelId < this.cfg.minLevel) return;

    this.damagePressure = Math.max(0, this.damagePressure - dt * 0.15);
    this.timer += dt;

    switch (this.phase) {
      case 'idle':
        this.enterCooldown();
        break;
      case 'cooldown': {
        const urgency = 1 + this.damagePressure * 0.35 + (this.cube.progress > 0.7 ? 0.4 : 0);
        if (this.timer >= this.phaseDuration / urgency) {
          this.beginTelegraph();
        }
        break;
      }
      case 'telegraph':
        this.updateTelegraph();
        if (this.timer >= this.phaseDuration) {
          this.beginSpin();
        }
        break;
      case 'spin':
        this.updateSpin();
        if (this.timer >= this.phaseDuration) {
          this.completeSpin();
        }
        break;
    }
  }

  private enterCooldown(): void {
    this.phase = 'cooldown';
    this.timer = 0;
    this.phaseDuration =
      this.cfg.cooldownMin +
      Math.random() * (this.cfg.cooldownMax - this.cfg.cooldownMin);
    // Later levels rotate more often
    const levelFactor = Math.max(0.55, 1 - (this.levelId - this.cfg.minLevel) * 0.02);
    this.phaseDuration *= levelFactor;
  }

  private beginTelegraph(): void {
    this.phase = 'telegraph';
    this.timer = 0;
    this.phaseDuration = Math.max(
      this.cfg.telegraphMin,
      this.cfg.telegraphMin +
        Math.random() * (this.cfg.telegraphMax - this.cfg.telegraphMin)
    );

    const axes: RotationAxis[] = ['x', 'y', 'z'];
    this.axis = axes[Math.floor(Math.random() * 3)];
    this.sign = Math.random() < 0.5 ? 1 : -1;

    const he = this.cube!.halfExtent * 2.2;
    this.ghostShell.geometry.dispose();
    this.ghostShell.geometry = new THREE.BoxGeometry(he, he, he);
    this.ghostShell.visible = true;
    (this.ghostShell.material as THREE.MeshBasicMaterial).opacity = 0.15;

    this.layoutAxisHelper();
    this.axisHelper.visible = true;

    bus.emit('cube-rotation-telegraph', {
      axis: this.axis,
      sign: this.sign,
      duration: this.phaseDuration,
    });
  }

  private layoutAxisHelper(): void {
    const len = this.cube!.halfExtent * 2.4;
    this.axisHelper.scale.set(1, len / 1.4, 1);
    this.axisHelper.position.set(0, 0, 0);
    this.axisHelper.rotation.set(0, 0, 0);
    if (this.axis === 'x') this.axisHelper.rotation.z = -Math.PI / 2;
    else if (this.axis === 'z') this.axisHelper.rotation.x = Math.PI / 2;
    // y default
    if (this.sign < 0) this.axisHelper.rotation.x += Math.PI;
  }

  private updateTelegraph(): void {
    const t = this.timer / this.phaseDuration;
    const pulse = 0.2 + Math.sin(this.timer * 12) * 0.12 + t * 0.25;
    (this.ghostShell.material as THREE.MeshBasicMaterial).opacity = pulse;
    this.axisHelper.rotation.y += this.sign * 0.04;
    // Glitch scale
    const s = 1 + Math.sin(this.timer * 20) * 0.01 * t;
    this.ghostShell.scale.setScalar(s);
  }

  private beginSpin(): void {
    this.phase = 'spin';
    this.timer = 0;
    this.phaseDuration =
      this.cfg.spinMin + Math.random() * (this.cfg.spinMax - this.cfg.spinMin);

    if (!this.cube) return;

    if (this.cfg.reducedMotion) {
      // Instant snap path
      this.cube.commitLatticeRotation(this.axis, this.sign);
      this.finishVisuals();
      bus.emit('cube-rotation-complete', { axis: this.axis, sign: this.sign, instant: true });
      this.enterCooldown();
      return;
    }

    this.fromQuat.copy(this.cube.group.quaternion);
    this._e.set(0, 0, 0);
    const ang = (this.sign * Math.PI) / 2;
    if (this.axis === 'x') this._e.x = ang;
    else if (this.axis === 'y') this._e.y = ang;
    else this._e.z = ang;
    this.toQuat.setFromEuler(this._e);
    this.toQuat.premultiply(this.fromQuat);

    bus.emit('cube-rotation-start', {
      axis: this.axis,
      sign: this.sign,
      duration: this.phaseDuration,
    });
  }

  private updateSpin(): void {
    if (!this.cube) return;
    const t = Math.min(1, this.timer / this.phaseDuration);
    // Smooth ease-in-out
    const e = t * t * (3 - 2 * t);
    this._q.slerpQuaternions(this.fromQuat, this.toQuat, e);
    this.cube.group.quaternion.copy(this._q);
    (this.ghostShell.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - t);
  }

  private completeSpin(): void {
    if (!this.cube) return;
    // Snap visual rotation back and remap lattice data so raycasts stay correct
    this.cube.group.quaternion.identity();
    this.cube.commitLatticeRotation(this.axis, this.sign);
    this.finishVisuals();
    bus.emit('cube-rotation-complete', { axis: this.axis, sign: this.sign, instant: false });
    bus.emit('camera-shake-request', { amount: 0.14 });
    this.enterCooldown();
  }

  private finishVisuals(): void {
    this.axisHelper.visible = false;
    this.ghostShell.visible = false;
    (this.ghostShell.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  reset(): void {
    this.phase = 'idle';
    this.timer = 0;
    this.damagePressure = 0;
    this.finishVisuals();
    if (this.cube) this.cube.group.quaternion.identity();
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
