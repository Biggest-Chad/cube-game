/**
 * Railgun — charge shot, high armor pierce, optional ricochet.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface Slug {
  active: boolean;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  crit: boolean;
  armorPierce: number;
  bounces: number;
}

const POOL = 12;

export class RailgunWeapon implements WeaponBehavior {
  readonly family = 'rail';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private charge = 0;
  private charging = false;
  private slugs: Slug[] = [];
  private next = 0;
  private chargeRing: THREE.Mesh;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: 95,
      fireRate: 0.55,
      projectileSpeed: 180,
      range: 140,
      splashRadius: 0.4,
      splashFalloff: 0.3,
      armorPierce: 0.75,
      critChance: 0.12,
      critMult: 2.1,
      heatPerShot: 0.28,
      heatCapacity: 1,
      heatCoolRate: 0.22,
      chargeTime: 0.55,
      projectileCount: 1,
      homing: 0,
      burstSize: 0,
      flags: new Set(),
    };

    this.chargeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.035, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.chargeRing.visible = false;
    this.group.add(this.chargeRing);
    // Outer charge halo
    const chargeOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.02, 8, 28),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    chargeOuter.name = 'charge_outer';
    chargeOuter.visible = false;
    this.group.add(chargeOuter);

    const geo = new THREE.BoxGeometry(0.09, 0.09, 1.1);
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xaaccff,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      this.group.add(mesh);
      // Outer glow shell on slug
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.95),
        new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      shell.name = 'shell';
      mesh.add(shell);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: 0x66aaff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      trail.visible = false;
      this.group.add(trail);
      this.slugs.push({
        active: false,
        mesh,
        trail,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        crit: false,
        armorPierce: 0,
        bounces: 0,
      });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    this.sim(ctx.dt, ctx.cube, ctx.now);
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);

    if (ctx.firing && this.cooldown <= 0 && this.heat < 0.95) {
      this.charging = true;
      const ct = Math.max(0.12, this.stats.chargeTime);
      this.charge = Math.min(1, this.charge + ctx.dt / ct);
      this.chargeRing.visible = true;
      this.chargeRing.position.copy(ctx.origin);
      this.chargeRing.lookAt(ctx.origin.clone().add(ctx.direction));
      const mat = this.chargeRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + this.charge * 0.7;
      this.chargeRing.scale.setScalar(0.6 + this.charge * 0.8);

      if (this.charge >= 1) {
        this.fire(ctx);
      }
    } else {
      // Release early if charged enough (>50%) or decay
      if (this.charging && this.charge >= 0.5 && !ctx.firing) {
        this.fire(ctx);
      } else if (!ctx.firing) {
        this.charge = Math.max(0, this.charge - ctx.dt * 1.5);
        if (this.charge <= 0) {
          this.charging = false;
          this.chargeRing.visible = false;
        }
      }
    }
  }

  private fire(ctx: WeaponFireContext): void {
    const power = Math.max(0.5, this.charge);
    this.charge = 0;
    this.charging = false;
    this.chargeRing.visible = false;
    this.cooldown = 1 / Math.max(0.15, this.stats.fireRate);
    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);

    const rolled = rollOutgoing({
      raw: this.stats.damage * power,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    let bounces = 0;
    if (this.stats.flags.has('rico_2')) bounces = 2;
    else if (this.stats.flags.has('rico_1')) bounces = 1;

    const s = this.slugs[this.next % POOL];
    this.next++;
    s.active = true;
    s.pos.copy(ctx.origin).addScaledVector(ctx.direction, 0.9);
    s.vel.copy(ctx.direction).multiplyScalar(this.stats.projectileSpeed);
    s.life = 1.0;
    s.damage = rolled.damage;
    s.crit = rolled.crit;
    s.armorPierce = this.stats.armorPierce;
    s.bounces = bounces;
    s.mesh.visible = true;
    s.trail.visible = true;
    s.mesh.position.copy(s.pos);
    s.mesh.lookAt(s.pos.clone().add(s.vel));

    // Instant hitscan assist for snappy feel
    const hit = ctx.cube.raycast(ctx.origin, ctx.direction, this.stats.range);
    if (hit && this.stats.projectileSpeed > 150) {
      // visual slug still flies; damage on contact in sim
    }

    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot, charge: power });
    if (rolled.crit) bus.emit('crit');
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    for (const s of this.slugs) {
      if (!s.active) continue;
      s.life -= dt;
      const prev = this.tmp.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      s.mesh.lookAt(s.pos.clone().add(s.vel));

      const attr = s.trail.geometry.attributes.position as THREE.BufferAttribute;
      attr.setXYZ(0, prev.x, prev.y, prev.z);
      attr.setXYZ(1, s.pos.x, s.pos.y, s.pos.z);
      attr.needsUpdate = true;
      s.trail.geometry.computeBoundingSphere();

      const move = this.move.copy(s.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.4);
        if (hit) {
          this.impact(s, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (s.life <= 0 || s.pos.length() > 220) this.kill(s);
    }
  }

  private impact(
    s: Slug,
    cube: CubeManager,
    instanceId: number,
    point: THREE.Vector3,
    now: number
  ): void {
    const type = cube.getBlockType(instanceId);
    const applied = applyToBlock(
      {
        raw: s.damage,
        armorPierce: s.armorPierce,
        forceCrit: s.crit,
        critChance: 0,
        critMult: 1,
      },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    if (result) {
      result.x = point.x;
      result.y = point.y;
      result.z = point.z;
      bus.emit('beam-hit', { ...result, crit: s.crit });
    }
    if (this.stats.splashRadius > 0) {
      for (const h of cube.applySplash(
        point,
        this.stats.splashRadius,
        s.damage * 0.2,
        now,
        instanceId
      )) {
        bus.emit('beam-hit', h);
      }
    }

    if (s.bounces > 0) {
      s.bounces--;
      s.damage *= this.stats.flags.has('rico_strong') ? 0.7 : 0.55;
      // Reflect roughly away from center
      const n = point.clone().normalize();
      s.vel.reflect(n).normalize().multiplyScalar(this.stats.projectileSpeed * 0.85);
      s.pos.copy(point).addScaledVector(s.vel.clone().normalize(), 0.5);
      s.life = Math.max(s.life, 0.4);
      return;
    }
    this.kill(s);
  }

  private kill(s: Slug): void {
    s.active = false;
    s.mesh.visible = false;
    s.trail.visible = false;
  }

  getHeat(): number {
    return this.heat;
  }

  getCharge(): number {
    return this.charge;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    this.charge = 0;
    this.charging = false;
    this.chargeRing.visible = false;
    for (const s of this.slugs) this.kill(s);
  }

  dispose(): void {
    this.chargeRing.geometry.dispose();
    (this.chargeRing.material as THREE.Material).dispose();
    for (const s of this.slugs) {
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
      s.trail.geometry.dispose();
      (s.trail.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
