/**
 * Shared weapon runtime contract. Every equippable family implements this.
 */
import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { WeaponStats } from '../data/weapons';
import type { PlayerStats } from '../progression/TechTree';

export interface WeaponFireContext {
  dt: number;
  firing: boolean;
  origin: THREE.Vector3;
  /** Preferred aim direction (usually toward cube origin from ship). */
  direction: THREE.Vector3;
  cube: CubeManager;
  playerStats: PlayerStats;
  now: number;
  /** Slot index 0..2 for hardpoint weapons; -1 for main gun */
  slot: number;
  /** Optional ship vitals / defense targets for flak anti-drone */
  enemyTargets?: Array<{ position: THREE.Vector3; radius: number; id: string }>;
  onEnemyHit?: (id: string, damage: number) => void;
}

export interface WeaponBehavior {
  readonly family: string;
  readonly group: THREE.Group;

  /** Apply derived stats (call when loadout changes). */
  setStats(stats: WeaponStats & { flags?: Set<string> }): void;

  /** Per-frame simulation + auto fire. */
  update(ctx: WeaponFireContext): void;

  /** Clear projectiles / heat / charge for session transitions. */
  reset(): void;

  dispose(): void;

  /** Optional heat 0..1 for HUD. */
  getHeat?(): number;

  /** Optional charge 0..1 for rail/torpedo HUD. */
  getCharge?(): number;
}

export function aimAtCube(from: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(from).multiplyScalar(-1).normalize();
}
