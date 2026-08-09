/**
 * Shared Cube Nucleus HP pool, shell DR, exposed/decay, milestone attributes.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';
import {
  CORE,
  computeCoreMaxHp,
  coreAttributeForLevel,
  coreAttributeLabel,
  type CoreAttribute,
} from '../data/core';
import { COLORS, ORBIT } from '../data/constants';
import type { LevelDefinition } from '../data/levels';
import { BlockType } from './BlockTypes';
import type { CubeManager } from './CubeManager';

export interface CoreDamageOutcome {
  coreDamage: number;
  transferDamage: number;
  transferInstanceId: number;
  destroyed: boolean;
  reducedByShell: number;
  exposed: boolean;
}

export interface CoreSnapshot {
  active: boolean;
  hp: number;
  maxHp: number;
  shellAlive: number;
  shellTotal: number;
  shellRatio: number;
  exposed: boolean;
  attribute: CoreAttribute;
  attributeLabel: string;
  decaying: boolean;
  overloadActive: boolean;
  hpRatio: number;
}

export class CoreNucleus {
  readonly vfxGroup = new THREE.Group();
  private cube: CubeManager | null = null;
  private levelId = 1;
  private active = false;
  /** True after nucleus destroyed this level (clear even if shell remains). */
  private completed = false;
  private maxHp = 1;
  private hp = 1;
  private shellTotal = 0;
  private shellAlive = 0;
  private attribute: CoreAttribute = 'none';
  private exposed = false;
  private exposedAnnounced = false;
  private decaying = false;
  private overloadFired = new Set<number>(); // thresholds 75/50/25 as 75 etc
  private overloadTimer = 0;
  private overloadKind: 'none' | 'rage' | 'regen' | 'swarm' = 'none';
  private spawnTimer = 0;
  private arcTimer = 0;
  private enrageTimer = 0;
  private pulse = 0;
  private coreMesh: THREE.Mesh | null = null;
  private ringMesh: THREE.Mesh | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private baseScale = 1;
  private _tmp = new THREE.Vector3();
  private _tmp2 = new THREE.Vector3();
  private _dirN = new THREE.Vector3();
  private _sphere = new THREE.Sphere();
  private _ray = new THREE.Ray();

  bind(cube: CubeManager): void {
    this.cube = cube;
  }

  get isActive(): boolean {
    return this.active && this.hp > 0;
  }

  get isDestroyed(): boolean {
    return this.completed || (this.active && this.hp <= 0);
  }

  get attr(): CoreAttribute {
    return this.attribute;
  }

  get isExposed(): boolean {
    return this.exposed;
  }

  get isOverloading(): boolean {
    return this.overloadTimer > 0;
  }

  get enrageMul(): { speed: number; fire: number } {
    if (this.enrageTimer <= 0) return { speed: 1, fire: 1 };
    return { speed: CORE.swarmEnrageSpeedMul, fire: CORE.swarmEnrageFireMul };
  }

  get rageFireMul(): number {
    return this.attribute === 'rage' ? CORE.rageFireRateMul : 1;
  }

  /**
   * Solid collision radius — full 3D sphere around the nucleus VFX.
   * Radius = max visual extent (body + ring) × 1.125 (~12.5% padding), isotropic.
   */
  get hitRadius(): number {
    if (!this.active || this.hp <= 0) return 0;
    // Peak render scale of core mesh / ring (matches updateVfx pulses)
    const scaleMul = 1.12 + this.pulse * 0.2;
    // Body: unit icosahedron radius 1; ring: major 1.35 + tube 0.06
    const bodyR = this.baseScale * scaleMul;
    const ringR = this.baseScale * 1.41 * scaleMul;
    const visualMax = Math.max(bodyR, ringR);
    // 10–15% padding (use 12.5%); floor scales with cube half-extent so small sectors stay hittable
    const he = this.cube?.halfExtent ?? 4;
    return Math.max(he * 0.22, visualMax * 1.125);
  }

  /** World-space center of the nucleus solid (cube group origin + local VFX). */
  getWorldCenter(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.cube) {
      // Prefer cube group origin (lattice center) — always sphere-symmetric
      this.cube.group.getWorldPosition(out);
      // VFX is local 0 under cube.group; if ever offset, blend to vfx world pos
      this.vfxGroup.getWorldPosition(this._tmp2);
      // Use cube center unless vfx drifted (should match)
      if (out.distanceToSquared(this._tmp2) > 0.01) {
        out.copy(this._tmp2);
      }
    } else {
      out.set(0, 0, 0);
    }
    return out;
  }

  /**
   * Analytic ray–sphere intersection (isotropic 3D).
   * Returns distance along ray (0 if already overlapping) and fills outPoint, or null.
   */
  raycastSolid(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number,
    outPoint: THREE.Vector3
  ): number | null {
    if (!this.active || this.hp <= 0) return null;
    const radius = this.hitRadius;
    if (radius <= 0) return null;

    this.getWorldCenter(this._tmp);
    const cx = this._tmp.x;
    const cy = this._tmp.y;
    const cz = this._tmp.z;
    const r2 = radius * radius;

    // oc = origin - center
    const ox = origin.x - cx;
    const oy = origin.y - cy;
    const oz = origin.z - cz;
    const distSq = ox * ox + oy * oy + oz * oz;

    // Already inside solid
    if (distSq <= r2) {
      outPoint.copy(origin);
      return 0;
    }

    if (direction.lengthSq() < 1e-12) return null;
    this._dirN.copy(direction).normalize();
    const dx = this._dirN.x;
    const dy = this._dirN.y;
    const dz = this._dirN.z;

    // Standard ray-sphere: |o + t*d - c|^2 = r^2
    // t^2 + 2*b*t + c = 0 with b = dot(oc,d), c = |oc|^2 - r^2
    const b = ox * dx + oy * dy + oz * dz;
    const c = distSq - r2;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    // Smallest positive t
    let t = -b - s;
    if (t < 0) t = -b + s;
    if (t < 0 || t > maxDist) return null;

    outPoint.set(origin.x + dx * t, origin.y + dy * t, origin.z + dz * t);
    return t;
  }

  /** True if a world point is inside the solid nucleus hitbox. */
  containsPoint(world: THREE.Vector3): boolean {
    if (!this.active || this.hp <= 0) return false;
    const r = this.hitRadius;
    if (r <= 0) return false;
    return this.getWorldCenter(this._tmp2).distanceToSquared(world) <= r * r;
  }

  snapshot(): CoreSnapshot {
    const shellRatio =
      this.shellTotal > 0 ? this.shellAlive / this.shellTotal : 0;
    return {
      active: this.active && !this.completed,
      hp: this.hp,
      maxHp: this.maxHp,
      shellAlive: this.shellAlive,
      shellTotal: this.shellTotal,
      shellRatio,
      exposed: this.exposed,
      attribute: this.attribute,
      attributeLabel: coreAttributeLabel(this.attribute),
      decaying: this.decaying,
      overloadActive: this.overloadTimer > 0,
      hpRatio: this.hp / Math.max(1, this.maxHp),
    };
  }

  /** Call after cube mesh is built. */
  startLevel(level: LevelDefinition): void {
    this.reset();
    this.levelId = level.id;
    if (!level.hasCore || !this.cube) {
      this.active = false;
      return;
    }

    this.active = true;
    this.attribute = coreAttributeForLevel(level.id);
    this.maxHp = computeCoreMaxHp(level.id, level.avgHP, level.size);
    // Prefer authored coreHP as floor when higher
    this.maxHp = Math.max(this.maxHp, level.coreHP);
    this.hp = this.maxHp;

    let shell = 0;
    let coreBlocks = 0;
    const n = this.cube.aliveBlocks;
    for (let id = 0; id < n; id++) {
      const t = this.cube.getBlockType(id);
      if (t === BlockType.Empty) continue;
      if (t === BlockType.Core) coreBlocks++;
      else shell++;
    }
    this.shellTotal = Math.max(0, shell);
    this.shellAlive = shell;

    // Inflate individual core block HP so they never die before shared pool
    // (shared pool is the real gate)
    this.cube.boostCoreBlockHealth(this.maxHp * 10);

    this.buildVfx();
    bus.emit('core-started', {
      levelId: level.id,
      maxHp: this.maxHp,
      attribute: this.attribute,
      shellTotal: this.shellTotal,
    });

    if (this.attribute !== 'none') {
      bus.emit('core-notify', {
        title: `NUCLEUS · ${coreAttributeLabel(this.attribute)}`,
        body: this.attributeIntro(),
        kind: this.attribute,
      });
    }
  }

  private attributeIntro(): string {
    switch (this.attribute) {
      case 'rage':
        return 'Weapons accelerated. Exposed: arc beams. Overload: multi-arc storm.';
      case 'regeneration':
        return 'Shell regenerates. Exposed: repair drones. Overload: mass resurrection.';
      case 'swarm':
        return 'Drone factory online. Exposed / overload: enraged swarms.';
      default:
        return 'Destroy the shell, then the nucleus.';
    }
  }

  private buildVfx(): void {
    const he = this.cube?.halfExtent ?? 4;
    this.baseScale = Math.max(0.55, he * 0.16);
    this.glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.core,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      this.glowMat
    );
    this.coreMesh.scale.setScalar(this.baseScale);
    this.vfxGroup.add(this.coreMesh);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.magenta,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.06, 8, 48),
      this.ringMat
    );
    this.ringMesh.scale.setScalar(this.baseScale);
    this.ringMesh.rotation.x = Math.PI / 2;
    this.vfxGroup.add(this.ringMesh);
  }

  /** Shell block destroyed or resurrected — keep counts accurate. */
  onShellCountDelta(delta: number): void {
    if (!this.active) return;
    this.shellAlive = Math.max(0, Math.min(this.shellTotal, this.shellAlive + delta));
    this.recomputeExposed();
  }

  /** Recount shell from cube (safe after mass resurrect). */
  recountShell(): void {
    if (!this.cube || !this.active) return;
    let shell = 0;
    for (let id = 0; id < this.cube.aliveBlocks; id++) {
      const t = this.cube.getBlockType(id);
      if (t !== BlockType.Empty && t !== BlockType.Core) shell++;
    }
    this.shellAlive = shell;
    // Allow resurrect to exceed original shellTotal for progress math
    this.shellTotal = Math.max(this.shellTotal, shell);
    this.recomputeExposed();
  }

  private recomputeExposed(): void {
    if (!this.active) return;
    const ratio = this.shellTotal > 0 ? this.shellAlive / this.shellTotal : 0;
    const was = this.exposed;
    this.exposed = ratio <= CORE.exposedShellRatio;
    this.decaying = this.shellAlive <= 0;

    if (this.exposed && !was && !this.exposedAnnounced) {
      this.exposedAnnounced = true;
      bus.emit('core-exposed', { attribute: this.attribute, shellRatio: ratio });
      bus.emit('core-notify', {
        title: 'NUCLEUS EXPOSED',
        body: this.exposedBody(),
        kind: 'exposed',
      });
      this.onExposed();
    }
  }

  private exposedBody(): string {
    switch (this.attribute) {
      case 'rage':
        return 'Core arc weapons online — dodge the beams!';
      case 'regeneration':
        return 'Repair swarm deploying!';
      case 'swarm':
        return 'Factory dumping a full drone swarm!';
      default:
        return 'Shell critical — finish the nucleus!';
    }
  }

  private onExposed(): void {
    if (!this.cube) return;
    if (this.attribute === 'regeneration') {
      bus.emit('core-spawn-drones', {
        count: CORE.regenRepairDroneCount,
        role: 'repair' as const,
        enraged: false,
      });
    } else if (this.attribute === 'swarm') {
      bus.emit('core-spawn-drones', {
        count: CORE.swarmExposedBurst,
        role: 'mixed' as const,
        enraged: false,
      });
    }
  }

  /**
   * Apply raw damage aimed at a Core block.
   * Shell DR scales with remaining shell (high when shell full, none when empty),
   * but never full immunity — min throughput always chips the nucleus.
   */
  applyDamage(raw: number, now: number): CoreDamageOutcome {
    if (!this.active || this.hp <= 0 || !this.cube) {
      return {
        coreDamage: 0,
        transferDamage: 0,
        transferInstanceId: -1,
        destroyed: false,
        reducedByShell: raw,
        exposed: this.exposed,
      };
    }

    const shellRatio =
      this.shellTotal > 0 ? this.shellAlive / this.shellTotal : 0;
    // DR = shellRatio * maxShellDr (e.g. 88% at full shell → 0% when empty)
    const dr = Math.min(CORE.maxShellDr, Math.max(0, shellRatio) * CORE.maxShellDr);
    const throughput = Math.max(CORE.minDamageThroughput, 1 - dr);
    // Optional CubeDefense bubble absorb (if Game wires absorb on cubeDefense)
    let incoming = raw * throughput;
    if (this.cube) {
      // Hook: defense may reduce before nucleus HP (implemented via optional method)
      const def = (this.cube as { defenseAbsorb?: (n: number) => number }).defenseAbsorb;
      if (typeof def === 'function') incoming = def(incoming);
    }
    const actual = Math.max(0, incoming);
    const transfer = actual * CORE.damageTransferPct;
    const toCore = Math.max(0, actual - transfer);

    let transferId = -1;
    if (transfer > 0.5 && this.shellAlive > 0) {
      transferId = this.cube.pickRandomShellInstance();
      if (transferId >= 0) {
        // Direct shell damage bypasses core routing
        this.cube.applyDamageDirect(transferId, transfer, now);
      }
    }

    const prevRatio = this.hp / this.maxHp;
    this.hp = Math.max(0, this.hp - toCore);
    this.checkOverloads(prevRatio);

    if (this.hp <= 0) {
      this.finishDestroyed(now);
      return {
        coreDamage: toCore,
        transferDamage: transfer,
        transferInstanceId: transferId,
        destroyed: true,
        reducedByShell: raw - actual,
        exposed: this.exposed,
      };
    }

    // Flash nucleus VFX
    this.pulse = Math.min(1, this.pulse + 0.45);
    return {
      coreDamage: toCore,
      transferDamage: transfer,
      transferInstanceId: transferId,
      destroyed: false,
      reducedByShell: raw - actual,
      exposed: this.exposed,
    };
  }

  private checkOverloads(prevRatio: number): void {
    const ratio = this.hp / this.maxHp;
    for (const t of CORE.overloadThresholds) {
      const key = Math.round(t * 100);
      if (prevRatio > t && ratio <= t && !this.overloadFired.has(key)) {
        this.overloadFired.add(key);
        this.triggerOverload(key);
      }
    }
  }

  private triggerOverload(pct: number): void {
    bus.emit('core-overload', {
      pct,
      attribute: this.attribute,
      hp: this.hp,
      maxHp: this.maxHp,
    });
    bus.emit('core-notify', {
      title: `NUCLEUS OVERLOAD · ${pct}%`,
      body: this.overloadBody(),
      kind: 'overload',
    });

    switch (this.attribute) {
      case 'rage':
        this.overloadTimer = CORE.rageOverloadDuration;
        this.overloadKind = 'rage';
        bus.emit('core-rage-storm', {
          count: CORE.rageOverloadBeamCount,
          duration: CORE.rageOverloadDuration,
        });
        break;
      case 'regeneration':
        this.overloadTimer = 2.5;
        this.overloadKind = 'regen';
        bus.emit('core-resurrect', { fraction: CORE.regenResurrectFrac });
        break;
      case 'swarm':
        this.overloadTimer = CORE.swarmEnrageDuration;
        this.overloadKind = 'swarm';
        this.enrageTimer = CORE.swarmEnrageDuration;
        bus.emit('core-spawn-drones', {
          count: CORE.swarmExposedBurst + 2,
          role: 'mixed' as const,
          enraged: true,
        });
        break;
      default:
        this.overloadTimer = 1.8;
        this.overloadKind = 'none';
        break;
    }
  }

  private overloadBody(): string {
    switch (this.attribute) {
      case 'rage':
        return 'Multi-vector arc storm! Keep moving!';
      case 'regeneration':
        return 'Mass lattice resurrection!';
      case 'swarm':
        return 'Enraged drone wave inbound!';
      default:
        return 'Nucleus destabilizing!';
    }
  }

  private finishDestroyed(now: number, decay = false): void {
    this.destroyAllCoreBlocks(now);
    this.completed = true;
    this.active = false;
    bus.emit('core-destroyed', {
      levelId: this.levelId,
      attribute: this.attribute,
      decay,
    });
    bus.emit('core-notify', {
      title: decay ? 'NUCLEUS COLLAPSED' : 'NUCLEUS DESTROYED',
      body: decay ? 'Destabilization complete.' : 'Cube authority offline.',
      kind: 'destroyed',
    });
  }

  private destroyAllCoreBlocks(now: number): void {
    if (!this.cube) return;
    const ids = this.cube.collectIdsOfType(BlockType.Core).sort((a, b) => b - a);
    for (const id of ids) {
      this.cube.applyDamageDirect(id, 1e12, now);
    }
    this.active = false;
    if (this.coreMesh) this.coreMesh.visible = false;
    if (this.ringMesh) this.ringMesh.visible = false;
  }

  /**
   * Per-frame: decay, regen attribute, swarm factory, VFX, arc timing.
   */
  update(
    dt: number,
    now: number,
    hooks?: {
      onArcBeam?: (dir: THREE.Vector3, speed: number, damage: number) => void;
      fireRateMulOut?: { value: number };
    }
  ): void {
    if (!this.active) return;
    this.pulse = Math.max(0, this.pulse - dt * 1.8);
    this.overloadTimer = Math.max(0, this.overloadTimer - dt);
    this.enrageTimer = Math.max(0, this.enrageTimer - dt);

    // Shell-alone decay
    if (this.decaying && this.hp > 0) {
      const decay = Math.max(
        CORE.decayMinPerSec,
        this.maxHp * CORE.decayPerSecOfMax
      );
      const prev = this.hp / this.maxHp;
      this.hp = Math.max(0, this.hp - decay * dt);
      this.checkOverloads(prev);
      if (this.hp <= 0) {
        this.finishDestroyed(now, true);
        return;
      }
    }

    // Regeneration attribute — heal shell blocks slowly
    if (this.attribute === 'regeneration' && this.cube && this.shellAlive > 0) {
      this.cube.regenShellBlocks(CORE.regenShellPerSec * dt, now);
    }

    // Swarm factory
    if (this.attribute === 'swarm') {
      this.spawnTimer += dt;
      const interval =
        this.exposed ? CORE.swarmSpawnInterval * 0.55 : CORE.swarmSpawnInterval;
      if (this.spawnTimer >= interval) {
        this.spawnTimer = 0;
        bus.emit('core-spawn-drones', {
          count: this.exposed ? 2 : 1,
          role: Math.random() > 0.55 ? ('attack' as const) : ('repair' as const),
          enraged: this.enrageTimer > 0,
        });
      }
    }

    // Rage exposed arc beams
    if (this.attribute === 'rage' && this.exposed && hooks?.onArcBeam) {
      this.arcTimer -= dt;
      if (this.arcTimer <= 0) {
        this.arcTimer = CORE.rageArcCooldown;
        const dir = this.randomOutwardDir();
        hooks.onArcBeam(dir, CORE.arcBeamSpeed, CORE.arcBeamDamage);
      }
      // During overload storm — continuous random arcs
      if (this.overloadKind === 'rage' && this.overloadTimer > 0) {
        if (Math.random() < dt * 4) {
          hooks.onArcBeam(
            this.randomOutwardDir(),
            CORE.arcBeamSpeed * 1.1,
            CORE.arcBeamDamage * 0.85
          );
        }
      }
    }

    this.updateVfx(dt);
  }

  private randomOutwardDir(): THREE.Vector3 {
    // Prefer toward + roughly player orbit plane randomness
    const u = Math.random() * Math.PI * 2;
    const v = (Math.random() - 0.5) * 1.2;
    return new THREE.Vector3(Math.cos(u), v, Math.sin(u)).normalize();
  }

  private updateVfx(dt: number): void {
    if (!this.coreMesh || !this.glowMat) return;
    this.coreMesh.rotation.y += dt * (0.6 + (this.overloadTimer > 0 ? 4 : 0));
    this.coreMesh.rotation.x += dt * (0.25 + (this.overloadTimer > 0 ? 2 : 0));
    if (this.ringMesh) {
      this.ringMesh.rotation.z += dt * (0.8 + (this.exposed ? 1.5 : 0));
    }

    const hpR = this.hp / Math.max(1, this.maxHp);
    let color: number = COLORS.core;
    let opacity = 0.4 + (1 - hpR) * 0.35 + this.pulse * 0.3;
    let scale = this.baseScale * (1 + this.pulse * 0.12);

    if (this.overloadTimer > 0 && this.overloadKind === 'rage') {
      color = 0xff2200;
      opacity = 0.75 + Math.sin(performance.now() * 0.04) * 0.2;
      scale = this.baseScale * (1.15 + Math.sin(performance.now() * 0.05) * 0.12);
      // Aggressive vibration
      this.coreMesh.position.set(
        (Math.random() - 0.5) * 0.18,
        (Math.random() - 0.5) * 0.18,
        (Math.random() - 0.5) * 0.18
      );
    } else if (this.overloadTimer > 0 && this.overloadKind === 'regen') {
      color = 0x44ff88;
      opacity = 0.7;
      scale = this.baseScale * 1.2;
      this.coreMesh.position.set(0, 0, 0);
    } else if (this.overloadTimer > 0 && this.overloadKind === 'swarm') {
      color = 0xff66ff;
      opacity = 0.7;
      scale = this.baseScale * (1.1 + Math.sin(performance.now() * 0.03) * 0.08);
      this.coreMesh.position.set(0, 0, 0);
    } else if (this.exposed) {
      color = 0xff6688;
      opacity = 0.55 + Math.sin(performance.now() * 0.008) * 0.12;
      scale = this.baseScale * (1.05 + Math.sin(performance.now() * 0.006) * 0.04);
      this.coreMesh.position.set(0, 0, 0);
    } else if (this.decaying) {
      color = 0xffaa44;
      opacity = 0.5 + Math.sin(performance.now() * 0.01) * 0.15;
      this.coreMesh.position.set(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      );
    } else {
      this.coreMesh.position.set(0, 0, 0);
    }

    this.glowMat.color.setHex(color);
    this.glowMat.opacity = opacity;
    this.coreMesh.scale.setScalar(scale);
    if (this.ringMat) {
      this.ringMat.color.setHex(this.exposed ? 0xff0044 : COLORS.magenta);
      this.ringMat.opacity = this.overloadTimer > 0 ? 0.7 : 0.3;
    }
    if (this.ringMesh) this.ringMesh.scale.setScalar(scale * 1.05);

    // Keep VFX at cube center (cube group may rotate via animator — parent handles)
    this.vfxGroup.position.set(0, 0, 0);
  }

  /** Combat progress 0..1 — shell clear is 85%, nucleus 15%. */
  combatProgress(): number {
    if (this.completed) return 1;
    if (!this.active) {
      return this.cube ? this.cube.rawBlockProgress() : 1;
    }
    const shellDone =
      this.shellTotal > 0
        ? 1 - this.shellAlive / this.shellTotal
        : 1;
    const coreDone = 1 - this.hp / Math.max(1, this.maxHp);
    return Math.min(1, shellDone * 0.85 + coreDone * 0.15);
  }

  /** Level clear when nucleus dead (or no nucleus and no blocks). */
  isLevelComplete(): boolean {
    if (!this.cube) return false;
    if (this.completed) return true;
    if (!this.active) {
      // No nucleus this level — classic clear
      return this.cube.aliveBlocks <= 0;
    }
    return this.hp <= 0;
  }

  reset(): void {
    this.active = false;
    this.completed = false;
    this.hp = 1;
    this.maxHp = 1;
    this.shellTotal = 0;
    this.shellAlive = 0;
    this.attribute = 'none';
    this.exposed = false;
    this.exposedAnnounced = false;
    this.decaying = false;
    this.overloadFired.clear();
    this.overloadTimer = 0;
    this.overloadKind = 'none';
    this.spawnTimer = 0;
    this.arcTimer = 0;
    this.enrageTimer = 0;
    this.pulse = 0;
    while (this.vfxGroup.children.length) {
      const c = this.vfxGroup.children[0];
      this.vfxGroup.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else (c.material as THREE.Material).dispose();
      }
    }
    this.coreMesh = null;
    this.ringMesh = null;
    this.glowMat = null;
    this.ringMat = null;
  }

  dispose(): void {
    this.reset();
  }
}

/** Arc beam uses base orbit linear feel for dodgeability. */
export function baseArcSpeed(): number {
  return CORE.arcBeamSpeed || ORBIT.defaultRadius * ORBIT.yawSpeed * 0.9;
}
