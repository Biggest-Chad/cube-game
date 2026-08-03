import * as THREE from 'three';
import { COLORS, COMBAT } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { bus } from '../core/EventBus';
import type { PlayerStats } from '../progression/TechTree';
import { DRONE_ROLES, type DroneRole } from '../data/drones';
import { applyToBlock } from '../combat/DamageModel';
import { pickBestEnemy, targetPriority, type EnemyUnitRef } from './DroneAI';

export interface DroneCombatContext {
  enemies?: EnemyUnitRef[];
  onEnemyHit?: (id: string, damage: number) => void;
  /** Optional player shield repair sink */
  onShieldRepair?: (amount: number) => void;
}

/**
 * Multi-role escort drone — mesh tinted by role.
 */
export class Drone {
  readonly group = new THREE.Group();
  readonly role: DroneRole;
  private cooldown = 0;
  private orbitAngle: number;
  private orbitHeight: number;
  private orbitRadius: number;
  private heat = 0;
  private readonly beam: THREE.Line;
  private beamLife = 0;
  private _target = new THREE.Vector3();
  private _pos = new THREE.Vector3();
  private _look = new THREE.Vector3(0, 0, 0);
  private _targetQuat = new THREE.Quaternion();
  private _m = new THREE.Matrix4();
  private _up = new THREE.Vector3(0, 1, 0);
  private rotor: THREE.Group | null = null;
  private eyeGlow: THREE.Mesh | null = null;
  private thrusters: THREE.Mesh[] = [];
  private spin = 0;
  private index: number;
  private roleColor: number;

  constructor(index: number, role: DroneRole = 'miner') {
    this.index = index;
    this.role = role;
    this.roleColor = DRONE_ROLES[role].color;
    this.orbitAngle = index * 1.2;
    this.orbitHeight = (index % 3) * 1.5 - 1.5;
    this.orbitRadius = 10 + (index % 4) * 1.5;

    this.buildMesh();
    this.rotor = this.group.getObjectByName('rotor') as THREE.Group | null;
    this.eyeGlow = this.group.getObjectByName('eye') as THREE.Mesh | null;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: this.roleColor,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.beam.visible = false;
    this.group.add(this.beam);

    const lamp = new THREE.PointLight(this.roleColor, 0.55, 6, 2);
    lamp.position.set(0, 0.1, -0.15);
    this.group.add(lamp);
  }

  private hull(c = 0x1a1520): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: c,
      metalness: 0.75,
      roughness: 0.35,
    });
  }

  private emit(c: number, i = 0.5): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: i,
      metalness: 0.4,
      roughness: 0.3,
    });
  }

  private buildMesh(): void {
    const g = this.group;
    const body = this.hull(0x16101c);
    const plate = this.hull(0x241830);
    const accent = this.emit(this.roleColor, 0.55);
    const cyan = this.emit(COLORS.cyan, 0.4);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), body);
    core.scale.set(1.1, 0.7, 1.6);
    g.add(core);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.4), plate);
    top.position.y = 0.1;
    g.add(top);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshStandardMaterial({
        color: this.roleColor,
        emissive: this.roleColor,
        emissiveIntensity: 1.1,
        metalness: 0.2,
        roughness: 0.15,
      })
    );
    eye.name = 'eye';
    eye.position.set(0, 0.02, -0.38);
    g.add(eye);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.16), plate);
      wing.position.set(side * 0.28, 0, 0.05);
      wing.rotation.z = side * 0.25;
      g.add(wing);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), accent);
      tip.position.set(side * 0.55, 0.02, 0.08);
      g.add(tip);
    }

    // Role badge fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.2), accent);
    fin.position.set(0, 0.16, 0.1);
    g.add(fin);

    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.position.set(0, 0, 0.28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 18), cyan);
    ring.rotation.y = Math.PI / 2;
    rotor.add(ring);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.1, 10),
      this.emit(this.roleColor, 0.85)
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0.08;
    rotor.add(nozzle);
    this.thrusters.push(nozzle);
    g.add(rotor);

    // Fighter gets wing guns; guardian gets shield dish
    if (this.role === 'fighter') {
      for (const side of [-1, 1]) {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), accent);
        gun.position.set(side * 0.2, -0.08, -0.2);
        g.add(gun);
      }
    } else if (this.role === 'guardian') {
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        this.emit(COLORS.green, 0.4)
      );
      dish.position.set(0, 0.22, 0);
      g.add(dish);
    } else if (this.role === 'breaker') {
      const drill = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), accent);
      drill.rotation.x = Math.PI / 2;
      drill.position.set(0, -0.05, -0.45);
      g.add(drill);
    }

    g.scale.setScalar(0.95);
  }

  update(
    dt: number,
    cube: CubeManager,
    stats: PlayerStats,
    now: number,
    hidden: boolean,
    combat?: DroneCombatContext
  ): void {
    const def = DRONE_ROLES[this.role];
    const half = cube.halfExtent;
    this.orbitRadius = half * 1.55 + 2 + (this.role === 'guardian' ? 1.5 : 0);
    this.orbitAngle += dt * (0.22 + stats.droneFireRateMul * 0.06);
    this._pos.set(
      Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight + Math.sin(this.orbitAngle * 0.7) * 1.2,
      Math.sin(this.orbitAngle) * this.orbitRadius
    );
    const k = 1 - Math.exp(-3.2 * dt);
    this.group.position.lerp(this._pos, k);

    this._look.set(0, 0, 0);
    this._m.lookAt(this.group.position, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    this.group.quaternion.slerp(this._targetQuat, 1 - Math.exp(-3.5 * dt));

    this.spin += dt * (8 + (1 - this.heat) * 4);
    if (this.rotor) this.rotor.rotation.z = this.spin;

    if (this.eyeGlow?.material instanceof THREE.MeshStandardMaterial) {
      this.eyeGlow.material.emissiveIntensity = 0.7 + Math.sin(now * 5 + this.index) * 0.4;
    }

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      if (this.beamLife <= 0) this.beam.visible = false;
    }

    if (hidden) this.heat = Math.min(1, this.heat + dt * 0.08);
    else this.heat = Math.max(0, this.heat - dt * 0.15);

    // Guardian passive repair
    if (this.role === 'guardian' && combat?.onShieldRepair && def.shieldRepairPerSec > 0) {
      combat.onShieldRepair(def.shieldRepairPerSec * dt);
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.heat > 0.95) return;

    const rate = 2.2 * stats.droneFireRateMul * def.fireRateMul * (1 - this.heat * 0.5);
    this.cooldown = 1 / Math.max(0.4, rate);

    // Fighter: prioritize enemy drones
    if (this.role === 'fighter' && combat?.enemies && combat.enemies.length > 0) {
      const enemy = pickBestEnemy(
        combat.enemies,
        this.group.position,
        80
      );
      if (enemy && combat.onEnemyHit) {
        this._target.set(enemy.position.x, enemy.position.y, enemy.position.z);
        this.showBeam(this.group.position, this._target);
        const dmg =
          COMBAT.baseDamage * 0.55 * stats.droneDamageMul * def.antiDroneMul;
        combat.onEnemyHit(enemy.id, dmg);
        return;
      }
    }

    // Block targeting for miner / breaker / guardian (and fighter fallback)
    if (this.role === 'fighter') return; // idle patrol if no enemies

    const nearest = cube.findNearest(this.group.position, 80, (t) =>
      targetPriority(t, stats, this.role)
    );
    if (!nearest) return;

    cube.getBlockWorldPos(nearest.instanceId, this._target);
    this.showBeam(this.group.position, this._target);

    const type = cube.getBlockType(nearest.instanceId);
    const raw = COMBAT.baseDamage * 0.45 * stats.droneDamageMul * def.blockDamageMul;
    const applied = applyToBlock(
      { raw, armorPierce: def.armorPierce, critChance: 0, critMult: 1 },
      type
    );
    const result = cube.applyDamage(nearest.instanceId, applied.finalDamage, now);
    if (result) {
      bus.emit('beam-hit', result);
      if (result.destroyed && result.explosive) {
        cube.applyExplosiveChain(result.x, result.y, result.z, now);
      }
    }
  }

  private showBeam(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.beam.geometry.attributes.position as THREE.BufferAttribute;
    const localFrom = this.group.worldToLocal(from.clone());
    const localTo = this.group.worldToLocal(to.clone());
    pos.setXYZ(0, localFrom.x, localFrom.y, localFrom.z);
    pos.setXYZ(1, localTo.x, localTo.y, localTo.z);
    pos.needsUpdate = true;
    this.beam.geometry.computeBoundingSphere();
    this.beam.visible = true;
    this.beamLife = 0.07;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
  }
}
