/**
 * Hostile drone — engages player ship / player drones, or repairs cube shell.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';
import {
  ENEMY_DRONE_DEFAULT_DAMAGE,
  ENEMY_DRONE_DEFAULT_FIRE_RATE,
  ENEMY_DRONE_DEFAULT_HIT_POINTS,
  ENEMY_DRONE_DEFAULT_RANGE,
  ENEMY_DRONE_DEFAULT_REPAIR_FRACTION,
  ENEMY_DRONE_DEFAULT_SPEED,
} from '../data/constraints';
import type { CubeManager } from './CubeManager';

export type EnemyDroneRole = 'attack' | 'repair' | 'kamikaze' | 'cube-fighter';

export interface EnemyDroneConfig {
  hp: number;
  damage: number;
  fireRate: number;
  speed: number;
  range: number;
  color: number;
  role: EnemyDroneRole;
  /** Temporary enrage mults from Swarm overload. */
  speedMul: number;
  fireMul: number;
  /** Repair amount per pulse as fraction of block max HP. */
  repairFrac: number;
}

const DEFAULT: EnemyDroneConfig = {
  hp: ENEMY_DRONE_DEFAULT_HIT_POINTS,
  damage: ENEMY_DRONE_DEFAULT_DAMAGE,
  fireRate: ENEMY_DRONE_DEFAULT_FIRE_RATE,
  speed: ENEMY_DRONE_DEFAULT_SPEED,
  range: ENEMY_DRONE_DEFAULT_RANGE,
  color: 0xff2244,
  role: 'attack',
  speedMul: 1,
  fireMul: 1,
  repairFrac: ENEMY_DRONE_DEFAULT_REPAIR_FRACTION,
};

export class EnemyDrone {
  readonly group = new THREE.Group();
  readonly id: string;
  hp: number;
  maxHp: number;
  alive = true;
  role: EnemyDroneRole;
  private cfg: EnemyDroneConfig;
  private cooldown = 0;
  private orbitAngle: number;
  private orbitRadius: number;
  private orbitHeight: number;
  private readonly _pos = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _lead = new THREE.Vector3();
  private beam: THREE.Line;
  private beamLife = 0;
  private huntShip = true;
  private retargetT = 0;
  private droneIndex = 0;

  constructor(id: string, index: number, halfExtent: number, cfg: Partial<EnemyDroneConfig> = {}) {
    this.id = id;
    this.cfg = { ...DEFAULT, ...cfg };
    this.role = this.cfg.role;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.orbitAngle = index * 1.7 + 0.5;
    this.orbitRadius = halfExtent * 1.35 + 1;
    this.orbitHeight = (index % 3) * 1.8 - 1.5;

    this.buildMesh();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: this.cfg.color,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.beam.visible = false;
    this.group.add(this.beam);
  }

  private buildMesh(): void {
    if (this.role === 'cube-fighter') {
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshStandardMaterial({
          color: 0x1a0810,
          metalness: 0.55,
          roughness: 0.28,
          emissive: this.cfg.color,
          emissiveIntensity: 0.7,
        })
      );
      this.group.add(hull);
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.18),
        new THREE.MeshBasicMaterial({
          color: this.cfg.color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.group.add(core);
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.22, 0.34),
          new THREE.MeshStandardMaterial({
            color: 0x401018,
            emissive: this.cfg.color,
            emissiveIntensity: 0.4,
          })
        );
        fin.position.set(s * 0.28, 0, 0.04);
        this.group.add(fin);
      }
      return;
    }
    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({
        color: 0x2a1018,
        metalness: 0.7,
        roughness: 0.35,
        emissive: this.cfg.color,
        emissiveIntensity: 0.45,
      })
    );
    body.scale.set(1, 0.7, 1.4);
    this.group.add(body);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.04, 0.18),
        new THREE.MeshStandardMaterial({
          color: 0x401020,
          emissive: this.cfg.color,
          emissiveIntensity: 0.3,
        })
      );
      wing.position.set(side * 0.3, 0, 0);
      this.group.add(wing);
    }

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: this.cfg.color })
    );
    eye.position.set(0, 0, -0.35);
    this.group.add(eye);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  applyDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    // Hit flash
    this.group.scale.setScalar(0.85);
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.beam.visible = false;
      bus.emit('enemy-drone-destroyed', { id: this.id, role: this.role });
      return true;
    }
    return false;
  }

  setEnraged(on: boolean): void {
    this.cfg.speedMul = on ? 1.55 : 1;
    this.cfg.fireMul = on ? 1.7 : 1;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    halfExtent: number,
    onPlayerHit: (damage: number) => void,
    playerDronePositions?: THREE.Vector3[],
    /** When false (stage countdown), fly but do not fire. */
    allowFire = true,
    cube?: CubeManager | null,
    now = 0,
    extras?: {
      playerVel?: THREE.Vector3;
      onDroneHit?: (aim: THREE.Vector3, damage: number) => void;
    }
  ): void {
    if (!this.alive) return;

    // Recover scale after hit flash
    const s = this.group.scale.x;
    if (s < 1) this.group.scale.setScalar(Math.min(1, s + dt * 3));

    const speed = this.cfg.speed * this.cfg.speedMul;
    if (this.role === 'cube-fighter') {
      this.updateCubeFighter(
        dt,
        playerPos,
        halfExtent,
        speed,
        onPlayerHit,
        playerDronePositions,
        allowFire,
        extras
      );
      return;
    }
    this.orbitRadius = halfExtent * (this.role === 'repair' ? 1.05 : 1.35) + 1;
    this.orbitAngle += dt * 0.35 * this.cfg.speedMul;
    this._pos.set(
      Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight + Math.sin(this.orbitAngle * 1.3) * 0.8,
      Math.sin(this.orbitAngle) * this.orbitRadius
    );
    if (this.role === 'kamikaze') {
      this._pos.copy(playerPos);
      this.group.lookAt(playerPos);
      this.group.position.lerp(this._pos, 1 - Math.exp(-speed * 0.55 * dt));
      if (this.group.position.distanceTo(playerPos) <= 1.45) {
        onPlayerHit(this.cfg.damage);
        this.applyDamage(1e9);
      }
      return;
    }

    // Attack drones dive toward player; repair drones hug the shell
    if (this.role === 'attack') {
      const dive = Math.sin(this.orbitAngle * 0.5) > 0.7;
      if (dive) this._pos.lerp(playerPos, 0.15);
      this.group.lookAt(playerPos);
    } else {
      this.group.lookAt(0, 0, 0);
    }
    this.group.position.lerp(this._pos, 1 - Math.exp(-speed * 0.35 * dt));

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      if (this.beamLife <= 0) this.beam.visible = false;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!allowFire || this.cooldown > 0) return;

    if (this.role === 'repair' && cube) {
      const near = cube.findNearest(this.group.position, this.cfg.range, () => 1);
      if (!near) return;
      this.cooldown = 1 / Math.max(0.3, this.cfg.fireRate * this.cfg.fireMul);
      cube.getBlockWorldPos(near.instanceId, this._target);
      this.showBeam(this.group.position, this._target);
      // Heal via negative damage path — direct HP add
      const refType = cube.getBlockType(near.instanceId);
      if (refType) {
        cube.regenShellBlocks(this.cfg.repairFrac * 0.35, now);
      }
      // Also heal nucleus slightly when repairing near core
      bus.emit('enemy-drone-repair', { id: this.id });
      return;
    }

    // Prefer shooting nearby player drones, else player
    let target = playerPos;
    let isDrone = false;
    if (playerDronePositions) {
      let bestD = 14;
      for (const pd of playerDronePositions) {
        const d = this.group.position.distanceTo(pd);
        if (d < bestD) {
          bestD = d;
          target = pd;
          isDrone = true;
        }
      }
    }

    const dist = this.group.position.distanceTo(target);
    if (dist > this.cfg.range) return;

    this.cooldown = 1 / Math.max(0.25, this.cfg.fireRate * this.cfg.fireMul);
    this.showBeam(this.group.position, target);
    if (!isDrone) {
      onPlayerHit(this.cfg.damage);
    } else {
      bus.emit('enemy-drone-hit-ally', { id: this.id, damage: this.cfg.damage * 0.8 });
    }
    bus.emit('enemy-drone-fire', { id: this.id });
  }

  private updateCubeFighter(
    dt: number,
    playerPos: THREE.Vector3,
    halfExtent: number,
    speed: number,
    onPlayerHit: (damage: number) => void,
    playerDronePositions: THREE.Vector3[] | undefined,
    allowFire: boolean,
    extras?: {
      playerVel?: THREE.Vector3;
      onDroneHit?: (aim: THREE.Vector3, damage: number) => void;
    }
  ): void {
    this.retargetT -= dt;
    const drones = playerDronePositions ?? [];
    if (this.retargetT <= 0) {
      this.retargetT = 0.7 + Math.random() * 0.9;
      if (drones.length === 0 || Math.random() < 0.42) this.huntShip = true;
      else {
        this.huntShip = false;
        this.droneIndex = (Math.random() * drones.length) | 0;
      }
    }
    const droneTarget = !this.huntShip ? drones[this.droneIndex] ?? drones[0] : undefined;
    const target = droneTarget ?? playerPos;
    const vel = extras?.playerVel;
    if (this.huntShip && vel && vel.lengthSq() > 0.05) {
      const t = Math.min(0.9, this.group.position.distanceTo(playerPos) / 22);
      this._lead.copy(playerPos).addScaledVector(vel, t);
    } else {
      this._lead.copy(target);
    }

    this._target.copy(this._lead).sub(this.group.position);
    const gap = this._target.length();
    if (gap > 0.15) {
      this._pos.copy(this._lead).addScaledVector(this._target.normalize(), -6.2);
    } else {
      this._pos.copy(this.group.position);
    }
    const away = this._pos.length();
    if (away < halfExtent + 2.4) {
      this._pos.multiplyScalar((halfExtent + 2.6) / Math.max(0.1, away));
    }
    this.group.lookAt(this._lead);
    this.group.position.lerp(this._pos, 1 - Math.exp(-speed * 0.42 * dt));

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      if (this.beamLife <= 0) this.beam.visible = false;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!allowFire || this.cooldown > 0) return;

    const dist = this.group.position.distanceTo(this._lead);
    if (dist > this.cfg.range) return;
    this.cooldown = 1 / Math.max(0.3, this.cfg.fireRate * this.cfg.fireMul);
    this.showBeam(this.group.position, this._lead);
    if (droneTarget) extras?.onDroneHit?.(this._lead, this.cfg.damage * 0.85);
    else onPlayerHit(this.cfg.damage);
    bus.emit('enemy-drone-fire', { id: this.id, role: this.role });
  }

  private showBeam(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.beam.geometry.attributes.position as THREE.BufferAttribute;
    // Beam in local space of group
    const lf = this.group.worldToLocal(from.clone());
    const lt = this.group.worldToLocal(to.clone());
    pos.setXYZ(0, lf.x, lf.y, lf.z);
    pos.setXYZ(1, lt.x, lt.y, lt.z);
    pos.needsUpdate = true;
    this.beam.geometry.computeBoundingSphere();
    this.beam.visible = true;
    this.beamLife = 0.08;
  }

  toUnitRef(): {
    id: string;
    position: { x: number; y: number; z: number };
    hp: number;
    kind: EnemyDroneRole;
  } {
    return {
      id: this.id,
      position: {
        x: this.group.position.x,
        y: this.group.position.y,
        z: this.group.position.z,
      },
      hp: this.hp,
      kind: this.role,
    };
  }

  reset(): void {
    this.cooldown = 0.3;
    this.beam.visible = false;
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
