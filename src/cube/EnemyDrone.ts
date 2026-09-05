/**
 * Hostile drone — engages player ship / player drones, or repairs cube shell.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';
import {
  ENEMY_DRONE_BOLT_SPEED,
  ENEMY_DRONE_DEFAULT_DAMAGE,
  ENEMY_DRONE_DEFAULT_FIRE_RATE,
  ENEMY_DRONE_DEFAULT_HIT_POINTS,
  ENEMY_DRONE_DEFAULT_RANGE,
  ENEMY_DRONE_DEFAULT_REPAIR_FRACTION,
  ENEMY_DRONE_DEFAULT_SPEED,
  ENEMY_DRONE_TELEGRAPH_SECONDS,
  NUCLEUS_KAMIKAZE_ALLY_PEEL_RANGE,
  NUCLEUS_KAMIKAZE_FUSE_MAX_SECONDS,
  NUCLEUS_KAMIKAZE_FUSE_MIN_SECONDS,
  NUCLEUS_KAMIKAZE_PROXIMITY,
} from '../data/constraints';
import type { CubeManager } from './CubeManager';
import { createEnemyDrone } from './enemyDroneFactory';
import { disposeUnshared, iffHaloTex } from '../drones/droneGeom';
import { loadEnemyDroneGlb } from '../drones/droneGlb';
import { makeTeslaBolt, orientZForward } from '../vfx/ProjectileVfx';

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

interface DroneBolt {
  active: boolean;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
}

const BOLT_POOL = 3;

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
  private haloSize = 2.35;
  private pulseT = 0;
  private telegraphT = 0;
  private charging = false;
  private bolts: DroneBolt[] = [];
  private nextBolt = 0;
  private telegraphRing!: THREE.Mesh;
  private readonly _boltDir = new THREE.Vector3();
  private fuse = 0;
  private fuseMax = NUCLEUS_KAMIKAZE_FUSE_MAX_SECONDS;
  private lastRamDist = 99;
  private didBoom = false;

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
    this.telegraphRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.045, 6, 18),
      glowMat(0xff6622, 0)
    );
    this.telegraphRing.rotation.x = Math.PI / 2;
    this.telegraphRing.visible = false;
    this.telegraphRing.renderOrder = 3;
    this.group.add(this.telegraphRing);
    for (let i = 0; i < BOLT_POOL; i++) {
      const mesh = makeTeslaBolt();
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.bolts.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
      });
    }
    if (this.role === 'kamikaze') this.rollFuse();
  }

  private rollFuse(): void {
    const span = Math.max(0, NUCLEUS_KAMIKAZE_FUSE_MAX_SECONDS - NUCLEUS_KAMIKAZE_FUSE_MIN_SECONDS);
    this.fuseMax = NUCLEUS_KAMIKAZE_FUSE_MIN_SECONDS + Math.random() * span;
    this.fuse = this.fuseMax;
    this.didBoom = false;
  }

  /** World-space harass bolts — CubeDefense parents these off the drone. */
  getProjectileMeshes(): THREE.Object3D[] {
    return this.bolts.map((b) => b.mesh);
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
      this.halo.scale.setScalar(2.35);
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
    this.group.scale.setScalar(0.72);
    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    const haloMat = (this.halo as THREE.Sprite).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    if (haloMat && 'opacity' in haloMat) haloMat.opacity = 0.95;
    bus.emit('enemy-drone-hit', {
      id: this.id,
      role: this.role,
      x: this.group.position.x,
      y: this.group.position.y,
      z: this.group.position.z,
      killed: this.hp <= 0,
    });
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.beam.visible = false;
      this.telegraphRing.visible = false;
      this.charging = false;
      if (this.role === 'kamikaze') this.emitKamiBoom();
      bus.emit('enemy-drone-destroyed', {
        id: this.id,
        role: this.role,
        x: this.group.position.x,
        y: this.group.position.y,
        z: this.group.position.z,
      });
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
    if (!this.alive) {
      this.simBolts(dt, playerPos, onPlayerHit, extras, playerDronePositions);
      return;
    }

    if (this.role === 'kamikaze') {
      this.updateKamikaze(dt, playerPos, onPlayerHit, playerDronePositions, extras);
      return;
    }

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

    this.simBolts(dt, playerPos, onPlayerHit, extras, playerDronePositions);

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!allowFire) {
      this.charging = false;
      this.telegraphT = 0;
      this.telegraphRing.visible = false;
      return;
    }

    if (this.role === 'repair' && cube) {
      if (this.cooldown > 0) return;
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

    // Harassers always threaten the ship. Only peel onto an ally inside bolt range.
    let target = playerPos;
    let isDrone = false;
    if (ally && this.group.position.distanceTo(ally) <= this.cfg.range) {
      target = ally;
      isDrone = true;
    }

    const dist = this.group.position.distanceTo(target);
    if (dist > this.cfg.range) {
      this.charging = false;
      this.telegraphT = 0;
      this.telegraphRing.visible = false;
      return;
    }

    if (this.role === 'attack') {
      this.updateHarassShot(dt, target, isDrone, ally, extras);
      return;
    }

    if (this.cooldown > 0) return;
    this.cooldown = 1 / Math.max(0.25, this.cfg.fireRate * this.cfg.fireMul);
    this.showBeam(this.group.position, target);
    if (isDrone && ally) extras?.onDroneHit?.(ally, this.cfg.damage * 0.8);
    else onPlayerHit(this.cfg.damage);
    bus.emit('enemy-drone-fire', { id: this.id });
  }

  private updateHarassShot(
    dt: number,
    target: THREE.Vector3,
    isDrone: boolean,
    ally: THREE.Vector3 | undefined,
    extras?: { onDroneHit?: (aim: THREE.Vector3, damage: number) => void }
  ): void {
    if (!this.charging) {
      if (this.cooldown > 0) return;
      this.charging = true;
      this.telegraphT = ENEMY_DRONE_TELEGRAPH_SECONDS;
      this.telegraphRing.visible = true;
      this.showBeam(this.group.position, target);
      this.beamLife = ENEMY_DRONE_TELEGRAPH_SECONDS;
      (this.beam.material as THREE.LineBasicMaterial).color.setHex(0xffaa44);
      bus.emit('enemy-drone-telegraph', { id: this.id });
    }
    this.telegraphT -= dt;
    this.showBeam(this.group.position, target);
    this.beamLife = Math.max(this.beamLife, 0.05);
    const u = 1 - Math.max(0, this.telegraphT) / ENEMY_DRONE_TELEGRAPH_SECONDS;
    this.telegraphRing.scale.setScalar(0.7 + u * 0.9);
    (this.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0.25 + u * 0.7;
    this.telegraphRing.rotation.z += dt * (4 + u * 10);
    if (this.telegraphT > 0) return;

    this.charging = false;
    this.telegraphRing.visible = false;
    this.cooldown = 1 / Math.max(0.12, this.cfg.fireRate * this.cfg.fireMul);
    this.spawnBolt(target, isDrone && ally ? this.cfg.damage * 0.8 : this.cfg.damage);
    bus.emit('enemy-drone-fire', { id: this.id });
  }

  private spawnBolt(target: THREE.Vector3, damage: number): void {
    const b = this.bolts[this.nextBolt % BOLT_POOL];
    this.nextBolt++;
    b.active = true;
    b.damage = damage;
    b.life = 2.4;
    b.pos.copy(this.group.position);
    this._boltDir.copy(target).sub(b.pos);
    if (this._boltDir.lengthSq() < 1e-8) this._boltDir.set(0, 0, -1);
    else this._boltDir.normalize();
    b.vel.copy(this._boltDir).multiplyScalar(ENEMY_DRONE_BOLT_SPEED);
    b.mesh.visible = true;
    b.mesh.position.copy(b.pos);
    orientZForward(b.mesh, b.vel);
  }

  private simBolts(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    extras?: { onDroneHit?: (aim: THREE.Vector3, damage: number) => void },
    playerDronePositions?: THREE.Vector3[]
  ): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.vel.lengthSq() > 1e-8) orientZForward(b.mesh, b.vel);
      let hit = false;
      if (b.pos.distanceTo(playerPos) < 1.05) {
        onPlayerHit(b.damage);
        hit = true;
      } else if (playerDronePositions) {
        for (const pd of playerDronePositions) {
          if (b.pos.distanceTo(pd) < 0.95) {
            extras?.onDroneHit?.(pd, b.damage);
            hit = true;
            break;
          }
        }
      }
      if (hit || b.life <= 0 || b.pos.length() > 90) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
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

  private updateKamikaze(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    playerDronePositions: THREE.Vector3[] | undefined,
    extras?: { onDroneHit?: (aim: THREE.Vector3, damage: number) => void }
  ): void {
    this.fuse = Math.max(0, this.fuse - dt);
    const ally = this.nearestAlly(playerDronePositions);
    let ram = playerPos;
    if (ally && this.group.position.distanceTo(ally) <= NUCLEUS_KAMIKAZE_ALLY_PEEL_RANGE) {
      ram = ally;
    }
    this._pos.copy(ram).sub(this.group.position);
    const dist = this._pos.length();
    this.lastRamDist = dist;
    if (dist > 0.001) {
      this.group.lookAt(ram);
      const step = Math.min(dist, this.cfg.speed * dt);
      this.group.position.addScaledVector(this._pos.multiplyScalar(1 / dist), step);
    }
    this.pulseHalo(dt);
    if (dist <= NUCLEUS_KAMIKAZE_PROXIMITY) {
      if (ram === ally && ally) extras?.onDroneHit?.(ally, this.cfg.damage);
      else onPlayerHit(this.cfg.damage);
      this.boomAndDie();
      return;
    }
    if (this.fuse <= 0) {
      if (ally && this.group.position.distanceTo(ally) <= NUCLEUS_KAMIKAZE_PROXIMITY) {
        extras?.onDroneHit?.(ally, this.cfg.damage);
      } else if (this.group.position.distanceTo(playerPos) <= NUCLEUS_KAMIKAZE_PROXIMITY) {
        onPlayerHit(this.cfg.damage);
      }
      this.boomAndDie();
    }
  }

  /** 0..1 audio / VFX urgency — closes on the ship and the fuse. */
  seekIntensity(playerPos: THREE.Vector3): number {
    if (!this.alive || this.role !== 'kamikaze') return 0;
    const dist = this.group.position.distanceTo(playerPos);
    const close = 1 - Math.min(1, dist / 38);
    const fuseU = 1 - this.fuse / Math.max(0.001, this.fuseMax);
    return Math.min(1, close * 0.7 + fuseU * 0.45 + (close > 0.65 ? 0.15 : 0));
  }

  private boomAndDie(): void {
    this.emitKamiBoom();
    this.applyDamage(1e9);
  }

  private emitKamiBoom(): void {
    if (this.didBoom) return;
    this.didBoom = true;
    const p = this.group.position;
    bus.emit('explosion', {
      x: p.x,
      y: p.y,
      z: p.z,
      radius: 3.6,
      family: 'missile',
    });
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
    if (this.role === 'kamikaze') {
      this.pulseKamikaze(dt);
      return;
    }
    this.pulseT += dt;
    const k = 1 + Math.sin(this.pulseT * 5.2 + this.orbitAngle) * 0.1;
    const charge = this.charging ? 1.35 : 1;
    this.halo.scale.setScalar(this.haloSize * k * charge);
    const haloMat = (this.halo as THREE.Sprite).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    if (haloMat && 'opacity' in haloMat) {
      haloMat.opacity = this.charging
        ? 0.72 + Math.sin(this.pulseT * 14) * 0.22
        : 0.58 + Math.sin(this.pulseT * 6.4 + this.orbitAngle) * 0.12;
    }
    if (this.rotor) this.rotor.rotation.z += dt * 6;
    if (this.flash.visible) {
      const f = this.flash.material as THREE.MeshBasicMaterial;
      f.opacity = Math.max(0, f.opacity - dt * 7);
      if (f.opacity <= 0.04) this.flash.visible = false;
    }
  }

  private pulseKamikaze(dt: number): void {
    const fuseU = 1 - this.fuse / Math.max(0.001, this.fuseMax);
    const closeU = 1 - Math.min(1, this.lastRamDist / 18);
    const urgency = Math.min(1, Math.max(fuseU, closeU));
    this.pulseT += dt * (1 + urgency * 2.4);
    const rate = 5.2 + urgency * 16;
    const w = 0.5 + 0.5 * Math.sin(this.pulseT * rate + this.orbitAngle);
    const amp = 0.1 + urgency * 0.28;
    const k = 1 + (w * 2 - 1) * amp;
    this.hullRoot.scale.setScalar(k);
    this.halo.scale.setScalar(this.haloSize * (1.15 + urgency * 0.7) * (0.85 + w * 0.4));
    const haloMat = (this.halo as THREE.Sprite).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    if (haloMat && 'opacity' in haloMat) {
      haloMat.opacity = 0.55 + urgency * 0.35 + w * 0.2;
    }
    if (haloMat && 'color' in haloMat) {
      const hot = 0.35 + urgency * 0.65;
      haloMat.color.setRGB(1, 0.55 + (1 - hot) * 0.35, 0.08 + (1 - hot) * 0.2);
    }
    this.telegraphRing.visible = true;
    this.telegraphRing.scale.setScalar(0.75 + urgency * 1.1 + w * 0.35);
    (this.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0.22 + urgency * 0.55 + w * 0.2;
    this.telegraphRing.rotation.z += dt * (4 + urgency * 14);
    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 0.2 + urgency * 0.55 + w * 0.25;
    if (this.rotor) this.rotor.rotation.z += dt * (10 + urgency * 18);
    this.pulseKamiEmissive(urgency, w);
  }

  private pulseKamiEmissive(urgency: number, w: number): void {
    this.hullRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const m = raw as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
        if ('emissiveIntensity' in m && typeof m.emissiveIntensity === 'number') {
          m.emissiveIntensity = 0.35 + urgency * 1.8 + w * 0.55;
        }
        if (m.transparent && m.blending === THREE.AdditiveBlending && 'opacity' in m) {
          m.opacity = 0.4 + urgency * 0.45 + w * 0.2;
        }
      }
    });
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
    this.charging = false;
    this.telegraphT = 0;
    this.telegraphRing.visible = false;
    this.hullRoot.scale.setScalar(1);
    this.didBoom = false;
    if (this.role === 'kamikaze') this.rollFuse();
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
  }

  dispose(): void {
    disposeUnshared(this.group);
  }
}
