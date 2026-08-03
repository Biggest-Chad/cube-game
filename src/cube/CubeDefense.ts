/**
 * Staged cube self-defense: shields, turrets, enemy drones.
 * Level-gated schedule from plan P8.
 */
import * as THREE from 'three';
import type { CubeManager } from './CubeManager';
import { Turret } from './Turret';
import { EnemyDrone } from './EnemyDrone';
import { bus } from '../core/EventBus';
import { COLORS } from '../data/constants';

export interface DefenseSchedule {
  coreShield: boolean;
  faceShields: boolean;
  turretCount: number;
  enemyDroneCount: number;
  layeredShields: boolean;
  elite: boolean;
}

/** Tunable introduction schedule by level id. */
export function defenseScheduleForLevel(levelId: number): DefenseSchedule {
  if (levelId <= 4) {
    return {
      coreShield: false,
      faceShields: false,
      turretCount: 0,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 7) {
    return {
      coreShield: true,
      faceShields: false,
      turretCount: 0,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 10) {
    return {
      coreShield: true,
      faceShields: false,
      turretCount: 1,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 14) {
    return {
      coreShield: true,
      faceShields: true,
      turretCount: 2,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 18) {
    return {
      coreShield: true,
      faceShields: true,
      turretCount: 2,
      enemyDroneCount: 2 + Math.min(2, levelId - 15),
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 25) {
    return {
      coreShield: true,
      faceShields: true,
      turretCount: 3,
      enemyDroneCount: 4,
      layeredShields: true,
      elite: false,
    };
  }
  return {
    coreShield: true,
    faceShields: true,
    turretCount: 4,
    enemyDroneCount: 6,
    layeredShields: true,
    elite: true,
  };
}

export interface ShieldPool {
  current: number;
  max: number;
  /** Seconds since last hit */
  regenDelay: number;
  regenPerSec: number;
  active: boolean;
}

export interface CubeDefenseHooks {
  onPlayerDamage: (amount: number, source: string) => void;
  getPlayerPosition: () => THREE.Vector3;
  getPlayerDronePositions?: () => THREE.Vector3[];
}

export class CubeDefense {
  readonly group = new THREE.Group();
  private cube: CubeManager | null = null;
  private levelId = 1;
  private schedule: DefenseSchedule = defenseScheduleForLevel(1);
  private turrets: Turret[] = [];
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

  constructor() {
    this.group.add(this.projectileRoot);
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
    this.schedule = defenseScheduleForLevel(levelId);
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
      // Use 2–4 faces mid, all late
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

    // Turrets on surface
    for (let i = 0; i < this.schedule.turretCount; i++) {
      const ang = (i / Math.max(1, this.schedule.turretCount)) * Math.PI * 2 + 0.4;
      const elev = (i % 2 === 0 ? 0.4 : -0.35) * he;
      const pos = new THREE.Vector3(
        Math.cos(ang) * he * 1.05,
        elev,
        Math.sin(ang) * he * 1.05
      );
      const t = new Turret(`turret_${this._idSeq++}`, pos, {
        hp: 60 + levelId * 10,
        damage: 10 + levelId * 0.8,
        fireRate: this.schedule.elite ? 0.65 : 0.4,
        projectileSpeed: 16 + levelId * 0.3,
        color: this.schedule.elite ? 0xff66ff : 0xff4488,
      });
      this.turrets.push(t);
      this.group.add(t.group);
      for (const m of t.getProjectileMeshes()) {
        this.projectileRoot.add(m);
      }
    }

    // Enemy drones
    for (let i = 0; i < this.schedule.enemyDroneCount; i++) {
      const d = new EnemyDrone(`ed_${this._idSeq++}`, i, he, {
        hp: 35 + levelId * 4,
        damage: 6 + levelId * 0.5,
        fireRate: this.schedule.elite ? 1.4 : 1.0,
        color: 0xff2244,
      });
      this.enemyDrones.push(d);
      this.group.add(d.group);
    }

    bus.emit('cube-defense-started', { levelId, schedule: this.schedule });
  }

  getSchedule(): DefenseSchedule {
    return this.schedule;
  }

  /** Live enemy unit refs for player fighters / flak. */
  getEnemyUnitRefs(): Array<{ id: string; position: { x: number; y: number; z: number }; hp: number }> {
    return this.enemyDrones.filter((d) => d.alive).map((d) => d.toUnitRef());
  }

  getEnemyTargetsForWeapons(): Array<{ position: THREE.Vector3; radius: number; id: string }> {
    return this.enemyDrones
      .filter((d) => d.alive)
      .map((d) => ({
        position: d.position.clone(),
        radius: 0.6,
        id: d.id,
      }));
  }

  damageEnemy(id: string, amount: number): boolean {
    for (const d of this.enemyDrones) {
      if (d.id === id && d.alive) return d.applyDamage(amount);
    }
    for (const t of this.turrets) {
      if (t.id === id && t.alive) return t.applyDamage(amount);
    }
    return false;
  }

  /**
   * Absorb damage aimed at cube center / core region.
   * Returns remaining damage that should hit blocks.
   */
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

  update(dt: number): void {
    // Shield regen
    this.tickShield(this.coreShield, this.coreShieldMesh, dt);
    for (let i = 0; i < this.faceShields.length; i++) {
      this.tickShield(this.faceShields[i], this.faceShieldMeshes[i] ?? null, dt);
    }

    if (!this.hooks || !this.cube) return;
    const playerPos = this.hooks.getPlayerPosition();
    const dronePos = this.hooks.getPlayerDronePositions?.() ?? [];

    for (const t of this.turrets) {
      t.update(dt, playerPos, (dmg, _pt) => {
        this.hooks?.onPlayerDamage(dmg, 'turret');
      });
    }

    const he = this.cube.halfExtent;
    for (const d of this.enemyDrones) {
      d.update(
        dt,
        playerPos,
        he,
        (dmg) => this.hooks?.onPlayerDamage(dmg, 'enemy-drone'),
        dronePos
      );
    }

    // Core shield pulse
    if (this.coreShieldMesh && this.coreShield.active) {
      const mat = this.coreShieldMesh.material as THREE.MeshBasicMaterial;
      const ratio = this.coreShield.current / Math.max(1, this.coreShield.max);
      mat.opacity = 0.12 + ratio * 0.18 + Math.sin(performance.now() * 0.004) * 0.03;
    }
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
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.55;
  }

  /** Session cleaner entry. */
  reset(): void {
    for (const t of this.turrets) {
      t.reset();
      t.dispose();
      this.group.remove(t.group);
    }
    this.turrets = [];
    for (const d of this.enemyDrones) {
      d.reset();
      d.dispose();
      this.group.remove(d.group);
    }
    this.enemyDrones = [];
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
    while (this.projectileRoot.children.length) {
      this.projectileRoot.remove(this.projectileRoot.children[0]);
    }
  }

  dispose(): void {
    this.reset();
    this.group.clear();
  }
}
