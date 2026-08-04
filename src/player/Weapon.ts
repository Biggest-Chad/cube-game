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
import { getWeaponDef, computeWeaponStats } from '../data/weapons';

export class Weapon {
  readonly group = new THREE.Group();
  private readonly main = new MainBeamWeapon();
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
  update(
    dt: number,
    firing: boolean,
    ship: Ship,
    cube: CubeManager,
    stats: PlayerStats,
    now: number,
    aimX = 0,
    aimY = 0
  ): void {
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
    });
  }

  /**
   * Stick offsets a cone around ship→cube, then soft-locks onto the best block
   * near that ray so crosshair and bolts share one reliable aim point.
   */
  private resolveAim(ship: Ship, cube: CubeManager, aimX: number, aimY: number): void {
    // Default: aim at cube center
    this._fwd.set(0, 0, 0).sub(this._origin);
    if (this._fwd.lengthSq() < 1e-6) ship.getForward(this._fwd);
    else this._fwd.normalize();

    this._right.crossVectors(this._fwd, this._worldUp);
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    else this._right.normalize();
    this._up.crossVectors(this._right, this._fwd).normalize();

    // Slightly wider stick cone for easier surface coverage (~32°)
    const maxRad = 0.56;
    this._dir
      .copy(this._fwd)
      .addScaledVector(this._right, aimX * maxRad)
      .addScaledVector(this._up, -aimY * maxRad)
      .normalize();

    // Primary raycast with generous half-extent (cube raycast uses expanded boxes for aim)
    let hit = cube.raycast(this._origin, this._dir, COMBAT.beamRange, -1, 0.62);
    // Soft assist: if miss, search a small cone for nearest surface hit
    if (!hit) {
      hit = this.coneAssist(cube, 0.12, 7);
    }
    if (!hit) {
      hit = this.coneAssist(cube, 0.22, 11);
    }

    if (hit) {
      // Aim at block center (more reliable than face point for projectiles)
      const center = cube.getInstanceWorldPos(hit.instanceId, this._tmp);
      // Bias slightly toward the hit face so we don't aim through the block
      this._aimTarget.copy(center).lerp(hit.point, 0.35);
      this._dir.copy(this._aimTarget).sub(this._origin).normalize();
      this._locked = true;
    } else {
      this._aimTarget.copy(this._origin).addScaledVector(this._dir, 42);
      this._locked = false;
    }
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
      const h = cube.raycast(this._origin, this._tmp, COMBAT.beamRange, -1, 0.62);
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
