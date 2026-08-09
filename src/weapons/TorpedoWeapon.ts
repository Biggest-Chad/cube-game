/**
 * Heavy Torpedo — slow telegraphed charge, huge delayed splash.
 */
import * as THREE from 'three';
import type { WeaponStats } from '../data/weapons';
import type { CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { applyToBlock, rollOutgoing } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';

interface Torpedo {
  active: boolean;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  trail: THREE.Line;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  splash: number;
  crit: boolean;
  armorPierce: number;
  armed: number;
}

const POOL = 6;

export class TorpedoWeapon implements WeaponBehavior {
  readonly family = 'torpedo';
  readonly group = new THREE.Group();
  private cooldown = 0;
  private heat = 0;
  private charge = 0;
  private charging = false;
  private torps: Torpedo[] = [];
  private next = 0;
  private chargeMesh: THREE.Mesh;
  private stats!: WeaponStats & { flags: Set<string> };
  private readonly tmp = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor() {
    this.stats = {
      damage: 220,
      fireRate: 0.28,
      projectileSpeed: 22,
      range: 95,
      splashRadius: 3.6,
      splashFalloff: 0.4,
      armorPierce: 0.55,
      critChance: 0.1,
      critMult: 2,
      heatPerShot: 0.45,
      heatCapacity: 1,
      heatCoolRate: 0.18,
      chargeTime: 0.9,
      projectileCount: 1,
      homing: 0.15,
      burstSize: 0,
      flags: new Set(),
    };

    this.chargeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 14, 14),
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.chargeMesh.visible = false;
    this.group.add(this.chargeMesh);

    const bodyGeo = new THREE.CapsuleGeometry(0.16, 0.85, 5, 12);
    const glowGeo = new THREE.SphereGeometry(0.32, 12, 12);
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff00aa,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      this.group.add(mesh);
      const glow = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff66cc,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.visible = false;
      this.group.add(glow);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: 0xff00aa,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      trail.visible = false;
      this.group.add(trail);
      this.torps.push({
        active: false,
        mesh,
        glow,
        trail,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        splash: 0,
        crit: false,
        armorPierce: 0,
        armed: 0,
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

    if (ctx.firing && this.cooldown <= 0 && this.heat < 0.92) {
      this.charging = true;
      const ct = Math.max(0.25, this.stats.chargeTime);
      this.charge = Math.min(1, this.charge + ctx.dt / ct);
      this.chargeMesh.visible = true;
      this.chargeMesh.position.copy(ctx.origin).addScaledVector(ctx.direction, 0.8);
      const mat = this.chargeMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + this.charge * 0.7;
      this.chargeMesh.scale.setScalar(0.5 + this.charge * 1.2);
      bus.emit('torpedo-telegraph', { charge: this.charge, slot: ctx.slot });

      if (this.charge >= 1) this.launch(ctx);
    } else if (!ctx.firing) {
      if (this.charging && this.charge >= 0.75) this.launch(ctx);
      else {
        this.charge = Math.max(0, this.charge - ctx.dt);
        if (this.charge <= 0) {
          this.charging = false;
          this.chargeMesh.visible = false;
        }
      }
    }
  }

  private launch(ctx: WeaponFireContext): void {
    const power = Math.max(0.75, this.charge);
    this.charge = 0;
    this.charging = false;
    this.chargeMesh.visible = false;
    this.cooldown = 1 / Math.max(0.1, this.stats.fireRate);
    this.heat = Math.min(1, this.heat + this.stats.heatPerShot);

    const rolled = rollOutgoing({
      raw: this.stats.damage * power,
      critChance: this.stats.critChance,
      critMult: this.stats.critMult,
    });

    const count = this.stats.flags.has('cluster_max')
      ? Math.max(3, this.stats.projectileCount)
      : this.stats.projectileCount;

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.07;
      const dir = ctx.direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).normalize();
      const t = this.torps[this.next % POOL];
      this.next++;
      t.active = true;
      t.pos.copy(ctx.origin).addScaledVector(dir, 1.0);
      t.vel.copy(dir).multiplyScalar(this.stats.projectileSpeed);
      t.life = 5;
      t.armed = 0.35;
      t.damage = rolled.damage / Math.sqrt(count);
      t.splash = this.stats.splashRadius;
      t.crit = rolled.crit;
      t.armorPierce = this.stats.armorPierce;
      t.mesh.visible = true;
      t.glow.visible = true;
      t.trail.visible = true;
      t.mesh.position.copy(t.pos);
      t.glow.position.copy(t.pos);
    }

    bus.emit('weapon-fire', { family: this.family, slot: ctx.slot });
  }

  private sim(dt: number, cube: CubeManager, now: number): void {
    const homing =
      this.stats.homing +
      (this.stats.flags.has('mag_lock') ? 0.4 : this.stats.flags.has('mag_seek') ? 0.2 : 0);

    for (const t of this.torps) {
      if (!t.active) continue;
      t.life -= dt;
      t.armed = Math.max(0, t.armed - dt);

      if (homing > 0) {
        const prefer = (bt: BlockType): number =>
          bt === BlockType.Core ? 50 : bt === BlockType.Reinforced ? 10 : 2;
        const n = cube.findNearest(t.pos, 40, prefer);
        if (n) {
          // Home to solid nucleus center when locked on core voxels
          if (
            cube.nucleus.isActive &&
            cube.getBlockType(n.instanceId) === BlockType.Core
          ) {
            cube.nucleus.getWorldCenter(this.desired);
          } else {
            cube.getBlockWorldPos(n.instanceId, this.desired);
          }
          this.desired.sub(t.pos).normalize();
          t.vel
            .normalize()
            .lerp(this.desired, Math.min(1, homing * 2.2 * dt))
            .normalize()
            .multiplyScalar(this.stats.projectileSpeed);
        }
      }

      const prev = this.tmp.copy(t.pos);
      t.pos.addScaledVector(t.vel, dt);
      t.mesh.position.copy(t.pos);
      t.glow.position.copy(t.pos);
      t.mesh.lookAt(t.pos.clone().add(t.vel));
      t.glow.scale.setScalar(1 + Math.sin(now * 10) * 0.15);

      const attr = t.trail.geometry.attributes.position as THREE.BufferAttribute;
      attr.setXYZ(0, prev.x, prev.y, prev.z);
      attr.setXYZ(1, t.pos.x, t.pos.y, t.pos.z);
      attr.needsUpdate = true;
      t.trail.geometry.computeBoundingSphere();

      // Always solid-collide (including during arm window) so torps never tunnel
      if (cube.nucleus.isActive && cube.nucleus.containsPoint(t.pos)) {
        const coreId = cube.findCoreInstanceId();
        if (coreId >= 0) {
          this.detonate(t, cube, t.pos.clone(), coreId, now);
          continue;
        }
      }

      const move = this.move.copy(t.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = cube.raycast(prev, move.normalize(), dist + 0.75);
        if (hit) {
          this.detonate(t, cube, hit.point, hit.instanceId, now);
          continue;
        }
      }
      if (t.life <= 0) this.detonate(t, cube, t.pos.clone(), -1, now);
    }
  }

  private detonate(
    t: Torpedo,
    cube: CubeManager,
    point: THREE.Vector3,
    instanceId: number,
    now: number
  ): void {
    if (!t.active) return;
    // Pre-arm impact still detonates but at reduced warhead yield (safety fuse)
    const yieldMul = t.armed > 0 ? 0.45 : 1;
    if (instanceId >= 0) {
      const type = cube.getBlockType(instanceId);
      const applied = applyToBlock(
        {
          raw: t.damage * yieldMul,
          armorPierce: t.armorPierce,
          forceCrit: t.crit,
          critChance: 0,
          critMult: 1,
        },
        type
      );
      const r = cube.applyDamage(instanceId, applied.finalDamage, now);
      if (r) {
        r.x = point.x;
        r.y = point.y;
        r.z = point.z;
        bus.emit('beam-hit', { ...r, crit: t.crit });
      }
    }
    const splashHits = cube.applySplash(
      point,
      t.splash,
      t.damage * 0.55 * yieldMul,
      now,
      instanceId
    );
    for (const h of splashHits) bus.emit('beam-hit', h);

    bus.emit('explosion', {
      x: point.x,
      y: point.y,
      z: point.z,
      radius: t.splash,
      family: 'torpedo',
    });
    bus.emit('torpedo-detonate', { x: point.x, y: point.y, z: point.z });

    t.active = false;
    t.mesh.visible = false;
    t.glow.visible = false;
    t.trail.visible = false;
  }

  getHeat(): number {
    return this.heat;
  }

  getCharge(): number {
    return this.charge;
  }

  reset(): void {
    this.cooldown = 0;
    this.heat = 0;
    this.charge = 0;
    this.charging = false;
    this.chargeMesh.visible = false;
    for (const t of this.torps) {
      t.active = false;
      t.mesh.visible = false;
      t.glow.visible = false;
      t.trail.visible = false;
    }
  }

  dispose(): void {
    this.chargeMesh.geometry.dispose();
    (this.chargeMesh.material as THREE.Material).dispose();
    for (const t of this.torps) {
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      t.glow.geometry.dispose();
      (t.glow.material as THREE.Material).dispose();
      t.trail.geometry.dispose();
      (t.trail.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
