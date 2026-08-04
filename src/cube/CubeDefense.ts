/**
 * Cube self-defense: lattice-mounted turrets (destructible blocks) + enemy drones + shields.
 * Turrets are part of the cube lattice and move with Rubik slice scrambles.
 */
import * as THREE from 'three';
import type { CubeManager } from './CubeManager';
import { BlockType } from './BlockTypes';
import { Turret } from './Turret';
import { EnemyDrone } from './EnemyDrone';
import { bus } from '../core/EventBus';
import { COLORS } from '../data/constants';

export interface DefenseSchedule {
  coreShield: boolean;
  faceShields: boolean;
  /** Extra free-floating turrets only if lattice yield is low */
  floatingTurretFallback: number;
  enemyDroneCount: number;
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
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 6) {
    return {
      coreShield: true,
      faceShields: false,
      floatingTurretFallback: 1,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 10) {
    return {
      coreShield: true,
      faceShields: false,
      floatingTurretFallback: 2,
      enemyDroneCount: 0,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 14) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 2,
      enemyDroneCount: 1,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 18) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 3,
      enemyDroneCount: 3,
      layeredShields: false,
      elite: false,
    };
  }
  if (levelId <= 25) {
    return {
      coreShield: true,
      faceShields: true,
      floatingTurretFallback: 3,
      enemyDroneCount: 5,
      layeredShields: true,
      elite: false,
    };
  }
  return {
    coreShield: true,
    faceShields: true,
    floatingTurretFallback: 4,
    enemyDroneCount: 7,
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

    // Lattice turret blocks (primary — destructible & scramble-safe)
    const turretIds = this.cube.collectIdsOfType(BlockType.Turret);
    for (const id of turretIds) {
      this.spawnTurretOnInstance(id, levelId, false);
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
      const d = new EnemyDrone(`ed_${this._idSeq++}`, i, he, {
        hp: 35 + levelId * 4,
        damage: 6 + levelId * 0.5,
        fireRate: this.schedule.elite ? 1.4 : 1.0,
        color: 0xff2244,
      });
      this.enemyDrones.push(d);
      this.group.add(d.group);
    }

    bus.emit('cube-defense-started', {
      levelId,
      latticeTurrets: turretIds.length,
      totalTurrets: this.links.length,
    });
  }

  private spawnTurretOnInstance(instanceId: number, levelId: number, floating: boolean): void {
    if (!this.cube) return;
    this.cube.getInstanceWorldPos(instanceId, this._pos);
    // Offset slightly outward so model sits on surface
    this._pos.multiplyScalar(1.08);
    const t = new Turret(`turret_${this._idSeq++}`, this._pos.clone(), {
      hp: 99999, // HP is the lattice block; visual dies with block
      damage: 9 + levelId * 0.85,
      fireRate: this.schedule.elite ? 0.7 : 0.45,
      projectileSpeed: 16 + levelId * 0.35,
      color: this.schedule.elite ? 0xff66ff : 0xff3355,
    });
    // Shrink model to block scale
    t.group.scale.setScalar(0.55);
    this.links.push({ turret: t, instanceId, floating });
    this.group.add(t.group);
    for (const m of t.getProjectileMeshes()) this.projectileRoot.add(m);
  }

  private spawnFloatingTurret(pos: THREE.Vector3, levelId: number): void {
    const t = new Turret(`turret_${this._idSeq++}`, pos, {
      hp: 70 + levelId * 12,
      damage: 10 + levelId * 0.8,
      fireRate: 0.4,
      projectileSpeed: 16,
      color: 0xff4488,
    });
    this.links.push({ turret: t, instanceId: -1, floating: true });
    this.group.add(t.group);
    for (const m of t.getProjectileMeshes()) this.projectileRoot.add(m);
  }

  getSchedule(): DefenseSchedule {
    return this.schedule;
  }

  getEnemyUnitRefs(): Array<{ id: string; position: { x: number; y: number; z: number }; hp: number }> {
    return this.enemyDrones.filter((d) => d.alive).map((d) => d.toUnitRef());
  }

  getEnemyTargetsForWeapons(): Array<{ position: THREE.Vector3; radius: number; id: string }> {
    const out: Array<{ position: THREE.Vector3; radius: number; id: string }> = [];
    for (const d of this.enemyDrones) {
      if (d.alive) out.push({ position: d.position.clone(), radius: 0.6, id: d.id });
    }
    // Lattice turrets: target via blocks; floating still targetable as entities
    for (const link of this.links) {
      if (link.floating && link.turret.alive) {
        out.push({
          position: link.turret.group.position.clone(),
          radius: 0.5,
          id: link.turret.id,
        });
      }
    }
    return out;
  }

  damageEnemy(id: string, amount: number): boolean {
    for (const d of this.enemyDrones) {
      if (d.id === id && d.alive) return d.applyDamage(amount);
    }
    for (const link of this.links) {
      if (link.turret.id === id && link.turret.alive && link.floating) {
        return link.turret.applyDamage(amount);
      }
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

  update(dt: number): void {
    this.tickShield(this.coreShield, this.coreShieldMesh, dt);
    for (let i = 0; i < this.faceShields.length; i++) {
      this.tickShield(this.faceShields[i], this.faceShieldMeshes[i] ?? null, dt);
    }

    if (!this.hooks || !this.cube) return;
    const playerPos = this.hooks.getPlayerPosition();
    const dronePos = this.hooks.getPlayerDronePositions?.() ?? [];

    // Re-sync lattice turrets by position (instance ids shift on block remove)
    this.syncLatticeTurrets();

    for (const link of this.links) {
      if (!link.turret.alive) continue;
      if (!link.floating && link.instanceId >= 0) {
        this.cube.getInstanceWorldPos(link.instanceId, this._pos);
        link.turret.group.position.copy(this._pos).multiplyScalar(1.12);
      }
      link.turret.update(dt, playerPos, (dmg) => {
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
