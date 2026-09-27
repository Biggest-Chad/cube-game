/**
 * Main gun facade — auto-fire plasma from nose muzzle with stick aim.
 * Aim is locked to a world target (soft-assisted) so crosshair and bolts share one ray.
 */
import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import type { Ship } from './Ship';
import { MainBeamWeapon } from '../weapons/MainBeamWeapon';
import { COMBAT } from '../data/constants';
import {
  MAIN_GUN_BOLT_POOL,
  MAIN_GUN_AIM_BLOCK_HALF_EXTENT,
  MAIN_GUN_AIM_STICK_CONE_RADIANS,
  MAIN_GUN_CONE_ASSIST_INNER_RADIANS,
  MAIN_GUN_CONE_ASSIST_INNER_SAMPLES,
  MAIN_GUN_CONE_ASSIST_OUTER_RADIANS,
  MAIN_GUN_CONE_ASSIST_OUTER_SAMPLES,
  MAIN_GUN_ENEMY_LOCK_ANGULAR_SLACK,
  type MainGunLockPriority,
} from '../data/constraints';
import { getWeaponDef, computeWeaponStats } from '../data/weapons';
import type { MainGunAmmoId } from '../data/ammo';

export class Weapon {
  readonly group = new THREE.Group();
  private readonly main = new MainBeamWeapon(MAIN_GUN_BOLT_POOL);
  private readonly _dir = new THREE.Vector3();
  private readonly _origin = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _worldUp = new THREE.Vector3(0, 1, 0);
  private readonly _aimTarget = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();
  private _locked = false;

  constructor() {
    const def = getWeaponDef('pulse_laser');
    if (def) {
      const stats = computeWeaponStats(def, {});
      stats.damage = COMBAT.baseDamage;
      stats.fireRate = COMBAT.baseFireRate;
      stats.projectileSpeed = COMBAT.projectileSpeed;
      // Main gun reliability: no random cone in stats path
      stats.spread = 0;
      this.main.setStats(stats);
    }
    this.group.add(this.main.group);
  }

  /**
   * @param aimX aim stick X (−1..1) horizontal offset
   * @param aimY aim stick Y (−1..1) vertical offset
   */
  private enemyTargets: Array<{ position: THREE.Vector3; radius: number; id: string }> = [];
  private onEnemyHit: ((id: string, dmg: number) => void) | null = null;
  private lockPriority: MainGunLockPriority = 'nucleus';
  private readonly _nuc = new THREE.Vector3();

  update(
    dt: number,
    firing: boolean,
    ship: Ship,
    cube: CubeManager,
    stats: PlayerStats,
    now: number,
    aimX = 0,
    aimY = 0,
    extras?: {
      enemyTargets?: Array<{ position: THREE.Vector3; radius: number; id: string }>;
      onEnemyHit?: (id: string, dmg: number) => void;
      ammo?: MainGunAmmoId;
      lockPriority?: MainGunLockPriority;
    }
  ): void {
    this.enemyTargets = extras?.enemyTargets ?? [];
    this.onEnemyHit = extras?.onEnemyHit ?? null;
    this.lockPriority = extras?.lockPriority ?? 'nucleus';
    ship.getMuzzleWorldPosition(this._origin);
    this.resolveAim(ship, cube, aimX, aimY);

    this.main.update({
      dt,
      firing,
      origin: this._origin,
      direction: this._dir,
      cube,
      playerStats: stats,
      now,
      slot: -1,
      // Exact aim target so primary bolt goes where the crosshair is
      aimTarget: this._aimTarget,
      aimLocked: this._locked,
      enemyTargets: this.enemyTargets,
      onEnemyHit: this.onEnemyHit ?? undefined,
      ammo: extras?.ammo ?? 'standard',
      lockPriority: this.lockPriority,
    });
  }

  /**
   * Stick offsets a cone around ship→cube, then soft-locks onto the preferred
   * class (nucleus / lattice / drones) so crosshair and bolts share one ray.
   */
  private resolveAim(ship: Ship, cube: CubeManager, aimX: number, aimY: number): void {
    // Default: aim at cube center, blend toward leaned ship forward when reticle pulled (WAVE46)
    this._fwd.set(0, 0, 0).sub(this._origin);
    if (this._fwd.lengthSq() < 1e-6) ship.getForward(this._fwd);
    else this._fwd.normalize();

    const aimMag = Math.hypot(aimX, aimY);
    if (aimMag > 0.04) {
      ship.getForward(this._tmp);
      const leanBlend = Math.min(1, aimMag * 1.35);
      this._fwd.lerp(this._tmp, leanBlend).normalize();
    }

    this._right.crossVectors(this._fwd, this._worldUp);
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    else this._right.normalize();
    this._up.crossVectors(this._right, this._fwd).normalize();

    // Stick cone widens with lean so peripheral drones stay on the main-gun vector
    const maxRad = MAIN_GUN_AIM_STICK_CONE_RADIANS * (1 + Math.min(0.55, aimMag * 0.55));
    this._dir
      .copy(this._fwd)
      .addScaledVector(this._right, aimX * maxRad)
      .addScaledVector(this._up, -aimY * maxRad)
      .normalize();

    const prio = this.lockPriority;
    const tryNucleus = (): boolean => this.tryLockNucleus(cube, aimMag);
    const tryDrones = (): boolean => this.tryLockDrone();
    const tryBlocks = (): boolean => this.tryLockBlock(cube);
    const clearlyOnNucleus = aimMag < 0.16;

    let locked = false;
    if (prio === "drones") locked = tryDrones() || tryBlocks() || (clearlyOnNucleus && tryNucleus());
    else if (prio === "blocks") locked = tryBlocks() || tryDrones() || (clearlyOnNucleus && tryNucleus());
    else if (aimMag > 0.1) {
      locked = tryDrones() || tryBlocks();
      if (!locked) locked = tryNucleus();
    } else {
      locked = tryNucleus() || tryDrones() || tryBlocks();
    }

    if (!locked) {
      this._aimTarget.copy(this._origin).addScaledVector(this._dir, 42);
      this._locked = false;
    }
  }

  private tryLockDrone(): boolean {
    if (this.enemyTargets.length === 0) return false;
    let best: { position: THREE.Vector3; id: string } | null = null;
    let bestScore = Infinity;
    for (const et of this.enemyTargets) {
      const to = this._tmp.copy(et.position).sub(this._origin);
      const dist = to.length();
      if (dist < 1e-3 || dist > COMBAT.beamRange) continue;
      to.multiplyScalar(1 / dist);
      const ang = 1 - Math.max(-1, Math.min(1, to.dot(this._dir)));
      if (ang > MAIN_GUN_ENEMY_LOCK_ANGULAR_SLACK) continue;
      const score = dist + ang * 40;
      if (score < bestScore) {
        bestScore = score;
        best = et;
      }
    }
    if (!best) return false;
    this._aimTarget.copy(best.position);
    this._dir.copy(this._aimTarget).sub(this._origin).normalize();
    this._locked = true;
    return true;
  }

  private tryLockNucleus(cube: CubeManager, aimMag = 0): boolean {
    const nuc = cube.nucleus;
    if (!nuc.isActive) return false;
    nuc.getWorldCenter(this._nuc);
    const to = this._tmp.copy(this._nuc).sub(this._origin);
    const dist = to.length();
    if (dist < 1e-3 || dist > COMBAT.beamRange) return false;
    to.multiplyScalar(1 / dist);
    const ang = 1 - Math.max(-1, Math.min(1, to.dot(this._dir)));
    const lean = Math.min(1, Math.max(0, (aimMag - 0.08) / 0.55));
    const baseSlack = nuc.isExposed
      ? MAIN_GUN_ENEMY_LOCK_ANGULAR_SLACK * 0.72
      : MAIN_GUN_ENEMY_LOCK_ANGULAR_SLACK * 0.55;
    const slack = baseSlack * (1 - lean * 0.82);
    if (ang > slack) return false;
    if (!nuc.isExposed) {
      const hit = cube.raycast(this._origin, to, dist + 0.8, -1, MAIN_GUN_AIM_BLOCK_HALF_EXTENT);
      if (!hit?.nucleusSolid) return false;
    }
    this._aimTarget.copy(this._nuc);
    this._dir.copy(this._aimTarget).sub(this._origin).normalize();
    this._locked = true;
    return true;
  }

  private tryLockBlock(cube: CubeManager): boolean {
    // Primary raycast with generous half-extent (cube raycast uses expanded boxes for aim)
    let hit = cube.raycast(
      this._origin,
      this._dir,
      COMBAT.beamRange,
      -1,
      MAIN_GUN_AIM_BLOCK_HALF_EXTENT
    );
    if (!hit) {
      hit = this.coneAssist(cube, MAIN_GUN_CONE_ASSIST_INNER_RADIANS, MAIN_GUN_CONE_ASSIST_INNER_SAMPLES);
    }
    if (!hit) {
      hit = this.coneAssist(cube, MAIN_GUN_CONE_ASSIST_OUTER_RADIANS, MAIN_GUN_CONE_ASSIST_OUTER_SAMPLES);
    }
    if (!hit) return false;
    if (this.lockPriority === 'blocks' && hit.nucleusSolid) {
      // Lattice preference: skip a pure-nucleus hit so we fall through if a drone is next
      return false;
    }
    const center = cube.getInstanceWorldPos(hit.instanceId, this._tmp);
    this._aimTarget.copy(center).lerp(hit.point, 0.35);
    this._dir.copy(this._aimTarget).sub(this._origin).normalize();
    this._locked = true;
    return true;
  }

  private coneAssist(
    cube: CubeManager,
    coneRad: number,
    samples: number
  ): ReturnType<CubeManager['raycast']> {
    let best: ReturnType<CubeManager['raycast']> = null;
    let bestScore = Infinity;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const r = coneRad * (0.35 + (i % 3) * 0.35);
      const ox = Math.cos(a) * r;
      const oy = Math.sin(a) * r;
      this._tmp
        .copy(this._dir)
        .addScaledVector(this._right, ox)
        .addScaledVector(this._up, oy)
        .normalize();
      const h = cube.raycast(
        this._origin,
        this._tmp,
        COMBAT.beamRange,
        -1,
        MAIN_GUN_AIM_BLOCK_HALF_EXTENT
      );
      if (!h) continue;
      // Prefer closer hits, slight preference for central sample
      const score = h.distance + Math.hypot(ox, oy) * 8;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  getAimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this._dir);
  }

  getAimTarget(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this._aimTarget);
  }

  isAimLocked(): boolean {
    return this._locked;
  }

  getMuzzle(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this._origin);
  }

  getHeat(): number {
    return this.main.getHeat();
  }

  reset(): void {
    this.main.reset();
  }

  dispose(): void {
    this.main.dispose();
    this.group.clear();
  }
}
