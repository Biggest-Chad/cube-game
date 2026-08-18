/**
 * Four military pads. Weapons are optional loadout (SAM / plasma / CIWS).
 * Searchlights were removed — they fought the cube lighting budget.
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
  weapon: GroundWeaponId | null;
  cooldown: number;
  burstLeft: number;
}

interface LivingLight {
  mesh: THREE.Mesh;
  baseOpacity: number;
  baseScale: number;
  speed: number;
  phase: number;
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
  trail: THREE.Line | null;
  trailPts: Float32Array | null;
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
  private livingLights: LivingLight[] = [];
  private enemyHit: ((id: string, dmg: number) => void) | null = null;
  private interceptHit: ((id: string, dmg: number) => void) | null = null;
  private enemies: Array<{ id: string; position: THREE.Vector3; radius: number }> = [];
  private intercepts: InterceptTarget[] = [];

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
    this.pulseLivingLights();
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
    this.livingLights = [];
  }

  private addLivingLight(
    parent: THREE.Object3D,
    mesh: THREE.Mesh,
    speed: number,
    phase: number,
    baseOpacity: number
  ): void {
    parent.add(mesh);
    this.livingLights.push({
      mesh,
      baseOpacity,
      baseScale: 1,
      speed,
      phase,
    });
  }

  private pulseLivingLights(): void {
    const t = this.elapsed;
    for (const L of this.livingLights) {
      const pulse = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * L.speed + L.phase));
      const mat = L.mesh.material;
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.opacity = L.baseOpacity * pulse;
      }
      const s = 0.82 + 0.28 * pulse;
      L.mesh.scale.setScalar(s);
    }
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
    // Unlit pads — city + cube keep the lighting budget. Additive beads read as activity.
    const deck = new THREE.MeshBasicMaterial({ color: 0x151c22 });
    const steel = new THREE.MeshBasicMaterial({ color: 0x2a333b });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0c1014 });
    const stripe = new THREE.MeshBasicMaterial({ color: 0x3a4a44 });
    const accent = new THREE.MeshBasicMaterial({ color: 0x3de8a0 });
    const glow = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });

    for (let i = 0; i < GROUND_STATION_COUNT; i++) {
      const [x, z] = corners[i];
      const root = new THREE.Group();
      root.position.set(x, y, z);
      root.lookAt(0, y, 0);
      root.rotateY(Math.PI);

      const apron = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.95, 0.18, 12), dark);
      apron.position.y = 0.02;
      root.add(apron);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.85, 4.15, 0.28, 12), deck);
      pad.position.y = 0.16;
      root.add(pad);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(4.05, 0.07, 6, 16), steel);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = 0.3;
      root.add(lip);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.12, 10), stripe);
      inner.position.y = 0.32;
      root.add(inner);

      for (let k = 0; k < 4; k++) {
        const chev = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 1.15), accent);
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        chev.position.set(Math.cos(a) * 2.55, 0.34, Math.sin(a) * 2.55);
        chev.rotation.y = -a;
        root.add(chev);
      }

      const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.25, 2.75), steel);
      bunker.position.set(0, 0.88, 0.2);
      root.add(bunker);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.16, 0.55), dark);
      brow.position.set(0, 1.55, -1.05);
      root.add(brow);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.08), glow(0x44ffaa, 0.7));
      slit.position.set(0, 1.28, -1.18);
      this.addLivingLight(root, slit, 2.4, i * 0.7, 0.7);

      for (const side of [-1, 1]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), dark);
        crate.position.set(side * 2.15, 0.55, 1.35);
        root.add(crate);
        const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.42), steel);
        crate2.position.set(side * 2.15, 1.0, 1.35);
        root.add(crate2);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.8), steel);
        rail.position.set(side * 3.15, 0.62, 0.15);
        root.add(rail);
      }

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 3.05, 8), steel);
      mast.position.set(-1.45, 2.2, -0.72);
      root.add(mast);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, 1.2), dark);
      dish.position.set(-1.45, 3.72, -0.55);
      dish.rotation.x = 0.7;
      root.add(dish);
      const dishCore = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), glow(0x66eeff, 0.85));
      dishCore.position.set(-1.45, 3.78, -0.42);
      this.addLivingLight(root, dishCore, 5.2, i * 1.3, 0.85);

      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.55), dark);
      vent.position.set(1.35, 1.65, 0.85);
      root.add(vent);
      for (let v = 0; v < 3; v++) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), steel);
        stack.position.set(1.15 + v * 0.2, 2.05, 0.85);
        root.add(stack);
      }

      const turret = new THREE.Group();
      turret.position.set(0.25, 1.62, -0.15);
      const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), steel);
      turret.add(cupola);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.22, 10), dark);
      collar.position.y = 0.42;
      turret.add(collar);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.65, 8), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = -0.95;
      turret.add(barrel);
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8), steel);
      brake.rotation.x = Math.PI / 2;
      brake.position.z = -1.62;
      turret.add(brake);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glow(0xff8844, 0.9));
      led.position.set(0.28, 0.22, 0.35);
      this.addLivingLight(turret, led, 7.5, i * 2.1, 0.9);
      root.add(turret);

      const housing = new THREE.Group();
      housing.position.set(-1.45, 3.55, -0.72);
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.48, 0.2), steel);
      housing.add(yoke);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.62, 10), steel);
      drum.rotation.x = Math.PI / 2;
      drum.position.z = -0.2;
      housing.add(drum);
      root.add(housing);

      // Perimeter beads — cheap "alive" running lights, not SpotLights
      for (let b = 0; b < 8; b++) {
        const a = (b / 8) * Math.PI * 2;
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 6, 6),
          glow(b % 2 === 0 ? 0x44ffaa : 0x66d8ff, 0.75)
        );
        bead.position.set(Math.cos(a) * 4.15, 0.38, Math.sin(a) * 4.15);
        this.addLivingLight(root, bead, 3.1 + (b % 3) * 0.4, i + b * 0.55, 0.75);
      }

      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glow(0xfff2c0, 0.8));
      strobe.position.set(1.55, 2.15, -0.85);
      this.addLivingLight(root, strobe, 9.5, i * 0.4, 0.8);

      this.group.add(root);
      this.stations.push({
        root,
        turret,
        housing,
        muzzle: new THREE.Vector3(),
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
        trail: null,
        trailPts: null,
      });
    };
    const samBody = new THREE.Group();
    const samCone = new THREE.ConeGeometry(0.11, 0.72, 7);
    samCone.rotateX(Math.PI / 2);
    samBody.add(
      new THREE.Mesh(
        samCone,
        new THREE.MeshBasicMaterial({ color: 0xb8ff88, toneMapped: false })
      )
    );
    const samGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x66ff44,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    samGlow.position.z = 0.22;
    samBody.add(samGlow);
    for (let i = 0; i < SAM_POOL; i++) {
      const g = i === 0 ? samBody : samBody.clone();
      addBolt('sam', g);
      const pts = new Float32Array(12 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0x88ff55,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      const bolt = this.bolts[this.bolts.length - 1];
      bolt.trail = line;
      bolt.trailPts = pts;
    }
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xff66cc,
      toneMapped: false,
    });
    const shellHalo = new THREE.MeshBasicMaterial({
      color: 0xff99ee,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < SHELL_POOL; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), shellMat));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 10), shellHalo));
      addBolt('artillery', g);
    }
    const trMat = new THREE.MeshBasicMaterial({
      color: 0xffe080,
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trGeo = new THREE.CylinderGeometry(0.045, 0.02, 1.15, 5);
    trGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < TRACER_POOL; i++) {
      addBolt('ciws', new THREE.Mesh(trGeo, trMat));
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
    out.set(0.25, 1.62, -1.75);
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
      if (b.trail && b.trailPts) {
        for (let t = 0; t < 12; t++) {
          b.trailPts[t * 3] = b.pos.x;
          b.trailPts[t * 3 + 1] = b.pos.y;
          b.trailPts[t * 3 + 2] = b.pos.z;
        }
        (b.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        b.trail.visible = true;
      }
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
    this._aim.copy(b.pos).add(b.vel);
    b.mesh.lookAt(this._aim);
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
      if (b.kind !== 'artillery') {
        this._aim.copy(b.pos).add(b.vel);
        b.mesh.lookAt(this._aim);
      }
      if (b.trail && b.trailPts) {
        for (let t = 11; t > 0; t--) {
          b.trailPts[t * 3] = b.trailPts[(t - 1) * 3];
          b.trailPts[t * 3 + 1] = b.trailPts[(t - 1) * 3 + 1];
          b.trailPts[t * 3 + 2] = b.trailPts[(t - 1) * 3 + 2];
        }
        b.trailPts[0] = b.pos.x;
        b.trailPts[1] = b.pos.y;
        b.trailPts[2] = b.pos.z;
        (b.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

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
    if (b.trail) b.trail.visible = false;
  }
}
