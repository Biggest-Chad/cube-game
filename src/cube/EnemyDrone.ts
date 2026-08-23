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

let haloTex: THREE.CanvasTexture | null = null;
function enemyHaloTex(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.needsUpdate = true;
  return haloTex;
}

function hullMat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: true });
}

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
  private halo!: THREE.Sprite;
  private flash!: THREE.Mesh;
  private haloSize = 2.4;
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

    this.buildMesh();
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
    const c = this.cfg.color;
    const accent = this.role === 'repair' ? 0xaaffcc : this.role === 'kamikaze' ? 0xffee88 : 0xffa0c8;
    this.haloSize = this.role === 'kamikaze' ? 3.1 : this.role === 'cube-fighter' ? 2.8 : 2.35;

    if (this.role === 'cube-fighter') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), hullMat(0x2a0510));
      this.group.add(hull);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), glowMat(c, 1));
      this.group.add(core);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.78), glowMat(c, 0.85));
      rim.position.y = 0.38;
      this.group.add(rim);
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.55), glowMat(accent, 0.9));
        fin.position.set(s * 0.46, 0, 0.04);
        this.group.add(fin);
      }
    } else {
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), hullMat(0x220810));
      body.scale.set(1.05, 0.72, 1.55);
      this.group.add(body);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat(c, 1));
      core.scale.set(1, 0.7, 1.4);
      this.group.add(core);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.28), glowMat(c, 0.95));
        wing.position.set(side * 0.42, 0, 0.04);
        this.group.add(wing);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), glowMat(accent, 1));
      eye.position.set(0, 0.02, -0.52);
      this.group.add(eye);
      if (this.role === 'kamikaze') {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), glowMat(0xffee66, 1));
        spike.rotation.x = -Math.PI / 2;
        spike.position.z = -0.72;
        this.group.add(spike);
      }
    }

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: enemyHaloTex(),
        color: c,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
        toneMapped: false,
      })
    );
    this.halo.scale.setScalar(this.haloSize);
    this.halo.renderOrder = 2;
    this.group.add(this.halo);

    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowMat(0xffffff, 0));
    this.flash.visible = false;
    this.flash.position.z = -0.55;
    this.group.add(this.flash);
    this.group.renderOrder = 2;
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
    this.orbitAngle += dt * 0.35 * this.cfg.speedMul;
    this._pos.set(
      Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight + Math.sin(this.orbitAngle * 1.3) * 0.8,
      Math.sin(this.orbitAngle) * this.orbitRadius
    );
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

    // Attack drones hunt player drones first, then the ship
    if (this.role === 'attack') {
      const hunt = ally ?? playerPos;
      const dive = Math.sin(this.orbitAngle * 0.5) > 0.7;
      if (dive) this._pos.lerp(hunt, 0.22);
      this.group.lookAt(hunt);
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

    // Hunt player drones first; only shoot the ship when no allies remain
    const target = ally ?? playerPos;
    const isDrone = !!ally;

    const dist = this.group.position.distanceTo(target);
    if (dist > this.cfg.range) return;

    this.cooldown = 1 / Math.max(0.25, this.cfg.fireRate * this.cfg.fireMul);
    this.showBeam(this.group.position, target);
    if (isDrone && ally) extras?.onDroneHit?.(ally, this.cfg.damage * 0.8);
    else onPlayerHit(this.cfg.damage);
    bus.emit('enemy-drone-fire', { id: this.id });
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
    const k = 1 + Math.sin(this.pulseT * 7 + this.orbitAngle) * 0.16;
    this.halo.scale.setScalar(this.haloSize * k);
    (this.halo.material as THREE.SpriteMaterial).opacity =
      0.55 + Math.sin(this.pulseT * 9 + this.orbitAngle) * 0.22;
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
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
  }
}
