import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import {
  DRONE_BASE_SHIELD_REGEN_DELAY,
  DRONE_BASE_SHIELD_REGEN_PER_SEC,
  DRONE_HARD_CAP,
  DRONE_ROLES,
  dronePurchaseCost,
  expandFleetRoles,
  fleetFromLegacyCount,
  type DroneFleetSnapshot,
  type DroneRole,
} from '../data/drones';
import { Drone, type DroneCombatContext } from './Drone';
import { COLORS } from '../data/constants';

/**
 * Multi-role drone fleet + shared frontal defender shield.
 */
export class DroneManager {
  readonly group = new THREE.Group();
  private drones: Drone[] = [];
  private fleet: DroneFleetSnapshot = fleetFromLegacyCount(0, false);
  private combat: DroneCombatContext = {};
  private stats: PlayerStats | null = null;

  /** Shared escort shield (sum of defenders). */
  shieldHp = 0;
  shieldMax = 0;
  private shieldRegenDelay = 0;
  private shieldMesh: THREE.Mesh | null = null;

  syncCount(stats: PlayerStats): void {
    this.stats = stats;
    const fleet = fleetFromLegacyCount(stats.droneCount, stats.dronesUnlocked);
    this.syncFleet(fleet);
    this.recomputeShield(stats);
    for (const d of this.drones) d.syncVitals(stats);
  }

  syncFleet(fleet: DroneFleetSnapshot): void {
    this.fleet = {
      count: Math.min(DRONE_HARD_CAP, Math.max(0, fleet.count)),
      unlockedRoles: [...fleet.unlockedRoles],
      roles: { ...fleet.roles },
    };
    const roles = expandFleetRoles(this.fleet);
    this.fleet.count = roles.length;

    const same =
      this.drones.length === roles.length &&
      this.drones.every((d, i) => d.role === roles[i]);
    if (same) {
      if (this.stats) for (const d of this.drones) d.syncVitals(this.stats);
      return;
    }

    this.clearDrones();
    for (let i = 0; i < roles.length; i++) {
      const d = new Drone(i, roles[i]);
      if (this.stats) d.syncVitals(this.stats);
      this.drones.push(d);
      this.group.add(d.group);
    }
    if (this.stats) this.recomputeShield(this.stats);
  }

  private recomputeShield(stats: PlayerStats): void {
    let max = 0;
    for (const d of this.drones) {
      if (d.role !== 'defender') continue;
      max +=
        DRONE_ROLES.defender.frontalShield *
        (1 + (stats.droneShieldAdd ?? 0));
    }
    max = Math.round(max);
    const ratio = this.shieldMax > 0 ? this.shieldHp / this.shieldMax : 1;
    this.shieldMax = max;
    this.shieldHp = max > 0 ? Math.min(max, Math.max(0, ratio * max)) : 0;
    this.ensureShieldMesh();
  }

  private ensureShieldMesh(): void {
    if (this.shieldMax <= 0) {
      if (this.shieldMesh) {
        this.group.remove(this.shieldMesh);
        this.shieldMesh.geometry.dispose();
        (this.shieldMesh.material as THREE.Material).dispose();
        this.shieldMesh = null;
      }
      return;
    }
    if (!this.shieldMesh) {
      this.shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshBasicMaterial({
          color: COLORS.green,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      this.group.add(this.shieldMesh);
    }
  }

  /**
   * Absorb incoming player damage with frontal escort shield.
   * Returns remaining damage after shield.
   */
  absorbFrontalDamage(raw: number): number {
    if (this.shieldMax <= 0 || this.shieldHp <= 0 || raw <= 0) return raw;
    const absorb = Math.min(this.shieldHp, raw);
    this.shieldHp -= absorb;
    this.shieldRegenDelay =
      DRONE_BASE_SHIELD_REGEN_DELAY * (1 - Math.min(0.5, this.stats?.droneShieldRegenAdd ?? 0));
    if (this.shieldHp <= 0 && this.shieldMesh) {
      this.shieldMesh.visible = false;
    }
    return raw - absorb;
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

  getAliveCount(): number {
    return this.drones.filter((d) => d.alive).length;
  }

  nextPurchaseCost(): number {
    return dronePurchaseCost(this.fleet.count);
  }

  canPurchase(): boolean {
    return this.fleet.count < DRONE_HARD_CAP;
  }

  purchaseDrone(role: DroneRole = 'fighter'): boolean {
    if (!this.canPurchase()) return false;
    if (!this.fleet.unlockedRoles.includes(role)) {
      if (role !== 'fighter') return false;
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
    this.stats = stats;
    if (this.drones.length === 0 && stats.dronesUnlocked && stats.droneCount > 0) {
      this.syncCount(stats);
    }

    // Shield regen
    if (this.shieldMax > 0 && this.shieldHp < this.shieldMax) {
      if (this.shieldRegenDelay > 0) this.shieldRegenDelay -= dt;
      else {
        const regen =
          DRONE_BASE_SHIELD_REGEN_PER_SEC *
          (1 + (stats.droneShieldRegenAdd ?? 0));
        this.shieldHp = Math.min(this.shieldMax, this.shieldHp + regen * dt);
        if (this.shieldMesh) this.shieldMesh.visible = this.shieldHp > 0;
      }
    }

    // Position shield mesh near ship if combat provides ship pos
    if (this.shieldMesh && this.combat.shipPos) {
      const ship = this.combat.shipPos;
      const toC = new THREE.Vector3(-ship.x, -ship.y, -ship.z).normalize();
      if (toC.lengthSq() < 1e-6) toC.set(0, 0, -1);
      this.shieldMesh.position.copy(ship).addScaledVector(toC, 1.8);
      this.shieldMesh.lookAt(0, 0, 0);
      const mat = this.shieldMesh.material as THREE.MeshBasicMaterial;
      const r = this.shieldHp / Math.max(1, this.shieldMax);
      mat.opacity = 0.1 + r * 0.28;
      this.shieldMesh.visible = this.shieldHp > 0.5;
    }

    for (const d of this.drones) {
      d.update(dt, cube, stats, now, hidden, this.combat);
    }
  }

  estimateBlockDps(stats: PlayerStats): number {
    let dps = 0;
    for (const d of this.drones) {
      if (d.role === 'defender' || !d.alive) continue;
      const def = DRONE_ROLES[d.role];
      const rate = 2.2 * stats.droneFireRateMul * def.fireRateMul;
      dps += 12 * 0.45 * stats.droneDamageMul * def.blockDamageMul * rate;
    }
    return dps;
  }

  reset(): void {
    for (const d of this.drones) {
      if (!d.alive && this.stats) {
        d.syncVitals(this.stats);
      }
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
    if (this.shieldMesh) {
      this.group.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      (this.shieldMesh.material as THREE.Material).dispose();
      this.shieldMesh = null;
    }
    this.group.clear();
  }
}
