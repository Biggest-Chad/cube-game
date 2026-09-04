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
import { createEnemyDrone } from './enemyDroneFactory';
import { disposeUnshared, iffHaloTex } from '../drones/droneGeom';
import { loadEnemyDroneGlb } from '../drones/droneGlb';

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

function glowMat(color: number, opacity = 0.9): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
}

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
  private hullRoot = new THREE.Group();
  private halo!: THREE.Sprite | THREE.Mesh;
  private flash!: THREE.Mesh;
  private rotor: THREE.Group | null = null;
  private haloSize = 1.7;
  private pulseT = 0;

  constructor(id: string, index: number, halfExtent: number, cfg: Partial<EnemyDroneConfig> = {}) {
    this.id = id;
    this.cfg = { ...DEFAULT, ...cfg };
    this.role = this.cfg.role;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.orbitAngle = index * 1.7 + 0.5;
    this.orbitRadius = halfExtent * 1.35 + 1;
    this.orbitHeight = (index % 3) * 1.8 - 1.5;

    this.hullRoot.name = 'HullVisual';
    this.group.add(this.hullRoot);
    this.buildMesh();
    void this.adoptGlbVisual();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      })
    );
    this.beam.visible = false;
    this.group.add(this.beam);
  }

  private buildMesh(): void {
    const visual = createEnemyDrone(this.role, this.cfg.color);
    const kids = visual.children.slice();
    for (const c of kids) this.hullRoot.add(c);
    this.bindSockets();
    this.group.renderOrder = 2;
  }

  private bindSockets(): void {
    this.rotor = this.group.getObjectByName('rotor') as THREE.Group | null;
    const namedHalo = this.group.getObjectByName('halo');
    const namedFlash = this.group.getObjectByName('flash');

    const haloIsSprite = !!(namedHalo && (namedHalo as THREE.Sprite).isSprite);
    const haloIsMesh = !!(namedHalo && (namedHalo as THREE.Mesh).isMesh);
    if (haloIsSprite || haloIsMesh) {
      this.halo = namedHalo as THREE.Sprite | THREE.Mesh;
    } else {
      this.halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: iffHaloTex('enemy'),
          color: 0xff2244,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: true,
          toneMapped: false,
        })
      );
      this.halo.name = 'halo';
      this.halo.scale.setScalar(1.7);
      this.halo.renderOrder = 2;
      this.group.add(this.halo);
    }
    this.haloSize = this.halo.scale.x;

    if (namedFlash instanceof THREE.Mesh) {
      this.flash = namedFlash;
    } else {
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), glowMat(0xffffff, 0));
      this.flash.name = 'flash';
      this.flash.visible = false;
      this.flash.position.z = -0.55;
      this.group.add(this.flash);
    }
  }

  private async adoptGlbVisual(): Promise<void> {
    try {
      const visual = await loadEnemyDroneGlb(this.role);
      while (this.hullRoot.children.length) this.hullRoot.remove(this.hullRoot.children[0]);
      const kids = visual.children.slice();
      for (const c of kids) this.hullRoot.add(c);
      this.bindSockets();
    } catch (err) {
      console.warn('[enemy-drone] GLB miss', this.role, err);
    }
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
    this.pulseHalo(dt);

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
    this.orbitAngle += dt * 0.4 * this.cfg.speedMul;
    const ally = this.nearestAlly(playerDronePositions);
    if (this.role === 'kamikaze') {
      const ram = ally ?? playerPos;
      this._pos.copy(ram);
      this.group.lookAt(ram);
      this.group.position.lerp(this._pos, 1 - Math.exp(-speed * 0.55 * dt));
      if (this.group.position.distanceTo(ram) <= 1.45) {
        if (ally) extras?.onDroneHit?.(ally, this.cfg.damage);
        else onPlayerHit(this.cfg.damage);
        this.applyDamage(1e9);
      }
      return;
    }

    if (this.role === 'attack') {
      this.stationInFrontOfShip(playerPos, halfExtent, now);
      this.group.lookAt(playerPos);
    } else {
      this._pos.set(
        Math.cos(this.orbitAngle) * this.orbitRadius,
        this.orbitHeight + Math.sin(this.orbitAngle * 1.3) * 0.8,
        Math.sin(this.orbitAngle) * this.orbitRadius
      );
      this.group.lookAt(0, 0, 0);
    }
    this.group.position.lerp(this._pos, 1 - Math.exp(-speed * 0.42 * dt));

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

    // Harassers always threaten the ship. Only peel onto an ally inside beam range.
    let target = playerPos;
    let isDrone = false;
    if (ally && this.group.position.distanceTo(ally) <= this.cfg.range) {
      target = ally;
      isDrone = true;
    }

    const dist = this.group.position.distanceTo(target);
    if (dist > this.cfg.range) return;

    this.cooldown = 1 / Math.max(0.25, this.cfg.fireRate * this.cfg.fireMul);
    this.showBeam(this.group.position, target);
    if (isDrone && ally) extras?.onDroneHit?.(ally, this.cfg.damage * 0.8);
    else onPlayerHit(this.cfg.damage);
    bus.emit('enemy-drone-fire', { id: this.id });
  }

  /** Hover in the ship's gun sight, between ship and cube. */
  private stationInFrontOfShip(playerPos: THREE.Vector3, halfExtent: number, now: number): void {
    const len = playerPos.length();
    if (len < 0.25) {
      this._pos.set(0, 1.6, halfExtent + 4);
      return;
    }
    this._target.copy(playerPos).multiplyScalar(-1 / len);
    this._lead.set(0, 1, 0).cross(this._target);
    if (this._lead.lengthSq() < 1e-5) this._lead.set(1, 0, 0);
    else this._lead.normalize();
    const slot = (Math.floor(this.orbitAngle * 2.1) % 3) - 1;
    const stand = 5.2 + (this.orbitAngle % 1) * 1.4;
    this._pos
      .copy(playerPos)
      .addScaledVector(this._target, stand)
      .addScaledVector(this._lead, slot * 1.75);
    this._pos.y += Math.sin(now * 1.55 + this.orbitAngle) * 0.65;
    const r = this._pos.length();
    const minR = halfExtent + 2.5;
    if (r < minR) this._pos.multiplyScalar(minR / Math.max(0.1, r));
  }

  private nearestAlly(drones: THREE.Vector3[] | undefined): THREE.Vector3 | undefined {
    if (!drones || drones.length === 0) return undefined;
    let best: THREE.Vector3 | undefined;
    let bestD = Infinity;
    for (const pd of drones) {
      const d = this.group.position.distanceTo(pd);
      if (d < bestD) {
        bestD = d;
        best = pd;
      }
    }
    return best;
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
      this.retargetT = 0.55 + Math.random() * 0.55;
      if (drones.length === 0) this.huntShip = true;
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
    this.beamLife = 0.14;
    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    (this.beam.material as THREE.LineBasicMaterial).color.setHex(this.cfg.color);
  }

  private pulseHalo(dt: number): void {
    this.pulseT += dt;
    const k = 1 + Math.sin(this.pulseT * 5.2 + this.orbitAngle) * 0.1;
    this.halo.scale.setScalar(this.haloSize * k);
    const haloMat = (this.halo as THREE.Sprite).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    if (haloMat && 'opacity' in haloMat) {
      haloMat.opacity = 0.44 + Math.sin(this.pulseT * 6.4 + this.orbitAngle) * 0.08;
    }
    if (this.rotor) this.rotor.rotation.z += dt * (this.role === 'kamikaze' ? 10 : 6);
    if (this.flash.visible) {
      const f = this.flash.material as THREE.MeshBasicMaterial;
      f.opacity = Math.max(0, f.opacity - dt * 7);
      if (f.opacity <= 0.04) this.flash.visible = false;
    }
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
    disposeUnshared(this.group);
  }
}
