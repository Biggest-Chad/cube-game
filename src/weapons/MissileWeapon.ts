/**
 * Guided Missiles — lateral side-rack launch, then delayed homing.
 * Missiles eject from left/right of the hardpoint, coast, then lock on.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import {
  GUIDED_MISSILE_ARMED_SPEED_MULTIPLIER,
  GUIDED_MISSILE_ARMED_TURN_GAIN,
  GUIDED_MISSILE_ARM_DELAY_PER_RANK_SECONDS,
  GUIDED_MISSILE_ARM_DELAY_SECONDS,
  GUIDED_MISSILE_ARM_DELAY_SPREAD_SECONDS,
  GUIDED_MISSILE_BASE_ARMOR_PIERCE,
  GUIDED_MISSILE_BASE_CRIT_CHANCE,
  GUIDED_MISSILE_BASE_CRIT_MULT,
  GUIDED_MISSILE_BASE_DAMAGE,
  GUIDED_MISSILE_BASE_FIRE_RATE,
  GUIDED_MISSILE_BASE_PROJECTILE_SPEED,
  GUIDED_MISSILE_BASE_RANGE,
  GUIDED_MISSILE_BASE_SPLASH_FALLOFF,
  GUIDED_MISSILE_BASE_SPLASH_RADIUS,
  GUIDED_MISSILE_BLOCK_HALF_EXTENT,
  GUIDED_MISSILE_BURST_SIZE,
  GUIDED_MISSILE_COASTING_SPEED_MULTIPLIER,
  GUIDED_MISSILE_COASTING_TURN_GAIN,
  GUIDED_MISSILE_EXPLOSION_POOL_SIZE,
  GUIDED_MISSILE_HEAT_COOL_RATE,
  GUIDED_MISSILE_HEAT_PER_SHOT,
  GUIDED_MISSILE_HOMING_STRENGTH,
  GUIDED_MISSILE_HUNTER_PRIORITY_DAMAGE_MULTIPLIER,
  GUIDED_MISSILE_LIFETIME_SECONDS,
  GUIDED_MISSILE_MAX_RANGE_FROM_ORIGIN,
  GUIDED_MISSILE_NUCLEUS_PROXIMITY_PADDING,
  GUIDED_MISSILE_POOL_SIZE,
  GUIDED_MISSILE_RAYCAST_LEAD,
  GUIDED_MISSILE_SPLASH_DAMAGE_FRACTION,
  GUIDED_MISSILE_TRAIL_SEGMENTS,
  WEAPON_MINIMUM_FIRE_RATE,
} from '../data/constraints';
import { NUCLEUS_HIT_ID, type CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';
import { addMat, makeMissileBody, makeTrail, orientZForward } from '../vfx/ProjectileVfx';

interface Missile {
  active: boolean;
  mesh: THREE.Object3D;
  exhaust: THREE.Mesh;
  exhaustGlow: THREE.Mesh;
  trail: THREE.Line;
  trailSet: (i: number, p: THREE.Vector3) => void;
  trailHist: THREE.Vector3[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Seconds remaining before homing engages (lateral coast). */
  arm: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
  targetId: number;
  side: number;
}

interface Explosion {
  active: boolean;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  flash: THREE.Mesh;
  life: number;
  maxLife: number;
  scale: number;
}

const POOL = GUIDED_MISSILE_POOL_SIZE;
const TRAIL_SEGS = GUIDED_MISSILE_TRAIL_SEGMENTS;
const EXPLOSION_POOL = GUIDED_MISSILE_EXPLOSION_POOL_SIZE;
/** Lateral coast before seekers arm */
const ARM_BASE = GUIDED_MISSILE_ARM_DELAY_SECONDS;
const ARM_SPREAD = GUIDED_MISSILE_ARM_DELAY_SPREAD_SECONDS;

export class MissileWeapon implements WeaponBehavior {
  readonly family = 'missile';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private missiles: Missile[] = [];
  private explosions: Explosion[] = [];
  private next = 0;
  private nextBoom = 0;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly fwd = new THREE.Vector3();
  private readonly launchDir = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: GUIDED_MISSILE_BASE_DAMAGE,
      fireRate: GUIDED_MISSILE_BASE_FIRE_RATE,
      projectileSpeed: GUIDED_MISSILE_BASE_PROJECTILE_SPEED,
      range: GUIDED_MISSILE_BASE_RANGE,
      splashRadius: GUIDED_MISSILE_BASE_SPLASH_RADIUS,
      splashFalloff: GUIDED_MISSILE_BASE_SPLASH_FALLOFF,
      armorPierce: GUIDED_MISSILE_BASE_ARMOR_PIERCE,
      critChance: GUIDED_MISSILE_BASE_CRIT_CHANCE,
      critMult: GUIDED_MISSILE_BASE_CRIT_MULT,
      heatPerShot: GUIDED_MISSILE_HEAT_PER_SHOT,
      heatCapacity: 1,
      heatCoolRate: GUIDED_MISSILE_HEAT_COOL_RATE,
      chargeTime: 0,
      projectileCount: 1,
      homing: GUIDED_MISSILE_HOMING_STRENGTH,
      burstSize: GUIDED_MISSILE_BURST_SIZE,
      flags: new Set(),
    };

    for (let i = 0; i < POOL; i++) {
      const mesh = makeMissileBody(0xcc66ff, 0.62, 0.09);
      mesh.visible = false;
      this.group.add(mesh);

      // Bright exhaust plume (cone) + hot core sphere — highly visible trail head
      const exhaust = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.55, 10, 1, true),
        addMat(0xffaa44, 0.95)
      );
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.z = 0.42;
      exhaust.visible = false;
      this.group.add(exhaust);

      const exhaustGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 10),
        addMat(0xffffff, 0.9)
      );
      exhaustGlow.position.z = 0.38;
      exhaustGlow.visible = false;
      this.group.add(exhaustGlow);

      const tr = makeTrail(0xff88ee, TRAIL_SEGS, 0.92);
      // Thicker visual via second soft trail layer
      (tr.line.material as THREE.LineBasicMaterial).linewidth = 2;
      this.group.add(tr.line);

      this.missiles.push({
        active: false,
        mesh,
        exhaust,
        exhaustGlow,
        trail: tr.line,
        trailSet: tr.set,
        trailHist: Array.from({ length: TRAIL_SEGS }, () => new THREE.Vector3()),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        arm: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
        targetId: -1,
        side: 1,
      });
    }

    for (let i = 0; i < EXPLOSION_POOL; i++) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 16, 16),
        addMat(0xffffff, 0)
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.55, 28),
        new THREE.MeshBasicMaterial({
          color: 0xff66ee,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 12),
        addMat(0xaa44ff, 0)
      );
      core.visible = false;
      ring.visible = false;
      flash.visible = false;
      this.group.add(core, ring, flash);
      this.explosions.push({
        active: false,
        core,
        ring,
        flash,
        life: 0,
        maxLife: 0.45,
        scale: 1,
      });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    this.sim(ctx.dt, ctx.cube, ctx.now);
    this.simExplosions(ctx.dt);
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    this.cooldown = 1 / Math.max(WEAPON_MINIMUM_FIRE_RATE, this.stats.fireRate);
    const rolled = rollOutgoing({
      raw: this.stats.damage,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    const count = Math.max(1, this.stats.projectileCount);
    this.buildBasis(ctx.direction);
    // Alternate racks across volleys so single-missile loadouts still fan left/right
    const volleyFlip = this.next % 2 === 0 ? 1 : -1;

    for (let i = 0; i < count; i++) {
      const side = (i % 2 === 0 ? 1 : -1) * volleyFlip;
      const rank = Math.floor(i / 2);
      const target = this.pickTarget(ctx.cube, ctx.origin);
      this.spawnLateral(ctx.origin, side, rank, rolled.damage, rolled.crit, target, count);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private buildBasis(direction: THREE.Vector3): void {
    this.fwd.copy(direction);
    if (this.fwd.lengthSq() < 1e-8) this.fwd.set(0, 0, -1);
    else this.fwd.normalize();

    this.right.crossVectors(this.fwd, this.up);
    if (this.right.lengthSq() < 1e-6) {
      this.right.set(1, 0, 0);
    } else {
      this.right.normalize();
    }
    // Re-orthogonalize up against fwd/right for slight bank
    this.tmp.crossVectors(this.right, this.fwd).normalize();
  }

  private pickTarget(cube: CubeManager, from: THREE.Vector3): number {
    if (cube.nucleus.isActive) {
      if (cube.nucleus.isExposed || this.stats.flags.has('hunter_core')) {
        return NUCLEUS_HIT_ID;
      }
    }
    const prefer = (t: BlockType): number => {
      if (t === BlockType.Core) return this.stats.flags.has('hunter_core') ? 40 : 28;
      if (t === BlockType.DataNode) return 18;
      if (t === BlockType.Reinforced) return 6;
      return 3;
    };
    const n = cube.findNearest(from, this.stats.range, prefer);
    return n?.instanceId ?? -1;
  }

  /**
   * Eject from a side rack: spawn offset to the left/right of the hardpoint,
   * initial velocity mostly lateral + slight forward/up, then arm homing after delay.
   */
  private spawnLateral(
    from: THREE.Vector3,
    side: number,
    rank: number,
    damage: number,
    crit: boolean,
    targetId: number,
    salvoSize: number
  ): void {
    const m = this.missiles[this.next % POOL];
    this.next++;
    m.active = true;
    m.side = side;

    const sideDist = 0.52 + rank * 0.18 + (salvoSize > 2 ? 0.06 : 0);
    // Origin offset: out the side pylon, slight belly drop, tiny forward
    m.pos
      .copy(from)
      .addScaledVector(this.right, side * sideDist)
      .addScaledVector(this.up, -0.06 + rank * 0.02)
      .addScaledVector(this.fwd, 0.15);

    // Launch velocity: strong lateral kick, mild forward, slight climb so paths fan out
    const speed = this.stats.projectileSpeed;
    const lateralKick = speed * (0.95 + rank * 0.08);
    const forwardKick = speed * 0.22;
    const climb = speed * (0.12 + rank * 0.04);
    m.vel
      .set(0, 0, 0)
      .addScaledVector(this.right, side * lateralKick)
      .addScaledVector(this.fwd, forwardKick)
      .addScaledVector(this.up, climb);

    m.life = GUIDED_MISSILE_LIFETIME_SECONDS;
    m.arm = ARM_BASE + rank * GUIDED_MISSILE_ARM_DELAY_PER_RANK_SECONDS + Math.random() * ARM_SPREAD;
    m.damage = damage;
    m.splash = this.stats.splashRadius;
    m.crit = crit;
    m.armorPierce = this.stats.armorPierce;
    m.targetId = targetId;

    m.mesh.visible = true;
    m.exhaust.visible = true;
    m.exhaustGlow.visible = true;
    m.trail.visible = true;
    m.mesh.position.copy(m.pos);
    this.launchDir.copy(m.vel).normalize();
    orientZForward(m.mesh, this.launchDir);
    // Parent exhaust to mesh orientation via world copy each frame
    m.exhaust.position.copy(m.pos).addScaledVector(this.launchDir, -0.38);
    orientZForward(m.exhaust, this.launchDir);
    m.exhaustGlow.position.copy(m.pos).addScaledVector(this.launchDir, -0.32);

    for (const h of m.trailHist) h.copy(m.pos);
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    const turnArmed = this.stats.homing * GUIDED_MISSILE_ARMED_TURN_GAIN;
    const turnCoasting = this.stats.homing * GUIDED_MISSILE_COASTING_TURN_GAIN;

    for (const m of this.missiles) {
      if (!m.active) continue;
      m.life -= dt;
      m.arm -= dt;

      // Retarget if lost (NUCLEUS_HIT_ID is -2 — use hasInstance, not id < 0)
      if (!cube.hasInstance(m.targetId)) {
        m.targetId = this.pickTarget(cube, m.pos);
      }

      const armed = m.arm <= 0;
      if (cube.hasInstance(m.targetId)) {
        // Always home to the isotropic nucleus center for core / nucleus ids
        if (
          m.targetId === NUCLEUS_HIT_ID ||
          (cube.nucleus.isActive && cube.getBlockType(m.targetId) === BlockType.Core)
        ) {
          cube.nucleus.getWorldCenter(this.desired);
        } else {
          cube.getBlockWorldPos(m.targetId, this.desired);
        }
        this.desired.sub(m.pos).normalize();
        const turn = armed ? turnArmed : turnCoasting;
        // While coasting, bias gently toward target without killing lateral path
        m.vel.normalize().lerp(this.desired, Math.min(1, turn * dt)).normalize();
        const speedMul = armed
          ? GUIDED_MISSILE_ARMED_SPEED_MULTIPLIER
          : GUIDED_MISSILE_COASTING_SPEED_MULTIPLIER;
        m.vel.multiplyScalar(this.stats.projectileSpeed * speedMul);
      }

      const prev = this.tmp.copy(m.pos);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      orientZForward(m.mesh, m.vel);

      // Exhaust flame behind the missile + pulse
      const dirLen = m.vel.length();
      if (dirLen > 1e-5) {
        this.launchDir.copy(m.vel).multiplyScalar(1 / dirLen);
        m.exhaust.position.copy(m.pos).addScaledVector(this.launchDir, -0.4);
        orientZForward(m.exhaust, this.launchDir);
        m.exhaustGlow.position.copy(m.pos).addScaledVector(this.launchDir, -0.34);
        const pulse = 0.75 + Math.sin(now * 28 + m.life * 12) * 0.25;
        m.exhaust.scale.set(pulse * 1.1, pulse * 1.1, 0.9 + pulse * 0.5);
        m.exhaustGlow.scale.setScalar(0.7 + pulse * 0.6);
        (m.exhaust.material as THREE.MeshBasicMaterial).opacity = armed ? 0.95 : 0.7;
      }

      // Long ribbon trail
      for (let i = m.trailHist.length - 1; i > 0; i--) m.trailHist[i].copy(m.trailHist[i - 1]);
      m.trailHist[0].copy(m.pos);
      for (let i = 0; i < m.trailHist.length; i++) m.trailSet(i, m.trailHist[i]);
      (m.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      m.trail.geometry.computeBoundingSphere();

      if (
        cube.nucleus.isActive &&
        cube.nucleus.containsPoint(m.pos, GUIDED_MISSILE_NUCLEUS_PROXIMITY_PADDING)
      ) {
        this.impact(m, cube, NUCLEUS_HIT_ID, m.pos.clone(), now);
        continue;
      }

      const move = this.move.copy(m.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(
          prev,
          move.normalize(),
          dist + GUIDED_MISSILE_RAYCAST_LEAD,
          -1,
          GUIDED_MISSILE_BLOCK_HALF_EXTENT
        );
        if (hit) {
          this.impact(m, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (m.life <= 0 || m.pos.length() > GUIDED_MISSILE_MAX_RANGE_FROM_ORIGIN) {
        this.spawnExplosion(m.pos, 0.7, false);
        this.kill(m);
      }
    }
  }

  private impact(
    m: Missile,
    cube: CubeManager,
    instanceId: number,
    point: THREE.Vector3,
    now: number
  ): void {
    const type = cube.getBlockType(instanceId);
    let raw = m.damage;
    if (
      (type === BlockType.Core || type === BlockType.DataNode) &&
      (this.stats.flags.has('hunter_lock') || this.stats.flags.has('hunter_core'))
    ) {
      raw *= GUIDED_MISSILE_HUNTER_PRIORITY_DAMAGE_MULTIPLIER;
    }
    const applied = applyToBlock(
      { raw, armorPierce: m.armorPierce, forceCrit: m.crit, critChance: 0, critMult: 1 },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    this.spawnExplosion(point, m.crit ? 1.45 : 1.1, m.crit);
    this.kill(m);
    if (result) {
      result.x = point.x;
      result.y = point.y;
      result.z = point.z;
      bus.emit('beam-hit', {
        ...result,
        crit: m.crit,
        style: 'bolt' as const,
        impactNx: point.x,
        impactNy: point.y,
        impactNz: point.z,
      });
    }
    if (m.splash > 0) {
      for (const h of cube.applySplash(point, m.splash, m.damage * GUIDED_MISSILE_SPLASH_DAMAGE_FRACTION, now, instanceId)) {
        bus.emit('beam-hit', { ...h, style: 'splash' as const });
      }
    }
    bus.emit('explosion', {
      x: point.x,
      y: point.y,
      z: point.z,
      radius: m.splash,
      family: 'missile',
    });
  }

  private spawnExplosion(at: THREE.Vector3, scale: number, crit: boolean): void {
    const e = this.explosions[this.nextBoom % EXPLOSION_POOL];
    this.nextBoom++;
    e.active = true;
    e.life = crit ? 0.55 : 0.42;
    e.maxLife = e.life;
    e.scale = scale;
    e.core.position.copy(at);
    e.ring.position.copy(at);
    e.flash.position.copy(at);
    e.core.scale.setScalar(0.2);
    e.ring.scale.setScalar(0.15);
    e.flash.scale.setScalar(0.3);
    e.core.visible = true;
    e.ring.visible = true;
    e.flash.visible = true;
    (e.core.material as THREE.MeshBasicMaterial).opacity = 1;
    (e.core.material as THREE.MeshBasicMaterial).color.setHex(crit ? 0xffffff : 0xffe0ff);
    (e.ring.material as THREE.MeshBasicMaterial).opacity = 0.95;
    (e.ring.material as THREE.MeshBasicMaterial).color.setHex(crit ? 0xffaa00 : 0xff44dd);
    (e.flash.material as THREE.MeshBasicMaterial).opacity = 0.85;
    (e.flash.material as THREE.MeshBasicMaterial).color.setHex(0xaa44ff);
    // Face ring roughly toward camera-ish (horizontal billboard-ish)
    e.ring.lookAt(at.x + 1, at.y + 2, at.z + 1);
  }

  private simExplosions(dt: number): void {
    for (const e of this.explosions) {
      if (!e.active) continue;
      e.life -= dt;
      const t = 1 - Math.max(0, e.life) / e.maxLife;
      const ease = 1 - (1 - t) * (1 - t);
      const s = e.scale * (0.35 + ease * 2.4);
      e.core.scale.setScalar(s * 0.55);
      e.flash.scale.setScalar(s * 1.15);
      e.ring.scale.setScalar(s * 1.6);
      const fade = Math.max(0, 1 - t);
      (e.core.material as THREE.MeshBasicMaterial).opacity = fade * (t < 0.25 ? 1 : 0.7);
      (e.flash.material as THREE.MeshBasicMaterial).opacity = fade * 0.65;
      (e.ring.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
      if (e.life <= 0) {
        e.active = false;
        e.core.visible = false;
        e.ring.visible = false;
        e.flash.visible = false;
      }
    }
  }

  private kill(m: Missile): void {
    m.active = false;
    m.mesh.visible = false;
    m.exhaust.visible = false;
    m.exhaustGlow.visible = false;
    m.trail.visible = false;
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const m of this.missiles) this.kill(m);
    for (const e of this.explosions) {
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
        if (Array.isArray(o.material)) o.material.forEach((x) => x.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}
