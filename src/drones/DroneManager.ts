import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import {
  DRONE_BASE_SHIELD_REGEN_DELAY,
  DRONE_BASE_SHIELD_REGEN_PER_SEC,
  DRONE_ROLES,
  expandBaySlots,
  type DroneBayState,
  type DroneRole,
} from '../data/drones';
import type { DroneBayController } from '../loadout/DroneBayState';
import { Drone, type DroneCombatContext } from './Drone';
import { COLORS } from '../data/constants';

/**
 * Multi-role drone fleet from bay assignments + per-defender shield bubbles.
 */
export class DroneManager {
  readonly group = new THREE.Group();
  private drones: Drone[] = [];
  private combat: DroneCombatContext = {};
  private stats: PlayerStats | null = null;
  private bayCtrl: DroneBayController | null = null;

  /** Shared escort shield (sum of defenders). */
  shieldHp = 0;
  shieldMax = 0;
  private shieldRegenDelay = 0;
  private shieldMesh: THREE.Mesh | null = null;

  bindBayController(ctrl: DroneBayController): void {
    this.bayCtrl = ctrl;
  }

  /** Rebuild fleet from bay controller (preferred). */
  syncFromBays(stats: PlayerStats): void {
    this.stats = stats;
    if (!this.bayCtrl) return;
    const roles = this.bayCtrl.equippedRoles();
    this.applyRoles(roles, stats);
  }

  /** Legacy tech.droneCount path — only if no bays controller state. */
  syncCount(stats: PlayerStats): void {
    this.stats = stats;
    if (this.bayCtrl && this.bayCtrl.state.bays > 0) {
      this.syncFromBays(stats);
      return;
    }
    // Fallback: spawn fighters equal to droneCount
    const n = stats.dronesUnlocked ? Math.max(0, stats.droneCount) : 0;
    const roles: DroneRole[] = Array.from({ length: n }, () => 'fighter' as DroneRole);
    this.applyRoles(roles, stats);
  }

  private applyRoles(roles: DroneRole[], stats: PlayerStats): void {
    const same =
      this.drones.length === roles.length &&
      this.drones.every((d, i) => d.role === roles[i]);
    if (same) {
      for (const d of this.drones) d.syncVitals(stats);
      this.recomputeShield(stats);
      return;
    }
    this.clearDrones();
    for (let i = 0; i < roles.length; i++) {
      const d = new Drone(i, roles[i]);
      d.syncVitals(stats);
      this.drones.push(d);
      this.group.add(d.group);
    }
    this.recomputeShield(stats);
  }

  syncFleet(fleet: DroneBayState): void {
    if (!this.stats) return;
    this.applyRoles(expandBaySlots(fleet), this.stats);
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

  /** Per-defender small bubbles (not one giant ship sphere). */
  private shieldMeshes: THREE.Mesh[] = [];

  private ensureShieldMesh(): void {
    // Dispose shared ship mesh if any leftover
    if (this.shieldMesh) {
      this.group.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      (this.shieldMesh.material as THREE.Material).dispose();
      this.shieldMesh = null;
    }
    // Rebuild small bubbles to match defender count
    while (this.shieldMeshes.length > 0) {
      const m = this.shieldMeshes.pop()!;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const defenders = this.drones.filter((d) => d.role === 'defender');
    for (let i = 0; i < defenders.length; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 10),
        new THREE.MeshBasicMaterial({
          color: COLORS.green,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      mesh.visible = false;
      this.shieldMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /**
   * Absorb incoming player damage via nearby defender bubble(s).
   * Shield is localized on each defender — only absorbs if a living defender
   * is near the ship (escort range). Returns remaining damage.
   */
  absorbFrontalDamage(raw: number, shipPos?: THREE.Vector3): number {
    if (this.shieldMax <= 0 || this.shieldHp <= 0 || raw <= 0) return raw;
    // Require at least one living defender within escort range of the ship
    if (shipPos) {
      let near = false;
      for (const d of this.drones) {
        if (d.role !== 'defender' || !d.alive) continue;
        if (d.group.position.distanceTo(shipPos) < 6.5) {
          near = true;
          break;
        }
      }
      if (!near) return raw;
    }
    const absorb = Math.min(this.shieldHp, raw);
    this.shieldHp -= absorb;
    this.shieldRegenDelay =
      DRONE_BASE_SHIELD_REGEN_DELAY * (1 - Math.min(0.5, this.stats?.droneShieldRegenAdd ?? 0));
    return raw - absorb;
  }

  get count(): number {
    return this.drones.length;
  }

  getAliveCount(): number {
    return this.drones.filter((d) => d.alive).length;
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
    if (this.drones.length === 0) {
      this.syncFromBays(stats);
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

    // Small shield bubbles ride each living defender
    const defenders = this.drones.filter((d) => d.role === 'defender');
    const r = this.shieldHp / Math.max(1, this.shieldMax);
    for (let i = 0; i < this.shieldMeshes.length; i++) {
      const mesh = this.shieldMeshes[i];
      const def = defenders[i];
      if (!def || !def.alive || this.shieldHp <= 0.5) {
        mesh.visible = false;
        continue;
      }
      mesh.position.copy(def.group.position);
      mesh.scale.setScalar(1 + Math.sin(now * 3 + i) * 0.06);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + r * 0.28;
      mesh.visible = true;
    }

    const neighbors: THREE.Vector3[] = [];
    for (const d of this.drones) {
      if (d.alive) neighbors.push(d.group.position);
    }
    this.combat.neighbors = neighbors;
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
    while (this.shieldMeshes.length) {
      const m = this.shieldMeshes.pop()!;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
