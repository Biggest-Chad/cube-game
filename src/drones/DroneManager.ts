import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import {
  DRONE_HARD_CAP,
  dronePurchaseCost,
  expandFleetRoles,
  fleetFromLegacyCount,
  type DroneFleetSnapshot,
  type DroneRole,
} from '../data/drones';
import { Drone, type DroneCombatContext } from './Drone';

/**
 * Multi-role drone fleet manager. Hard cap 24; exponential cost curve in data.
 */
export class DroneManager {
  readonly group = new THREE.Group();
  private drones: Drone[] = [];
  private fleet: DroneFleetSnapshot = fleetFromLegacyCount(0, false);
  private combat: DroneCombatContext = {};

  /** Legacy Game.ts path — all miners from tech stats. */
  syncCount(stats: PlayerStats): void {
    const fleet = fleetFromLegacyCount(stats.droneCount, stats.dronesUnlocked);
    this.syncFleet(fleet);
  }

  syncFleet(fleet: DroneFleetSnapshot): void {
    this.fleet = {
      count: Math.min(DRONE_HARD_CAP, Math.max(0, fleet.count)),
      unlockedRoles: [...fleet.unlockedRoles],
      roles: { ...fleet.roles },
    };
    // Normalize role sums
    const roles = expandFleetRoles(this.fleet);
    this.fleet.count = roles.length;

    // Rebuild if role list shape changed
    const same =
      this.drones.length === roles.length &&
      this.drones.every((d, i) => d.role === roles[i]);
    if (same) return;

    this.clearDrones();
    for (let i = 0; i < roles.length; i++) {
      const d = new Drone(i, roles[i]);
      this.drones.push(d);
      this.group.add(d.group);
    }
  }

  getFleet(): DroneFleetSnapshot {
    return {
      count: this.fleet.count,
      unlockedRoles: [...this.fleet.unlockedRoles],
      roles: { ...this.fleet.roles },
    };
  }

  get count(): number {
    return this.drones.length;
  }

  /** Next purchase cost for +1 drone (miner default). */
  nextPurchaseCost(): number {
    return dronePurchaseCost(this.fleet.count);
  }

  canPurchase(): boolean {
    return this.fleet.count < DRONE_HARD_CAP;
  }

  /**
   * Add one drone of role (defaults miner). Caller spends currency.
   */
  purchaseDrone(role: DroneRole = 'miner'): boolean {
    if (!this.canPurchase()) return false;
    if (!this.fleet.unlockedRoles.includes(role)) {
      if (role !== 'miner') return false;
    }
    this.fleet.count += 1;
    this.fleet.roles[role] = (this.fleet.roles[role] ?? 0) + 1;
    this.syncFleet(this.fleet);
    return true;
  }

  unlockRole(role: DroneRole): boolean {
    if (this.fleet.unlockedRoles.includes(role)) return false;
    this.fleet.unlockedRoles.push(role);
    return true;
  }

  /**
   * Reassign one drone from fromRole to toRole.
   */
  reassign(fromRole: DroneRole, toRole: DroneRole): boolean {
    const from = this.fleet.roles[fromRole] ?? 0;
    if (from <= 0) return false;
    if (!this.fleet.unlockedRoles.includes(toRole)) return false;
    this.fleet.roles[fromRole] = from - 1;
    this.fleet.roles[toRole] = (this.fleet.roles[toRole] ?? 0) + 1;
    this.syncFleet(this.fleet);
    return true;
  }

  setCombatContext(ctx: DroneCombatContext): void {
    this.combat = ctx;
  }

  update(
    dt: number,
    cube: CubeManager,
    stats: PlayerStats,
    now: number,
    hidden: boolean
  ): void {
    // Keep legacy auto-sync if fleet empty but stats say otherwise
    if (this.drones.length === 0 && stats.dronesUnlocked && stats.droneCount > 0) {
      this.syncCount(stats);
    }
    for (const d of this.drones) {
      d.update(dt, cube, stats, now, hidden, this.combat);
    }
  }

  /** Estimate drone DPS on soft blocks for UI. */
  estimateBlockDps(stats: PlayerStats): number {
    let dps = 0;
    for (const d of this.drones) {
      if (d.role === 'fighter') continue;
      const rate = 2.2 * stats.droneFireRateMul;
      dps += COMBAT_BASE * 0.45 * stats.droneDamageMul * rate;
    }
    return dps;
  }

  reset(): void {
    // Session: keep fleet ownership; no projectile state on drones
    for (const d of this.drones) {
      // beams clear on their own
    }
  }

  private clearDrones(): void {
    for (const d of this.drones) {
      this.group.remove(d.group);
      d.dispose();
    }
    this.drones = [];
  }

  dispose(): void {
    this.clearDrones();
    this.group.clear();
  }
}

const COMBAT_BASE = 12;
