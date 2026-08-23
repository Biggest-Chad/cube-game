/**
 * Cube self-defense: lattice-mounted turrets (destructible blocks) + enemy drones + shields.
 * Turrets are part of the cube lattice and move with Rubik slice scrambles.
 */
import * as THREE from 'three';
import type { CubeManager } from './CubeManager';
import { BlockType } from './BlockTypes';
import { Turret } from './Turret';
import { EnemyDrone, type EnemyDroneRole } from './EnemyDrone';
import { bus } from '../core/EventBus';
import { COLORS } from '../data/constants';
import {
  ENEMY_ARC_DEFAULT_HIT_POINTS,
  ENEMY_ATTACK_DRONE_BASE_HIT_POINTS,
  ENEMY_ATTACK_DRONE_HIT_POINTS_PER_LEVEL,
  ENEMY_ATTACK_DRONE_SPEED,
  ENEMY_DRONE_BASE_DAMAGE,
  ENEMY_DRONE_DAMAGE_PER_LEVEL,
  ENEMY_DRONE_ELITE_FIRE_RATE_MULTIPLIER,
  ENEMY_DRONE_REPAIR_FRACTION,
  ENEMY_DRONE_SOFT_CAP,
  ENEMY_INTERCEPT_RADIUS,
  ENEMY_REPAIR_DRONE_BASE_HIT_POINTS,
  ENEMY_REPAIR_DRONE_HIT_POINTS_PER_LEVEL,
  ENEMY_REPAIR_DRONE_SPEED,
  ENEMY_WEAPON_TARGET_RADIUS_DRONE,
  ENEMY_WEAPON_TARGET_RADIUS_TURRET,
  CUBE_FIGHTER_BASE_DAMAGE,
  CUBE_FIGHTER_BASE_HIT_POINTS,
  CUBE_FIGHTER_DAMAGE_PER_LEVEL,
  CUBE_FIGHTER_FIRE_RATE,
  CUBE_FIGHTER_HIT_POINTS_PER_LEVEL,
  CUBE_FIGHTER_RANGE,
  CUBE_FIGHTER_SPEED,
  FLOATING_TURRET_BASE_DAMAGE,
  FLOATING_TURRET_BASE_HIT_POINTS,
  FLOATING_TURRET_DAMAGE_PER_LEVEL,
  FLOATING_TURRET_FIRE_RATE,
  FLOATING_TURRET_HIT_POINTS_PER_LEVEL,
  FLOATING_TURRET_PROJECTILE_SPEED,
  LATTICE_TURRET_BASE_DAMAGE,
  LATTICE_TURRET_BASE_HIT_POINTS,
  LATTICE_TURRET_BASE_PROJECTILE_SPEED,
  LATTICE_TURRET_DAMAGE_PER_LEVEL,
  LATTICE_TURRET_ELITE_FIRE_RATE,
  LATTICE_TURRET_FIRE_RATE,
  LATTICE_TURRET_HIT_POINTS_PER_LEVEL,
  LATTICE_TURRET_PROJECTILE_SPEED_PER_LEVEL,
  LATTICE_TURRET_SPAWN_KEEP_FRACTION,
} from '../data/constraints';
import { CORE } from '../data/core';
import { RageLaser, type RageLaserPhase } from './RageLaser';
import { NucleusSpikeBurst, type SpikeBurstPhase } from './NucleusSpikeBurst';
import { NucleusOffensiveKit } from './NucleusOffensiveKit';
import { spikeBurstProfileForStage } from '../data/nucleusAtk';
import { NUCLEUS_KAMIKAZE_PROXIMITY } from '../data/constraints';

export interface DefenseSchedule {
  coreShield: boolean;
  faceShields: boolean;
  /** Extra free-floating turrets only if lattice yield is low */
  floatingTurretFallback: number;
  enemyDroneCount: number;
  cubeFighterCount: number;
  layeredShields: boolean;
  elite: boolean;
}

export function defenseScheduleForLevel(levelId: number): DefenseSchedule {
  if (levelId <= 3) {
    return {
      coreShield: false,
      faceShields: false,
      floatingTurretFallback: 0,
      enemyDroneCount: 0,
      cubeFighterCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 6) {
    return {
      coreShield: true,
      faceShields: false,
      floatingTurretFallback: 0,
      enemyDroneCount: 0,
      cubeFighterCount: 1,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 10) {
    return {
      coreShield: true,
      faceShields: false,
      floatingTurretFallback: 1,
      enemyDroneCount: 0,
      cubeFighterCount: 2,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 14) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 1,
      enemyDroneCount: 1,
      cubeFighterCount: 2,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 18) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 1,
      enemyDroneCount: 3,
      cubeFighterCount: 3,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 25) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 1,
      enemyDroneCount: 5,
      cubeFighterCount: 4,
      layeredShields: true,
      elite: false,
    };
  }
  return {
    coreShield: true,
    faceShields: true,
    floatingTurretFallback: 2,
    enemyDroneCount: 7,
    cubeFighterCount: 5,
    layeredShields: true,
    elite: true,
  };
}

export interface ShieldPool {
  current: number;
  max: number;
  regenDelay: number;
  regenPerSec: number;
  active: boolean;
}

export interface CubeDefenseHooks {
  onPlayerDamage: (amount: number, source: string) => void;
  getPlayerPosition: () => THREE.Vector3;
  getPlayerDronePositions?: () => THREE.Vector3[];
  onPlayerDroneDamage?: (aim: THREE.Vector3, damage: number) => void;
}

interface LatticeTurretLink {
  turret: Turret;
  instanceId: number;
  floating: boolean;
}

export class CubeDefense {
  readonly group = new THREE.Group();
  private cube: CubeManager | null = null;
  private levelId = 1;
  private schedule: DefenseSchedule = defenseScheduleForLevel(1);
  private links: LatticeTurretLink[] = [];
  private enemyDrones: EnemyDrone[] = [];
  private coreShield: ShieldPool = {
    current: 0,
    max: 0,
    regenDelay: 0,
    regenPerSec: 0,
    active: false,
  };
  private faceShields: ShieldPool[] = [];
  private coreShieldMesh: THREE.Mesh | null = null;
  private faceShieldMeshes: THREE.Mesh[] = [];
  private projectileRoot = new THREE.Group();
  private hooks: CubeDefenseHooks | null = null;
  private _idSeq = 0;
  private _pos = new THREE.Vector3();
  private fireRateMul = 1;
  private unsubs: Array<() => void> = [];
  /** Rage arc beams — player must dodge. */
  private arcs: Array<{
    mesh: THREE.Mesh;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    life: number;
    damage: number;
  }> = [];
  private readonly rageLaser = new RageLaser();
  private readonly spikes = new NucleusSpikeBurst();
  private readonly kit = new NucleusOffensiveKit();
  private readonly _laserOrigin = new THREE.Vector3();
  private readonly playerVel = new THREE.Vector3();
  private readonly lastPlayer = new THREE.Vector3();
  private playerVelPrimed = false;

  constructor() {
    this.group.add(this.projectileRoot);
    this.group.add(this.rageLaser.group);
    this.group.add(this.spikes.group);
    this.group.add(this.kit.group);
  }

  get rageLaserPhase(): RageLaserPhase {
    return this.rageLaser.phaseId;
  }

  get spikePhase(): SpikeBurstPhase {
    return this.spikes.phaseId;
  }

  setHooks(hooks: CubeDefenseHooks): void {
    this.hooks = hooks;
  }

  bind(cube: CubeManager): void {
    this.cube = cube;
  }

  startLevel(levelId: number): void {
    this.reset();
    this.levelId = levelId;
    this.kit.startLevel(levelId);
    this.schedule = defenseScheduleForLevel(levelId);
    this.fireRateMul = 1;
    this.bindCoreEvents();
    if (!this.cube) return;

    const he = this.cube.halfExtent;

    if (this.schedule.coreShield) {
      const max = 80 + levelId * 18;
      this.coreShield = {
        current: max,
        max,
        regenDelay: 0,
        regenPerSec: this.schedule.layeredShields ? 6 : 3,
        active: true,
      };
      this.coreShieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(1.2, he * 0.22), 16, 12),
        new THREE.MeshBasicMaterial({
          color: COLORS.cyan,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      this.group.add(this.coreShieldMesh);
    }

    if (this.schedule.faceShields) {
      const faces: THREE.Vector3[] = [
        new THREE.Vector3(he, 0, 0),
        new THREE.Vector3(-he, 0, 0),
        new THREE.Vector3(0, he, 0),
        new THREE.Vector3(0, -he, 0),
        new THREE.Vector3(0, 0, he),
        new THREE.Vector3(0, 0, -he),
      ];
      const use = this.schedule.elite ? faces : faces.slice(0, 2 + (levelId % 3));
      for (const f of use) {
        const max = 40 + levelId * 8;
        this.faceShields.push({
          current: max,
          max,
          regenDelay: 0,
          regenPerSec: 2,
          active: true,
        });
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(he * 0.9, he * 0.9),
          new THREE.MeshBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        mesh.position.copy(f).multiplyScalar(1.05);
        mesh.lookAt(0, 0, 0);
        this.faceShieldMeshes.push(mesh);
        this.group.add(mesh);
      }
    }

    // Lattice turret blocks (primary — destructible & scramble-safe). Keep 40%.
    const turretIds = this.cube.collectIdsOfType(BlockType.Turret);
    const armed = this.pickSubset(turretIds, LATTICE_TURRET_SPAWN_KEEP_FRACTION);
    const armedSet = new Set(armed);
    for (const id of armed) {
      this.spawnTurretOnInstance(id, levelId, false);
    }
    for (const id of turretIds) {
      if (!armedSet.has(id)) this.cube.demoteTurretBlock(id);
    }

    // Fallback floaters only if lattice has very few turrets
    const need =
      Math.max(0, this.schedule.floatingTurretFallback - turretIds.length);
    for (let i = 0; i < need; i++) {
      const ang = (i / Math.max(1, need)) * Math.PI * 2 + 0.3;
      const elev = (i % 2 === 0 ? 0.35 : -0.3) * he;
      const pos = new THREE.Vector3(
        Math.cos(ang) * he * 1.08,
        elev,
        Math.sin(ang) * he * 1.08
      );
      // Snap to nearest block if possible so it "sits" on lattice
      const near = this.cube.findNearest(pos, he * 0.5);
      if (near) {
        this.spawnTurretOnInstance(near.instanceId, levelId, true);
      } else {
        this.spawnFloatingTurret(pos, levelId);
      }
    }

    for (let i = 0; i < this.schedule.enemyDroneCount; i++) {
      this.spawnEnemyDrone('attack', false);
    }
    for (let i = 0; i < this.schedule.cubeFighterCount; i++) {
      this.spawnEnemyDrone('cube-fighter', false);
    }

    bus.emit('cube-defense-started', {
      levelId,
      latticeTurrets: turretIds.length,
      totalTurrets: this.links.length,
    });
  }

  private bindCoreEvents(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.unsubs.push(
      bus.on(
        'core-spawn-drones',
        (p: { count: number; role: 'attack' | 'repair' | 'mixed'; enraged?: boolean }) => {
          for (let i = 0; i < p.count; i++) {
            let role: EnemyDroneRole = 'attack';
            if (p.role === 'repair') role = 'repair';
            else if (p.role === 'mixed') role = Math.random() > 0.45 ? 'attack' : 'repair';
            this.spawnEnemyDrone(role, !!p.enraged);
          }
        }
      ),
      bus.on('core-resurrect', (p: { fraction: number }) => {
        if (!this.cube) return;
        this.cube.resurrectShellFraction(p.fraction, performance.now() / 1000);
      }),
      bus.on('core-started', (p: { attribute?: string }) => {
        if (p.attribute === 'rage') this.fireRateMul = CORE.rageFireRateMul;
        else this.fireRateMul = 1;
      }),
      bus.on('core-spike-burst', () => {
        if (!this.cube || !this.hooks) return;
        this.cube.nucleus.getWorldCenter(this._laserOrigin);
        const profile = spikeBurstProfileForStage(this.levelId);
        const mul = this.cube.nucleus.overloadDamageMul;
        profile.damage *= mul;
        profile.shockDamage *= mul;
        profile.airBurstDamage *= mul;
        this.spikes.arm(
          this._laserOrigin,
          this.hooks.getPlayerPosition(),
          profile
        );
      }),
      bus.on('core-overload', () => {
        this.kit.notifyOverload();
        this.spewCubeFighterWave();
      }),
      bus.on(
        'core-spawn-kamikaze',
        (p: { count: number; hp: number; damage: number; speed: number }) => {
          for (let i = 0; i < p.count; i++) {
            this.spawnEnemyDrone('kamikaze', true, p);
          }
        }
      )
    );
  }

  spawnEnemyDrone(
    role: EnemyDroneRole = 'attack',
    enraged = false,
    kami?: { hp: number; damage: number; speed: number }
  ): EnemyDrone | null {
    if (!this.cube) return null;
    // Soft cap to avoid meltdown
    if (this.enemyDrones.filter((d) => d.alive).length >= ENEMY_DRONE_SOFT_CAP) return null;
    const he = this.cube.halfExtent;
    const idx = this.enemyDrones.length;
    const isRepair = role === 'repair';
    const isKami = role === 'kamikaze';
    const isCubeFighter = role === 'cube-fighter';
    const dmgMul = this.cube.nucleus.overloadDamageMul;
    const d = new EnemyDrone(`ed_${this._idSeq++}`, idx, he, {
      hp: isKami
        ? kami?.hp ?? 22
        : isCubeFighter
          ? CUBE_FIGHTER_BASE_HIT_POINTS + this.levelId * CUBE_FIGHTER_HIT_POINTS_PER_LEVEL
          : (isRepair ? ENEMY_REPAIR_DRONE_BASE_HIT_POINTS : ENEMY_ATTACK_DRONE_BASE_HIT_POINTS) +
            this.levelId *
              (isRepair ? ENEMY_REPAIR_DRONE_HIT_POINTS_PER_LEVEL : ENEMY_ATTACK_DRONE_HIT_POINTS_PER_LEVEL),
      damage: isKami
        ? kami?.damage ?? 14
        : isCubeFighter
          ? (CUBE_FIGHTER_BASE_DAMAGE + this.levelId * CUBE_FIGHTER_DAMAGE_PER_LEVEL) * dmgMul
          : (ENEMY_DRONE_BASE_DAMAGE + this.levelId * ENEMY_DRONE_DAMAGE_PER_LEVEL) * dmgMul,
      fireRate: isCubeFighter
        ? CUBE_FIGHTER_FIRE_RATE * this.fireRateMul
        : (this.schedule.elite ? ENEMY_DRONE_ELITE_FIRE_RATE_MULTIPLIER : 1.0) * this.fireRateMul,
      speed: isKami
        ? kami?.speed ?? 7.2
        : isCubeFighter
          ? CUBE_FIGHTER_SPEED
          : isRepair
            ? ENEMY_REPAIR_DRONE_SPEED
            : ENEMY_ATTACK_DRONE_SPEED,
      color: isKami ? 0xffaa22 : isCubeFighter ? 0xff4488 : isRepair ? 0x44ff88 : 0xff2244,
      role,
      repairFrac: ENEMY_DRONE_REPAIR_FRACTION,
      ...(isKami ? { range: NUCLEUS_KAMIKAZE_PROXIMITY + 40 } : {}),
      ...(isCubeFighter ? { range: CUBE_FIGHTER_RANGE } : {}),
    });
    if (enraged) d.setEnraged(true);
    // Spawn near cube surface
    const ang = Math.random() * Math.PI * 2;
    d.group.position.set(
      Math.cos(ang) * he * 1.2,
      (Math.random() - 0.5) * he,
      Math.sin(ang) * he * 1.2
    );
    this.enemyDrones.push(d);
    this.group.add(d.group);
    return d;
  }

  private spewCubeFighterWave(): void {
    if (!this.cube?.nucleus.isActive) return;
    const hpR = this.cube.nucleus.snapshot().hpRatio;
    const n = this.cubeFighterOverloadCount(this.levelId, hpR);
    if (n <= 0) return;
    this.cube.nucleus.getWorldCenter(this._laserOrigin);
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const d = this.spawnEnemyDrone('cube-fighter', true);
      if (!d) continue;
      const yaw = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.4;
      const pitch = (Math.random() - 0.5) * 0.9;
      d.group.position.copy(this._laserOrigin).add(
        new THREE.Vector3(
          Math.cos(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.sin(yaw) * Math.cos(pitch)
        ).multiplyScalar(1.6)
      );
      spawned++;
    }
    if (spawned > 0) {
      bus.emit('core-notify', {
        title: 'CUBE FIGHTERS',
        body: `${spawned} interceptors launched — fighters, take them.`,
        kind: 'overload',
      });
    }
  }

  private cubeFighterOverloadCount(levelId: number, hpRatio: number): number {
    if (levelId <= 3) return 0;
    const fromSector = 2 + Math.floor(levelId / 4);
    const fromHp = Math.floor((1 - Math.min(1, Math.max(0, hpRatio))) * 5);
    return Math.min(14, fromSector + fromHp);
  }

  private pickSubset<T>(list: T[], frac: number): T[] {
    if (list.length === 0) return [];
    const n = Math.max(0, Math.round(list.length * frac));
    if (n >= list.length) return list.slice();
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, n);
  }

  /** Fire a dodgeable arc beam from cube center. */
  fireArcBeam(dir: THREE.Vector3, speed: number, damage: number): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.22, 2.4, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.rotation.x = Math.PI / 2;
    const pos = new THREE.Vector3(0, 0, 0);
    const vel = dir.clone().normalize().multiplyScalar(speed);
    // Orient along velocity
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      vel.clone().normalize()
    );
    mesh.quaternion.copy(q);
    mesh.position.copy(pos);
    this.projectileRoot.add(mesh);
    this.arcs.push({ mesh, pos, vel, life: 4.5, damage });
    bus.emit('core-arc-fire', { damage, speed });
  }

  private spawnTurretOnInstance(instanceId: number, levelId: number, floating: boolean): void {
    if (!this.cube) return;
    this.cube.getInstanceWorldPos(instanceId, this._pos);
    // Offset slightly outward so model sits on surface
    this._pos.multiplyScalar(1.08);
    // Real HP — destructible like blocks; lattice block also cleared on kill
    const hp = LATTICE_TURRET_BASE_HIT_POINTS + levelId * LATTICE_TURRET_HIT_POINTS_PER_LEVEL;
    const t = new Turret(`turret_${this._idSeq++}`, this._pos.clone(), {
      hp,
      damage: LATTICE_TURRET_BASE_DAMAGE + levelId * LATTICE_TURRET_DAMAGE_PER_LEVEL,
      fireRate: this.schedule.elite ? LATTICE_TURRET_ELITE_FIRE_RATE : LATTICE_TURRET_FIRE_RATE,
      projectileSpeed:
        LATTICE_TURRET_BASE_PROJECTILE_SPEED + levelId * LATTICE_TURRET_PROJECTILE_SPEED_PER_LEVEL,
      color: this.schedule.elite ? 0xff66ff : 0xff3355,
    });
    t.group.scale.setScalar(0.55);
    this.links.push({ turret: t, instanceId, floating });
    this.group.add(t.group);
    for (const m of t.getProjectileMeshes()) this.projectileRoot.add(m);
  }

  private spawnFloatingTurret(pos: THREE.Vector3, levelId: number): void {
    const t = new Turret(`turret_${this._idSeq++}`, pos, {
      hp: FLOATING_TURRET_BASE_HIT_POINTS + levelId * FLOATING_TURRET_HIT_POINTS_PER_LEVEL,
      damage: FLOATING_TURRET_BASE_DAMAGE + levelId * FLOATING_TURRET_DAMAGE_PER_LEVEL,
      fireRate: FLOATING_TURRET_FIRE_RATE,
      projectileSpeed: FLOATING_TURRET_PROJECTILE_SPEED,
      color: 0xff4488,
    });
    this.links.push({ turret: t, instanceId: -1, floating: true });
    this.group.add(t.group);
    for (const m of t.getProjectileMeshes()) this.projectileRoot.add(m);
  }

  getSchedule(): DefenseSchedule {
    return this.schedule;
  }

  getEnemyUnitRefs(): Array<{
    id: string;
    position: { x: number; y: number; z: number };
    hp: number;
    kind?: string;
  }> {
    const out: Array<{
      id: string;
      position: { x: number; y: number; z: number };
      hp: number;
      kind?: string;
    }> = [];
    for (const d of this.enemyDrones) {
      if (d.alive) out.push(d.toUnitRef());
    }
    for (const link of this.links) {
      if (!link.turret.alive) continue;
      const p = link.turret.group.position;
      out.push({
        id: link.turret.id,
        position: { x: p.x, y: p.y, z: p.z },
        hp: link.turret.hp,
        kind: 'turret',
      });
    }
    return out;
  }

  /**
   * All hostile entities with hittable spheres for main gun / loadout weapons.
   * Larger radii after long-range orbit so soft-lock + bolts connect reliably.
   */
  getEnemyTargetsForWeapons(): Array<{ position: THREE.Vector3; radius: number; id: string }> {
    const out: Array<{ position: THREE.Vector3; radius: number; id: string }> = [];
    for (const d of this.enemyDrones) {
      if (d.alive) {
        out.push({
          position: d.position.clone(),
          radius: ENEMY_WEAPON_TARGET_RADIUS_DRONE,
          id: d.id,
        });
      }
    }
    for (const link of this.links) {
      if (!link.turret.alive) continue;
      // Prefer live world position of turret model
      out.push({
        position: link.turret.group.position.clone(),
        radius: ENEMY_WEAPON_TARGET_RADIUS_TURRET,
        id: link.turret.id,
      });
    }
    for (const t of this.kit.getWeaponTargets()) out.push(t);
    return out;
  }

  /**
   * Apply damage to enemy drones / turrets. Lattice turrets also destroy their block.
   * Returns true if the entity was killed.
   */
  damageEnemy(id: string, amount: number): boolean {
    for (const d of this.enemyDrones) {
      if (d.id === id && d.alive) {
        const killed = d.applyDamage(amount);
        if (killed) {
          bus.emit('beam-hit', {
            destroyed: true,
            type: BlockType.Standard,
            x: d.position.x,
            y: d.position.y,
            z: d.position.z,
            fragments: 4,
            style: 'bolt' as const,
          });
        }
        return killed;
      }
    }
    for (const link of this.links) {
      if (link.turret.id !== id || !link.turret.alive) continue;
      const killed = link.turret.applyDamage(amount);
      if (killed) {
        const p = link.turret.group.position;
        bus.emit('beam-hit', {
          destroyed: true,
          type: BlockType.Turret,
          x: p.x,
          y: p.y,
          z: p.z,
          fragments: 6,
          style: 'explosive' as const,
        });
        // Clear lattice turret block if bound
        if (!link.floating && link.instanceId >= 0 && this.cube?.hasInstance(link.instanceId)) {
          this.cube.applyDamageDirect(link.instanceId, 1e9, performance.now() / 1000);
        }
      }
      return killed;
    }
    return this.kit.damageEntity(id, amount);
  }

  /** Nucleus / rage projectiles — defender drones and CIWS only. */
  getInterceptTargets(): Array<{
    id: string;
    position: { x: number; y: number; z: number };
    radius: number;
  }> {
    const out: Array<{
      id: string;
      position: { x: number; y: number; z: number };
      radius: number;
    }> = [];
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      out.push({
        id: `arc_${i}`,
        position: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
        radius: ENEMY_INTERCEPT_RADIUS,
      });
    }
    for (const s of this.spikes.getInterceptTargets()) out.push(s);
    for (const k of this.kit.getInterceptTargets()) out.push(k);
    return out;
  }

  /** Damage an intercept target (arc beam / spike). Returns true if destroyed. */
  damageIntercept(id: string, amount: number): boolean {
    if (id.startsWith('spike_')) return this.spikes.damageIntercept(id, amount);
    if (id.startsWith('kit_')) return this.kit.damageEntity(id, amount);
    if (!id.startsWith('arc_')) return false;
    const idx = Number(id.slice(4));
    const a = this.arcs[idx];
    if (!a) return false;
    // Soft HP for arcs so fighters can shoot them down
    (a as { hp?: number }).hp = ((a as { hp?: number }).hp ?? ENEMY_ARC_DEFAULT_HIT_POINTS) - amount;
    if (((a as { hp?: number }).hp ?? 0) <= 0) {
      a.life = 0;
      return true;
    }
    return false;
  }

  absorbCoreDamage(raw: number): number {
    if (!this.coreShield.active || this.coreShield.current <= 0) return raw;
    const absorb = Math.min(this.coreShield.current, raw);
    this.coreShield.current -= absorb;
    this.coreShield.regenDelay = 3;
    this.flashShield(this.coreShieldMesh);
    if (this.coreShield.current <= 0) {
      this.coreShield.active = false;
      if (this.coreShieldMesh) this.coreShieldMesh.visible = false;
      bus.emit('cube-shield-break', { kind: 'core' });
    }
    return raw - absorb;
  }

  /**
   * @param allowFire When false (stage start countdown), defenses aim/move but do not shoot.
   */
  update(dt: number, allowFire = true): void {
    this.tickShield(this.coreShield, this.coreShieldMesh, dt);
    for (let i = 0; i < this.faceShields.length; i++) {
      this.tickShield(this.faceShields[i], this.faceShieldMeshes[i] ?? null, dt);
    }

    if (!this.hooks || !this.cube) return;
    const playerPos = this.hooks.getPlayerPosition();
    const dronePos = this.hooks.getPlayerDronePositions?.() ?? [];
    if (!this.playerVelPrimed) {
      this.lastPlayer.copy(playerPos);
      this.playerVel.set(0, 0, 0);
      this.playerVelPrimed = true;
    } else {
      const inv = dt > 1e-4 ? 1 / dt : 0;
      this.playerVel.lerp(
        this._pos.copy(playerPos).sub(this.lastPlayer).multiplyScalar(inv),
        1 - Math.exp(-8 * dt)
      );
      this.lastPlayer.copy(playerPos);
    }

    // Re-sync lattice turrets by position (instance ids shift on block remove)
    this.syncLatticeTurrets();

    for (const link of this.links) {
      if (!link.turret.alive) continue;
      if (!link.floating && link.instanceId >= 0) {
        this.cube.getInstanceWorldPos(link.instanceId, this._pos);
        link.turret.group.position.copy(this._pos).multiplyScalar(1.12);
      }
      // Temporarily scale fire rate via rage
      const base = link.turret;
      link.turret.update(
        dt * Math.min(2, this.fireRateMul),
        playerPos,
        (dmg) => {
          this.hooks?.onPlayerDamage(dmg, 'turret');
        },
        allowFire,
        this.playerVel
      );
      void base;
    }

    const he = this.cube.halfExtent;
    const now = performance.now() / 1000;
    for (const d of this.enemyDrones) {
      d.update(
        dt,
        playerPos,
        he,
        (dmg) => this.hooks?.onPlayerDamage(dmg, 'enemy-drone'),
        dronePos,
        allowFire,
        this.cube,
        now,
        {
          playerVel: this.playerVel,
          onDroneHit: (aim, dmg) => this.hooks?.onPlayerDroneDamage?.(aim, dmg),
        }
      );
    }

    // Legacy rage bolts (overload spray)
    if (allowFire) this.updateArcs(dt, playerPos);

    // Rage sweep laser — charge + slow-tracking continuous beam
    const nuc = this.cube.nucleus;
    const laserOn = nuc.isActive && nuc.attr === 'rage' && nuc.isExposed;
    if (laserOn) {
      nuc.getWorldCenter(this._laserOrigin);
    }
    const power = nuc.overloadDamageMul;
    this.rageLaser.update(dt, {
      active: laserOn,
      origin: this._laserOrigin,
      player: playerPos,
      overloading: nuc.isOverloading && nuc.attr === 'rage',
      allowFire,
      onPlayerDamage: (dmg) => this.hooks?.onPlayerDamage(dmg, 'core-arc'),
      damageMul: power,
    });
    if (laserOn && this.rageLaser.glow > 0) {
      nuc.flareFromLaser(this.rageLaser.glow);
    }

    if (nuc.isActive && nuc.attr === 'none') {
      nuc.getWorldCenter(this._laserOrigin);
    } else if (!nuc.isActive) {
      this.spikes.reset();
    }
    this.spikes.update(
      dt,
      playerPos,
      (dmg) => this.hooks?.onPlayerDamage(dmg, 'core-spike'),
      allowFire && nuc.isActive && nuc.attr === 'none'
    );
    if (this.spikes.glow > 0) nuc.flareFromLaser(this.spikes.glow);

    if (nuc.isActive) {
      nuc.getWorldCenter(this._laserOrigin);
      this.kit.update(
        dt,
        this._laserOrigin,
        playerPos,
        allowFire,
        (dmg) => this.hooks?.onPlayerDamage(dmg, 'core-kit'),
        nuc.overloadDamageMul
      );
    }

    if (this.coreShieldMesh && this.coreShield.active) {
      const mat = this.coreShieldMesh.material as THREE.MeshBasicMaterial;
      const ratio = this.coreShield.current / Math.max(1, this.coreShield.max);
      mat.opacity = 0.12 + ratio * 0.18 + Math.sin(performance.now() * 0.004) * 0.03;
    }
  }

  private updateArcs(dt: number, playerPos: THREE.Vector3): void {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      // Hit player (generous radius for readability)
      if (a.pos.distanceTo(playerPos) < 1.35) {
        this.hooks?.onPlayerDamage(a.damage, 'core-arc');
        a.life = 0;
      }
      if (a.life <= 0 || a.pos.length() > 90) {
        this.projectileRoot.remove(a.mesh);
        a.mesh.geometry.dispose();
        (a.mesh.material as THREE.Material).dispose();
        this.arcs.splice(i, 1);
      }
    }
  }

  /** Apply nucleus fire-rate aura (Rage). */
  setFireRateMul(mul: number): void {
    this.fireRateMul = Math.max(1, mul);
  }

  consumeOrbitNudge(): { yaw: number; pitch: number } | null {
    return this.kit.consumeOrbitNudge();
  }

  private tickShield(pool: ShieldPool, mesh: THREE.Mesh | null, dt: number): void {
    if (!pool.active && pool.current <= 0) return;
    if (pool.current >= pool.max) {
      pool.regenDelay = 0;
      return;
    }
    if (pool.regenDelay > 0) {
      pool.regenDelay -= dt;
      return;
    }
    pool.current = Math.min(pool.max, pool.current + pool.regenPerSec * dt);
    pool.active = pool.current > 0;
    if (mesh) {
      mesh.visible = pool.active;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.1 + (pool.current / pool.max) * 0.15;
    }
  }

  private flashShield(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  /**
   * Match non-floating turret models to current Turret block instances.
   * Destroys models whose lattice block was destroyed.
   */
  private syncLatticeTurrets(): void {
    if (!this.cube) return;
    const ids = this.cube.collectIdsOfType(BlockType.Turret);
    const used = new Set<number>();

    for (const link of this.links) {
      if (link.floating || !link.turret.alive) continue;
      // Find nearest turret block to current model position
      let bestId = -1;
      let bestD = 2.5;
      for (const id of ids) {
        if (used.has(id)) continue;
        this.cube.getInstanceWorldPos(id, this._pos);
        const d = link.turret.group.position.distanceTo(
          this._pos.clone().multiplyScalar(1.12)
        );
        if (d < bestD) {
          bestD = d;
          bestId = id;
        }
      }
      if (bestId < 0) {
        link.turret.applyDamage(999999);
      } else {
        used.add(bestId);
        link.instanceId = bestId;
      }
    }

    // Spawn missing models for new turret blocks (e.g. after load)
    for (const id of ids) {
      if (used.has(id)) continue;
      const already = this.links.some(
        (l) => !l.floating && l.turret.alive && l.instanceId === id
      );
      if (!already) this.spawnTurretOnInstance(id, this.levelId, false);
    }
  }

  reset(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    for (const link of this.links) {
      link.turret.reset();
      link.turret.dispose();
      this.group.remove(link.turret.group);
    }
    this.links = [];
    for (const d of this.enemyDrones) {
      d.reset();
      d.dispose();
      this.group.remove(d.group);
    }
    this.enemyDrones = [];
    for (const a of this.arcs) {
      this.projectileRoot.remove(a.mesh);
      a.mesh.geometry.dispose();
      (a.mesh.material as THREE.Material).dispose();
    }
    this.arcs = [];
    this.rageLaser.reset();
    this.spikes.reset();
    this.kit.reset();
    if (this.coreShieldMesh) {
      this.group.remove(this.coreShieldMesh);
      this.coreShieldMesh.geometry.dispose();
      (this.coreShieldMesh.material as THREE.Material).dispose();
      this.coreShieldMesh = null;
    }
    for (const m of this.faceShieldMeshes) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.faceShieldMeshes = [];
    this.faceShields = [];
    this.coreShield = { current: 0, max: 0, regenDelay: 0, regenPerSec: 0, active: false };
    this.fireRateMul = 1;
    this.playerVelPrimed = false;
    this.playerVel.set(0, 0, 0);
    while (this.projectileRoot.children.length) {
      this.projectileRoot.remove(this.projectileRoot.children[0]);
    }
  }

  dispose(): void {
    this.reset();
    this.rageLaser.dispose();
    this.spikes.dispose();
    this.kit.dispose();
    this.group.clear();
  }
}
