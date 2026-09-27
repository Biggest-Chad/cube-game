/**
 * Pulse / main beam — elongated plasma lances (not upright capsules).
 * Bolts travel nose-first with multi-layer glow core + ribbon trail.
 */
import * as THREE from 'three';
import { COLORS, COMBAT, PERF } from '../data/constants';
import {
  MAIN_GUN_BASE_ARMOR_PIERCE,
  MAIN_GUN_BOLT_BLOCK_HALF_EXTENT,
  MAIN_GUN_BOLT_ENEMY_SWEEP_PADDING,
  MAIN_GUN_BOLT_RAYCAST_LEAD,
  MAIN_GUN_HEAT_COOL_RATE,
  MAIN_GUN_HEAT_PER_SHOT,
} from '../data/constraints';
import { mainGunStream } from './mainGunStream';
import type { CubeManager } from '../cube/CubeManager';
import { BLOCK_DEFS, BlockType } from '../cube/BlockTypes';
import { bus } from '../core/EventBus';
import type { WeaponStats } from '../data/weapons';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';
import {
  MAIN_GUN_AMMO,
  resolveMainGunAmmo,
  type MainGunAmmoId,
} from '../data/ammo';

interface Bolt {
  active: boolean;
  root: THREE.Group;
  core: THREE.Mesh;
  sheath: THREE.Mesh;
  tip: THREE.Mesh;
  trail: THREE.Line;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
  penLeft: number;
  lastHitId: number;
  ammo: MainGunAmmoId;
}

function makePlasmaBoltGeometry(): {
  root: THREE.Group;
  core: THREE.Mesh;
  sheath: THREE.Mesh;
  tip: THREE.Mesh;
} {
  const root = new THREE.Group();
  const add = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

  // Hot white core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 1.05, 10), add(0xffffff, 1));
  core.rotation.x = Math.PI / 2;
  root.add(core);

  // Cyan / magenta plasma sheath
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.95, 12),
    add(COLORS.cyan, 0.55)
  );
  sheath.rotation.x = Math.PI / 2;
  root.add(sheath);

  // Soft outer bloom volume
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.17, 0.8, 12),
    add(COLORS.cyan, 0.22)
  );
  outer.rotation.x = Math.PI / 2;
  root.add(outer);

  // Leading tip flare
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), add(0xffffff, 0.95));
  tip.position.z = 0.52;
  tip.scale.set(0.75, 0.75, 1.45);
  root.add(tip);

  // Soft rear glow
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), add(COLORS.cyan, 0.55));
  tail.position.z = -0.48;
  tail.scale.set(1.35, 1.35, 0.7);
  root.add(tail);

  return { root, core, sheath, tip };
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
  /** Index of the next interleaved main-gun bolt inside the current cycle. */
  private streamSlot = 0;
  /** Bolt count locked at the start of the current cycle. */
  private streamCount = 1;
  /** Completed main-gun cycles. Stutter inserts a bolt on some of these. */
  private streamCycle = 0;
  private focusId = -1;
  private focusStacks = 0;
  private stats: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3(0, 0, 1);
  private readonly _q = new THREE.Quaternion();
  private readonly _primaryDir = new THREE.Vector3();
  private readonly _shotDir = new THREE.Vector3();
  private readonly _axis = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _right = new THREE.Vector3(1, 0, 0);
  private readonly _end = new THREE.Vector3();
  private readonly _splashAt = new THREE.Vector3();
  private readonly _from = new THREE.Vector3();
  private readonly _np = new THREE.Vector3();
  private readonly _penDir = new THREE.Vector3();

  constructor(pool: number = PERF.maxProjectiles) {
    this.stats = {
      damage: COMBAT.baseDamage,
      fireRate: COMBAT.baseFireRate,
      projectileSpeed: COMBAT.projectileSpeed,
      range: COMBAT.beamRange,
      splashRadius: 0,
      splashFalloff: 0.5,
      armorPierce: MAIN_GUN_BASE_ARMOR_PIERCE,
      critChance: 0,
      critMult: 2,
      heatPerShot: MAIN_GUN_HEAT_PER_SHOT,
      heatCapacity: 1,
      heatCoolRate: MAIN_GUN_HEAT_COOL_RATE,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0,
      burstSize: 0,
      flags: new Set(),
    };

    for (let i = 0; i < pool; i++) {
      const { root, core, sheath, tip } = makePlasmaBoltGeometry();
      root.visible = false;
      this.group.add(root);

      // Multi-point trail ribbon (4 segments for smoother streak)
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: COLORS.cyan,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          linewidth: 2,
        })
      );
      trail.visible = false;
      this.group.add(trail);

      this.bolts.push({
        active: false,
        root,
        core,
        sheath,
        tip,
        trail,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
        penLeft: 0,
        lastHitId: -1,
        ammo: 'standard',
      });
    }

    // Instant hit confirmation streak (thin core beam)
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: COLORS.white,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      line.visible = false;
      this.group.add(line);
      this.beamLines.push({ line, life: 0 });
    }

    // Muzzle flash — elongated along fire direction
    for (let i = 0; i < 4; i++) {
      const flashRoot = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({
          color: COLORS.white,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      flashRoot.visible = false;
      this.group.add(flashRoot);
      this.flashes.push({ mesh: flashRoot, life: 0 });
    }
  }

  setStats(stats: WeaponStats & { flags?: Set<string> }): void {
    this.stats = { ...stats, flags: stats.flags ?? new Set() };
  }

  update(ctx: WeaponFireContext): void {
    this.updateBolts(ctx.dt, ctx.cube, ctx.now, ctx);
    this.updateFlashes(ctx.dt);
    this.updateBeams(ctx.dt);

    const coolMul = 1 + (ctx.slot < 0 ? ctx.playerStats.heatCoolAdd ?? 0 : 0);
    this.heat = Math.max(0, this.heat - this.stats.heatCoolRate * coolMul * ctx.dt);
    this.cooldown = Math.max(0, this.cooldown - ctx.dt);
    if (!ctx.firing) this.streamSlot = 0;
    if (!ctx.firing || this.cooldown > 0 || this.heat >= 0.98) return;

    const isMain = ctx.slot < 0;
    const ammo = isMain ? (ctx.ammo ?? 'standard') : 'standard';
    const magazine = isMain
      ? resolveMainGunAmmo(ammo, {
          splashAdd: this.stats.splashRadius + ctx.playerStats.splashAdd,
          penetrationAdd: (this.stats.penetration ?? 0) + ctx.playerStats.penetrationAdd,
          armorPierceAdd: ctx.playerStats.armorPierceAdd ?? 0,
          ammoApPenAdd: ctx.playerStats.ammoApPenAdd ?? 0,
          ammoHeSplashAdd: ctx.playerStats.ammoHeSplashAdd ?? 0,
        })
      : null;
    const rate =
      this.stats.fireRate *
      (isMain ? ctx.playerStats.fireRateMul : 1) *
      (1 - this.heat * 0.35);
    const baseInterval = 1 / Math.max(0.4, rate);

    const ammoDmg = magazine?.damageMul ?? 1;
    const baseDmg = this.stats.damage * (isMain ? ctx.playerStats.damageMul : 1) * ammoDmg;
    const critChance = this.stats.critChance + (isMain ? ctx.playerStats.critChance : 0);
    const splash = magazine ? magazine.splash : this.stats.splashRadius;
    const spreadExtra = (this.stats.spread ?? 0) + (ctx.playerStats.spreadAdd ?? 0);
    const pen = magazine ? magazine.pen : (this.stats.penetration ?? 0);
    const armorPierce =
      this.stats.armorPierce + (magazine ? magazine.armorPierceAdd : ctx.playerStats.armorPierceAdd ?? 0);

    const primaryDir = this._primaryDir.copy(ctx.direction);
    if (primaryDir.lengthSq() < 1e-12) primaryDir.set(0, 0, 1);
    else primaryDir.normalize();
    if (isMain && ctx.aimTarget) {
      primaryDir.copy(ctx.aimTarget).sub(ctx.origin).normalize();
    }

    if (isMain) {
      if (this.streamSlot === 0) {
        this.streamCycle++;
        let total = 1 + Math.max(0, Math.floor(ctx.playerStats.multiShotAdd));
        const stutter = ctx.playerStats.stutterEvery;
        if (stutter > 0 && this.streamCycle % stutter === 0) total += 1;
        this.streamCount = total;
      }
      const total = Math.max(1, this.streamCount);
      const slot = mainGunStream(total, spreadExtra)[this.streamSlot] ?? mainGunStream(1)[0];
      this.cooldown = baseInterval / total;
      this.heat = Math.min(1, this.heat + this.stats.heatPerShot / total);
      this.launchBolt(
        ctx,
        this.dirFromAngle(primaryDir, slot.angle),
        baseDmg,
        critChance,
        splash,
        armorPierce,
        pen,
        ammo,
        this.streamSlot,
        slot.angle === 0 ? (ctx.aimTarget ?? null) : null
      );
      this.streamSlot++;
      if (this.streamSlot >= total) this.streamSlot = 0;
    } else {
      const shots = Math.max(1, this.stats.projectileCount);
      this.cooldown = baseInterval;
      this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
      for (let s = 0; s < shots; s++) {
        const fan = (s - (shots - 1) / 2) * 0.028;
        const jitter = spreadExtra > 0 ? (Math.random() - 0.5) * spreadExtra * 0.08 : 0;
        this.launchBolt(
          ctx,
          this.dirFromAngle(primaryDir, fan + jitter),
          baseDmg,
          critChance,
          splash,
          armorPierce,
          pen,
          ammo,
          s,
          null
        );
      }
    }

    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  /** Yaw a shot off the aim ray. Zero stays on the crosshair. */
  private dirFromAngle(primary: THREE.Vector3, angle: number): THREE.Vector3 {
    const dir = this._shotDir;
    if (Math.abs(angle) < 1e-6) {
      dir.copy(primary);
      return dir;
    }
    this._axis.copy(Math.abs(primary.y) < 0.9 ? this._up : this._right);
    dir.copy(primary).applyAxisAngle(this._axis, angle).normalize();
    return dir;
  }

  private launchBolt(
    ctx: WeaponFireContext,
    dir: THREE.Vector3,
    baseDmg: number,
    critChance: number,
    splash: number,
    armorPierce: number,
    pen: number,
    ammo: MainGunAmmoId,
    beamIndex: number,
    aimEnd: THREE.Vector3 | null
  ): void {
    const rolled = rollOutgoing({
      raw: baseDmg,
      critChance,
      critMult: this.stats.critMult,
    });
    if (rolled.crit) bus.emit('crit');
    const spawn = this.tmp.copy(ctx.origin).addScaledVector(dir, 0.15);
    this.muzzleFlash(spawn, dir);
    this.fireBolt(spawn, dir, rolled.damage, splash, rolled.crit, armorPierce, pen, ammo);
    let end: THREE.Vector3;
    if (aimEnd) {
      end = this._end.copy(aimEnd);
    } else {
      const preview = ctx.cube.raycast(spawn, dir, this.stats.range, -1, 0.55);
      end = preview ? preview.point : this._end.copy(spawn).addScaledVector(dir, 32);
    }
    this.showBeam(spawn, end, beamIndex % this.beamLines.length, rolled.crit);
  }

  private orientBolt(root: THREE.Group, pos: THREE.Vector3, vel: THREE.Vector3): void {
    // Align local +Z with flight direction (geometry tip is on +Z)
    this.dir.copy(vel);
    if (this.dir.lengthSq() < 1e-8) this.dir.set(0, 0, 1);
    else this.dir.normalize();
    this._q.setFromUnitVectors(this._fwd, this.dir);
    root.quaternion.copy(this._q);
    root.position.copy(pos);
  }

  private fireBolt(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    splash: number,
    crit: boolean,
    armorPierce: number,
    penLeft = 0,
    ammo: MainGunAmmoId = 'standard'
  ): void {
    const b = this.bolts[this.nextBolt % this.bolts.length];
    this.nextBolt++;
    const profile = MAIN_GUN_AMMO[ammo];
    b.active = true;
    b.pos.copy(from);
    b.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
    b.life = 1.15;
    b.maxLife = 1.15;
    b.damage = damage;
    b.splash = splash;
    b.crit = crit;
    b.armorPierce = armorPierce;
    b.penLeft = penLeft;
    b.lastHitId = -1;
    b.ammo = ammo;
    b.root.visible = true;
    b.trail.visible = true;
    const fat = ammo === 'he' ? 1.18 : ammo === 'ap' ? 0.88 : 1;
    b.root.scale.set(1.35 * fat, 1.35 * fat, ammo === 'ap' ? 1.28 : 1.15);

    const coreCol = crit ? 0xffddff : profile.coreColor;
    const sheathCol = crit ? COLORS.magenta : profile.sheathColor;
    (b.core.material as THREE.MeshBasicMaterial).color.setHex(coreCol);
    (b.core.material as THREE.MeshBasicMaterial).opacity = 1;
    (b.sheath.material as THREE.MeshBasicMaterial).color.setHex(sheathCol);
    (b.sheath.material as THREE.MeshBasicMaterial).opacity = 0.65;
    (b.tip.material as THREE.MeshBasicMaterial).color.setHex(coreCol);
    const tmat = b.trail.material as THREE.LineBasicMaterial;
    tmat.color.setHex(sheathCol);
    tmat.opacity = 0.9;

    this.orientBolt(b.root, b.pos, b.vel);
  }

  private updateBolts(
    dt: number,
    cube: CubeManager,
    now: number,
    ctx?: WeaponFireContext
  ): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      // Snapshot previous position (do not alias this.tmp — enemy tests reuse it)
      const prevX = b.pos.x;
      const prevY = b.pos.y;
      const prevZ = b.pos.z;
      b.pos.addScaledVector(b.vel, dt);
      this.orientBolt(b.root, b.pos, b.vel);

      // Fade over life
      const t = Math.max(0, b.life / b.maxLife);
      (b.core.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * t;
      (b.sheath.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.35 * t;
      b.root.scale.setScalar(0.85 + 0.2 * t);

      // Trail: previous → current (elongated streak)
      const posAttr = b.trail.geometry.attributes.position as THREE.BufferAttribute;
      const back = this.dir.copy(b.vel).normalize().multiplyScalar(-0.55);
      posAttr.setXYZ(0, prevX + back.x, prevY + back.y, prevZ + back.z);
      posAttr.setXYZ(1, prevX, prevY, prevZ);
      posAttr.setXYZ(2, b.pos.x, b.pos.y, b.pos.z);
      posAttr.setXYZ(3, b.pos.x, b.pos.y, b.pos.z);
      posAttr.needsUpdate = true;
      b.trail.geometry.setDrawRange(0, 3);
      b.trail.geometry.computeBoundingSphere();
      (b.trail.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.45 * t;

      const mx = b.pos.x - prevX;
      const my = b.pos.y - prevY;
      const mz = b.pos.z - prevZ;
      const dist = Math.hypot(mx, my, mz);
      if (dist > 1e-5) {
        const preferEnemies = (ctx?.lockPriority ?? 'drones') === 'drones';
        const hitEnemySweep = (): boolean => {
          if (!ctx?.enemyTargets || !ctx.onEnemyHit) return false;
          for (const et of ctx.enemyTargets) {
            const toEx = et.position.x - prevX;
            const toEy = et.position.y - prevY;
            const toEz = et.position.z - prevZ;
            const tSeg = Math.max(
              0,
              Math.min(1, (toEx * mx + toEy * my + toEz * mz) / Math.max(1e-6, dist * dist))
            );
            const cx = prevX + mx * tSeg;
            const cy = prevY + my * tSeg;
            const cz = prevZ + mz * tSeg;
            const dx = cx - et.position.x;
            const dy = cy - et.position.y;
            const dz = cz - et.position.z;
            if (dx * dx + dy * dy + dz * dz <= (et.radius + MAIN_GUN_BOLT_ENEMY_SWEEP_PADDING) ** 2) {
              ctx.onEnemyHit(et.id, b.damage);
              b.active = false;
              b.root.visible = false;
              b.trail.visible = false;
              bus.emit('beam-hit', {
                destroyed: false,
                type: BlockType.Standard,
                x: et.position.x,
                y: et.position.y,
                z: et.position.z,
                fragments: 0,
                crit: b.crit,
                style: 'bolt' as const,
              });
              return true;
            }
          }
          return false;
        };
        const hitBlockSweep = (): boolean => {
          const hit = cube.raycast(
            this.tmp.set(prevX, prevY, prevZ),
            this.dir.set(mx / dist, my / dist, mz / dist),
            dist + MAIN_GUN_BOLT_RAYCAST_LEAD,
            b.lastHitId,
            MAIN_GUN_BOLT_BLOCK_HALF_EXTENT
          );
          if (!hit) return false;
          this.resolveHit(b, cube, hit.instanceId, hit.point, now, ctx);
          return true;
        };
        if (preferEnemies) {
          if (hitEnemySweep() || hitBlockSweep()) continue;
        } else if (hitBlockSweep() || hitEnemySweep()) {
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
    now: number,
    ctx?: WeaponFireContext
  ): void {
    const type = cube.getBlockType(instanceId);
    const stats = ctx?.playerStats;
    const isMain = ctx?.slot === -1;
    let raw = b.damage;
    if (isMain && stats) {
      if (stats.focusLockAdd > 0) {
        if (instanceId === this.focusId) {
          this.focusStacks = Math.min(stats.focusLockAdd >= 0.12 ? 4 : 3, this.focusStacks + 1);
        } else {
          this.focusId = instanceId;
          this.focusStacks = 1;
        }
        raw *= 1 + stats.focusLockAdd * Math.max(0, this.focusStacks - 1);
      }
      const armor = BLOCK_DEFS[type]?.armorClass;
      if (stats.shredMul > 0 && armor && armor !== 'none') {
        raw *= 1 + stats.shredMul;
      }
    }
    const applied = applyToBlock(
      {
        raw,
        armorPierce: b.armorPierce,
        forceCrit: b.crit,
        critChance: 0,
        critMult: 1,
      },
      type
    );
    let hitDamage = applied.finalDamage;
    const result = cube.applyDamage(instanceId, hitDamage, now);
    if (isMain && stats?.phaseNucleusAdd && result?.coreHit) {
      cube.applyNucleusHit(hitDamage * stats.phaseNucleusAdd, now);
    }
    b.lastHitId = instanceId;
    // Penetration: stop on shared nucleus (multi-core voxels would re-hit the pool)
    const hitNucleus =
      !!result?.coreHit || type === BlockType.Core;
    if (b.penLeft > 0 && !hitNucleus) {
      b.penLeft--;
      b.damage *= 0.78;
      b.pos.copy(point).addScaledVector(this._penDir.copy(b.vel).normalize(), 0.55);
    } else {
      this.deactivateBolt(b);
    }
    if (!result) {
      bus.emit('beam-miss-impact', { x: point.x, y: point.y, z: point.z });
      return;
    }
    result.x = point.x;
    result.y = point.y;
    result.z = point.z;
    bus.emit('beam-hit', {
      ...result,
      crit: b.crit,
      style: 'bolt' as const,
      impactNx: point.x,
      impactNy: point.y,
      impactNz: point.z,
    });

    const profile = MAIN_GUN_AMMO[b.ammo];
    const shipBurstGlow = b.ammo === 'he' && b.splash >= 1.2;

    if (result.destroyed && result.explosive) {
      const chain = cube.applyExplosiveChain(result.x, result.y, result.z, now);
      for (const c of chain) if (c.destroyed) bus.emit('beam-hit', c);
    }
    const splashNow = b.splash > 0 && (result.destroyed || profile.splashOnChip);
    if (splashNow) {
      const splash = cube.applySplash(
        this._splashAt.set(result.x, result.y, result.z),
        b.splash,
        b.damage * (b.ammo === 'he' ? 0.42 : 0.35),
        now,
        instanceId,
        { glow: shipBurstGlow }
      );
      for (const c of splash) if (c.destroyed) bus.emit('beam-hit', c);
    }
    if (result.destroyed && result.type === BlockType.DataNode) {
      bus.emit('data-node', { x: result.x, y: result.y, z: result.z });
    }

    if (isMain && stats) {
      if (result.destroyed && stats.leechOnKill > 0) {
        bus.emit('player-leech', { amount: hitDamage * stats.leechOnKill });
      }
      if (stats.ionChance > 0 && b.splash <= 0 && Math.random() < stats.ionChance) {
        const bloom = cube.applySplash(point, 1.35, hitDamage * 0.28, now, instanceId);
        for (const c of bloom) if (c.destroyed) bus.emit('beam-hit', { ...c, style: 'bolt' as const });
      }
      const hops = Math.floor(stats.chainJumpsAdd);
      if (hops > 0) {
        const from = this._from.copy(point);
        let ignore = instanceId;
        let chainDmg = hitDamage * 0.55;
        for (let h = 0; h < hops; h++) {
          const next = cube.findNearest(from, 2.35, undefined, ignore);
          if (!next) break;
          const np = cube.getInstanceWorldPos(next.instanceId, this._np);
          const cr = cube.applyDamage(next.instanceId, chainDmg, now);
          this.showBeam(from, np, h % this.beamLines.length, true);
          if (cr) bus.emit('beam-hit', { ...cr, style: 'bolt' as const });
          ignore = next.instanceId;
          from.copy(np);
          chainDmg *= 0.7;
        }
      }
    }
  }

  private deactivateBolt(b: Bolt): void {
    b.active = false;
    b.root.visible = false;
    b.trail.visible = false;
  }

  private muzzleFlash(at: THREE.Vector3, dir: THREE.Vector3): void {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.life = 0.1;
    f.mesh.position.copy(at);
    f.mesh.visible = true;
    // Bigger punchy muzzle bloom
    f.mesh.scale.set(1.4, 1.4, 2.8);
    this._look.copy(at).add(dir);
    f.mesh.lookAt(this._look);
    const mat = f.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    mat.color.setHex(0xffffff);
  }

  private updateFlashes(dt: number): void {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      const t = Math.max(0, f.life / 0.07);
      mat.opacity = t;
      f.mesh.scale.set(1.1 - t * 0.2, 1.1 - t * 0.2, 1.5 + (1 - t) * 2.5);
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
    b.life = COMBAT.beamDuration * 1.15;
    const mat = b.line.material as THREE.LineBasicMaterial;
    mat.opacity = crit ? 0.55 : 0.28;
    mat.color.setHex(crit ? COLORS.magenta : COLORS.cyan);
  }

  private updateBeams(dt: number): void {
    for (const b of this.beamLines) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const mat = b.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, (b.life / (COMBAT.beamDuration * 1.15)) * 0.35);
      if (b.life <= 0) b.line.visible = false;
    }
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    this.streamSlot = 0;
    this.streamCount = 1;
    this.streamCycle = 0;
    this.focusId = -1;
    this.focusStacks = 0;
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
      b.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
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
