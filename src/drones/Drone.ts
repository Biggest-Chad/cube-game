import * as THREE from 'three';
import { COLORS, COMBAT } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { PlayerStats } from '../progression/TechTree';
import { DRONE_ROLES, type DroneRole } from '../data/drones';
import { applyToBlock } from '../combat/DamageModel';
import { pickBestEnemy, targetPriority, type EnemyUnitRef } from './DroneAI';
import { addMat, stdEmit, stdHull } from '../vfx/ProjectileVfx';

export interface DroneCombatContext {
  enemies?: EnemyUnitRef[];
  onEnemyHit?: (id: string, damage: number) => void;
  onShieldRepair?: (amount: number) => void;
}

/**
 * Multi-role escort drone — detailed mesh, thick volumetric fire beam.
 */
export class Drone {
  readonly group = new THREE.Group();
  readonly role: DroneRole;
  private cooldown = 0;
  private orbitAngle: number;
  private orbitHeight: number;
  private orbitRadius: number;
  private heat = 0;
  private beamCore: THREE.Mesh;
  private beamGlow: THREE.Mesh;
  private beamLife = 0;
  private _target = new THREE.Vector3();
  private _pos = new THREE.Vector3();
  private _look = new THREE.Vector3(0, 0, 0);
  private _targetQuat = new THREE.Quaternion();
  private _m = new THREE.Matrix4();
  private _up = new THREE.Vector3(0, 1, 0);
  private _mid = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _fwd = new THREE.Vector3(0, 1, 0);
  private rotor: THREE.Group | null = null;
  private eyeGlow: THREE.Mesh | null = null;
  private thrusters: THREE.Mesh[] = [];
  private spin = 0;
  private index: number;
  private roleColor: number;
  private lamp!: THREE.PointLight;

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

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamCore = new THREE.Mesh(cyl, addMat(0xffffff, 0));
    this.beamGlow = new THREE.Mesh(cyl, addMat(this.roleColor, 0));
    this.beamCore.visible = this.beamGlow.visible = false;
    this.group.add(this.beamGlow, this.beamCore);

    this.lamp = new THREE.PointLight(this.roleColor, 0.85, 8, 2);
    this.lamp.position.set(0, 0.12, -0.12);
    this.group.add(this.lamp);
  }

  private buildMesh(): void {
    const g = this.group;
    const body = stdHull(0x14101a, 0.82, 0.28);
    const plate = stdHull(0x221828, 0.78, 0.32);
    const accent = stdEmit(this.roleColor, 0.85);
    const cyan = stdEmit(COLORS.cyan, 0.55);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), body);
    core.scale.set(1.15, 0.72, 1.65);
    g.add(core);

    // Armor ridges
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.42), plate);
    top.position.y = 0.11;
    g.add(top);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.28), plate);
    chin.position.set(0, -0.08, -0.15);
    g.add(chin);

    // Sensor eye + additive halo
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 14),
      stdEmit(this.roleColor, 1.25)
    );
    eye.name = 'eye';
    eye.position.set(0, 0.02, -0.4);
    g.add(eye);
    const eyeHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      addMat(this.roleColor, 0.35)
    );
    eyeHalo.position.copy(eye.position);
    g.add(eyeHalo);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.18), plate);
      wing.position.set(side * 0.3, 0, 0.05);
      wing.rotation.z = side * 0.28;
      g.add(wing);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.04), accent);
      edge.position.set(side * 0.3, 0.02, 0.05);
      edge.rotation.z = side * 0.28;
      g.add(edge);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), addMat(this.roleColor, 0.85));
      tip.position.set(side * 0.58, 0.02, 0.08);
      g.add(tip);
    }

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.22), accent);
    fin.position.set(0, 0.18, 0.1);
    g.add(fin);

    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.position.set(0, 0, 0.3);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 22), cyan);
    ring.rotation.y = Math.PI / 2;
    rotor.add(ring);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.012, 6, 16),
      addMat(COLORS.cyan, 0.45)
    );
    ring2.rotation.y = Math.PI / 2;
    rotor.add(ring2);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 0.12, 12),
      stdEmit(this.roleColor, 1.05)
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0.09;
    rotor.add(nozzle);
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.2, 8),
      addMat(this.roleColor, 0.55)
    );
    plume.rotation.x = -Math.PI / 2;
    plume.position.z = 0.2;
    rotor.add(plume);
    this.thrusters.push(nozzle, plume);
    g.add(rotor);

    if (this.role === 'fighter') {
      for (const side of [-1, 1]) {
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.32, 8), accent);
        gun.rotation.x = Math.PI / 2;
        gun.position.set(side * 0.22, -0.08, -0.22);
        g.add(gun);
      }
    } else if (this.role === 'guardian') {
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        stdEmit(COLORS.green, 0.55)
      );
      dish.position.set(0, 0.24, 0);
      g.add(dish);
    } else if (this.role === 'breaker') {
      const drill = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), accent);
      drill.rotation.x = Math.PI / 2;
      drill.position.set(0, -0.05, -0.48);
      g.add(drill);
    }

    g.scale.setScalar(1.05);
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
    this.orbitAngle += dt * (0.28 + stats.droneFireRateMul * 0.08);
    // Dynamic weaving orbit — feels more alive
    const weave = Math.sin(this.orbitAngle * 2.1 + this.index) * 1.4;
    const bob = Math.sin(this.orbitAngle * 0.7 + this.index * 0.5) * 1.6;
    this._pos.set(
      Math.cos(this.orbitAngle) * (this.orbitRadius + weave * 0.3),
      this.orbitHeight + bob,
      Math.sin(this.orbitAngle) * (this.orbitRadius + weave * 0.3)
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
      this.eyeGlow.material.emissiveIntensity =
        0.85 + Math.sin(now * 5 + this.index) * 0.45 + this.heat * 0.3;
    }
    this.lamp.intensity = 0.6 + Math.sin(now * 4 + this.index) * 0.25;
    for (const t of this.thrusters) {
      if (t.material instanceof THREE.MeshStandardMaterial) {
        t.material.emissiveIntensity = 0.7 + Math.sin(now * 7 + this.index) * 0.35;
      } else if (t.material instanceof THREE.MeshBasicMaterial) {
        t.material.opacity = 0.4 + Math.sin(now * 9 + this.index) * 0.2;
      }
    }

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      const t = Math.max(0, this.beamLife / 0.1);
      (this.beamCore.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
      (this.beamGlow.material as THREE.MeshBasicMaterial).opacity = t * 0.45;
      if (this.beamLife <= 0) {
        this.beamCore.visible = this.beamGlow.visible = false;
      }
    }

    if (hidden) this.heat = Math.min(1, this.heat + dt * 0.08);
    else this.heat = Math.max(0, this.heat - dt * 0.15);

    if (this.role === 'guardian' && combat?.onShieldRepair && def.shieldRepairPerSec > 0) {
      combat.onShieldRepair(def.shieldRepairPerSec * dt);
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.heat > 0.95) return;

    const rate = 2.2 * stats.droneFireRateMul * def.fireRateMul * (1 - this.heat * 0.5);
    this.cooldown = 1 / Math.max(0.4, rate);

    // All drones prioritize hostile drones — fighters are dedicated hunters
    if (combat?.enemies && combat.enemies.length > 0) {
      const enemy = pickBestEnemy(combat.enemies, this.group.position, 90);
      if (enemy && combat.onEnemyHit) {
        this._target.set(enemy.position.x, enemy.position.y, enemy.position.z);
        this.showBeam(this.group.position, this._target);
        const anti =
          this.role === 'fighter' ? def.antiDroneMul * 1.35 : def.antiDroneMul * 0.85;
        const dmg = COMBAT.baseDamage * 0.55 * stats.droneDamageMul * anti;
        combat.onEnemyHit(enemy.id, dmg);
        return;
      }
    }

    // Fighters still chip the nucleus / high-value blocks when skies are clear
    if (this.role === 'fighter') {
      const nearestCore = cube.findNearest(this.group.position, 80, (t) =>
        t === BlockType.Core ? 30 : t === BlockType.Turret ? 12 : 1
      );
      if (!nearestCore) return;
      cube.getBlockWorldPos(nearestCore.instanceId, this._target);
      this.showBeam(this.group.position, this._target);
      const type = cube.getBlockType(nearestCore.instanceId);
      const raw = COMBAT.baseDamage * 0.4 * stats.droneDamageMul * def.blockDamageMul;
      const applied = applyToBlock(
        { raw, armorPierce: def.armorPierce, critChance: 0, critMult: 1 },
        type
      );
      const result = cube.applyDamage(nearestCore.instanceId, applied.finalDamage, now);
      if (result) bus.emit('beam-hit', { ...result, style: 'beam' as const });
      return;
    }

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
      bus.emit('beam-hit', { ...result, style: 'beam' as const });
      if (result.destroyed && result.explosive) {
        cube.applyExplosiveChain(result.x, result.y, result.z, now);
      }
    }
  }

  private showBeam(from: THREE.Vector3, to: THREE.Vector3): void {
    // Beams live in drone local space
    const localFrom = this.group.worldToLocal(from.clone());
    const localTo = this.group.worldToLocal(to.clone());
    const len = Math.max(0.15, localFrom.distanceTo(localTo));
    this._mid.copy(localFrom).add(localTo).multiplyScalar(0.5);
    this._dir.copy(localTo).sub(localFrom).normalize();
    this._q.setFromUnitVectors(this._fwd, this._dir);

    for (const [mesh, w] of [
      [this.beamCore, 0.035],
      [this.beamGlow, 0.11],
    ] as const) {
      mesh.position.copy(this._mid);
      mesh.quaternion.copy(this._q);
      mesh.scale.set(w, len, w);
      mesh.visible = true;
    }
    (this.beamCore.material as THREE.MeshBasicMaterial).opacity = 0.95;
    (this.beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.5;
    this.beamLife = 0.1;
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
