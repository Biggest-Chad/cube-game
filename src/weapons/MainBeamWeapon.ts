/**
 * Pulse / main beam — elongated plasma lances (not upright capsules).
 * Bolts travel nose-first with multi-layer glow core + ribbon trail.
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
  private stats: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3(0, 0, 1);
  private readonly _q = new THREE.Quaternion();

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

    for (let i = 0; i < PERF.maxProjectiles; i++) {
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
    const baseDmg = this.stats.damage * (isMain ? ctx.playerStats.damageMul : 1);
    const critChance = this.stats.critChance + (isMain ? ctx.playerStats.critChance : 0);
    const splash = this.stats.splashRadius + (isMain ? ctx.playerStats.splashAdd : 0);
    // Main gun: ignore random spread for reliability (only gentle multi-shot fan)
    const spreadExtra = isMain
      ? 0
      : (this.stats.spread ?? 0) + (ctx.playerStats.spreadAdd ?? 0);
    const pen =
      (this.stats.penetration ?? 0) +
      (isMain ? Math.floor(ctx.playerStats.penetrationAdd ?? 0) : 0);
    const armorPierce =
      this.stats.armorPierce + (isMain ? ctx.playerStats.armorPierceAdd ?? 0 : 0);

    // Primary direction: exact aim (to locked target if provided)
    const primaryDir = ctx.direction.clone().normalize();
    if (isMain && ctx.aimTarget) {
      primaryDir.copy(ctx.aimTarget).sub(ctx.origin).normalize();
    }

    for (let s = 0; s < shots; s++) {
      let dir: THREE.Vector3;
      if (isMain && s === 0) {
        // First bolt is laser-true to crosshair / aim target
        dir = primaryDir.clone();
      } else {
        // Extra multi-shot bolts: small fixed fan only (no random jitter on main)
        const fan = (s - (shots - 1) / 2) * (isMain ? 0.018 : 0.028);
        const jitter = !isMain && spreadExtra > 0 ? (Math.random() - 0.5) * spreadExtra * 0.08 : 0;
        const spread = fan + jitter;
        const axis =
          Math.abs(primaryDir.y) < 0.9
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
        dir = primaryDir.clone().applyAxisAngle(axis, spread).normalize();
      }

      const rolled = rollOutgoing({
        raw: baseDmg,
        critChance,
        critMult: this.stats.critMult,
      });
      if (rolled.crit) bus.emit('crit');

      // Spawn slightly past muzzle so mesh never embeds in hull
      const spawn = this.tmp.copy(ctx.origin).addScaledVector(dir, 0.15);
      this.muzzleFlash(spawn, dir);
      this.fireBolt(spawn, dir, rolled.damage, splash, rolled.crit, armorPierce, pen);

      // Preview beam: for primary main shot use aim target / same ray as crosshair
      let end: THREE.Vector3;
      if (isMain && s === 0 && ctx.aimTarget) {
        end = ctx.aimTarget.clone();
      } else {
        const preview = ctx.cube.raycast(spawn, dir, this.stats.range, -1, 0.55);
        end = preview ? preview.point : spawn.clone().addScaledVector(dir, 32);
      }
      this.showBeam(spawn, end, s % this.beamLines.length, rolled.crit);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
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
    penLeft = 0
  ): void {
    const b = this.bolts[this.nextBolt % this.bolts.length];
    this.nextBolt++;
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
    b.root.visible = true;
    b.trail.visible = true;
    // Punchier scale for satisfying plasma lances
    b.root.scale.set(1.35, 1.35, 1.15);

    const coreCol = crit ? 0xffddff : 0xffffff;
    const sheathCol = crit ? COLORS.magenta : COLORS.cyan;
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

  private updateBolts(dt: number, cube: CubeManager, now: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      const prev = this.tmp.copy(b.pos);
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
      posAttr.setXYZ(0, prev.x + back.x, prev.y + back.y, prev.z + back.z);
      posAttr.setXYZ(1, prev.x, prev.y, prev.z);
      posAttr.setXYZ(2, b.pos.x, b.pos.y, b.pos.z);
      posAttr.setXYZ(3, b.pos.x, b.pos.y, b.pos.z);
      posAttr.needsUpdate = true;
      b.trail.geometry.setDrawRange(0, 3);
      b.trail.geometry.computeBoundingSphere();
      (b.trail.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.45 * t;

      const move = this.dir.copy(b.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        // Generous hit volume + lead so fast bolts don't tunnel past blocks
        const hit = cube.raycast(
          prev,
          move.normalize(),
          dist + 0.75,
          b.lastHitId,
          0.58
        );
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
    b.lastHitId = instanceId;
    // Penetration: continue through remaining blocks at reduced damage
    if (b.penLeft > 0) {
      b.penLeft--;
      b.damage *= 0.78;
      b.pos.copy(point).addScaledVector(b.vel.clone().normalize(), 0.55);
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
