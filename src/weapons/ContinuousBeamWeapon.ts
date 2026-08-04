/**
 * Continuous Arc Beam — thick volumetric particle beam with glow cores,
 * impact blooms, and bounce/refract chains. Punchy, highly visible.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { WeaponStats } from '../data/weapons';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface BeamRibbon {
  core: THREE.Mesh;
  mid: THREE.Mesh;
  outer: THREE.Mesh;
  life: number;
}

interface ImpactFlash {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  life: number;
}

const MAX_RIBBONS = 18;
const MAX_IMPACTS = 12;
const MAX_BOUNCES = 6;
const PARTICLE_POOL = 200;

export class ContinuousBeamWeapon implements WeaponBehavior {
  readonly family = 'beam';
  readonly group = new THREE.Group();
  private heat = 0;
  private damageAccum = 0;
  private stats: WeaponStats & { flags: Set<string> };
  private ribbons: BeamRibbon[] = [];
  private impacts: ImpactFlash[] = [];
  private nextImpact = 0;
  private activeRibbons = 0;
  private pulse = 0;
  private particlePts!: THREE.Points;
  private particleGeo!: THREE.BufferGeometry;
  private particlePos!: Float32Array;
  private particleCol!: Float32Array;
  private particleLife!: Float32Array;
  private particleVel!: Float32Array;
  private readonly _origin = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _reflect = new THREE.Vector3();
  private readonly _refract = new THREE.Vector3();
  private readonly _axis = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();
  private readonly _mid = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _fwd = new THREE.Vector3(0, 1, 0);
  private readonly _scale = new THREE.Vector3();

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

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    for (let i = 0; i < MAX_RIBBONS; i++) {
      const core = new THREE.Mesh(
        cyl,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      const mid = new THREE.Mesh(
        cyl,
        new THREE.MeshBasicMaterial({
          color: COLORS.magenta,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      const outer = new THREE.Mesh(
        cyl,
        new THREE.MeshBasicMaterial({
          color: 0xaa44ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      core.visible = mid.visible = outer.visible = false;
      this.group.add(outer, mid, core);
      this.ribbons.push({ core, mid, outer, life: 0 });
    }

    for (let i = 0; i < MAX_IMPACTS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0xff66ee,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.visible = false;
      const light = new THREE.PointLight(COLORS.magenta, 0, 14, 2);
      this.group.add(mesh, light);
      this.impacts.push({ mesh, light, life: 0 });
    }

    this.particlePos = new Float32Array(PARTICLE_POOL * 3);
    this.particleCol = new Float32Array(PARTICLE_POOL * 3);
    this.particleLife = new Float32Array(PARTICLE_POOL);
    this.particleVel = new Float32Array(PARTICLE_POOL * 3);
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleCol, 3));
    this.particlePts = new THREE.Points(
      this.particleGeo,
      new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.particlePts.frustumCulled = false;
    this.group.add(this.particlePts);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.particleLife[i] = 0;
      this.particlePos[i * 3 + 1] = -9999;
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    const dt = ctx.dt;
    this.pulse += dt * 16;
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * dt);
    this.updateParticles(dt);
    this.updateImpacts(dt);

    // Fade ribbons
    for (const r of this.ribbons) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = Math.max(0, r.life / 0.1);
      (r.core.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
      (r.mid.material as THREE.MeshBasicMaterial).opacity = t * 0.55;
      (r.outer.material as THREE.MeshBasicMaterial).opacity = t * 0.28;
      if (r.life <= 0) {
        r.core.visible = r.mid.visible = r.outer.visible = false;
      }
    }

    if (!ctx.firing) {
      this.damageAccum = 0;
      return;
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot * dt * 2.2);
    const heatMul = 1 - this.heat * 0.4;
    const dps =
      this.stats.damage * this.stats.fireRate * heatMul;
    const critChance = this.stats.critChance;
    const bounceBase = this.resolveBounceCount();
    const canRefract =
      this.stats.flags.has('refract') || this.stats.flags.has('refract_max');
    const beams = Math.max(1, this.stats.projectileCount);
    const penBase = Math.floor(this.stats.penetration ?? 0);

    this.activeRibbons = 0;
    this.damageAccum += dps * dt;
    const tickThreshold = Math.max(0.035, 1 / Math.max(1, this.stats.fireRate * 1.6));
    const applyDamage = this.damageAccum >= dps * tickThreshold * 0.45;
    if (applyDamage) {
      this.damageAccum = Math.max(0, this.damageAccum - dps * tickThreshold);
    }
    const dmgPerTick = dps * tickThreshold;

    for (let b = 0; b < beams; b++) {
      const spread = (b - (beams - 1) / 2) * 0.025;
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
    const hit = ctx.cube.raycast(origin, dir, range, -1, 0.58);
    const end = hit
      ? hit.point
      : origin.clone().addScaledVector(dir, Math.min(range, 40));

    this.drawRibbon(origin, end, depth);
    this.spawnBeamParticles(origin, end, depth);

    if (!hit) return;

    this.spawnImpact(hit.point, depth);
    if (damage > 0) {
      this.applyHit(ctx.cube, hit.instanceId, hit.point, damage, critChance, ctx.now);
    }

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

    const n = hit.normal;
    const idot = dir.dot(n);
    this._reflect.copy(dir).addScaledVector(n, -2 * idot).normalize();
    const bounceOrigin = hit.point.clone().addScaledVector(n, 0.1);
    const bounceDmg = damage * (this.stats.flags.has('bounce_strong') ? 0.88 : 0.72);

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

    if (canRefract && depth < 4) {
      this._refract
        .copy(this._reflect)
        .addScaledVector(n, 0.35)
        .add(this._tmp.set(n.z, n.x, n.y).multiplyScalar((Math.random() - 0.5) * 0.5))
        .normalize();
      this._tmp.copy(hit.point).multiplyScalar(-1).normalize();
      this._refract.lerp(this._tmp, 0.25).normalize();
      const refractOrigin = hit.point.clone().addScaledVector(this._refract, 0.14);
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

  private drawRibbon(from: THREE.Vector3, to: THREE.Vector3, depth: number): void {
    if (this.activeRibbons >= MAX_RIBBONS) return;
    const r = this.ribbons[this.activeRibbons++];
    const len = Math.max(0.2, from.distanceTo(to));
    this._mid.copy(from).add(to).multiplyScalar(0.5);
    this._dir.copy(to).sub(from).normalize();
    this._q.setFromUnitVectors(this._fwd, this._dir);

    const pulse = 1 + Math.sin(this.pulse * 2 + depth) * 0.12;
    const wCore = (0.045 + depth * 0.008) * pulse;
    const wMid = (0.12 + depth * 0.02) * pulse;
    const wOuter = (0.28 + depth * 0.04) * pulse;

    for (const [mesh, w] of [
      [r.core, wCore],
      [r.mid, wMid],
      [r.outer, wOuter],
    ] as const) {
      mesh.position.copy(this._mid);
      mesh.quaternion.copy(this._q);
      mesh.scale.set(w, len, w);
      mesh.visible = true;
    }
    r.life = 0.09 + Math.sin(this.pulse + depth) * 0.015;
    const bounce = depth > 0;
    (r.core.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    (r.mid.material as THREE.MeshBasicMaterial).color.setHex(bounce ? 0xff66dd : COLORS.magenta);
    (r.outer.material as THREE.MeshBasicMaterial).color.setHex(bounce ? 0xcc44ff : 0x8844ff);
    (r.core.material as THREE.MeshBasicMaterial).opacity = 0.95;
    (r.mid.material as THREE.MeshBasicMaterial).opacity = 0.55;
    (r.outer.material as THREE.MeshBasicMaterial).opacity = 0.3;
  }

  private spawnBeamParticles(from: THREE.Vector3, to: THREE.Vector3, depth: number): void {
    const n = 7 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      this._tmp.copy(from).lerp(to, t);
      // Lateral jitter for thick beam volume
      this._tmp.x += (Math.random() - 0.5) * 0.15;
      this._tmp.y += (Math.random() - 0.5) * 0.15;
      this._tmp.z += (Math.random() - 0.5) * 0.15;
      this.emitParticle(
        this._tmp.x,
        this._tmp.y,
        this._tmp.z,
        depth > 0 ? 1 : 0.95,
        depth > 0 ? 0.4 : 0.05,
        1
      );
    }
  }

  private emitParticle(x: number, y: number, z: number, cr: number, cg: number, cb: number): void {
    let idx = -1;
    for (let i = 0; i < PARTICLE_POOL; i++) {
      if (this.particleLife[i] <= 0) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = Math.floor(Math.random() * PARTICLE_POOL);
    const i3 = idx * 3;
    this.particlePos[i3] = x;
    this.particlePos[i3 + 1] = y;
    this.particlePos[i3 + 2] = z;
    this.particleCol[i3] = cr;
    this.particleCol[i3 + 1] = cg;
    this.particleCol[i3 + 2] = cb;
    this.particleVel[i3] = (Math.random() - 0.5) * 2;
    this.particleVel[i3 + 1] = (Math.random() - 0.5) * 2;
    this.particleVel[i3 + 2] = (Math.random() - 0.5) * 2;
    this.particleLife[idx] = 0.12 + Math.random() * 0.18;
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < PARTICLE_POOL; i++) {
      if (this.particleLife[i] <= 0) continue;
      this.particleLife[i] -= dt;
      const i3 = i * 3;
      this.particlePos[i3] += this.particleVel[i3] * dt;
      this.particlePos[i3 + 1] += this.particleVel[i3 + 1] * dt;
      this.particlePos[i3 + 2] += this.particleVel[i3 + 2] * dt;
      if (this.particleLife[i] <= 0) this.particlePos[i3 + 1] = -9999;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
  }

  private spawnImpact(point: THREE.Vector3, depth: number): void {
    const imp = this.impacts[this.nextImpact % MAX_IMPACTS];
    this.nextImpact++;
    imp.life = 0.18;
    imp.mesh.position.copy(point);
    imp.mesh.visible = true;
    imp.mesh.scale.setScalar(0.9 + Math.random() * 0.7);
    const mat = imp.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    mat.color.setHex(depth > 0 ? 0xffaaff : 0xffffff);
    imp.light.position.copy(point);
    imp.light.intensity = 42 + Math.sin(this.pulse) * 10;
    imp.light.color.setHex(depth > 0 ? 0xff44cc : COLORS.magenta);
    // Burst particles at impact
    for (let i = 0; i < 14; i++) {
      this.emitParticle(
        point.x + (Math.random() - 0.5) * 0.3,
        point.y + (Math.random() - 0.5) * 0.3,
        point.z + (Math.random() - 0.5) * 0.3,
        1,
        0.5 + Math.random() * 0.5,
        1
      );
    }
  }

  private updateImpacts(dt: number): void {
    for (const imp of this.impacts) {
      if (imp.life <= 0) continue;
      imp.life -= dt;
      const t = Math.max(0, imp.life / 0.14);
      (imp.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
      imp.mesh.scale.multiplyScalar(1 + dt * 4);
      imp.light.intensity = t * 30;
      if (imp.life <= 0) {
        imp.mesh.visible = false;
        imp.light.intensity = 0;
      }
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
    bus.emit('beam-hit', {
      ...result,
      crit: rolled.crit,
      style: 'beam' as const,
      impactNx: point.x,
      impactNy: point.y,
      impactNz: point.z,
    });
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

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.heat = 0;
    this.damageAccum = 0;
    for (const r of this.ribbons) {
      r.life = 0;
      r.core.visible = r.mid.visible = r.outer.visible = false;
    }
    for (const imp of this.impacts) {
      imp.life = 0;
      imp.mesh.visible = false;
      imp.light.intensity = 0;
    }
    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.particleLife[i] = 0;
      this.particlePos[i * 3 + 1] = -9999;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.reset();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}
