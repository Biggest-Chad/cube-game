/**
 * Hostile drone — engages player ship and player drones.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';

export interface EnemyDroneConfig {
  hp: number;
  damage: number;
  fireRate: number;
  speed: number;
  range: number;
  color: number;
}

const DEFAULT: EnemyDroneConfig = {
  hp: 45,
  damage: 8,
  fireRate: 1.1,
  speed: 6,
  range: 28,
  color: 0xff2244,
};

export class EnemyDrone {
  readonly group = new THREE.Group();
  readonly id: string;
  hp: number;
  maxHp: number;
  alive = true;
  private cfg: EnemyDroneConfig;
  private cooldown = 0;
  private orbitAngle: number;
  private orbitRadius: number;
  private orbitHeight: number;
  private readonly _pos = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private beam: THREE.Line;
  private beamLife = 0;

  constructor(id: string, index: number, halfExtent: number, cfg: Partial<EnemyDroneConfig> = {}) {
    this.id = id;
    this.cfg = { ...DEFAULT, ...cfg };
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
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.beam.visible = false;
      bus.emit('enemy-drone-destroyed', { id: this.id });
      return true;
    }
    return false;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    halfExtent: number,
    onPlayerHit: (damage: number) => void,
    playerDronePositions?: THREE.Vector3[],
    /** When false (stage countdown), fly but do not fire. */
    allowFire = true
  ): void {
    if (!this.alive) return;

    this.orbitRadius = halfExtent * 1.35 + 1;
    this.orbitAngle += dt * 0.35;
    this._pos.set(
      Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight + Math.sin(this.orbitAngle * 1.3) * 0.8,
      Math.sin(this.orbitAngle) * this.orbitRadius
    );
    // Occasionally dive toward player
    const dive = Math.sin(this.orbitAngle * 0.5) > 0.7;
    if (dive) {
      this._pos.lerp(playerPos, 0.15);
    }
    this.group.position.lerp(this._pos, 1 - Math.exp(-this.cfg.speed * 0.35 * dt));
    this.group.lookAt(playerPos);

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      if (this.beamLife <= 0) this.beam.visible = false;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!allowFire || this.cooldown > 0) return;

    // Prefer shooting nearby player drones, else player
    let target = playerPos;
    let isDrone = false;
    if (playerDronePositions) {
      let bestD = 12;
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

    this.cooldown = 1 / this.cfg.fireRate;
    this.showBeam(this.group.position, target);
    if (!isDrone) {
      onPlayerHit(this.cfg.damage);
    } else {
      bus.emit('enemy-drone-hit-ally', { id: this.id, damage: this.cfg.damage * 0.8 });
    }
    bus.emit('enemy-drone-fire', { id: this.id });
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

  toUnitRef(): { id: string; position: { x: number; y: number; z: number }; hp: number } {
    return {
      id: this.id,
      position: {
        x: this.group.position.x,
        y: this.group.position.y,
        z: this.group.position.z,
      },
      hp: this.hp,
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
