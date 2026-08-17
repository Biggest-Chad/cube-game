/**
 * Four decorative military pads. Searchlights always light the cube.
 * Weapons are optional loadout (SAM / plasma / CIWS).
 */
import * as THREE from 'three';
import {
  ARENA_FLOOR_WORLD_Y,
  GROUND_ARTILLERY_ARC_GRAVITY,
  GROUND_ARTILLERY_LIFE,
  GROUND_ARTILLERY_SPEED,
  GROUND_CIWS_BURST,
  GROUND_CIWS_LIFE,
  GROUND_CIWS_SPEED,
  GROUND_SAM_HOMING,
  GROUND_SAM_LIFE,
  GROUND_SAM_SPEED,
  GROUND_SEARCHLIGHT_ANGLE,
  GROUND_SEARCHLIGHT_COLOR,
  GROUND_SEARCHLIGHT_DISTANCE,
  GROUND_SEARCHLIGHT_INTENSITY,
  GROUND_SEARCHLIGHT_PENUMBRA,
  GROUND_SEARCHLIGHT_SWEEP_RADIANS,
  GROUND_STATION_COUNT,
  GROUND_STATION_PAD_HEIGHT,
  GROUND_STATION_RING_RADIUS,
} from '../data/constraints';
import {
  groundWeaponStats,
  type GroundStationState,
  type GroundWeaponId,
} from '../data/groundStations';
import { NUCLEUS_HIT_ID, type CubeManager } from '../cube/CubeManager';
import { BlockType } from '../cube/BlockTypes';
import { applyToBlock } from '../combat/DamageModel';
import { bus } from '../core/EventBus';
import type { PlayerStats } from '../progression/TechTree';

interface Station {
  root: THREE.Group;
  turret: THREE.Group;
  muzzle: THREE.Vector3;
  light: THREE.SpotLight;
  cone: THREE.Mesh;
  lightTarget: THREE.Object3D;
  weapon: GroundWeaponId | null;
  cooldown: number;
  burstLeft: number;
}

interface Bolt {
  active: boolean;
  kind: GroundWeaponId;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  splash: number;
  targetId: number;
}

const SAM_POOL = 24;
const SHELL_POOL = 10;
const TRACER_POOL = 48;

export class GroundStationField {
  readonly group = new THREE.Group();
  private stations: Station[] = [];
  private cube: CubeManager | null = null;
  private ranks: GroundStationState['ranks'] = { sam: 0, artillery: 0, ciws: 0 };
  private bolts: Bolt[] = [];
  private readonly _aim = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private elapsed = 0;
  private enemyHit: ((id: string, dmg: number) => void) | null = null;
  private enemies: Array<{ id: string; position: THREE.Vector3; radius: number }> = [];

  constructor() {
    this.group.name = 'GroundStations';
    this.buildPads();
    this.buildPools();
  }

  bind(cube: CubeManager): void {
    this.cube = cube;
  }

  setCombat(
    enemies: Array<{ id: string; position: THREE.Vector3; radius: number }>,
    onEnemyHit?: (id: string, dmg: number) => void
  ): void {
    this.enemies = enemies;
    this.enemyHit = onEnemyHit ?? null;
  }

  applyLoadout(state: GroundStationState): void {
    this.ranks = { ...state.ranks };
    for (let i = 0; i < this.stations.length; i++) {
      this.stations[i].weapon = state.slots[i] ?? null;
    }
  }

  update(dt: number, now: number, armed: boolean, stats: PlayerStats): void {
    this.elapsed += dt;
    this.updateSearchlights(dt);
    if (armed && this.cube) this.tryFire(dt, now, stats);
    this.simBolts(dt, now);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else (m as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
    this.stations = [];
  }

  private buildPads(): void {
    const r = GROUND_STATION_RING_RADIUS;
    const corners = [
      [r, r],
      [r, -r],
      [-r, r],
      [-r, -r],
    ];
    const y = ARENA_FLOOR_WORLD_Y + GROUND_STATION_PAD_HEIGHT;
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1a242c,
      metalness: 0.55,
      roughness: 0.4,
      emissive: 0x062018,
      emissiveIntensity: 0.25,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x2a3238,
      metalness: 0.7,
      roughness: 0.32,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x44ffaa,
      emissive: 0x22aa66,
      emissiveIntensity: 0.7,
      metalness: 0.3,
      roughness: 0.35,
    });

    for (let i = 0; i < GROUND_STATION_COUNT; i++) {
      const [x, z] = corners[i];
      const root = new THREE.Group();
      root.position.set(x, y, z);
      root.lookAt(0, y, 0);
      root.rotateY(Math.PI);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.35, 10), padMat);
      pad.position.y = 0.1;
      root.add(pad);
      const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 2.4), steel);
      bunker.position.set(0, 0.75, 0.15);
      root.add(bunker);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6), steel);
      mast.position.set(-1.15, 1.9, -0.6);
      root.add(mast);

      const turret = new THREE.Group();
      turret.position.set(0.2, 1.45, -0.1);
      const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), steel);
      turret.add(cupola);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = -0.85;
      turret.add(barrel);
      root.add(turret);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: GROUND_SEARCHLIGHT_COLOR })
      );
      lamp.position.set(-1.15, 3.15, -0.6);
      root.add(lamp);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 18, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: GROUND_SEARCHLIGHT_COLOR,
          transparent: true,
          opacity: 0.07,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      cone.rotation.x = Math.PI / 2;
      lamp.add(cone);

      const lightTarget = new THREE.Object3D();
      lightTarget.position.set(0, 0, 0);
      this.group.add(lightTarget);

      const light = new THREE.SpotLight(
        GROUND_SEARCHLIGHT_COLOR,
        GROUND_SEARCHLIGHT_INTENSITY,
        GROUND_SEARCHLIGHT_DISTANCE,
        GROUND_SEARCHLIGHT_ANGLE,
        GROUND_SEARCHLIGHT_PENUMBRA,
        1.25
      );
      light.position.copy(root.position).add(new THREE.Vector3(-1.15, 3.15, -0.6));
      light.target = lightTarget;
      this.group.add(light);

      this.group.add(root);
      this.stations.push({
        root,
        turret,
        muzzle: new THREE.Vector3(),
        light,
        cone,
        lightTarget,
        weapon: null,
        cooldown: 0.4 + i * 0.2,
        burstLeft: 0,
      });
    }
  }

  private buildPools(): void {
    const addBolt = (kind: GroundWeaponId, mesh: THREE.Object3D): void => {
      mesh.visible = false;
      this.group.add(mesh);
      this.bolts.push({
        active: false,
        kind,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        splash: 0,
        targetId: -1,
      });
    };
    const samGeo = new THREE.ConeGeometry(0.07, 0.55, 6);
    samGeo.rotateX(Math.PI / 2);
    const samMat = new THREE.MeshBasicMaterial({ color: 0x88ff66 });
    for (let i = 0; i < SAM_POOL; i++) {
      addBolt('sam', new THREE.Mesh(samGeo, samMat));
    }
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xff66cc });
    for (let i = 0; i < SHELL_POOL; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), shellMat));
      addBolt('artillery', g);
    }
    const trMat = new THREE.MeshBasicMaterial({ color: 0xffe080 });
    const trGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 4);
    trGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < TRACER_POOL; i++) {
      addBolt('ciws', new THREE.Mesh(trGeo, trMat));
    }
  }

  private updateSearchlights(dt: number): void {
    void dt;
    const sweep = GROUND_SEARCHLIGHT_SWEEP_RADIANS;
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i];
      const wobble = Math.sin(this.elapsed * 0.35 + i * 1.7) * sweep;
      const wobbleY = Math.cos(this.elapsed * 0.28 + i) * sweep * 0.45;
      s.lightTarget.position.set(
        Math.sin(wobble) * 4,
        wobbleY * 3,
        Math.cos(wobble) * 4
      );
      const lampWorld = this._tmp.set(-1.15, 3.15, -0.6);
      s.root.localToWorld(lampWorld);
      s.light.position.copy(lampWorld);
      s.cone.position.set(0, 0, 0);
      const localT = s.cone.parent
        ? s.cone.parent.worldToLocal(this._aim.copy(s.lightTarget.position))
        : s.lightTarget.position;
      s.cone.lookAt(localT);
    }
  }

  private tryFire(dt: number, now: number, stats: PlayerStats): void {
    if (!this.cube) return;
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i];
      if (!s.weapon) continue;
      const st = groundWeaponStats(s.weapon, this.ranks[s.weapon] ?? 0);
      const dmg = st.damage * stats.droneDamageMul;
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.turret.lookAt(0, 1.2, 0);

      if (s.weapon === 'ciws') {
        if (s.burstLeft > 0) {
          if (s.cooldown > 0) continue;
          this.fireCiws(s, dmg, st.spread, now);
          s.burstLeft -= 1;
          s.cooldown = 1 / Math.max(4, st.fireRate);
          if (s.burstLeft <= 0) s.cooldown = 0.55;
          continue;
        }
        if (s.cooldown > 0) continue;
        s.burstLeft = GROUND_CIWS_BURST;
        s.cooldown = 0;
        continue;
      }

      if (s.cooldown > 0) continue;
      s.cooldown = 1 / Math.max(0.08, st.fireRate);
      if (s.weapon === 'sam') this.fireSam(s, dmg, st.swarm, st.splash, now);
      else this.fireArtillery(s, dmg, st.splash);
    }
  }

  private muzzleWorld(s: Station, out: THREE.Vector3): THREE.Vector3 {
    out.set(0.2, 1.45, -1.5);
    s.root.localToWorld(out);
    return out;
  }

  private fireSam(s: Station, damage: number, swarm: number, splash: number, now: number): void {
    if (!this.cube) return;
    const from = this.muzzleWorld(s, this._tmp);
    const used = new Set<number>();
    for (let k = 0; k < swarm; k++) {
      const b = this.nextBolt('sam');
      if (!b) break;
      let tid = -1;
      const peel = this.cube.findPeelTarget(from, 90, {
        seed: (now * 10 + k * 97 + s.root.id) | 0,
        allowNucleus: true,
      });
      if (peel && !used.has(peel.instanceId)) {
        tid = peel.instanceId;
        used.add(tid);
      } else {
        const n = this.cube.findNearest(from, 90);
        tid = n?.instanceId ?? NUCLEUS_HIT_ID;
      }
      b.active = true;
      b.mesh.visible = true;
      b.pos.copy(from).add(this._aim.set((k - swarm * 0.5) * 0.25, 0.15 * k, 0));
      this.cube.getBlockWorldPos(tid, this._aim);
      b.vel.copy(this._aim).sub(b.pos).normalize().multiplyScalar(GROUND_SAM_SPEED);
      b.vel.y += 6;
      b.life = GROUND_SAM_LIFE;
      b.damage = damage;
      b.splash = splash;
      b.targetId = tid;
      b.mesh.position.copy(b.pos);
    }
    bus.emit('weapon-fire', { family: 'missile', slot: -2 });
  }

  private fireArtillery(s: Station, damage: number, splash: number): void {
    if (!this.cube) return;
    const b = this.nextBolt('artillery');
    if (!b) return;
    const from = this.muzzleWorld(s, this._tmp);
    const peel = this.cube.findPeelTarget(from, 110, { allowNucleus: true, seed: (this.elapsed * 20) | 0 });
    const tid = peel?.instanceId ?? NUCLEUS_HIT_ID;
    this.cube.getBlockWorldPos(tid, this._aim);
    const g = GROUND_ARTILLERY_ARC_GRAVITY;
    const to = this._aim;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    const horiz = Math.hypot(dx, dz) || 0.01;
    const t = Math.max(0.55, horiz / GROUND_ARTILLERY_SPEED);
    b.active = true;
    b.mesh.visible = true;
    b.pos.copy(from);
    b.vel.set(dx / t, dy / t + 0.5 * g * t, dz / t);
    b.life = GROUND_ARTILLERY_LIFE;
    b.damage = damage;
    b.splash = splash;
    b.targetId = tid;
    b.mesh.position.copy(b.pos);
    bus.emit('weapon-fire', { family: 'rocket', slot: -2 });
  }

  private fireCiws(s: Station, damage: number, spread: number, now: number): void {
    if (!this.cube) return;
    const b = this.nextBolt('ciws');
    if (!b) return;
    const from = this.muzzleWorld(s, this._tmp);
    let aim = this._aim.set(0, 0, 0);
    if (this.enemies.length > 0 && Math.random() < 0.35) {
      const e = this.enemies[(now * 7) % this.enemies.length | 0];
      aim.copy(e.position);
      b.targetId = -3;
    } else {
      const peel = this.cube.findPeelTarget(from, 85, { allowNucleus: true });
      const tid = peel?.instanceId ?? NUCLEUS_HIT_ID;
      this.cube.getBlockWorldPos(tid, aim);
      b.targetId = tid;
    }
    aim.sub(from).normalize();
    aim.x += (Math.random() - 0.5) * spread;
    aim.y += (Math.random() - 0.5) * spread * 0.7;
    aim.z += (Math.random() - 0.5) * spread;
    aim.normalize();
    b.active = true;
    b.mesh.visible = true;
    b.pos.copy(from);
    b.vel.copy(aim).multiplyScalar(GROUND_CIWS_SPEED);
    b.life = GROUND_CIWS_LIFE;
    b.damage = damage;
    b.splash = 0;
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(b.pos.clone().add(b.vel));
  }

  private simBolts(dt: number, now: number): void {
    if (!this.cube) return;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      const prev = this._tmp.copy(b.pos);
      if (b.kind === 'artillery') b.vel.y -= GROUND_ARTILLERY_ARC_GRAVITY * dt;
      if (b.kind === 'sam') {
        if (!this.cube.hasInstance(b.targetId)) {
          const n = this.cube.findNearest(b.pos, 80);
          b.targetId = n?.instanceId ?? (this.cube.nucleus.isActive ? NUCLEUS_HIT_ID : -1);
        }
        if (this.cube.hasInstance(b.targetId)) {
          this.cube.getBlockWorldPos(b.targetId, this._aim);
          this._aim.sub(b.pos).normalize();
          b.vel.normalize().lerp(this._aim, Math.min(1, GROUND_SAM_HOMING * dt)).normalize();
          b.vel.multiplyScalar(GROUND_SAM_SPEED);
        }
      }
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.kind !== 'artillery') b.mesh.lookAt(b.pos.clone().add(b.vel));

      if (b.kind === 'ciws' && b.targetId === -3 && this.enemyHit) {
        for (const e of this.enemies) {
          if (b.pos.distanceToSquared(e.position) <= (e.radius + 0.4) ** 2) {
            this.enemyHit(e.id, b.damage);
            this.killBolt(b);
            break;
          }
        }
        if (!b.active) continue;
      }

      const move = this._aim.copy(b.pos).sub(prev);
      const dist = move.length();
      if (dist > 1e-5) {
        const hit = this.cube.raycast(prev, move.normalize(), dist + 0.45, -1, 0.52);
        if (hit) {
          this.impact(b, hit.instanceId, hit.point, now);
          continue;
        }
      }
      if (b.life <= 0 || b.pos.y < ARENA_FLOOR_WORLD_Y - 2) this.killBolt(b);
    }
  }

  private impact(b: Bolt, instanceId: number, point: THREE.Vector3, now: number): void {
    if (!this.cube) {
      this.killBolt(b);
      return;
    }
    const type = this.cube.getBlockType(instanceId);
    const applied = applyToBlock(
      { raw: b.damage, armorPierce: b.kind === 'artillery' ? 0.2 : 0.05, critChance: 0, critMult: 1 },
      type
    );
    const result = this.cube.applyDamage(instanceId, applied.finalDamage, now);
    if (result) bus.emit('beam-hit', { ...result, style: b.kind === 'artillery' ? 'explosive' : 'bolt' });
    if (b.splash > 0) {
      this.cube.applySplash(point, b.splash, b.damage * 0.35, now, instanceId);
    }
    this.killBolt(b);
  }

  private nextBolt(kind: GroundWeaponId): Bolt | null {
    for (const b of this.bolts) {
      if (!b.active && b.kind === kind) return b;
    }
    return null;
  }

  private killBolt(b: Bolt): void {
    b.active = false;
    b.mesh.visible = false;
  }
}
