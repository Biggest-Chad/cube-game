import * as THREE from 'three';
import { COLORS } from '../data/constants';
import {
  DRONE_BASE_DAMAGE,
  DRONE_BASE_FIRE_RATE,
  DRONE_BOMBER_PROJECTILE_SPEED,
  DRONE_BOMBER_SPLASH_DAMAGE_FRACTION,
  DRONE_BOMBER_WARHEAD_DAMAGE_FRACTION,
  DRONE_DEFENDER_ANTI_DRONE_DAMAGE_FRACTION,
  DRONE_DEFENDER_POINT_DEFENSE_DAMAGE_FRACTION,
  DRONE_FIGHTER_ANTI_DRONE_DAMAGE_FRACTION,
  DRONE_FIGHTER_BLOCK_DAMAGE_FRACTION,
  DRONE_HIDDEN_HEAT_GAIN_PER_SECOND,
  DRONE_MINIMUM_FIRE_RATE,
  DRONE_VISIBLE_HEAT_BLEED_PER_SECOND,
} from '../data/constraints';
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
  /** Other living drone world positions — used for swarm separation. */
  neighbors?: THREE.Vector3[];
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
  private vel = new THREE.Vector3();
  private steer = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private radial = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private fireLook = new THREE.Vector3();
  private hasFireLook = false;
  private wanderT = 0;
  private nextJink = 0;
  private jinkA = 0;
  private jinkB = 0;
  private radiusGoal = 12;
  private heightGoal = 0;
  private tanSign = 1;
  private peelId = -1;
  private peelT = 0;
  private seed = 1;
  private heat = 0;
  private beamCore: THREE.Mesh;
  private beamGlow: THREE.Mesh;
  private beamLife = 0;
  private bombMesh: THREE.Object3D | null = null;
  private bombHalo: THREE.Mesh | null = null;
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

  constructor(index: number, role: DroneRole = 'fighter') {
    this.index = index;
    this.role = role;
    this.roleColor = DRONE_ROLES[role].color;
    this.maxHp = DRONE_ROLES[role].baseHp;
    this.hp = this.maxHp;
    this.orbitAngle = index * 1.2 + Math.random() * 2.2;
    this.orbitHeight = (index % 3) * 1.5 - 1.5;
    this.orbitRadius = 10 + (index % 4) * 1.5 + DRONE_ROLES[role].orbitRadiusBias;
    this.seed = (index * 9973 + 131) | 0;
    this.wanderT = index * 0.73;
    this.nextJink = Math.random() * 0.4;
    this.tanSign = index % 2 === 0 ? 1 : -1;
    this.vel.set(Math.cos(this.orbitAngle), 0.2, Math.sin(this.orbitAngle)).multiplyScalar(5);

    this.buildMesh();
    this.rotor = this.group.getObjectByName('rotor') as THREE.Group | null;
    this.eyeGlow = this.group.getObjectByName('eye') as THREE.Mesh | null;

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamCore = new THREE.Mesh(cyl, addMat(0xffffff, 0));
    this.beamGlow = new THREE.Mesh(cyl, addMat(this.roleColor, 0));
    this.beamCore.visible = this.beamGlow.visible = false;
    this.group.add(this.beamGlow, this.beamCore);

    if (role === 'bomber') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), addMat(0xff6622, 1)));
      this.bombHalo = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 12), addMat(0xffcc55, 0.5));
      g.add(this.bombHalo);
      this.bombMesh = g;
      this.bombMesh.visible = false;
      this.group.add(this.bombMesh);
    }
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
    this.hasFireLook = false;

    if (this.role === 'defender' && ship) {
      this.updateDefenderSeat(dt, ship, now);
    } else {
      this.updateSwarmFlight(dt, cube, combat);
    }

    this.spin += dt * (8 + (1 - this.heat) * 4);
    if (this.rotor) this.rotor.rotation.z = this.spin;

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
      this.bombMesh.position.copy(this.group.worldToLocal(this._mid.copy(this.bombPos)));
      const pulse = 1 + Math.sin(now * 18) * 0.18;
      this.bombMesh.scale.setScalar(pulse);
      if (this.bombHalo?.material instanceof THREE.MeshBasicMaterial) {
        this.bombHalo.material.opacity = 0.35 + Math.sin(now * 22) * 0.2;
      }
      // Hit check vs cube centerish — raycast
      const bombPrev = this.bombPos.clone().addScaledVector(this.bombVel, -dt);
      const hit = cube.raycast(
        bombPrev,
        this.bombVel.clone().normalize(),
        this.bombVel.length() * dt + 0.6,
        -1,
        0.7
      );
      if (hit || this.bombPos.length() > half * 3.5) {
        if (hit) {
          const raw =
            DRONE_BASE_DAMAGE *
            DRONE_BOMBER_WARHEAD_DAMAGE_FRACTION *
            stats.droneDamageMul *
            def.blockDamageMul;
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
                applied.finalDamage * DRONE_BOMBER_SPLASH_DAMAGE_FRACTION,
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

    if (hidden) this.heat = Math.min(1, this.heat + dt * DRONE_HIDDEN_HEAT_GAIN_PER_SECOND);
    else this.heat = Math.max(0, this.heat - dt * DRONE_VISIBLE_HEAT_BLEED_PER_SECOND);

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.heat > 0.95) return;

    const rate =
      DRONE_BASE_FIRE_RATE * stats.droneFireRateMul * def.fireRateMul * (1 - this.heat * 0.5);
    this.cooldown = 1 / Math.max(DRONE_MINIMUM_FIRE_RATE, rate);

    // —— Defender: point defense only ——
    if (this.role === 'defender') {
      if (combat?.intercepts?.length && combat.onInterceptHit) {
        const t = pickBestIntercept(combat.intercepts, this.group.position, 35);
        if (t) {
          this._target.set(t.position.x, t.position.y, t.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onInterceptHit(
            t.id,
            DRONE_BASE_DAMAGE *
              DRONE_DEFENDER_POINT_DEFENSE_DAMAGE_FRACTION *
              stats.droneDamageMul *
              def.pointDefenseMul
          );
          return;
        }
      }
      if (combat?.enemies?.length && combat.onEnemyHit) {
        const e = pickBestEnemy(
          combat.enemies.filter((u) => u.kind !== 'cube-fighter'),
          this.group.position,
          40
        );
        if (e) {
          this._target.set(e.position.x, e.position.y, e.position.z);
          this.showBeam(this.group.position, this._target);
          combat.onEnemyHit(
            e.id,
            DRONE_BASE_DAMAGE *
              DRONE_DEFENDER_ANTI_DRONE_DAMAGE_FRACTION *
              stats.droneDamageMul *
              def.antiDroneMul
          );
        }
      }
      return;
    }

    // —— Fighter: enemy drones / kamikazes → peel hull. Nucleus shots are PD-only. ——
    if (this.role === 'fighter') {
      if (combat?.enemies?.length && combat.onEnemyHit) {
        const enemy = pickBestEnemy(combat.enemies, this.group.position, 90);
        if (enemy) {
          this._target.set(enemy.position.x, enemy.position.y, enemy.position.z);
          this.markFireLook(this._target);
          this.showBeam(this.group.position, this._target);
          combat.onEnemyHit(
            enemy.id,
            DRONE_BASE_DAMAGE *
              DRONE_FIGHTER_ANTI_DRONE_DAMAGE_FRACTION *
              stats.droneDamageMul *
              def.antiDroneMul
          );
          return;
        }
      }
      const peel = this.acquireClosestTarget(dt, cube, 78, true);
      if (peel === -1) return;
      cube.getBlockWorldPos(peel, this._target);
      this.markFireLook(this._target);
      const hitId = this.firstBlockOnLine(cube, this.group.position, this._target);
      const aimId = hitId !== -1 ? hitId : peel;
      cube.getBlockWorldPos(aimId, this._target);
      this.showBeam(this.group.position, this._target);
      const type = cube.getBlockType(aimId);
      const raw =
        DRONE_BASE_DAMAGE *
        DRONE_FIGHTER_BLOCK_DAMAGE_FRACTION *
        stats.droneDamageMul *
        def.blockDamageMul;
      const applied = applyToBlock(
        { raw, armorPierce: def.armorPierce, critChance: 0, critMult: 1 },
        type
      );
      const result = cube.applyDamage(aimId, applied.finalDamage, now);
      if (result) bus.emit('beam-hit', { ...result, style: 'beam' as const });
      return;
    }

    // —— Bomber: closest live block, reassess often ——
    if (this.bombActive) return;
    const peel = this.acquireClosestTarget(dt, cube, 110, true);
    if (peel === -1 || !this.bombMesh) return;
    cube.getBlockWorldPos(peel, this._target);
    this.markFireLook(this._target);
    this.bombPos.copy(this.group.position);
    this.bombVel.copy(this._target).sub(this.bombPos).normalize().multiplyScalar(DRONE_BOMBER_PROJECTILE_SPEED);
    this.bombActive = true;
    this.bombMesh.visible = true;
    this.bombMesh.position.set(0, 0, 0);
    this.showBeam(this.group.position, this._target);
  }

  private markFireLook(world: THREE.Vector3): void {
    this.fireLook.copy(world);
    this.hasFireLook = true;
  }

  /** Closest live voxel, reassessed often so we do not tunnel through a nearer face. */
  private acquireClosestTarget(
    dt: number,
    cube: CubeManager,
    maxDist: number,
    allowNucleus: boolean
  ): number {
    this.peelT -= dt;
    if (this.peelT > 0 && this.peelId !== -1 && cube.hasInstance(this.peelId)) {
      return this.peelId;
    }
    this.peelT = 0.22 + Math.random() * 0.18;
    const hit = cube.findClosestLive(this.group.position, maxDist, allowNucleus);
    this.peelId = hit?.instanceId ?? -1;
    return this.peelId;
  }

  /** First voxel on the shot line — prevents firing through occluders. */
  private firstBlockOnLine(
    cube: CubeManager,
    from: THREE.Vector3,
    to: THREE.Vector3
  ): number {
    this._dir.copy(to).sub(from);
    const dist = this._dir.length();
    if (dist < 1e-4) return -1;
    this._dir.multiplyScalar(1 / dist);
    const hit = cube.raycast(from, this._dir, dist + 0.35, -1, 0.42);
    return hit?.instanceId ?? -1;
  }

  private updateDefenderSeat(dt: number, ship: THREE.Vector3, now: number): void {
    const toCenter = this._dir.copy(ship).multiplyScalar(-1).normalize();
    if (toCenter.lengthSq() < 1e-6) toCenter.set(0, 0, -1);
    const side = (this.index % 3) - 1;
    this._pos
      .copy(ship)
      .addScaledVector(toCenter, 2.2)
      .addScaledVector(this._up, side * 0.9 + Math.sin(now * 2 + this.index) * 0.35);
    const right = this._look.crossVectors(toCenter, this._up).normalize();
    this._pos.addScaledVector(right, side * 1.1 + Math.sin(now * 1.4 + this.seed) * 0.35);
    const k = 1 - Math.exp(-3.4 * dt);
    this.group.position.lerp(this._pos, k);
    this._look.copy(ship);
    this._m.lookAt(this.group.position, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    this.group.quaternion.slerp(this._targetQuat, 1 - Math.exp(-4 * dt));
  }

  /** Boids-ish swarm: wander, jink, peel, stay off the hull. */
  private updateSwarmFlight(
    dt: number,
    cube: CubeManager,
    combat?: DroneCombatContext
  ): void {
    const he = cube.halfExtent;
    const def = DRONE_ROLES[this.role];
    const minR = he * 1.22 + 1.8;
    const maxR = he * 2.4 + 3.2 + def.orbitRadiusBias * 0.35;
    const p = this.group.position;

    this.wanderT += dt;
    this.nextJink -= dt;
    if (this.nextJink <= 0) {
      this.nextJink = 0.28 + Math.random() * 1.05;
      this.jinkA = (Math.random() - 0.5) * 2.8;
      this.jinkB = (Math.random() - 0.5) * 1.9;
      this.radiusGoal = minR + Math.random() * (maxR - minR);
      this.heightGoal = (Math.random() - 0.5) * he * 1.15;
      if (Math.random() < 0.18) this.tanSign *= -1;
    }

    const rz = Math.hypot(p.x, p.z) || 0.001;
    const ang = Math.atan2(p.z, p.x);
    this.tangent.set(-Math.sin(ang), 0, Math.cos(ang));
    this.radial.set(p.x / rz, 0, p.z / rz);

    const tanSpeed = this.role === 'bomber' ? 5.2 : 8.4;
    this.desired.set(0, 0, 0);
    this.desired.addScaledVector(this.tangent, this.tanSign * (tanSpeed + Math.sin(this.wanderT * 1.4 + this.index) * 3.2));
    this.desired.addScaledVector(this.radial, (this.radiusGoal - rz) * 2.1);
    this.desired.y += (this.heightGoal - p.y) * 1.55;
    this.desired.x += this.jinkA * 4.4 + Math.sin(this.wanderT * 2.6 + this.seed) * 2.6;
    this.desired.y += this.jinkB * 3.2 + Math.sin(this.wanderT * 1.9 + this.index * 0.7) * 2.1;
    this.desired.z += Math.cos(this.wanderT * 2.1 + this.seed * 0.01) * 2.8;

    const dist3 = p.length();
    if (dist3 < minR && dist3 > 1e-4) {
      this.desired.addScaledVector(p, ((minR - dist3) * 9) / dist3);
    }

    const neighbors = combat?.neighbors;
    if (neighbors) {
      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        const dx = p.x - n.x;
        const dy = p.y - n.y;
        const dz = p.z - n.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.04 || d2 > 20) continue;
        const d = Math.sqrt(d2);
        const push = 4.8 / d;
        this.desired.x += (dx / d) * push;
        this.desired.y += (dy / d) * push;
        this.desired.z += (dz / d) * push;
      }
    }

    if (this.peelId !== -1 && cube.hasInstance(this.peelId)) {
      cube.getBlockWorldPos(this.peelId, this._target);
      const tx = this._target.x - p.x;
      const ty = this._target.y - p.y;
      const tz = this._target.z - p.z;
      this.desired.x += tx * 0.22;
      this.desired.y += ty * 0.18;
      this.desired.z += tz * 0.22;
    }

    const maxSpd = this.role === 'bomber' ? 8.5 : 13.5;
    const maxAcc = this.role === 'bomber' ? 11 : 22;
    this.steer.copy(this.desired);
    if (this.steer.lengthSq() > 1e-6) this.steer.setLength(maxSpd);
    this.steer.sub(this.vel);
    if (this.steer.length() > maxAcc) this.steer.setLength(maxAcc);
    this.vel.addScaledVector(this.steer, dt);
    const spd = this.vel.length();
    if (spd > maxSpd) this.vel.multiplyScalar(maxSpd / spd);
    else if (spd < 2.2 && spd > 1e-4) this.vel.multiplyScalar(2.2 / spd);
    this.group.position.addScaledVector(this.vel, dt);

    this._look.copy(p).add(this.vel);
    if (this.hasFireLook) this._look.lerp(this.fireLook, 0.4);
    this._m.lookAt(p, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    this.group.quaternion.slerp(this._targetQuat, 1 - Math.exp(-5.2 * dt));
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
