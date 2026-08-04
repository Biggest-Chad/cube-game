/**
 * Continuous arc beam — sustained hitscan with optional bounce / refract chains.
 * Used by the starter hardpoint weapon (Arc Beam).
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { WeaponStats } from '../data/weapons';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface BeamSeg {
  line: THREE.Line;
  glow: THREE.Line;
  life: number;
}

const MAX_SEGS = 24;
const MAX_BOUNCES = 6;

export class ContinuousBeamWeapon implements WeaponBehavior {
  readonly family = 'beam';
  readonly group = new THREE.Group();
  private heat = 0;
  private damageAccum = 0;
  private stats: WeaponStats & { flags: Set<string> };
  private segs: BeamSeg[] = [];
  private activeSegs = 0;
  private pulse = 0;
  private readonly _origin = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _reflect = new THREE.Vector3();
  private readonly _refract = new THREE.Vector3();
  private readonly _axis = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: 22,
      fireRate: 8,
      projectileSpeed: 0,
      range: 90,
      splashRadius: 0,
      splashFalloff: 0.5,
      armorPierce: 0.08,
      critChance: 0.06,
      critMult: 1.9,
      heatPerShot: 0.12,
      heatCapacity: 1,
      heatCoolRate: 0.4,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0,
      burstSize: 0,
      bounceCount: 0,
      penetration: 0,
      spread: 0,
      flags: new Set(),
    };

    for (let i = 0; i < MAX_SEGS; i++) {
      const coreGeo = new THREE.BufferGeometry();
      coreGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        coreGeo,
        new THREE.LineBasicMaterial({
          color: COLORS.magenta,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const glow = new THREE.Line(
        glowGeo,
        new THREE.LineBasicMaterial({
          color: 0xaa44ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      line.visible = false;
      glow.visible = false;
      this.group.add(glow, line);
      this.segs.push({ line, glow, life: 0 });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    const dt = ctx.dt;
    this.pulse += dt * 14;
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * dt);

    // Fade unused segments
    for (const s of this.segs) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const t = Math.max(0, s.life / 0.08);
      (s.line.material as THREE.LineBasicMaterial).opacity = t * 0.95;
      (s.glow.material as THREE.LineBasicMaterial).opacity = t * 0.35;
      if (s.life <= 0) {
        s.line.visible = false;
        s.glow.visible = false;
      }
    }

    if (!ctx.firing) {
      this.damageAccum = 0;
      return;
    }

    // Heat builds while holding fire
    this.heat = Math.min(1, this.heat + this.stats.heatPerShot * dt * 2.2);
    const heatMul = 1 - this.heat * 0.45;

    const isMain = ctx.slot < 0;
    const dps =
      this.stats.damage *
      this.stats.fireRate *
      (isMain ? ctx.playerStats.damageMul : 1) *
      heatMul;
    const critChance =
      this.stats.critChance + (isMain ? ctx.playerStats.critChance : 0);
    const spreadBase =
      (this.stats.spread ?? 0) + (isMain ? ctx.playerStats.spreadAdd ?? 0 : 0);
    const penBase =
      Math.floor(this.stats.penetration ?? 0) +
      (isMain ? Math.floor(ctx.playerStats.penetrationAdd ?? 0) : 0);
    const bounceBase = this.resolveBounceCount();
    const canRefract =
      this.stats.flags.has('refract') || this.stats.flags.has('refract_max');
    const beams = Math.max(
      1,
      this.stats.projectileCount + (isMain ? Math.floor(ctx.playerStats.multiShotAdd) : 0)
    );

    this.activeSegs = 0;
    this.damageAccum += dps * dt;

    // Tick damage roughly every ~1/fireRate but continuous feel
    const tickThreshold = Math.max(0.04, 1 / Math.max(1, this.stats.fireRate * 1.5));
    const ticks = Math.floor(this.damageAccum / (dps * tickThreshold || 1));
    // Always draw beams; apply damage when accum crosses tick
    const applyDamage = this.damageAccum >= dps * tickThreshold * 0.5;
    if (applyDamage) {
      this.damageAccum = Math.max(0, this.damageAccum - dps * tickThreshold);
    }

    const dmgPerTick = dps * tickThreshold;

    for (let b = 0; b < beams; b++) {
      const spread =
        (b - (beams - 1) / 2) * 0.03 +
        (spreadBase > 0 ? (Math.random() - 0.5) * spreadBase * 0.12 : 0);
      this._axis
        .copy(ctx.direction)
        .cross(Math.abs(ctx.direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0))
        .normalize();
      if (this._axis.lengthSq() < 1e-6) this._axis.set(1, 0, 0);
      this._dir.copy(ctx.direction).applyAxisAngle(this._axis, spread).normalize();
      this._origin.copy(ctx.origin).addScaledVector(this._dir, 0.12);

      this.traceChain(
        ctx,
        this._origin.clone(),
        this._dir.clone(),
        bounceBase,
        penBase,
        canRefract,
        applyDamage ? dmgPerTick : 0,
        critChance,
        0
      );
    }

    if (applyDamage) {
      bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
    }
  }

  private resolveBounceCount(): number {
    let n = this.stats.bounceCount ?? 0;
    const f = this.stats.flags;
    if (f.has('bounce_3') || f.has('refract_max')) n = Math.max(n, 3);
    else if (f.has('bounce_2')) n = Math.max(n, 2);
    else if (f.has('bounce_1') || f.has('refract')) n = Math.max(n, 1);
    return Math.min(MAX_BOUNCES, n);
  }

  private traceChain(
    ctx: WeaponFireContext,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    bouncesLeft: number,
    penLeft: number,
    canRefract: boolean,
    damage: number,
    critChance: number,
    depth: number
  ): void {
    if (depth > 10) return;
    const range = this.stats.range * (1 - depth * 0.08);
    const hit = ctx.cube.raycast(origin, dir, range);
    const end = hit
      ? hit.point
      : origin.clone().addScaledVector(dir, Math.min(range, 40));

    this.drawSeg(origin, end, depth);

    if (!hit) return;

    if (damage > 0) {
      this.applyHit(ctx.cube, hit.instanceId, hit.point, damage, critChance, ctx.now);
    }

    // Penetration: continue through block
    if (penLeft > 0) {
      const past = hit.point.clone().addScaledVector(dir, 0.55);
      this.traceChain(
        ctx,
        past,
        dir.clone(),
        bouncesLeft,
        penLeft - 1,
        canRefract,
        damage * 0.75,
        critChance,
        depth + 1
      );
      return;
    }

    if (bouncesLeft <= 0) return;

    // Reflect: I - 2(I·N)N
    const n = hit.normal;
    const idot = dir.dot(n);
    this._reflect.copy(dir).addScaledVector(n, -2 * idot).normalize();
    // Nudge off surface
    const bounceOrigin = hit.point.clone().addScaledVector(n, 0.08);
    const bounceDmg = damage * (this.stats.flags.has('bounce_strong') ? 0.85 : 0.7);

    this.traceChain(
      ctx,
      bounceOrigin,
      this._reflect.clone(),
      bouncesLeft - 1,
      0,
      canRefract,
      bounceDmg,
      critChance * 0.9,
      depth + 1
    );

    // Refract: secondary ray bends into a different axis along the surface plane
    if (canRefract && depth < 4) {
      this._refract
        .copy(this._reflect)
        .addScaledVector(n, 0.35)
        .add(
          this._tmp
            .set(n.z, n.x, n.y)
            .multiplyScalar((Math.random() - 0.5) * 0.6)
        )
        .normalize();
      // Prefer skimming toward cube center
      this._tmp.copy(hit.point).multiplyScalar(-1).normalize();
      this._refract.lerp(this._tmp, 0.25).normalize();
      const refractOrigin = hit.point.clone().addScaledVector(this._refract, 0.12);
      this.traceChain(
        ctx,
        refractOrigin,
        this._refract.clone(),
        Math.max(0, bouncesLeft - 1),
        0,
        this.stats.flags.has('refract_max'),
        damage * 0.55,
        critChance * 0.75,
        depth + 1
      );
    }
  }

  private applyHit(
    cube: CubeManager,
    instanceId: number,
    point: THREE.Vector3,
    damage: number,
    critChance: number,
    now: number
  ): void {
    const type = cube.getBlockType(instanceId);
    const rolled = rollOutgoing({
      raw: damage,
      critChance,
      critMult: this.stats.critMult,
    });
    if (rolled.crit) bus.emit('crit');
    const applied = applyToBlock(
      {
        raw: rolled.damage,
        armorPierce: this.stats.armorPierce,
        forceCrit: rolled.crit,
        critChance: 0,
        critMult: 1,
      },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    if (!result) {
      bus.emit('beam-miss-impact', { x: point.x, y: point.y, z: point.z });
      return;
    }
    result.x = point.x;
    result.y = point.y;
    result.z = point.z;
    bus.emit('beam-hit', { ...result, crit: rolled.crit });
    if (result.destroyed && result.explosive) {
      const chain = cube.applyExplosiveChain(result.x, result.y, result.z, now);
      for (const c of chain) if (c.destroyed) bus.emit('beam-hit', c);
    }
    if (this.stats.splashRadius > 0 && result.destroyed) {
      const splash = cube.applySplash(
        new THREE.Vector3(result.x, result.y, result.z),
        this.stats.splashRadius,
        rolled.damage * 0.3,
        now
      );
      for (const c of splash) if (c.destroyed) bus.emit('beam-hit', c);
    }
    if (result.destroyed && result.type === BlockType.DataNode) {
      bus.emit('data-node', { x: result.x, y: result.y, z: result.z });
    }
  }

  private drawSeg(from: THREE.Vector3, to: THREE.Vector3, depth: number): void {
    if (this.activeSegs >= MAX_SEGS) return;
    const s = this.segs[this.activeSegs++];
    const pos = s.line.geometry.attributes.position as THREE.BufferAttribute;
    const gpos = s.glow.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    gpos.setXYZ(0, from.x, from.y, from.z);
    gpos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    gpos.needsUpdate = true;
    s.line.geometry.computeBoundingSphere();
    s.glow.geometry.computeBoundingSphere();
    s.line.visible = true;
    s.glow.visible = true;
    s.life = 0.07 + Math.sin(this.pulse + depth) * 0.01;
    const core = s.line.material as THREE.LineBasicMaterial;
    const glow = s.glow.material as THREE.LineBasicMaterial;
    const bounceTint = depth > 0;
    core.color.setHex(bounceTint ? 0xff66dd : COLORS.magenta);
    glow.color.setHex(bounceTint ? 0xcc44ff : 0x8844ff);
    core.opacity = 0.95;
    glow.opacity = 0.4;
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.heat = 0;
    this.damageAccum = 0;
    for (const s of this.segs) {
      s.life = 0;
      s.line.visible = false;
      s.glow.visible = false;
    }
  }

  dispose(): void {
    for (const s of this.segs) {
      s.line.geometry.dispose();
      (s.line.material as THREE.Material).dispose();
      s.glow.geometry.dispose();
      (s.glow.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
