/**
 * Guided Missiles — homing projectiles prioritizing data nodes / cores.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface Missile {
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
  targetId: number;
}

const POOL = 20;

export class MissileWeapon implements WeaponBehavior {
  readonly family = 'missile';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private missiles: Missile[] = [];
  private next = 0;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: 48,
      fireRate: 0.85,
      projectileSpeed: 38,
      range: 100,
      splashRadius: 1.1,
      splashFalloff: 0.5,
      armorPierce: 0.15,
      critChance: 0.08,
      critMult: 2,
      heatPerShot: 0.18,
      heatCapacity: 1,
      heatCoolRate: 0.25,
      chargeTime: 0,
      projectileCount: 1,
      homing: 0.65,
      burstSize: 2,
      flags: new Set(),
    };

    const geo = new THREE.CapsuleGeometry(0.07, 0.4, 3, 6);
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xaa66ff,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      this.group.add(mesh);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: 0xcc88ff,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      trail.visible = false;
      this.group.add(trail);
      this.missiles.push({
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
        targetId: -1,
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

    this.cooldown = 1 / Math.max(0.15, this.stats.fireRate);
    const rolled = rollOutgoing({
      raw: this.stats.damage,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    for (let i = 0; i < this.stats.projectileCount; i++) {
      const spread = (i - (this.stats.projectileCount - 1) / 2) * 0.08;
      const axis = new THREE.Vector3(0, 1, 0);
      const dir = ctx.direction.clone().applyAxisAngle(axis, spread).normalize();
      const target = this.pickTarget(ctx.cube, ctx.origin);
      this.spawn(ctx.origin, dir, rolled.damage, rolled.crit, target);
    }

    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);
    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private pickTarget(cube: CubeManager, from: THREE.Vector3): number {
    const prefer = (t: BlockType): number => {
      if (t === BlockType.Core) return this.stats.flags.has('hunter_core') ? 40 : 20;
      if (t === BlockType.DataNode) return 18;
      if (t === BlockType.Reinforced) return 6;
      return 3;
    };
    const n = cube.findNearest(from, this.stats.range, prefer);
    return n?.instanceId ?? -1;
  }

  private spawn(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    crit: boolean,
    targetId: number
  ): void {
    const m = this.missiles[this.next % POOL];
    this.next++;
    m.active = true;
    m.pos.copy(from).addScaledVector(dir, 0.7);
    m.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
    m.life = 3.5;
    m.damage = damage;
    m.splash = this.stats.splashRadius;
    m.crit = crit;
    m.armorPierce = this.stats.armorPierce;
    m.targetId = targetId;
    m.mesh.visible = true;
    m.trail.visible = true;
    m.mesh.position.copy(m.pos);
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    const turn = this.stats.homing * 4.5;
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.life -= dt;

      // Retarget if lost
      if (m.targetId < 0 || cube.getBlockType(m.targetId) === BlockType.Empty) {
        m.targetId = this.pickTarget(cube, m.pos);
      }
      if (m.targetId >= 0) {
        cube.getBlockWorldPos(m.targetId, this.desired);
        this.desired.sub(m.pos).normalize();
        m.vel.normalize().lerp(this.desired, Math.min(1, turn * dt)).normalize();
        m.vel.multiplyScalar(this.stats.projectileSpeed);
      }

      const prev = this.tmp.copy(m.pos);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.lookAt(m.pos.clone().add(m.vel));

      const attr = m.trail.geometry.attributes.position as THREE.BufferAttribute;
      attr.setXYZ(0, prev.x, prev.y, prev.z);
      attr.setXYZ(1, m.pos.x, m.pos.y, m.pos.z);
      attr.needsUpdate = true;
      m.trail.geometry.computeBoundingSphere();

      const move = this.move.copy(m.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.45);
        if (hit) {
          this.impact(m, cube, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (m.life <= 0 || m.pos.length() > 200) this.kill(m);
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
      raw *= 1.25;
    }
    const applied = applyToBlock(
      { raw, armorPierce: m.armorPierce, forceCrit: m.crit, critChance: 0, critMult: 1 },
      type
    );
    const result = cube.applyDamage(instanceId, applied.finalDamage, now);
    this.kill(m);
    if (result) {
      result.x = point.x;
      result.y = point.y;
      result.z = point.z;
      bus.emit('beam-hit', { ...result, crit: m.crit });
    }
    if (m.splash > 0) {
      for (const h of cube.applySplash(point, m.splash, m.damage * 0.3, now)) {
        bus.emit('beam-hit', h);
      }
    }
  }

  private kill(m: Missile): void {
    m.active = false;
    m.mesh.visible = false;
    m.trail.visible = false;
  }

  getHeat(): number {
    return this.heat;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    for (const m of this.missiles) this.kill(m);
  }

  dispose(): void {
    for (const m of this.missiles) {
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
      m.trail.geometry.dispose();
      (m.trail.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
