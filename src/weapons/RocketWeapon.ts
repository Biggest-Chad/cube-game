/**
 * Rocket Pod — wing-release dumb-fire splash.
 * Rockets drop from under the wing, free-fall briefly, then ignite and punch forward.
 */
import * as THREE from 'three';
import {
  ROCKET_POD_BASE_ARMOR_PIERCE,
  ROCKET_POD_BASE_CRIT_CHANCE,
  ROCKET_POD_BASE_CRIT_MULT,
  ROCKET_POD_BASE_DAMAGE,
  ROCKET_POD_BASE_FIRE_RATE,
  ROCKET_POD_BASE_PROJECTILE_SPEED,
  ROCKET_POD_BASE_RANGE,
  ROCKET_POD_BASE_SPLASH_FALLOFF,
  ROCKET_POD_BASE_SPLASH_RADIUS,
  ROCKET_POD_BURST_SIZE,
  ROCKET_POD_HEAT_COOL_RATE,
  ROCKET_POD_HEAT_PER_SHOT,
} from '../data/constraints';
import type { WeaponStats } from '../data/weapons';
import { NUCLEUS_HIT_ID, type CubeManager } from '../cube/CubeManager';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';
import { addMat, makeTrail, orientZForward } from '../vfx/ProjectileVfx';

type RocketPhase = 'drop' | 'boost' | 'cruise';

interface Rocket {
  active: boolean;
  mesh: THREE.Group;
  exhaust: THREE.Mesh;
  exhaustGlow: THREE.Mesh;
  trail: THREE.Line;
  trailSet: (i: number, p: THREE.Vector3) => void;
  trailHist: THREE.Vector3[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  aim: THREE.Vector3;
  life: number;
  phase: RocketPhase;
  /** Time remaining in current phase (drop → boost) */
  phaseT: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
  wing: number;
}

interface Boom {
  active: boolean;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  flash: THREE.Mesh;
  life: number;
  maxLife: number;
  scale: number;
}

const POOL = 20;
const TRAIL_SEGS = 16;
const BOOM_POOL = 10;
/** Free-fall hang time before motor ignition */
const DROP_TIME = 0.16;
/** Hard acceleration after ignition */
const BOOST_TIME = 0.28;

export class RocketWeapon implements WeaponBehavior {
  readonly family = 'rocket';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private rockets: Rocket[] = [];
  private booms: Boom[] = [];
  private next = 0;
  private nextBoom = 0;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly fwd = new THREE.Vector3();
  private readonly dropDir = new THREE.Vector3();

  constructor() {
    // Defaults track constraints (54 / 1.45 after 2026-09-05 nerf from 58 / 3.1).
    this.stats = {
      damage: ROCKET_POD_BASE_DAMAGE,
      fireRate: ROCKET_POD_BASE_FIRE_RATE,
      projectileSpeed: ROCKET_POD_BASE_PROJECTILE_SPEED,
      range: ROCKET_POD_BASE_RANGE,
      splashRadius: ROCKET_POD_BASE_SPLASH_RADIUS,
      splashFalloff: ROCKET_POD_BASE_SPLASH_FALLOFF,
      armorPierce: ROCKET_POD_BASE_ARMOR_PIERCE,
      critChance: ROCKET_POD_BASE_CRIT_CHANCE,
      critMult: ROCKET_POD_BASE_CRIT_MULT,
      heatPerShot: ROCKET_POD_HEAT_PER_SHOT,
      heatCapacity: 1,
      heatCoolRate: ROCKET_POD_HEAT_COOL_RATE,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0,
      burstSize: ROCKET_POD_BURST_SIZE,
      flags: new Set(),
    };

    for (let i = 0; i < POOL; i++) {
      const mesh = makeRocketMesh(0xff6622);
      mesh.visible = false;
      this.group.add(mesh);

      const exhaust = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.55, 10, 1, true),
        addMat(0xffaa44, 0)
      );
      exhaust.rotation.x = Math.PI / 2;
      exhaust.visible = false;
      this.group.add(exhaust);

      const exhaustGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        addMat(0xffffff, 0)
      );
      exhaustGlow.visible = false;
      this.group.add(exhaustGlow);

      const tr = makeTrail(0xff8844, TRAIL_SEGS, 0.9);
      this.group.add(tr.line);

      this.rockets.push({
        active: false,
        mesh,
        exhaust,
        exhaustGlow,
        trail: tr.line,
        trailSet: tr.set,
        trailHist: Array.from({ length: TRAIL_SEGS }, () => new THREE.Vector3()),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        aim: new THREE.Vector3(),
        life: 0,
        phase: 'drop',
        phaseT: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
        wing: 1,
      });
    }

    for (let i = 0; i < BOOM_POOL; i++) {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 14), addMat(0xffcc66, 0));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.7, 28),
        new THREE.MeshBasicMaterial({
          color: 0xff6622,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), addMat(0xff4400, 0));
      core.visible = false;
      ring.visible = false;
      flash.visible = false;
      this.group.add(core, ring, flash);
      this.booms.push({
        active: false,
        core,
        ring,
        flash,
        life: 0,
        maxLife: 0.5,
        scale: 1,
      });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    this.sim(ctx.dt, ctx.cube, ctx.now);
    this.simBooms(ctx.dt);
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    this.cooldown = 1 / Math.max(0.15, this.stats.fireRate);
    const count = Math.max(1, this.stats.projectileCount);
    const rolled = rollOutgoing({
      raw: this.stats.damage,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    this.buildBasis(ctx.direction);
    // Alternate wings across volley / shots
    const wingFlip = this.next % 2 === 0 ? 1 : -1;

    for (let i = 0; i < count; i++) {
      const wing = (i % 2 === 0 ? 1 : -1) * wingFlip;
      const rank = Math.floor(i / 2);
      this.spawn(ctx.origin, ctx.direction, wing, rank, rolled.damage, rolled.crit);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private buildBasis(direction: THREE.Vector3): void {
    this.fwd.copy(direction);
    if (this.fwd.lengthSq() < 1e-8) this.fwd.set(0, 0, -1);
    else this.fwd.normalize();
    this.right.crossVectors(this.fwd, this.up);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    else this.right.normalize();
  }

  /**
   * Release from wing pylon: offset laterally, drop with belly-down velocity,
   * aim stored for post-ignition boost.
   */
  private spawn(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    wing: number,
    rank: number,
    damage: number,
    crit: boolean
  ): void {
    const r = this.rockets[this.next % POOL];
    this.next++;
    r.active = true;
    r.phase = 'drop';
    r.phaseT = DROP_TIME + rank * 0.03 + Math.random() * 0.04;
    r.wing = wing;
    r.aim.copy(dir);
    if (r.aim.lengthSq() < 1e-8) r.aim.set(0, 0, -1);
    else r.aim.normalize();

    // Under-wing release point (pylon origin + wing offset + slight belly)
    const wingOut = 0.35 + rank * 0.12;
    r.pos
      .copy(from)
      .addScaledVector(this.right, wing * wingOut)
      .addScaledVector(this.up, -0.18 - rank * 0.04)
      .addScaledVector(this.fwd, -0.05);

    // Drop: mostly down + slight outward + tiny forward (cold release)
    r.vel
      .set(0, 0, 0)
      .addScaledVector(this.up, -4.5 - rank * 0.6)
      .addScaledVector(this.right, wing * (1.8 + rank * 0.4))
      .addScaledVector(this.fwd, 1.2);

    r.life = 3.2;
    r.damage = damage;
    r.splash = this.stats.splashRadius;
    r.crit = crit;
    r.armorPierce = this.stats.armorPierce;

    r.mesh.visible = true;
    r.exhaust.visible = false;
    r.exhaustGlow.visible = false;
    r.trail.visible = false;
    r.mesh.position.copy(r.pos);
    // Nose points slightly down while dropping
    this.dropDir.copy(r.vel).normalize();
    orientZForward(r.mesh, this.dropDir);
    for (const h of r.trailHist) h.copy(r.pos);
    // Scale pop on release
    r.mesh.scale.setScalar(0.85);
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    const cruiseSpeed = this.stats.projectileSpeed;
    for (const r of this.rockets) {
      if (!r.active) continue;
      r.life -= dt;
      r.phaseT -= dt;

      if (r.phase === 'drop') {
        // Gravity-ish acceleration while cold
        r.vel.y -= 14 * dt;
        r.vel.multiplyScalar(1 - 0.4 * dt);
        if (r.phaseT <= 0) {
          r.phase = 'boost';
          r.phaseT = BOOST_TIME;
          // Snap velocity toward aim, keep a bit of drop residual
          r.vel.copy(r.aim).multiplyScalar(cruiseSpeed * 0.35);
          r.vel.y -= 1.5;
          r.exhaust.visible = true;
          r.exhaustGlow.visible = true;
          r.trail.visible = true;
          r.mesh.scale.setScalar(1.05);
          bus.emit('weapon-fire', { family: 'rocket_ignite', slot: -1 });
        }
      } else if (r.phase === 'boost') {
        // Hard punch forward
        const target = this.tmp.copy(r.aim).multiplyScalar(cruiseSpeed * 1.35);
        r.vel.lerp(target, 1 - Math.exp(-9 * dt));
        if (r.phaseT <= 0) {
          r.phase = 'cruise';
          r.vel.copy(r.aim).multiplyScalar(cruiseSpeed);
          r.mesh.scale.setScalar(1);
        }
      } else {
        // Cruise — slight settle to aim + light gravity sag
        r.vel.lerp(this.tmp.copy(r.aim).multiplyScalar(cruiseSpeed), 1 - Math.exp(-2 * dt));
        r.vel.y -= 1.8 * dt;
      }

      const prev = this.tmp.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      if (r.vel.lengthSq() > 1e-6) orientZForward(r.mesh, r.vel);

      const lit = r.phase !== 'drop';
      if (lit) {
        const d = r.vel.clone().normalize();
        r.exhaust.position.copy(r.pos).addScaledVector(d, -0.42);
        orientZForward(r.exhaust, d);
        r.exhaustGlow.position.copy(r.pos).addScaledVector(d, -0.36);
        const pulse = 0.7 + Math.sin(now * 32 + r.life * 14) * 0.3;
        const boost = r.phase === 'boost' ? 1.45 : 1;
        r.exhaust.scale.set(pulse * boost, pulse * boost, (0.9 + pulse * 0.6) * boost);
        r.exhaustGlow.scale.setScalar((0.65 + pulse * 0.55) * boost);
        (r.exhaust.material as THREE.MeshBasicMaterial).opacity =
          r.phase === 'boost' ? 0.95 : 0.75;
        (r.exhaustGlow.material as THREE.MeshBasicMaterial).opacity =
          r.phase === 'boost' ? 0.9 : 0.55;

        for (let i = r.trailHist.length - 1; i > 0; i--) r.trailHist[i].copy(r.trailHist[i - 1]);
        r.trailHist[0].copy(r.pos);
        for (let i = 0; i < r.trailHist.length; i++) r.trailSet(i, r.trailHist[i]);
        (r.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        r.trail.geometry.computeBoundingSphere();
      }

      // Settle scale after release pop
      if (r.mesh.scale.x > 1.001) {
        const s = THREE.MathUtils.lerp(r.mesh.scale.x, 1, 1 - Math.exp(-8 * dt));
        r.mesh.scale.setScalar(s);
      }

      if (
        r.phase !== 'drop' &&
        cube.nucleus.isActive &&
        cube.nucleus.containsPoint(r.pos)
      ) {
        this.detonate(r, cube, NUCLEUS_HIT_ID, r.pos.clone(), now);
        continue;
      }

      const move = this.move.copy(r.pos).sub(prev);
      const dist = move.length();
      // Only collide after drop (don't hit ship/cube during release)
      if (r.phase !== 'drop' && dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.75, -1, 0.7);
        if (hit) {
          this.detonate(r, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (r.life <= 0 || r.pos.length() > 200) {
        this.spawnBoom(r.pos, 0.7, false);
        this.kill(r);
      }
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
    this.spawnBoom(point, r.crit ? 1.55 : 1.2, r.crit);
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
      const splashDmg = r.damage * 0.5;
      const hits = cube.applySplash(point, r.splash, splashDmg, now, instanceId, { glow: true });
      for (const h of hits) bus.emit('beam-hit', { ...h, style: 'splash' as const });
    }
    bus.emit('explosion', {
      x: point.x,
      y: point.y,
      z: point.z,
      radius: r.splash,
      family: 'rocket',
    });
  }

  private spawnBoom(at: THREE.Vector3, scale: number, crit: boolean): void {
    const e = this.booms[this.nextBoom % BOOM_POOL];
    this.nextBoom++;
    e.active = true;
    e.life = crit ? 0.55 : 0.42;
    e.maxLife = e.life;
    e.scale = scale;
    e.core.position.copy(at);
    e.ring.position.copy(at);
    e.flash.position.copy(at);
    e.core.scale.setScalar(0.25);
    e.ring.scale.setScalar(0.2);
    e.flash.scale.setScalar(0.35);
    e.core.visible = true;
    e.ring.visible = true;
    e.flash.visible = true;
    (e.core.material as THREE.MeshBasicMaterial).opacity = 1;
    (e.core.material as THREE.MeshBasicMaterial).color.setHex(crit ? 0xffffff : 0xffee88);
    (e.ring.material as THREE.MeshBasicMaterial).opacity = 0.95;
    (e.ring.material as THREE.MeshBasicMaterial).color.setHex(crit ? 0xffaa00 : 0xff6622);
    (e.flash.material as THREE.MeshBasicMaterial).opacity = 0.85;
    e.ring.lookAt(at.x + 1, at.y + 2, at.z + 0.5);
  }

  private simBooms(dt: number): void {
    for (const e of this.booms) {
      if (!e.active) continue;
      e.life -= dt;
      const t = 1 - Math.max(0, e.life) / e.maxLife;
      const ease = 1 - (1 - t) * (1 - t);
      const s = e.scale * (0.4 + ease * 2.6);
      e.core.scale.setScalar(s * 0.5);
      e.flash.scale.setScalar(s * 1.2);
      e.ring.scale.setScalar(s * 1.7);
      const fade = Math.max(0, 1 - t);
      (e.core.material as THREE.MeshBasicMaterial).opacity = fade * (t < 0.2 ? 1 : 0.65);
      (e.flash.material as THREE.MeshBasicMaterial).opacity = fade * 0.7;
      (e.ring.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
      if (e.life <= 0) {
        e.active = false;
        e.core.visible = false;
        e.ring.visible = false;
        e.flash.visible = false;
      }
    }
  }

  private kill(r: Rocket): void {
    r.active = false;
    r.mesh.visible = false;
    r.exhaust.visible = false;
    r.exhaustGlow.visible = false;
    r.trail.visible = false;
    r.mesh.scale.setScalar(1);
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const r of this.rockets) this.kill(r);
    for (const e of this.booms) {
      e.active = false;
      e.core.visible = false;
      e.ring.visible = false;
      e.flash.visible = false;
    }
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

/** Fat orange rocket body — larger silhouette than guided missiles. */
function makeRocketMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const length = 0.85;
  const radius = 0.12;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 12),
    addMat(color, 0.98)
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const sheath = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius * 1.2, length * 0.85, 4, 10),
    addMat(0xff8844, 0.28)
  );
  sheath.rotation.x = Math.PI / 2;
  g.add(sheath);

  const core = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius * 0.35, length * 0.7, 3, 6),
    addMat(0xffe0a0, 0.9)
  );
  core.rotation.x = Math.PI / 2;
  g.add(core);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 1.05, radius * 2.8, 10),
    addMat(0xffcc88, 0.95)
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -length * 0.55 - radius * 0.75;
  g.add(nose);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, radius * 2.1, radius * 1.5),
      addMat(color, 0.85)
    );
    fin.position.set(Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05, length * 0.32);
    g.add(fin);
  }

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.85, radius * 0.9, 10),
    addMat(0x331100, 0.8)
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = length * 0.48;
  g.add(nozzle);

  return g;
}
