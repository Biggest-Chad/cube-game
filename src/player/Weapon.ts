/**
 * Facade — main gun delegates to MainBeamWeapon for Game.ts compatibility.
 * Hardpoint weapons are owned by combat/HardpointSystem.
 */
import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import { MainBeamWeapon } from '../weapons/MainBeamWeapon';
import { COMBAT } from '../data/constants';
import { getWeaponDef, computeWeaponStats } from '../data/weapons';

export class Weapon {
  readonly group = new THREE.Group();
  private readonly main = new MainBeamWeapon();
  private readonly _dir = new THREE.Vector3();

  constructor() {
    // Seed with pulse laser defaults + main-gun combat constants
    const def = getWeaponDef('pulse_laser');
    if (def) {
      const stats = computeWeaponStats(def, {});
      stats.damage = COMBAT.baseDamage;
      stats.fireRate = COMBAT.baseFireRate;
      stats.projectileSpeed = COMBAT.projectileSpeed;
      this.main.setStats(stats);
    }
    // Projectiles live in world space; keep group at origin
    this.group.add(this.main.group);
  }

  update(
    dt: number,
    firing: boolean,
    shipPos: THREE.Vector3,
    cube: CubeManager,
    stats: PlayerStats,
    now: number
  ): void {
    this._dir.copy(shipPos).multiplyScalar(-1).normalize();
    if (this._dir.lengthSq() < 1e-6) this._dir.set(0, 0, -1);

    this.main.update({
      dt,
      firing,
      origin: shipPos,
      direction: this._dir,
      cube,
      playerStats: stats,
      now,
      slot: -1,
    });
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
