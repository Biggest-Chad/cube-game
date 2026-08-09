import * as THREE from 'three';
import { COLORS, COMBAT } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { PlayerStats } from '../progression/TechTree';
import {
  DRONE_BASE_RESPAWN,
  DRONE_ROLES,
  type DroneRole,
} from '../data/drones';
import { applyToBlock } from '../combat/DamageModel';
import {
  pickBestEnemy,
  pickBestIntercept,
  targetPriority,
  type EnemyUnitRef,
  type InterceptTarget,
} from './DroneAI';
import { addMat, stdEmit, stdHull } from '../vfx/ProjectileVfx';

export interface DroneCombatContext {
  enemies?: EnemyUnitRef[];
  intercepts?: InterceptTarget[];
  onEnemyHit?: (id: string, damage: number) => void;
  onInterceptHit?: (id: string, damage: number) => void;
  shipPos?: THREE.Vector3;
  nucleusExposed?: boolean;
}

/**
 * Fighter / Bomber / Defender with independent HP and timed respawn.
 */
export class Drone {
  readonly group = new THREE.Group();
  readonly role: DroneRole;
  hp = 40;
  maxHp = 40;
  alive = true;
  private respawnTimer = 0;
  private cooldown = 0;
  private orbitAngle: number;
  private orbitHeight: number;
  private orbitRadius = 10;
  private heat = 0;
  private beamCore: THREE.Mesh;
  private beamGlow: THREE.Mesh;
  private beamLife = 0;
  private bombMesh: THREE.Mesh | null = null;
  private bombActive = false;
  private bombPos = new THREE.Vector3();
  private bombVel = new THREE.Vector3();
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

  constructor(index: number, role: DroneRole = 'fighter') {
    this.index = index;
    this.role = role;
    this.roleColor = DRONE_ROLES[role].color;
    this.maxHp = DRONE_ROLES[role].baseHp;
    this.hp = this.maxHp;
    this.orbitAngle = index * 1.2;
    this.orbitHeight = (index % 3) * 1.5 - 1.5;
    this.orbitRadius = 10 + (index % 4) * 1.5 + DRONE_ROLES[role].orbitRadiusBias;

    this.buildMesh();
    this.rotor = this.group.getObjectByName('rotor') as THREE.Group | null;
    this.eyeGlow = this.group.getObjectByName('eye') as THREE.Mesh | null;

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamCore = new THREE.Mesh(cyl, addMat(0xffffff, 0));
    this.beamGlow = new THREE.Mesh(cyl, addMat(this.roleColor, 0));
    this.beamCore.visible = this.beamGlow.visible = false;
    this.group.add(this.beamGlow, this.beamCore);

    if (role === 'bomber') {
      this.bombMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        addMat(0xff8844, 0.9)
      );
      this.bombMesh.visible = false;
      this.group.add(this.bombMesh);
    }

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
    const scale =
      this.role === 'bomber' ? 1.35 : this.role === 'defender' ? 1.15 : 1.0;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), body);
    core.scale.set(1.15 * scale, 0.72 * scale, 1.65 * scale);
    g.add(core);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.07, 0.42 * scale), plate);
    top.position.y = 0.11 * scale;
    g.add(top);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * scale, 14, 14),
      stdEmit(this.roleColor, 1.25)
    );
    eye.name = 'eye';
    eye.position.set(0, 0.02, -0.4 * scale);
    g.add(eye);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.58 * scale, 0.035, 0.18 * scale),
        plate
      );
      wing.position.set(side * 0.3 * scale, 0, 0.05);
      wing.rotation.z = side * 0.28;
      g.add(wing);
    }

    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.position.set(0, 0, 0.3 * scale);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14 * scale, 0.025, 8, 22), cyan);
    ring.rotation.y = Math.PI / 2;
    rotor.add(ring);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 0.12, 12),
      stdEmit(this.roleColor, 1.05)
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0.09;
    rotor.add(nozzle);
    this.thrusters.push(nozzle);
    g.add(rotor);

    if (this.role === 'fighter') {
      for (const side of [-1, 1]) {
        const gun = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.025, 0.32, 8),
          accent
        );
        gun.rotation.x = Math.PI / 2;
        gun.position.set(side * 0.22, -0.08, -0.22);
        g.add(gun);
      }
    } else if (this.role === 'bomber') {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.4), plate);
      bay.position.set(0, -0.12, 0.05);
      g.add(bay);
    } else if (this.role === 'defender') {
      const shieldPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.5, 0.06),
        stdEmit(COLORS.green, 0.45)
      );
      shieldPlate.position.set(0, 0, -0.42);
      g.add(shieldPlate);
    }

    g.scale.setScalar(1.05);
  }

  /** Apply damage; returns true if destroyed this hit. */
  takeDamage(amount: number): boolean {
    if (!this.alive || amount <= 0) return false;
    this.hp -= amount;
    this.group.scale.setScalar(0.9);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.hp = 0;
    this.group.visible = false;
    this.beamCore.visible = this.beamGlow.visible = false;
    if (this.bombMesh) this.bombMesh.visible = false;
    this.bombActive = false;
    bus.emit('player-drone-destroyed', { role: this.role, index: this.index });
  }

  private beginRespawn(stats: PlayerStats): void {
    const base = DRONE_BASE_RESPAWN;
    const mul = Math.max(0.35, 1 - (stats.droneRespawnReduce ?? 0));
    this.respawnTimer = base * mul;
  }

  syncVitals(stats: PlayerStats): void {
    const base = DRONE_ROLES[this.role].baseHp;
    const max = Math.round(base * (1 + (stats.droneHpAdd ?? 0)));
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = max;
    if (this.alive) this.hp = Math.min(max, Math.max(1, ratio * max));
  }

  update(
    dt: number,
    cube: CubeManager,
    stats: PlayerStats,
    now: number,
    hidden: boolean,
    combat?: DroneCombatContext
  ): void {
    // Respawn
    if (!this.alive) {
      if (this.respawnTimer <= 0) this.beginRespawn(stats);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.alive = true;
        this.hp = this.maxHp;
        this.group.visible = true;
        this.group.scale.setScalar(1.05);
        bus.emit('player-drone-respawned', { role: this.role, index: this.index });
      }
      return;
    }

    // Recover hit scale
    const s = this.group.scale.x;
    if (s < 1.05) this.group.scale.setScalar(Math.min(1.05, s + dt * 2));

    const def = DRONE_ROLES[this.role];
    const half = cube.halfExtent;
    const ship = combat?.shipPos;

    // Positioning by role
    if (this.role === 'defender' && ship) {
      // Screen in front of ship (toward cube origin from ship)
      const toCenter = this._dir.copy(ship).multiplyScalar(-1).normalize();
      if (toCenter.lengthSq() < 1e-6) toCenter.set(0, 0, -1);
      const side = (this.index % 3) - 1;
      this._pos
        .copy(ship)
        .addScaledVector(toCenter, 2.2)
        .addScaledVector(this._up, side * 0.9 + Math.sin(now * 2 + this.index) * 0.2);
      const right = this._look.crossVectors(toCenter, this._up).normalize();
      this._pos.addScaledVector(right, side * 1.1);
    } else {
      this.orbitRadius =
        half * 1.55 + 2 + def.orbitRadiusBias + (this.index % 4) * 0.8;
      const angSpeed =
        this.role === 'bomber' ? 0.16 : 0.32 + stats.droneFireRateMul * 0.08;
      this.orbitAngle += dt * angSpeed;
      const weave = Math.sin(this.orbitAngle * 2.1 + this.index) * 1.4;
      const bob = Math.sin(this.orbitAngle * 0.7 + this.index * 0.5) * 1.6;
      this._pos.set(
        Math.cos(this.orbitAngle) * (this.orbitRadius + weave * 0.3),
        this.orbitHeight + bob,
        Math.sin(this.orbitAngle) * (this.orbitRadius + weave * 0.3)
      );
    }

    const k = 1 - Math.exp(-(this.role === 'bomber' ? 1.6 : 3.2) * dt);
    this.group.position.lerp(this._pos, k);

    this._look.set(0, 0, 0);
    this._m.lookAt(this.group.position, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    this.group.quaternion.slerp(this._targetQuat, 1 - Math.exp(-3.5 * dt));

    this.spin += dt * (8 + (1 - this.heat) * 4);
    if (this.rotor) this.rotor.rotation.z = this.spin;
    this.lamp.intensity = 0.6 + Math.sin(now * 4 + this.index) * 0.25;

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      const t = Math.max(0, this.beamLife / 0.1);
      (this.beamCore.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
      (this.beamGlow.material as THREE.MeshBasicMaterial).opacity = t * 0.45;
      if (this.beamLife <= 0) this.beamCore.visible = this.beamGlow.visible = false;
    }

    // Bomber projectile travel
    if (this.bombActive && this.bombMesh) {
      this.bombPos.addScaledVector(this.bombVel, dt);
      this.bombMesh.position.copy(
        this.group.worldToLocal(this.bombPos.clone())
      );
      // Hit check vs cube centerish — raycast
      const hit = cube.raycast(
        this.bombPos.clone().addScaledVector(this.bombVel, -dt),
        this.bombVel.clone().normalize(),
        this.bombVel.length() * dt + 0.6,
        -1,
        0.7
      );
      if (hit || this.bombPos.length() > half * 3.5) {
        if (hit) {
          const raw =
            COMBAT.baseDamage * 1.8 * stats.droneDamageMul * def.blockDamageMul;
          const type = cube.getBlockType(hit.instanceId);
          const applied = applyToBlock(
            { raw, armorPierce: def.armorPierce, critChance: 0, critMult: 1 },
            type
          );
          const result = cube.applyDamage(hit.instanceId, applied.finalDamage, now);
          if (result) {
            bus.emit('beam-hit', { ...result, style: 'explosive' as const });
            if (def.splashRadius > 0) {
              cube.applySplash(
                new THREE.Vector3(result.x, result.y, result.z),
                def.splashRadius,
                applied.finalDamage * 0.45,
                now,
                hit.instanceId
              );
            }
          }
        }
        this.bombActive = false;
        this.bombMesh.visible = false;
      }
    }

    if (hidden) this.heat = Math.min(1, this.heat + dt * 0.08);
    else this.heat = Math.max(0, this.heat - dt * 0.15);

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.heat > 0.95) return;

    const rate =
      2.2 * stats.droneFireRateMul * def.fireRateMul * (1 - this.heat * 0.5);
    this.cooldown = 1 / Math.max(0.25, rate);

    // —— Defender: point defense only ——
    if (this.role === 'defender') {
      if (combat?.intercepts?.length && combat.onInterceptHit) {
        const t = pickBestIntercept(combat.intercepts, this.group.position, 35);
        if (t) {
          this._target.set(t.position.x, t.position.y, t.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onInterceptHit(
            t.id,
            COMBAT.baseDamage * 0.35 * stats.droneDamageMul * def.pointDefenseMul
          );
          return;
        }
      }
      if (combat?.enemies?.length && combat.onEnemyHit) {
        const e = pickBestEnemy(combat.enemies, this.group.position, 40);
        if (e) {
          this._target.set(e.position.x, e.position.y, e.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onEnemyHit(
            e.id,
            COMBAT.baseDamage * 0.4 * stats.droneDamageMul * def.antiDroneMul
          );
        }
      }
      return;
    }

    // —— Fighter: enemies → intercepts → light blocks ——
    if (this.role === 'fighter') {
      if (combat?.enemies?.length && combat.onEnemyHit) {
        const enemy = pickBestEnemy(combat.enemies, this.group.position, 90);
        if (enemy) {
          this._target.set(enemy.position.x, enemy.position.y, enemy.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onEnemyHit(
            enemy.id,
            COMBAT.baseDamage * 0.55 * stats.droneDamageMul * def.antiDroneMul
          );
          return;
        }
      }
      if (combat?.intercepts?.length && combat.onInterceptHit) {
        const t = pickBestIntercept(combat.intercepts, this.group.position, 70);
        if (t) {
          this._target.set(t.position.x, t.position.y, t.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onInterceptHit(
            t.id,
            COMBAT.baseDamage * 0.5 * stats.droneDamageMul * def.pointDefenseMul
          );
          return;
        }
      }
      const nearest = cube.findNearest(this.group.position, 70, (t) =>
        targetPriority(t, stats, 'fighter')
      );
      if (!nearest) return;
      cube.getBlockWorldPos(nearest.instanceId, this._target);
      this.showBeam(this.group.position, this._target);
      const type = cube.getBlockType(nearest.instanceId);
      const raw = COMBAT.baseDamage * 0.35 * stats.droneDamageMul * def.blockDamageMul;
      const applied = applyToBlock(
        { raw, armorPierce: def.armorPierce, critChance: 0, critMult: 1 },
        type
      );
      const result = cube.applyDamage(nearest.instanceId, applied.finalDamage, now);
      if (result) bus.emit('beam-hit', { ...result, style: 'beam' as const });
      return;
    }

    // —— Bomber: plasma bomb toward core if exposed else high-value blocks ——
    if (this.bombActive) return;
    const preferCore = combat?.nucleusExposed || stats.dronePriorityCore;
    const nearest = cube.findNearest(this.group.position, 100, (t) => {
      if (preferCore && t === BlockType.Core) return 50;
      return targetPriority(t, stats, 'bomber');
    });
    if (!nearest || !this.bombMesh) return;
    cube.getBlockWorldPos(nearest.instanceId, this._target);
    this.bombPos.copy(this.group.position);
    this.bombVel.copy(this._target).sub(this.bombPos).normalize().multiplyScalar(18);
    this.bombActive = true;
    this.bombMesh.visible = true;
    this.bombMesh.position.set(0, 0, 0);
    this.showBeam(this.group.position, this._target);
  }

  private showBeam(from: THREE.Vector3, to: THREE.Vector3): void {
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
    (this.beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.45;
    this.beamLife = 0.1;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
  }
}
