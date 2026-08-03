/**
 * Pulse / main beam family — hitscan-assisted energy bolts.
 * Logic ported from player/Weapon.ts; implements WeaponBehavior.
 */
import * as THREE from 'three';
import { COLORS, COMBAT, PERF } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { WeaponStats } from '../data/weapons';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface Bolt {
  active: boolean;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
}

export class MainBeamWeapon implements WeaponBehavior {
  readonly family = 'pulse';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private bolts: Bolt[] = [];
  private flashes: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private beamLines: Array<{ line: THREE.Line; life: number }> = [];
  private nextBolt = 0;
  private stats: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: COMBAT.baseDamage,
      fireRate: COMBAT.baseFireRate,
      projectileSpeed: COMBAT.projectileSpeed,
      range: COMBAT.beamRange,
      splashRadius: 0,
      splashFalloff: 0.5,
      armorPierce: 0.05,
      critChance: 0,
      critMult: 2,
      heatPerShot: 0.05,
      heatCapacity: 1,
      heatCoolRate: 0.35,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0,
      burstSize: 0,
      flags: new Set(),
    };

    const boltGeo = new THREE.CapsuleGeometry(0.06, 0.45, 3, 6);
    for (let i = 0; i < PERF.maxProjectiles; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(boltGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: COLORS.cyan,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      trail.visible = false;
      this.group.add(trail);

      this.bolts.push({
        active: false,
        mesh,
        trail,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
      });
    }

    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: COLORS.white,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      line.visible = false;
      this.group.add(line);
      this.beamLines.push({ line, life: 0 });
    }

    const flashGeo = new THREE.SphereGeometry(0.18, 8, 8);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        flashGeo,
        new THREE.MeshBasicMaterial({
          color: COLORS.white,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0 });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  /**
   * Compatibility entry used by player/Weapon facade and hardpoints.
   * When called as main gun, multiplies by PlayerStats damage/fireRate.
   */
  update(ctx: WeaponFireContext): void {
    this.updateBolts(ctx.dt, ctx.cube, ctx.now);
    this.updateFlashes(ctx.dt);
    this.updateBeams(ctx.dt);

    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    const isMain = ctx.slot < 0;
    const rate =
      this.stats.fireRate *
      (isMain ? ctx.playerStats.fireRateMul : 1) *
      (1 - this.heat * 0.35);
    this.cooldown = 1 / Math.max(0.4, rate);

    const shots = Math.max(
      1,
      this.stats.projectileCount + (isMain ? Math.floor(ctx.playerStats.multiShotAdd) : 0)
    );
    const baseDmg =
      this.stats.damage * (isMain ? ctx.playerStats.damageMul : 1);
    const critChance =
      this.stats.critChance + (isMain ? ctx.playerStats.critChance : 0);
    const splash =
      this.stats.splashRadius + (isMain ? ctx.playerStats.splashAdd : 0);

    for (let s = 0; s < shots; s++) {
      const spread = (s - (shots - 1) / 2) * 0.035;
      const axis =
        Math.abs(ctx.direction.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
      const dir = ctx.direction.clone().applyAxisAngle(axis, spread).normalize();

      const rolled = rollOutgoing({
        raw: baseDmg,
        critChance,
        critMult: this.stats.critMult,
      });
      if (rolled.crit) bus.emit('crit');

      this.muzzleFlash(ctx.origin);
      this.fireBolt(
        ctx.origin,
        dir,
        rolled.damage,
        splash,
        rolled.crit,
        this.stats.armorPierce
      );

      const preview = ctx.cube.raycast(ctx.origin, dir, this.stats.range);
      const end = preview
        ? preview.point
        : ctx.origin.clone().addScaledVector(dir, 28);
      this.showBeam(ctx.origin, end, s % this.beamLines.length, rolled.crit);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private fireBolt(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    splash: number,
    crit: boolean,
    armorPierce: number
  ): void {
    const b = this.bolts[this.nextBolt % this.bolts.length];
    this.nextBolt++;
    b.active = true;
    b.pos.copy(from).addScaledVector(dir, 0.6);
    b.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
    b.life = 1.2;
    b.damage = damage;
    b.splash = splash;
    b.crit = crit;
    b.armorPierce = armorPierce;
    b.mesh.visible = true;
    b.trail.visible = true;
    const mat = b.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(crit ? COLORS.magenta : COLORS.cyan);
    mat.opacity = 1;
    const tmat = b.trail.material as THREE.LineBasicMaterial;
    tmat.color.setHex(crit ? COLORS.magenta : COLORS.cyan);
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(b.pos.clone().add(dir));
  }

  private updateBolts(dt: number, cube: CubeManager, now: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      const prev = this.tmp.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(b.pos.clone().add(b.vel));

      const posAttr = b.trail.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, prev.x, prev.y, prev.z);
      posAttr.setXYZ(1, b.pos.x, b.pos.y, b.pos.z);
      posAttr.needsUpdate = true;
      b.trail.geometry.computeBoundingSphere();

      const move = this.dir.copy(b.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.35);
        if (hit) {
          this.resolveHit(b, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (b.life <= 0 || b.pos.length() > 200) this.deactivateBolt(b);
    }
  }

  private resolveHit(
    b: Bolt,
    cube: CubeManager,
    instanceId: number,
    point: THREE.Vector3,
    now: number
  ): void {
    const type = cube.getBlockType(instanceId);
    const applied = applyToBlock(
      {
        raw: b.damage,
        armorPierce: b.armorPierce,
        forceCrit: b.crit,
        critChance: 0,
        critMult: 1,
      },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    this.deactivateBolt(b);
    if (!result) {
      bus.emit('beam-miss-impact', { x: point.x, y: point.y, z: point.z });
      return;
    }
    result.x = point.x;
    result.y = point.y;
    result.z = point.z;
    bus.emit('beam-hit', { ...result, crit: b.crit });

    if (result.destroyed && result.explosive) {
      const chain = cube.applyExplosiveChain(result.x, result.y, result.z, now);
      for (const c of chain) if (c.destroyed) bus.emit('beam-hit', c);
    }
    if (b.splash > 0 && result.destroyed) {
      const splash = cube.applySplash(
        new THREE.Vector3(result.x, result.y, result.z),
        b.splash,
        b.damage * 0.35,
        now
      );
      for (const c of splash) if (c.destroyed) bus.emit('beam-hit', c);
    }
    if (result.destroyed && result.type === BlockType.DataNode) {
      bus.emit('data-node', { x: result.x, y: result.y, z: result.z });
    }
  }

  private deactivateBolt(b: Bolt): void {
    b.active = false;
    b.mesh.visible = false;
    b.trail.visible = false;
  }

  private muzzleFlash(at: THREE.Vector3): void {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.life = 0.06;
    f.mesh.position.copy(at);
    f.mesh.visible = true;
    f.mesh.scale.setScalar(1);
    const mat = f.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.9;
  }

  private updateFlashes(dt: number): void {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, f.life / 0.06);
      f.mesh.scale.setScalar(1 + (0.06 - f.life) * 12);
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  private showBeam(from: THREE.Vector3, to: THREE.Vector3, index: number, crit: boolean): void {
    const b = this.beamLines[index];
    const pos = b.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    b.line.geometry.computeBoundingSphere();
    b.line.visible = true;
    b.life = COMBAT.beamDuration;
    const mat = b.line.material as THREE.LineBasicMaterial;
    mat.opacity = crit ? 0.7 : 0.35;
    mat.color.setHex(crit ? COLORS.magenta : COLORS.cyan);
  }

  private updateBeams(dt: number): void {
    for (const b of this.beamLines) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const mat = b.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, (b.life / COMBAT.beamDuration) * 0.4);
      if (b.life <= 0) b.line.visible = false;
    }
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const b of this.bolts) this.deactivateBolt(b);
    for (const f of this.flashes) {
      f.life = 0;
      f.mesh.visible = false;
    }
    for (const b of this.beamLines) {
      b.life = 0;
      b.line.visible = false;
    }
  }

  dispose(): void {
    for (const b of this.bolts) {
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      b.trail.geometry.dispose();
      (b.trail.material as THREE.Material).dispose();
    }
    for (const b of this.beamLines) {
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
    for (const f of this.flashes) {
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
