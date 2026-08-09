/**
 * Flak Cannon — proximity AoE bursts, strong vs enemy drones.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface Shell {
  active: boolean;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  fuse: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
}

const POOL = 36;

export class FlakWeapon implements WeaponBehavior {
  readonly family = 'flak';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private shells: Shell[] = [];
  private next = 0;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: 22,
      fireRate: 3.2,
      projectileSpeed: 55,
      range: 70,
      splashRadius: 2.8,
      splashFalloff: 0.55,
      armorPierce: 0,
      critChance: 0.06,
      critMult: 1.7,
      heatPerShot: 0.09,
      heatCapacity: 1,
      heatCoolRate: 0.32,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0,
      burstSize: 6,
      flags: new Set(),
    };

    const geo = new THREE.SphereGeometry(0.1, 10, 10);
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffe080,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xffaa40,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.add(halo);
      this.group.add(mesh);
      this.shells.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        fuse: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
      });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    this.sim(ctx.dt, ctx.cube, ctx.now, ctx);
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    this.cooldown = 1 / Math.max(0.5, this.stats.fireRate);
    const rolled = rollOutgoing({
      raw: this.stats.damage,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    for (let i = 0; i < this.stats.projectileCount; i++) {
      const spread = (i - (this.stats.projectileCount - 1) / 2) * 0.05 + (Math.random() - 0.5) * 0.04;
      const axis = new THREE.Vector3(0, 1, 0);
      const dir = ctx.direction.clone().applyAxisAngle(axis, spread).normalize();
      // Prefer aim near enemy drones if present
      let aim = dir;
      if (ctx.enemyTargets && ctx.enemyTargets.length > 0) {
        let best = ctx.enemyTargets[0];
        let bestD = ctx.origin.distanceTo(best.position);
        for (const t of ctx.enemyTargets) {
          const d = ctx.origin.distanceTo(t.position);
          if (d < bestD) {
            best = t;
            bestD = d;
          }
        }
        if (bestD < this.stats.range) {
          aim = best.position.clone().sub(ctx.origin).normalize();
        }
      }
      this.spawn(ctx.origin, aim, rolled.damage, rolled.crit);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private spawn(from: THREE.Vector3, dir: THREE.Vector3, damage: number, crit: boolean): void {
    const s = this.shells[this.next % POOL];
    this.next++;
    s.active = true;
    s.pos.copy(from).addScaledVector(dir, 0.5);
    s.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
    s.life = 1.6;
    // Proximity fuse distance-as-time
    const early = this.stats.flags.has('prox_early') || this.stats.flags.has('prox_max') ? 0.55 : 0.85;
    s.fuse = early;
    s.damage = damage;
    s.splash = this.stats.splashRadius;
    s.crit = crit;
    s.armorPierce = this.stats.armorPierce;
    s.mesh.visible = true;
    s.mesh.position.copy(s.pos);
  }

  private sim(dt: number, cube: CubeManager, now: number, ctx: WeaponFireContext): void {
    for (const s of this.shells) {
      if (!s.active) continue;
      s.life -= dt;
      s.fuse -= dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);

      // Proximity vs enemy drones
      if (ctx.enemyTargets) {
        for (const t of ctx.enemyTargets) {
          if (s.pos.distanceTo(t.position) < s.splash * 0.65 + t.radius) {
            this.burst(s, cube, s.pos.clone(), now, ctx);
            break;
          }
        }
        if (!s.active) continue;
      }

      // Fuse timeout or block contact
      const hit = cube.raycast(
        this.tmp.copy(s.pos).addScaledVector(s.vel, -dt),
        s.vel.clone().normalize(),
        s.vel.length() * dt + 0.4
      );
      if (hit) {
        this.burst(s, cube, hit.point, now, ctx);
        continue;
      }
      if (s.fuse <= 0 || s.life <= 0) {
        this.burst(s, cube, s.pos.clone(), now, ctx);
      }
    }
  }

  private burst(
    s: Shell,
    cube: CubeManager,
    point: THREE.Vector3,
    now: number,
    ctx: WeaponFireContext
  ): void {
    if (!s.active) return;
    // Anti-drone damage
    if (ctx.enemyTargets && ctx.onEnemyHit) {
      const mul = this.stats.flags.has('prox_smart') || this.stats.flags.has('prox_max') ? 1.6 : 1.2;
      for (const t of ctx.enemyTargets) {
        if (point.distanceTo(t.position) <= s.splash + t.radius) {
          ctx.onEnemyHit(t.id, s.damage * mul);
        }
      }
    }

    const hits = cube.applySplash(point, s.splash, s.damage * 0.85, now);
    // Apply armor model on primary nearest if any
    for (const h of hits) {
      bus.emit('beam-hit', {
        ...h,
        crit: s.crit,
        style: 'explosive' as const,
        impactNx: point.x,
        impactNy: point.y,
        impactNz: point.z,
      });
    }
    // Also direct hit attempt when splash found nothing
    const near = cube.findNearest(point, s.splash);
    if (near && hits.length === 0) {
      const type = cube.getBlockType(near.instanceId);
      const applied = applyToBlock(
        { raw: s.damage, armorPierce: s.armorPierce, forceCrit: s.crit, critChance: 0, critMult: 1 },
        type
      );
      const r = cube.applyDamage(near.instanceId, applied.finalDamage, now);
      if (r) bus.emit('beam-hit', { ...r, crit: s.crit });
    }

    bus.emit('explosion', {
      x: point.x,
      y: point.y,
      z: point.z,
      radius: s.splash,
      family: 'flak',
    });
    s.active = false;
    s.mesh.visible = false;
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const s of this.shells) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const s of this.shells) {
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
