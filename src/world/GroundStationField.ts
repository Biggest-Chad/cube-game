/**
 * Four military pads. Each mounts a real SpotLight that searches the cube.
 * Weapons are optional loadout (SAM / plasma / CIWS). CIWS is point defense.
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
  GROUND_SEARCHLIGHT_DECAY,
  GROUND_SEARCHLIGHT_DISTANCE,
  GROUND_SEARCHLIGHT_INTENSITY,
  GROUND_SEARCHLIGHT_PENUMBRA,
  GROUND_SEARCHLIGHT_RETARGET_MAX_SECONDS,
  GROUND_SEARCHLIGHT_RETARGET_MIN_SECONDS,
  GROUND_SEARCHLIGHT_SLEW_MAX,
  GROUND_SEARCHLIGHT_SLEW_MIN,
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
import type { InterceptTarget } from '../drones/DroneAI';

interface Station {
  root: THREE.Group;
  turret: THREE.Group;
  housing: THREE.Group;
  muzzle: THREE.Vector3;
  light: THREE.SpotLight;
  beam: THREE.Mesh;
  lightTarget: THREE.Object3D;
  aim: THREE.Vector3;
  aimGoal: THREE.Vector3;
  retargetIn: number;
  slew: number;
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
  interceptId: string | null;
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
  private interceptHit: ((id: string, dmg: number) => void) | null = null;
  private enemies: Array<{ id: string; position: THREE.Vector3; radius: number }> = [];
  private intercepts: InterceptTarget[] = [];
  private readonly beamGeo = new THREE.CylinderGeometry(0.06, 1, 1, 12, 1, true);

  constructor() {
    this.group.name = 'GroundStations';
    this.beamGeo.rotateX(Math.PI / 2);
    this.buildPads();
    this.buildPools();
  }

  bind(cube: CubeManager): void {
    this.cube = cube;
  }

  setCombat(
    enemies: Array<{ id: string; position: THREE.Vector3; radius: number }>,
    onEnemyHit?: (id: string, dmg: number) => void,
    intercepts?: InterceptTarget[],
    onInterceptHit?: (id: string, dmg: number) => void
  ): void {
    this.enemies = enemies;
    this.enemyHit = onEnemyHit ?? null;
    this.intercepts = intercepts ?? [];
    this.interceptHit = onInterceptHit ?? null;
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
    this.beamGeo.dispose();
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

      const housing = new THREE.Group();
      housing.position.set(-1.15, 3.15, -0.6);
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.18), steel);
      housing.add(yoke);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 10), steel);
      drum.rotation.x = Math.PI / 2;
      drum.position.z = -0.18;
      housing.add(drum);
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshBasicMaterial({
          color: GROUND_SEARCHLIGHT_COLOR,
          transparent: true,
          opacity: 0.95,
        })
      );
      lens.position.z = -0.42;
      housing.add(lens);
      root.add(housing);

      const lightTarget = new THREE.Object3D();
      lightTarget.position.set(0, 2, 0);
      this.group.add(lightTarget);

      const light = new THREE.SpotLight(
        GROUND_SEARCHLIGHT_COLOR,
        GROUND_SEARCHLIGHT_INTENSITY,
        GROUND_SEARCHLIGHT_DISTANCE,
        GROUND_SEARCHLIGHT_ANGLE,
        GROUND_SEARCHLIGHT_PENUMBRA,
        GROUND_SEARCHLIGHT_DECAY
      );
      light.castShadow = false;
      light.target = lightTarget;
      this.group.add(light);

      const beam = new THREE.Mesh(
        this.beamGeo.clone(),
        new THREE.MeshBasicMaterial({
          color: GROUND_SEARCHLIGHT_COLOR,
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      beam.frustumCulled = false;
      this.group.add(beam);

      this.group.add(root);
      this.stations.push({
        root,
        turret,
        housing,
        muzzle: new THREE.Vector3(),
        light,
        beam,
        lightTarget,
        aim: new THREE.Vector3(0, 2, 0),
        aimGoal: new THREE.Vector3(0, 2, 0),
        retargetIn: 0.2 + i * 0.35,
        slew: 1,
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
        interceptId: null,
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
    const he = Math.max(4, this.cube?.halfExtent ?? 6);
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i];
      s.retargetIn -= dt;
      if (s.retargetIn <= 0) {
        this.pickSearchPoint(s.aimGoal, he, i);
        s.retargetIn =
          GROUND_SEARCHLIGHT_RETARGET_MIN_SECONDS +
          Math.random() *
            (GROUND_SEARCHLIGHT_RETARGET_MAX_SECONDS - GROUND_SEARCHLIGHT_RETARGET_MIN_SECONDS);
        s.slew =
          GROUND_SEARCHLIGHT_SLEW_MIN +
          Math.random() * (GROUND_SEARCHLIGHT_SLEW_MAX - GROUND_SEARCHLIGHT_SLEW_MIN);
      }
      const k = 1 - Math.exp(-s.slew * dt);
      s.aim.lerp(s.aimGoal, k);
      s.lightTarget.position.copy(s.aim);

      s.housing.lookAt(s.aim);
      const lampWorld = this._tmp.set(0, 0, -0.42);
      s.housing.localToWorld(lampWorld);
      s.light.position.copy(lampWorld);

      const dist = Math.max(0.8, lampWorld.distanceTo(s.aim));
      const farR = Math.tan(GROUND_SEARCHLIGHT_ANGLE) * dist;
      s.beam.position.copy(lampWorld).lerp(s.aim, 0.5);
      s.beam.lookAt(s.aim);
      s.beam.scale.set(farR, farR, dist);
      const mat = s.beam.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.09 + Math.min(0.08, 4 / dist);
    }
  }

  /** Random point on a cube face (or near-center) so the disc crawls the voxels. */
  private pickSearchPoint(out: THREE.Vector3, he: number, pad: number): void {
    if (Math.random() < 0.72) {
      const face = (Math.floor(Math.random() * 6) + pad) % 6;
      const a = (Math.random() * 2 - 1) * he;
      const b = (Math.random() * 2 - 1) * he;
      const f = he * (0.88 + Math.random() * 0.28);
      if (face === 0) out.set(f, a, b);
      else if (face === 1) out.set(-f, a, b);
      else if (face === 2) out.set(a, f, b);
      else if (face === 3) out.set(a, -f * 0.55, b);
      else if (face === 4) out.set(a, b, f);
      else out.set(a, b, -f);
      return;
    }
    out.set(
      (Math.random() - 0.5) * he * 1.15,
      (Math.random() - 0.35) * he * 1.1,
      (Math.random() - 0.5) * he * 1.15
    );
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
    const inbound = this.pickNearestIntercept(from, 70);
    b.interceptId = null;
    if (inbound) {
      aim.set(inbound.position.x, inbound.position.y, inbound.position.z);
      b.targetId = -4;
      b.interceptId = inbound.id;
    } else if (this.enemies.length > 0 && Math.random() < 0.45) {
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

      if (b.kind === 'ciws' && b.targetId === -4 && this.interceptHit && b.interceptId) {
        const t = this.intercepts.find((x) => x.id === b.interceptId);
        if (t) {
          const dx = b.pos.x - t.position.x;
          const dy = b.pos.y - t.position.y;
          const dz = b.pos.z - t.position.z;
          if (dx * dx + dy * dy + dz * dz <= (t.radius + 0.45) ** 2) {
            this.interceptHit(t.id, b.damage);
            this.killBolt(b);
            continue;
          }
        }
      }
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

  private pickNearestIntercept(from: THREE.Vector3, maxDist: number): InterceptTarget | null {
    let best: InterceptTarget | null = null;
    let bestD = maxDist * maxDist;
    for (const t of this.intercepts) {
      const dx = t.position.x - from.x;
      const dy = t.position.y - from.y;
      const dz = t.position.z - from.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = t;
      }
    }
    return best;
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
