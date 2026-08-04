/**
 * Main gun facade — auto-fire plasma from nose muzzle with manual aim offset.
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

  constructor() {
    const def = getWeaponDef('pulse_laser');
    if (def) {
      const stats = computeWeaponStats(def, {});
      stats.damage = COMBAT.baseDamage;
      stats.fireRate = COMBAT.baseFireRate;
      stats.projectileSpeed = COMBAT.projectileSpeed;
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

    // Default: aim at cube center
    this._fwd.set(0, 0, 0).sub(this._origin).normalize();
    if (this._fwd.lengthSq() < 1e-6) ship.getForward(this._fwd);

    // Build local aim frame around forward
    this._right.crossVectors(this._fwd, this._worldUp);
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    else this._right.normalize();
    this._up.crossVectors(this._right, this._fwd).normalize();

    // Max offset ~28° — deliberate, not twitchy
    const maxRad = 0.48;
    this._dir
      .copy(this._fwd)
      .addScaledVector(this._right, aimX * maxRad)
      .addScaledVector(this._up, -aimY * maxRad)
      .normalize();

    this.main.update({
      dt,
      firing,
      origin: this._origin,
      direction: this._dir,
      cube,
      playerStats: stats,
      now,
      slot: -1,
    });
  }

  /** Current world-space aim direction (after last update). */
  getAimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this._dir);
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
