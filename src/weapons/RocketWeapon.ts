/**
 * Rocket Pod — slow dumb-fire splash projectiles with thick exhaust trails.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';
import { makeMissileBody, makeTrail, orientZForward } from '../vfx/ProjectileVfx';

interface Rocket {
  active: boolean;
  mesh: THREE.Object3D;
  trail: THREE.Line;
  trailSet: (i: number, p: THREE.Vector3) => void;
  trailHist: THREE.Vector3[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
  glow: THREE.PointLight;
}

const POOL = 24;

export class RocketWeapon implements WeaponBehavior {
  readonly family = 'rocket';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private rockets: Rocket[] = [];
  private next = 0;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor() {
    this.stats = emptyStats(0xff6622);
    for (let i = 0; i < POOL; i++) {
      const mesh = makeMissileBody(0xff6622, 0.55, 0.09);
      mesh.visible = false;
      this.group.add(mesh);
      const tr = makeTrail(0xff8844, 8, 0.75);
      this.group.add(tr.line);
      const glow = new THREE.PointLight(0xff6622, 0, 8, 2);
      this.group.add(glow);
      const hist = Array.from({ length: 8 }, () => new THREE.Vector3());
      this.rockets.push({
        active: false,
        mesh,
        trail: tr.line,
        trailSet: tr.set,
        trailHist: hist,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
        glow,
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
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    this.cooldown = 1 / Math.max(0.2, this.stats.fireRate);
    const count = this.stats.projectileCount;
    const rolled = rollOutgoing({
      raw: this.stats.damage,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.06;
      const axis =
        Math.abs(ctx.direction.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
      const dir = ctx.direction.clone().applyAxisAngle(axis, spread).normalize();
      this.spawn(ctx.origin, dir, rolled.damage, rolled.crit);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private spawn(from: THREE.Vector3, dir: THREE.Vector3, damage: number, crit: boolean): void {
    const r = this.rockets[this.next % POOL];
    this.next++;
    r.active = true;
    r.pos.copy(from).addScaledVector(dir, 0.8);
    r.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
    // slight gravity-less arc drop for dumb-fire feel
    r.vel.y -= 1.5;
    r.life = 2.5;
    r.damage = damage;
    r.splash = this.stats.splashRadius;
    r.crit = crit;
    r.armorPierce = this.stats.armorPierce;
    r.mesh.visible = true;
    r.trail.visible = true;
    r.mesh.position.copy(r.pos);
    orientZForward(r.mesh, dir);
    for (const h of r.trailHist) h.copy(r.pos);
    r.glow.intensity = crit ? 10 : 6;
    r.glow.position.copy(r.pos);
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    for (const r of this.rockets) {
      if (!r.active) continue;
      r.life -= dt;
      const prev = this.tmp.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      orientZForward(r.mesh, r.vel);
      r.glow.position.copy(r.pos);
      r.glow.intensity = 5 + Math.sin(r.life * 20) * 2;

      // Scroll trail history
      for (let i = r.trailHist.length - 1; i > 0; i--) r.trailHist[i].copy(r.trailHist[i - 1]);
      r.trailHist[0].copy(r.pos);
      for (let i = 0; i < r.trailHist.length; i++) r.trailSet(i, r.trailHist[i]);
      (r.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      r.trail.geometry.computeBoundingSphere();

      const move = this.move.copy(r.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.5, -1, 0.55);
        if (hit) {
          this.detonate(r, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (r.life <= 0 || r.pos.length() > 180) this.kill(r);
    }
  }

  private detonate(
    r: Rocket,
    cube: CubeManager,
    instanceId: number,
    point: THREE.Vector3,
    now: number
  ): void {
    const type = cube.getBlockType(instanceId);
    const applied = applyToBlock(
      { raw: r.damage, armorPierce: r.armorPierce, forceCrit: r.crit, critChance: 0, critMult: 1 },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    this.kill(r);
    if (result) {
      result.x = point.x;
      result.y = point.y;
      result.z = point.z;
      bus.emit('beam-hit', {
        ...result,
        crit: r.crit,
        style: 'splash' as const,
        impactNx: point.x,
        impactNy: point.y,
        impactNz: point.z,
      });
    }
    if (r.splash > 0) {
      const splashDmg = r.damage * 0.45;
      const hits = cube.applySplash(point, r.splash, splashDmg, now);
      for (const h of hits) bus.emit('beam-hit', { ...h, style: 'splash' as const });
    }
    bus.emit('explosion', { x: point.x, y: point.y, z: point.z, radius: r.splash, family: 'rocket' });
  }

  private kill(r: Rocket): void {
    r.active = false;
    r.mesh.visible = false;
    r.trail.visible = false;
    r.glow.intensity = 0;
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const r of this.rockets) this.kill(r);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}

function emptyStats(color: number): WeaponStats & { flags: Set<string> } {
  return {
    damage: 38,
    fireRate: 1.4,
    projectileSpeed: 42,
    range: 90,
    splashRadius: 2.2,
    splashFalloff: 0.45,
    armorPierce: 0.1,
    critChance: 0.04,
    critMult: 1.75,
    heatPerShot: 0.14,
    heatCapacity: 1,
    heatCoolRate: 0.28,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 3,
    flags: new Set(),
  };
}
