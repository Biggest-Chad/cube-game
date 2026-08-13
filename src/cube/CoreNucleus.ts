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
  private hitFlinch = 0;
  private leakT = 0;
  private dying = false;
  private deathT = 0;
  private coreMesh: THREE.Mesh | null = null;
  private membrane: THREE.Mesh | null = null;
  private ringMesh: THREE.Mesh | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private membraneMat: THREE.ShaderMaterial | null = null;
  private tendrils: THREE.Mesh[] = [];
  private tendrilDirs: THREE.Vector3[] = [];
  private ichorPts: THREE.Points | null = null;
  private ichorPos: Float32Array | null = null;
  private ichorLife: Float32Array | null = null;
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

  /** Visual flare while the sweep laser charges / fires. */
  flareFromLaser(intensity: number): void {
    this.pulse = Math.max(this.pulse, THREE.MathUtils.clamp(intensity, 0, 1));
  }

  /**
   * Solid collision radius — full 3D sphere around the nucleus VFX.
   * Radius = max visual extent (body + ring) × 1.125 (~12.5% padding), isotropic.
   */
  get hitRadius(): number {
    if (!this.active || this.hp <= 0) return 0;
    // Peak render scale of core mesh / ring (matches updateVfx pulses)
    // Visual pulse must not inflate the hitbox (would magnet-snipe during fire)
    const scaleMul = 1.12;
    const bodyR = this.baseScale * 1.08 * scaleMul;
    const tendrilR = this.baseScale * 1.55;
    const visualMax = Math.max(bodyR, tendrilR);
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
    const n = this.cube.aliveBlocks;
    for (let id = 0; id < n; id++) {
      const t = this.cube.getBlockType(id);
      if (t !== BlockType.Empty) shell++;
    }
    this.shellTotal = Math.max(0, shell);
    this.shellAlive = shell;

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
        return 'Weapons accelerated. Exposed: charging sweep laser. Overload: faster, hotter beam.';
      case 'regeneration':
        return 'Shell heals. Exposed: repair drones. Overload: inner lattice revives. Ignore it and the cube grows back.';
      case 'swarm':
        return 'Drone factory online. Exposed / overload: enraged swarms.';
      default:
        return 'Destroy the shell, then the nucleus.';
    }
  }

  private buildVfx(): void {
    this.clearVfx();
    const he = this.cube?.halfExtent ?? 4;
    this.baseScale = Math.max(0.62, he * 0.2);
    this.dying = false;
    this.deathT = 0;

    this.membraneMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uPain: { value: 0 },
        uHp: { value: 1 },
        uExposed: { value: 0 },
        uDying: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform float uPain;
        uniform float uDying;
        varying vec3 vN;
        varying vec3 vP;
        varying float vWobble;
        void main() {
          vec3 p = position;
          float n = sin(p.x * 3.4 + uTime * 2.2) * sin(p.y * 2.8 - uTime * 1.7) * sin(p.z * 3.7 + uTime * 1.4);
          float strain = sin(uTime * 6.2 + p.y * 9.0) * (0.045 + uPain * 0.11);
          float disp = 0.14 + uPulse * 0.22 + uPain * 0.28 + uDying * 0.55;
          p += normal * (n * disp + strain);
          p += normal * uDying * sin(uTime * 18.0 + p.x * 20.0) * 0.12;
          vWobble = n;
          vN = normalize(normalMatrix * normal);
          vP = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform float uPain;
        uniform float uHp;
        uniform float uExposed;
        uniform float uDying;
        varying vec3 vN;
        varying vec3 vP;
        varying float vWobble;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 2.2);
          float veins = abs(sin(vP.x * 11.0 + uTime) * sin(vP.y * 9.0 - uTime * 1.3));
          vec3 meat = mix(vec3(0.18, 0.02, 0.06), vec3(0.62, 0.05, 0.18), veins);
          vec3 bile = vec3(0.22, 0.55, 0.08);
          vec3 hot = vec3(1.0, 0.18, 0.42);
          vec3 col = mix(meat, hot, uPulse * 0.7 + uPain * 0.5);
          col = mix(col, bile, (1.0 - uHp) * 0.45);
          col = mix(col, vec3(1.0, 0.55, 0.12), uExposed * 0.25);
          col += fres * vec3(0.85, 0.08, 0.35);
          col += vec3(vWobble * 0.12, 0.0, 0.06);
          float a = 0.42 + fres * 0.38 + uPulse * 0.2 + uDying * 0.25;
          a *= mix(1.0, 0.35, uDying);
          gl_FragColor = vec4(col, clamp(a, 0.15, 0.92));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    this.membrane = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.08, 3),
      this.membraneMat
    );
    this.membrane.scale.setScalar(this.baseScale);
    this.vfxGroup.add(this.membrane);

    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x4a0014,
      transparent: true,
      opacity: 0.92,
    });
    this.coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 2),
      this.glowMat
    );
    this.coreMesh.scale.setScalar(this.baseScale);
    this.vfxGroup.add(this.coreMesh);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x6a1028,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.22, 0.045, 10, 56),
      this.ringMat
    );
    this.ringMesh.scale.setScalar(this.baseScale);
    this.ringMesh.rotation.x = Math.PI / 2.4;
    this.vfxGroup.add(this.ringMesh);

    const tendrilMat = new THREE.MeshBasicMaterial({
      color: 0x3a0814,
      transparent: true,
      opacity: 0.88,
    });
    this.tendrils = [];
    this.tendrilDirs = [];
    const tCount = 9;
    for (let i = 0; i < tCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / tCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 1.15, 6, 1, true),
        tendrilMat.clone()
      );
      mesh.geometry.translate(0, 0.55, 0);
      this.vfxGroup.add(mesh);
      this.tendrils.push(mesh);
      this.tendrilDirs.push(dir);
    }

    const ichorN = 48;
    this.ichorPos = new Float32Array(ichorN * 3);
    this.ichorLife = new Float32Array(ichorN);
    const igeo = new THREE.BufferGeometry();
    igeo.setAttribute('position', new THREE.BufferAttribute(this.ichorPos, 3));
    this.ichorPts = new THREE.Points(
      igeo,
      new THREE.PointsMaterial({
        color: 0x8a1028,
        size: 0.11,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.vfxGroup.add(this.ichorPts);
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
        return 'Sweep laser charging — keep moving off the line!';
      case 'regeneration':
        return 'Repair swarm deploying — inner layers will grow back if you stall!';
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

    // Flash / flinch — living tissue reacting to the wound
    this.pulse = Math.min(1, this.pulse + 0.55);
    this.hitFlinch = Math.min(1, this.hitFlinch + 0.85);
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
        {
          const span = CORE.regenResurrectFracMax - CORE.regenResurrectFracMin;
          const fraction = CORE.regenResurrectFracMin + Math.random() * span;
          bus.emit('core-resurrect', { fraction });
        }
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
        return 'Laser overcharged — slew is faster. Stay off the line!';
      case 'regeneration':
        return 'Inner lattice reconstructed — cut it down again!';
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
    this.beginDeath();
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

  beginDeath(): void {
    this.dying = true;
    this.deathT = 0;
    this.pulse = 1;
    this.hitFlinch = 1;
    if (this.membraneMat) this.membraneMat.uniforms.uDying.value = 1;
  }

  get isDying(): boolean {
    return this.dying;
  }

  private destroyAllCoreBlocks(now: number): void {
    if (!this.cube) return;
    const ids = this.cube.collectIdsOfType(BlockType.Core).sort((a, b) => b - a);
    for (const id of ids) {
      this.cube.applyDamageDirect(id, 1e12, now);
    }
    this.active = false;
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
    if (this.dying) {
      this.updateDeath(dt);
      return;
    }
    if (!this.active) return;
    this.pulse = Math.max(0, this.pulse - dt * 1.8);
    this.hitFlinch = Math.max(0, this.hitFlinch - dt * 2.4);
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

    // Regeneration: heal living shell + slowly grow back innermost dead voxels
    if (this.attribute === 'regeneration' && this.cube) {
      if (this.shellAlive > 0) {
        this.cube.regenShellBlocks(CORE.regenShellPerSec * dt, now);
      }
      this.cube.tickInnerRevive(dt, now, CORE.regenRevivePerSecOfDead);
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

    // Rage overload: a few extra dodgeable bolts under the sweep laser
    if (
      this.attribute === 'rage' &&
      this.exposed &&
      hooks?.onArcBeam &&
      this.overloadKind === 'rage' &&
      this.overloadTimer > 0
    ) {
      if (Math.random() < dt * 1.4) {
        hooks.onArcBeam(
          this.randomOutwardDir(),
          CORE.arcBeamSpeed * 1.05,
          CORE.arcBeamDamage * 0.75
        );
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

  updateDeath(dt: number): void {
    this.deathT += dt;
    this.pulse = 1;
    this.hitFlinch = 1;
    this.updateVfx(dt);
    if (this.deathT > 2.4) {
      this.vfxGroup.visible = false;
    }
  }

  private updateVfx(dt: number): void {
    if (!this.coreMesh || !this.glowMat) return;
    const t = performance.now() * 0.001;
    const hpR = this.hp / Math.max(1, this.maxHp);
    const pain = this.hitFlinch;
    const breath = 1 + Math.sin(t * 2.15) * 0.045 + Math.sin(t * 5.1) * 0.02;
    const strain = this.exposed ? 1.08 : 1;
    let scale = this.baseScale * breath * strain * (1 + this.pulse * 0.16);

    if (this.dying) {
      const burst = this.deathT < 0.28 ? 1.35 + this.deathT * 2.2 : Math.max(0.05, 1.6 - this.deathT * 0.85);
      scale = this.baseScale * burst;
      this.vfxGroup.rotation.x += dt * (4 + this.deathT * 8);
      this.vfxGroup.rotation.z += dt * 6;
      this.vfxGroup.position.set(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      );
    } else {
      this.vfxGroup.position.set(
        (Math.random() - 0.5) * pain * 0.14,
        (Math.random() - 0.5) * pain * 0.14,
        (Math.random() - 0.5) * pain * 0.14
      );
    }

    this.coreMesh.rotation.y += dt * (0.85 + (this.overloadTimer > 0 ? 5 : 0) + pain * 3);
    this.coreMesh.rotation.x += dt * (0.4 + pain * 2);
    this.coreMesh.scale.setScalar(scale * (0.72 + (1 - hpR) * 0.18));
    const heartCol = this.dying
      ? 0x2a0008
      : this.overloadKind === 'rage' && this.overloadTimer > 0
        ? 0xff2208
        : this.exposed
          ? 0xff3355
          : 0x5a0818;
    this.glowMat.color.setHex(heartCol);
    this.glowMat.opacity = this.dying ? Math.max(0.1, 0.9 - this.deathT * 0.4) : 0.95;

    if (this.membrane && this.membraneMat) {
      this.membrane.scale.setScalar(scale);
      this.membrane.rotation.y -= dt * 0.35;
      this.membrane.rotation.z += dt * 0.18;
      this.membraneMat.uniforms.uTime.value = t;
      this.membraneMat.uniforms.uPulse.value = this.pulse;
      this.membraneMat.uniforms.uPain.value = pain;
      this.membraneMat.uniforms.uHp.value = hpR;
      this.membraneMat.uniforms.uExposed.value = this.exposed ? 1 : 0;
      this.membraneMat.uniforms.uDying.value = this.dying ? 1 : 0;
    }

    if (this.ringMesh && this.ringMat) {
      this.ringMesh.rotation.z += dt * (1.1 + (this.exposed ? 2.2 : 0));
      this.ringMesh.rotation.y += dt * 0.4;
      this.ringMesh.scale.setScalar(scale * (1.02 + Math.sin(t * 3) * 0.04));
      this.ringMat.color.setHex(this.dying ? 0x4a0008 : this.exposed ? 0xff1030 : 0x7a1830);
      this.ringMat.opacity = this.dying ? 0.15 : 0.4 + this.pulse * 0.3;
    }

    for (let i = 0; i < this.tendrils.length; i++) {
      const mesh = this.tendrils[i];
      const dir = this.tendrilDirs[i];
      const wiggle = Math.sin(t * (2.4 + i * 0.37) + i) * (0.22 + pain * 0.45);
      const reach = this.baseScale * (0.85 + Math.sin(t * 1.7 + i) * 0.12 + pain * 0.2);
      const reachDying = this.dying ? reach * (1.4 - this.deathT * 0.5) : reach;
      const aim = dir.clone();
      aim.x += wiggle;
      aim.y += Math.cos(t * 1.9 + i * 0.6) * 0.18;
      aim.normalize();
      mesh.position.copy(aim).multiplyScalar(this.baseScale * 0.55);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);
      mesh.scale.set(
        this.dying ? 0.7 + Math.random() * 0.8 : 1,
        reachDying / this.baseScale,
        this.dying ? 0.7 + Math.random() * 0.8 : 1
      );
      const tm = mesh.material as THREE.MeshBasicMaterial;
      tm.color.setHex(this.dying ? 0x1a0004 : pain > 0.3 ? 0x8a1020 : 0x3a0814);
    }

    this.leakT += dt;
    this.updateIchor(dt, t, hpR);

    this.vfxGroup.visible = !this.dying || this.deathT < 2.45;
  }

  private updateIchor(dt: number, t: number, hpR: number): void {
    if (!this.ichorPts || !this.ichorPos || !this.ichorLife) return;
    const n = this.ichorLife.length;
    const rate = this.dying ? 28 : this.exposed || this.pulse > 0.2 ? 10 : 4;
    for (let i = 0; i < n; i++) {
      if (this.ichorLife[i] <= 0) {
        if (Math.random() < dt * rate) {
          const a = Math.random() * Math.PI * 2;
          const b = (Math.random() - 0.5) * Math.PI;
          const r = this.baseScale * (0.4 + Math.random() * 0.5);
          this.ichorPos[i * 3] = Math.cos(a) * Math.cos(b) * r;
          this.ichorPos[i * 3 + 1] = Math.sin(b) * r;
          this.ichorPos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
          this.ichorLife[i] = 0.35 + Math.random() * 0.55;
        }
        continue;
      }
      this.ichorLife[i] -= dt;
      this.ichorPos[i * 3 + 1] -= dt * (0.35 + (1 - hpR) * 0.5);
      this.ichorPos[i * 3] *= 1 + dt * 0.4;
      this.ichorPos[i * 3 + 2] *= 1 + dt * 0.4;
    }
    const attr = this.ichorPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    const mat = this.ichorPts.material as THREE.PointsMaterial;
    mat.opacity = this.dying ? 0.95 : 0.55 + this.pulse * 0.35;
    mat.color.setHex(this.dying ? 0xff2244 : hpR < 0.4 ? 0x66aa22 : 0xaa1830);
    void t;
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
    this.dying = false;
    this.deathT = 0;
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
    this.hitFlinch = 0;
    this.clearVfx();
  }

  private clearVfx(): void {
    this.vfxGroup.visible = true;
    this.vfxGroup.position.set(0, 0, 0);
    this.vfxGroup.rotation.set(0, 0, 0);
    while (this.vfxGroup.children.length) {
      this.disposeObject(this.vfxGroup.children[0]);
    }
    this.coreMesh = null;
    this.membrane = null;
    this.ringMesh = null;
    this.glowMat = null;
    this.ringMat = null;
    this.membraneMat = null;
    this.tendrils = [];
    this.tendrilDirs = [];
    this.ichorPts = null;
    this.ichorPos = null;
    this.ichorLife = null;
  }

  private disposeObject(obj: THREE.Object3D): void {
    this.vfxGroup.remove(obj);
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.Points || c instanceof THREE.LineSegments) {
        c.geometry.dispose();
        const mat = c.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
  }

  dispose(): void {
    this.reset();
  }
}

/** Arc beam uses base orbit linear feel for dodgeability. */
export function baseArcSpeed(): number {
  return CORE.arcBeamSpeed || ORBIT.defaultRadius * ORBIT.yawSpeed * 0.9;
}
