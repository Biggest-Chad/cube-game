/**
 * Cube-mounted turret — fires slow orbs at the player.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';

export interface TurretProjectile {
  active: boolean;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
}

export interface TurretConfig {
  hp: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  range: number;
  color: number;
}

const DEFAULT: TurretConfig = {
  hp: 80,
  damage: 12,
  fireRate: 0.45,
  projectileSpeed: 18,
  range: 55,
  color: 0xff4488,
};

export class Turret {
  readonly group = new THREE.Group();
  readonly id: string;
  hp: number;
  maxHp: number;
  alive = true;
  private cfg: TurretConfig;
  private cooldown = 0;
  private barrel: THREE.Mesh;
  private head: THREE.Group;
  private projectiles: TurretProjectile[] = [];
  private next = 0;
  private readonly _aim = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();

  constructor(id: string, position: THREE.Vector3, cfg: Partial<TurretConfig> = {}) {
    this.id = id;
    this.cfg = { ...DEFAULT, ...cfg };
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.group.position.copy(position);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2a1520,
      metalness: 0.7,
      roughness: 0.4,
      emissive: this.cfg.color,
      emissiveIntensity: 0.25,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 8), baseMat);
    this.group.add(base);

    this.head = new THREE.Group();
    this.head.position.y = 0.25;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x3a2030,
        metalness: 0.6,
        roughness: 0.35,
        emissive: this.cfg.color,
        emissiveIntensity: 0.4,
      })
    );
    this.head.add(dome);
    this.barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.55, 6),
      new THREE.MeshStandardMaterial({
        color: this.cfg.color,
        emissive: this.cfg.color,
        emissiveIntensity: 0.6,
        metalness: 0.5,
        roughness: 0.3,
      })
    );
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.z = -0.35;
    this.head.add(this.barrel);
    this.group.add(this.head);

    // Charge ring (telegraph)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.03, 6, 16),
      new THREE.MeshBasicMaterial({
        color: this.cfg.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.name = 'charge_ring';
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    const pGeo = new THREE.SphereGeometry(0.12, 8, 8);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        pGeo,
        new THREE.MeshBasicMaterial({
          color: this.cfg.color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      // projectiles parented to world via group parent — add to root when fired from manager
      this.projectiles.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: this.cfg.damage,
      });
    }
  }

  /** Projectile meshes must be added to a world group by CubeDefense. */
  getProjectileMeshes(): THREE.Mesh[] {
    return this.projectiles.map((p) => p.mesh);
  }

  applyDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      for (const p of this.projectiles) {
        p.active = false;
        p.mesh.visible = false;
      }
      bus.emit('turret-destroyed', { id: this.id });
      return true;
    }
    return false;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number, point: THREE.Vector3) => void,
    /** When false (stage countdown), aim only — no new shots. */
    allowFire = true
  ): void {
    if (!this.alive) {
      this.simProjectiles(dt, playerPos, onPlayerHit);
      return;
    }

    const toPlayer = this._aim.copy(playerPos).sub(this.group.position);
    const dist = toPlayer.length();
    if (dist > 0.01) {
      toPlayer.normalize();
      // Yaw head toward player
      const yaw = Math.atan2(toPlayer.x, toPlayer.z);
      this.head.rotation.y = yaw;
      this.head.rotation.x = -Math.asin(THREE.MathUtils.clamp(toPlayer.y, -0.9, 0.9));
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    const ring = this.group.getObjectByName('charge_ring') as THREE.Mesh | undefined;
    const chargeT = this.cooldown > 0 ? 1 - this.cooldown * this.cfg.fireRate : 1;

    if (allowFire && dist <= this.cfg.range && this.cooldown <= 0) {
      this.fire(toPlayer);
      this.cooldown = 1 / this.cfg.fireRate;
    } else if (ring && allowFire && dist <= this.cfg.range) {
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.15 + (1 - Math.min(1, this.cooldown * this.cfg.fireRate)) * 0.5);
      ring.scale.setScalar(0.8 + chargeT * 0.4);
    } else if (ring) {
      (ring.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    this.simProjectiles(dt, playerPos, onPlayerHit);
  }

  private fire(dir: THREE.Vector3): void {
    const p = this.projectiles[this.next % this.projectiles.length];
    this.next++;
    p.active = true;
    p.pos.copy(this.group.position).add(new THREE.Vector3(0, 0.35, 0)).addScaledVector(dir, 0.6);
    p.vel.copy(dir).multiplyScalar(this.cfg.projectileSpeed);
    p.life = 4;
    p.damage = this.cfg.damage;
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    bus.emit('turret-fire', { id: this.id });
  }

  private simProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number, point: THREE.Vector3) => void
  ): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.pos.distanceTo(playerPos) < 1.1) {
        onPlayerHit(p.damage, p.pos.clone());
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      if (p.life <= 0 || p.pos.length() > 120) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  reset(): void {
    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }
    this.cooldown = 0.5;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
    for (const p of this.projectiles) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
  }
}
