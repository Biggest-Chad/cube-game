/**
 * Mounts loadout weapons on ship hardpoints, updates firing, visual pylons.
 */
import * as THREE from 'three';
import type { LoadoutState, DerivedWeapon } from '../loadout/LoadoutState';
import type { WeaponBehavior, WeaponFireContext } from '../weapons/WeaponBehavior';
import { createWeaponBehavior } from '../weapons';
import { MAX_HARDPOINTS } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from '../progression/TechTree';
import { bus } from '../core/EventBus';

/** Local offsets — wing hardpoints sit under the wings like fighter pylons. */
const SLOT_LOCAL: THREE.Vector3[] = [
  new THREE.Vector3(0.62, -0.16, 0.08), // right wing
  new THREE.Vector3(-0.62, -0.16, 0.08), // left wing
  new THREE.Vector3(0, -0.2, -0.28), // center belly
];

export class HardpointSystem {
  /** Visual pylons — attach under ship with attachToShip(). */
  readonly group = new THREE.Group();
  /**
   * World-space projectile / VFX root — add to scene (NOT under ship).
   * Behaviors write world coordinates into this tree.
   */
  readonly worldGroup = new THREE.Group();
  private pylons: THREE.Group[] = [];
  private behaviors: Array<WeaponBehavior | null> = [null, null, null];
  private loadout: LoadoutState | null = null;
  private readonly _origin = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < MAX_HARDPOINTS; i++) {
      const pylon = this.buildPylon(i);
      pylon.position.copy(SLOT_LOCAL[i]);
      pylon.visible = i === 0;
      this.pylons.push(pylon);
      this.group.add(pylon);
    }
  }

  private buildPylon(index: number): THREE.Group {
    const g = new THREE.Group();
    g.name = `hardpoint_${index}`;

    const dark = new THREE.MeshStandardMaterial({
      color: 0x16121c,
      metalness: 0.88,
      roughness: 0.28,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x2a3a48,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.45,
      metalness: 0.55,
      roughness: 0.28,
    });

    // Clamp base
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.2), dark);
    g.add(base);
    // Side armor plates
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.16), dark);
      plate.position.set(s * 0.08, 0, 0);
      g.add(plate);
    }
    // Pylon spar
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.26), accent);
    spar.position.set(0, -0.02, -0.14);
    g.add(spar);
    // Muzzle housing
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
      dark
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, -0.02, -0.26);
    g.add(housing);
    // Empty muzzle ring (glows when weapon equipped via tint)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.012, 8, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, -0.02, -0.32);
    ring.name = 'empty_ring';
    g.add(ring);
    // Status LED
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    led.position.set(0.05, 0.04, 0.02);
    g.add(led);

    // Cable
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6),
      dark
    );
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0.09, 0.02, 0.05);
    g.add(cable);

    return g;
  }

  /** Attach under ship visual group (call once from Game). */
  attachToShip(shipGroup: THREE.Object3D): void {
    shipGroup.add(this.group);
  }

  bindLoadout(loadout: LoadoutState): void {
    this.loadout = loadout;
    this.rebuildFromLoadout();
  }

  rebuildFromLoadout(): void {
    if (!this.loadout) return;
    const unlocks = this.loadout.hardpointUnlocks;

    for (let i = 0; i < MAX_HARDPOINTS; i++) {
      this.pylons[i].visible = i < unlocks;
      const derived = i < unlocks ? this.loadout.getDerived(i) : null;
      this.mountSlot(i, derived);
    }
  }

  private mountSlot(slot: number, derived: DerivedWeapon | null): void {
    const prev = this.behaviors[slot];
    if (prev) {
      this.worldGroup.remove(prev.group);
      prev.dispose();
      this.behaviors[slot] = null;
    }

    // Empty ring visibility
    const ring = this.pylons[slot].getObjectByName('empty_ring');
    if (ring) ring.visible = !derived;

    if (!derived) return;

    const behavior = createWeaponBehavior(derived.def.family);
    behavior.setStats(derived.stats);
    // Projectiles use world-space positions — keep under scene worldGroup
    this.worldGroup.add(behavior.group);
    this.behaviors[slot] = behavior;

    // Tint pylon accent to weapon color
    this.pylons[slot].traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        if (o.material.emissive) {
          o.material.emissive.setHex(derived.def.color);
          o.material.emissiveIntensity = 0.35;
        }
      }
    });
  }

  update(
    dt: number,
    firing: boolean,
    shipWorldPos: THREE.Vector3,
    cube: CubeManager,
    playerStats: PlayerStats,
    now: number,
    extras?: Pick<WeaponFireContext, 'enemyTargets' | 'onEnemyHit'>
  ): void {
    if (!this.loadout) return;

    for (let i = 0; i < this.loadout.hardpointUnlocks; i++) {
      const b = this.behaviors[i];
      if (!b) continue;

      // World-space muzzle: pylon position
      this.pylons[i].getWorldPosition(this._origin);
      // Hardpoints never use aim stick — always fire toward cube center.
      // Homing weapons (missiles/torpedoes) steer themselves in their behaviors.
      this._dir.set(0, 0, 0).sub(this._origin);
      if (this._dir.lengthSq() < 1e-6) {
        this._dir.copy(shipWorldPos).multiplyScalar(-1);
      }
      if (this._dir.lengthSq() < 1e-6) this._dir.set(0, 0, -1);
      else this._dir.normalize();

      b.update({
        dt,
        firing,
        origin: this._origin,
        direction: this._dir,
        cube,
        playerStats,
        now,
        slot: i,
        enemyTargets: extras?.enemyTargets,
        onEnemyHit: extras?.onEnemyHit,
      });
    }
  }

  /** Celebrate hardpoint unlock with emissive pulse. */
  celebrateUnlock(slot: number): void {
    if (slot < 0 || slot >= MAX_HARDPOINTS) return;
    this.pylons[slot].visible = true;
    this.pylons[slot].scale.setScalar(1.4);
    bus.emit('hardpoint-vfx', { slot });
    // Scale settles on next rebuild/update frames via lerp in updateVisuals if needed
    const p = this.pylons[slot];
    const start = performance.now();
    const tick = (): void => {
      const t = (performance.now() - start) / 600;
      if (t >= 1) {
        p.scale.setScalar(1);
        return;
      }
      const s = 1.4 - 0.4 * t;
      p.scale.setScalar(s);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getHeat(slot: number): number {
    return this.behaviors[slot]?.getHeat?.() ?? 0;
  }

  getCharge(slot: number): number {
    return this.behaviors[slot]?.getCharge?.() ?? 0;
  }

  reset(): void {
    for (const b of this.behaviors) b?.reset();
  }

  dispose(): void {
    for (let i = 0; i < this.behaviors.length; i++) {
      const b = this.behaviors[i];
      if (b) {
        this.worldGroup.remove(b.group);
        b.dispose();
        this.behaviors[i] = null;
      }
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
    this.worldGroup.clear();
  }
}
