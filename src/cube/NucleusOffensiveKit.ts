/**
 * Stage-gated nucleus toys: blob, mines, gravity well, shards, rift, bloom, javelin.
 * Kamikaze drones spawn via EventBus so CubeDefense can reuse EnemyDrone targeting.
 */
import * as THREE from 'three';
import { bus } from '../core/EventBus';
import {
  NUCLEUS_BLOOM_COOLDOWN_SECONDS,
  NUCLEUS_BLOOM_DURATION_SECONDS,
  NUCLEUS_BLOB_COOLDOWN_SECONDS,
  NUCLEUS_BLOB_DAMAGE,
  NUCLEUS_BLOB_HIT_POINTS,
  NUCLEUS_BLOB_LIFE_SECONDS,
  NUCLEUS_BLOB_OVERLOAD_COUNT,
  NUCLEUS_BLOB_OVERLOAD_SPREAD,
  NUCLEUS_BLOB_RADIUS,
  NUCLEUS_BLOB_SPEED,
  NUCLEUS_GRAVITY_COOLDOWN_SECONDS,
  NUCLEUS_GRAVITY_CORE_DAMAGE,
  NUCLEUS_GRAVITY_DURATION_SECONDS,
  NUCLEUS_GRAVITY_YAW_STRENGTH,
  NUCLEUS_JAVELIN_COOLDOWN_SECONDS,
  NUCLEUS_JAVELIN_DAMAGE,
  NUCLEUS_JAVELIN_HIT_POINTS,
  NUCLEUS_JAVELIN_SPEED,
  NUCLEUS_JAVELIN_TELEGRAPH_SECONDS,
  NUCLEUS_KAMIKAZE_BASE_COUNT,
  NUCLEUS_KAMIKAZE_BASE_HIT_POINTS,
  NUCLEUS_KAMIKAZE_DAMAGE,
  NUCLEUS_KAMIKAZE_HIT_POINTS_PER_STAGE,
  NUCLEUS_KAMIKAZE_SPEED,
  NUCLEUS_MINE_BLAST_DAMAGE,
  NUCLEUS_MINE_BLAST_RADIUS,
  NUCLEUS_MINE_COOLDOWN_SECONDS,
  NUCLEUS_MINE_FUSE_SECONDS,
  NUCLEUS_MINE_HIT_POINTS,
  NUCLEUS_MINE_MAX_LIVE,
  NUCLEUS_MINE_PROXIMITY,
  NUCLEUS_MINE_SHRAPNEL_COUNT,
  NUCLEUS_MINE_SHRAPNEL_DAMAGE,
  NUCLEUS_MINE_SHRAPNEL_SPEED,
  NUCLEUS_RIFT_COOLDOWN_SECONDS,
  NUCLEUS_RIFT_DAMAGE_PER_SECOND,
  NUCLEUS_RIFT_FIRE_SECONDS,
  NUCLEUS_RIFT_HIT_RADIUS,
  NUCLEUS_RIFT_TELEGRAPH_SECONDS,
  NUCLEUS_SHARD_COOLDOWN_SECONDS,
  NUCLEUS_SHARD_COUNT,
  NUCLEUS_SHARD_HITS,
  NUCLEUS_SHARD_LIFE_SECONDS,
  NUCLEUS_SHARD_ORBIT_RADIUS,
} from '../data/constraints';
import {
  nucleusKitCooldownScale,
  nucleusKitDamageScale,
  nucleusKitUnlocks,
} from '../data/nucleusAtk';

interface Proj {
  id: string;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  hp: number;
}

interface Mine {
  id: string;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  fuse: number;
  hp: number;
}

interface Shard {
  id: string;
  mesh: THREE.Mesh;
  angle: number;
  hp: number;
  life: number;
}

export class NucleusOffensiveKit {
  readonly group = new THREE.Group();
  private levelId = 1;
  private cd: Record<string, number> = {};
  private blobs: Proj[] = [];
  private mines: Mine[] = [];
  private shrapnel: Proj[] = [];
  private shards: Shard[] = [];
  private javelin: Proj | null = null;
  private javelinTele = 0;
  private javelinDir = new THREE.Vector3(0, 0, 1);
  private wellT = 0;
  private wellMesh: THREE.Mesh;
  private riftT = 0;
  private riftFire = 0;
  private riftDir = new THREE.Vector3(1, 0, 0);
  private riftLine: THREE.Mesh;
  private bloomT = 0;
  private bloomMesh: THREE.Mesh;
  private javLine: THREE.Mesh;
  private idSeq = 0;
  private pendingNudge: { yaw: number; pitch: number } | null = null;
  private overloadPulse = 0;
  private readonly lastOrigin = new THREE.Vector3();
  private readonly lastPlayer = new THREE.Vector3();
  private readonly sph = new THREE.SphereGeometry(1, 12, 10);
  private readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);

  constructor() {
    this.wellMesh = this.glowSphere(0x8866ff, 0);
    this.bloomMesh = this.glowSphere(0xffeecc, 0);
    this.riftLine = this.glowCyl(0x66eeff);
    this.javLine = this.glowCyl(0xffaa44);
    this.group.add(this.wellMesh, this.bloomMesh, this.riftLine, this.javLine);
  }

  startLevel(levelId: number): void {
    this.reset();
    this.levelId = levelId;
    this.cd = {};
  }

  notifyOverload(): void {
    this.overloadPulse = 2.4;
    const u = nucleusKitUnlocks(this.levelId);
    if (u.kamikaze) this.spawnKamikaze();
    if (u.blob) {
      this.fireBlobs(true);
      this.cd.blob = NUCLEUS_BLOB_COOLDOWN_SECONDS * 0.55;
    }
    if (u.latticeJavelin) this.armJavelin();
    else if (u.phaseRift) this.armRift();
    else if (u.mirrorShard) this.spawnShards();
    else if (u.gravityWell) this.armWell();
    else if (u.staticBloom) this.armBloom();
  }

  update(
    dt: number,
    origin: THREE.Vector3,
    player: THREE.Vector3,
    allowFire: boolean,
    onDamage: (n: number) => void
  ): void {
    this.lastOrigin.copy(origin);
    this.lastPlayer.copy(player);
    this.overloadPulse = Math.max(0, this.overloadPulse - dt);
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);

    if (allowFire) this.tryIdleCasts(origin, player);

    this.tickBlobs(dt, player, onDamage);
    this.tickMines(dt, player, onDamage);
    this.tickShrapnel(dt, player, onDamage);
    this.tickShards(dt, origin);
    this.tickWell(dt, origin, player, onDamage);
    this.tickRift(dt, origin, player, onDamage);
    this.tickBloom(dt, origin);
    this.tickJavelin(dt, origin, player, onDamage);
  }

  consumeOrbitNudge(): { yaw: number; pitch: number } | null {
    const n = this.pendingNudge;
    this.pendingNudge = null;
    return n;
  }

  getWeaponTargets(): Array<{ position: THREE.Vector3; radius: number; id: string }> {
    const out: Array<{ position: THREE.Vector3; radius: number; id: string }> = [];
    for (const m of this.mines) {
      out.push({ position: m.pos.clone(), radius: 1.15, id: m.id });
    }
    for (const s of this.shards) {
      out.push({
        position: s.mesh.position.clone(),
        radius: 1.05,
        id: s.id,
      });
    }
    return out;
  }

  getInterceptTargets(): Array<{
    id: string;
    position: { x: number; y: number; z: number };
    radius: number;
  }> {
    const out: Array<{
      id: string;
      position: { x: number; y: number; z: number };
      radius: number;
    }> = [];
    const push = (id: string, p: THREE.Vector3, r: number) => {
      out.push({ id, position: { x: p.x, y: p.y, z: p.z }, radius: r });
    };
    for (const b of this.blobs) push(b.id, b.pos, b.radius);
    for (const s of this.shrapnel) push(s.id, s.pos, 0.55);
    if (this.javelin) push(this.javelin.id, this.javelin.pos, 0.7);
    return out;
  }

  damageEntity(id: string, amount: number): boolean {
    if (id.startsWith('kit_blob_')) return this.hurtProj(this.blobs, id, amount);
    if (id.startsWith('kit_shrap_')) return this.hurtProj(this.shrapnel, id, amount);
    if (id.startsWith('kit_javelin_') && this.javelin) {
      this.javelin.hp -= amount;
      if (this.javelin.hp <= 0) {
        this.disposeProj(this.javelin);
        this.javelin = null;
        return true;
      }
      return false;
    }
    if (id.startsWith('kit_mine_')) {
      const m = this.mines.find((x) => x.id === id);
      if (!m) return false;
      m.hp -= amount;
      if (m.hp <= 0) {
        this.killMine(m, false);
        return true;
      }
      return false;
    }
    if (id.startsWith('kit_shard_')) {
      const s = this.shards.find((x) => x.id === id);
      if (!s) return false;
      s.hp -= amount;
      if (s.hp <= 0) {
        this.killShard(s);
        return true;
      }
      return false;
    }
    return false;
  }

  reset(): void {
    for (const b of this.blobs) this.disposeProj(b);
    for (const s of this.shrapnel) this.disposeProj(s);
    if (this.javelin) this.disposeProj(this.javelin);
    for (const m of this.mines) {
      this.group.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
    }
    for (const s of this.shards) {
      this.group.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    this.blobs = [];
    this.shrapnel = [];
    this.mines = [];
    this.shards = [];
    this.javelin = null;
    this.javelinTele = 0;
    this.wellT = 0;
    this.riftT = 0;
    this.riftFire = 0;
    this.bloomT = 0;
    this.overloadPulse = 0;
    this.pendingNudge = null;
    this.setOp(this.wellMesh, 0);
    this.setOp(this.bloomMesh, 0);
    this.setOp(this.riftLine, 0);
    this.setOp(this.javLine, 0);
  }

  dispose(): void {
    this.reset();
    this.sph.dispose();
    this.cyl.dispose();
    this.group.clear();
  }

  private tryIdleCasts(origin: THREE.Vector3, player: THREE.Vector3): void {
    const u = nucleusKitUnlocks(this.levelId);
    const cd = nucleusKitCooldownScale(this.levelId);
    if (u.blob && this.ready('blob', NUCLEUS_BLOB_COOLDOWN_SECONDS * cd)) {
      this.fireBlobs(this.overloadPulse > 0);
    }
    if (u.mine && this.mines.length < NUCLEUS_MINE_MAX_LIVE) {
      if (this.ready('mine', NUCLEUS_MINE_COOLDOWN_SECONDS * cd)) this.spawnMine(origin);
    }
    if (u.gravityWell && this.ready('well', NUCLEUS_GRAVITY_COOLDOWN_SECONDS * cd)) {
      this.armWell();
    }
    if (u.mirrorShard && this.shards.length === 0) {
      if (this.ready('shard', NUCLEUS_SHARD_COOLDOWN_SECONDS * cd)) this.spawnShards();
    }
    if (u.phaseRift && this.ready('rift', NUCLEUS_RIFT_COOLDOWN_SECONDS * cd)) {
      this.armRift();
    }
    if (u.staticBloom && this.ready('bloom', NUCLEUS_BLOOM_COOLDOWN_SECONDS * cd)) {
      this.armBloom();
    }
    if (u.latticeJavelin && !this.javelin && this.javelinTele <= 0) {
      if (this.ready('jav', NUCLEUS_JAVELIN_COOLDOWN_SECONDS * cd)) this.armJavelin(player, origin);
    }
  }

  private fireBlobs(overload: boolean): void {
    const n = overload ? NUCLEUS_BLOB_OVERLOAD_COUNT : 1;
    const dmg = NUCLEUS_BLOB_DAMAGE * nucleusKitDamageScale(this.levelId);
    const to = this.lastPlayer.clone().sub(this.lastOrigin);
    if (to.lengthSq() < 1e-6) to.set(0, 0, 1);
    else to.normalize();
    bus.emit('core-notify', {
      title: overload ? 'BLOB SPREAD' : 'BLOB SHOT',
      body: overload ? 'Nucleus fans a cluster of plasma blobs.' : 'Slow blob inbound — shoot it down.',
      kind: 'overload',
    });
    const right = new THREE.Vector3().crossVectors(to, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    else right.normalize();
    for (let i = 0; i < n; i++) {
      const yaw = n === 1 ? 0 : (i - (n - 1) / 2) * NUCLEUS_BLOB_OVERLOAD_SPREAD;
      const dir = to.clone().addScaledVector(right, Math.sin(yaw)).addScaledVector(
        new THREE.Vector3(0, 1, 0),
        (Math.random() - 0.5) * 0.1
      );
      this.spawnBlob(dir, dmg);
    }
  }

  private spawnBlob(dir: THREE.Vector3, damage: number): void {
    const mesh = new THREE.Mesh(
      this.sph,
      new THREE.MeshBasicMaterial({
        color: 0x88ffcc,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.scale.setScalar(NUCLEUS_BLOB_RADIUS);
    const p: Proj = {
      id: `kit_blob_${this.idSeq++}`,
      mesh,
      pos: this.lastOrigin.clone().addScaledVector(dir, 1.2),
      vel: dir.clone().normalize().multiplyScalar(NUCLEUS_BLOB_SPEED),
      life: NUCLEUS_BLOB_LIFE_SECONDS,
      damage,
      radius: NUCLEUS_BLOB_RADIUS,
      hp: NUCLEUS_BLOB_HIT_POINTS,
    };
    mesh.position.copy(p.pos);
    this.group.add(mesh);
    this.blobs.push(p);
  }

  private spawnMine(origin: THREE.Vector3): void {
    const ang = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 7;
    const pos = new THREE.Vector3(
      origin.x + Math.cos(ang) * r,
      origin.y + (Math.random() - 0.5) * 6,
      origin.z + Math.sin(ang) * r
    );
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.mines.push({
      id: `kit_mine_${this.idSeq++}`,
      mesh,
      pos,
      fuse: NUCLEUS_MINE_FUSE_SECONDS,
      hp: NUCLEUS_MINE_HIT_POINTS + this.levelId * 0.4,
    });
    bus.emit('core-notify', {
      title: 'DEPTH CHARGE',
      body: 'Floating mine — shoot it or stay clear.',
      kind: 'overload',
    });
  }

  private spawnKamikaze(): void {
    const extra = Math.min(3, Math.floor((this.levelId - 20) / 15));
    const count = NUCLEUS_KAMIKAZE_BASE_COUNT + extra;
    const hp =
      NUCLEUS_KAMIKAZE_BASE_HIT_POINTS +
      Math.max(0, this.levelId - 20) * NUCLEUS_KAMIKAZE_HIT_POINTS_PER_STAGE;
    bus.emit('core-spawn-kamikaze', {
      count,
      hp,
      damage: NUCLEUS_KAMIKAZE_DAMAGE * nucleusKitDamageScale(this.levelId),
      speed: NUCLEUS_KAMIKAZE_SPEED,
    });
    bus.emit('core-notify', {
      title: 'KAMIKAZE DRONES',
      body: 'Seekers inbound — shoot them down.',
      kind: 'overload',
    });
  }

  private spawnShards(): void {
    const n = NUCLEUS_SHARD_COUNT + (this.overloadPulse > 0 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.1, 0.12),
        new THREE.MeshBasicMaterial({
          color: 0xaaddff,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.group.add(mesh);
      this.shards.push({
        id: `kit_shard_${this.idSeq++}`,
        mesh,
        angle: (i / n) * Math.PI * 2,
        hp: NUCLEUS_SHARD_HITS,
        life: NUCLEUS_SHARD_LIFE_SECONDS,
      });
    }
    bus.emit('core-notify', {
      title: 'MIRROR SHARDS',
      body: 'Orbiting plates soak a few bolts — break them.',
      kind: 'overload',
    });
  }

  private armWell(): void {
    this.wellT = NUCLEUS_GRAVITY_DURATION_SECONDS;
    bus.emit('core-notify', {
      title: 'GRAVITY WELL',
      body: 'Orbit tug — fight the pull for a moment.',
      kind: 'overload',
    });
  }

  private armRift(): void {
    this.riftT = NUCLEUS_RIFT_TELEGRAPH_SECONDS;
    this.riftFire = 0;
    bus.emit('core-notify', {
      title: 'PHASE RIFT',
      body: 'Leave the glowing line before it cuts.',
      kind: 'overload',
    });
  }

  private armBloom(): void {
    this.bloomT = NUCLEUS_BLOOM_DURATION_SECONDS;
    bus.emit('core-notify', {
      title: 'STATIC BLOOM',
      body: 'Brief flash — no damage. Keep flying.',
      kind: 'overload',
    });
    bus.emit('nucleus-static-bloom', { duration: NUCLEUS_BLOOM_DURATION_SECONDS });
  }

  private armJavelin(player?: THREE.Vector3, origin?: THREE.Vector3): void {
    this.javelinTele = NUCLEUS_JAVELIN_TELEGRAPH_SECONDS;
    if (player && origin) {
      this.javelinDir.copy(player).sub(origin);
      if (this.javelinDir.lengthSq() < 1e-6) this.javelinDir.set(0, 0, 1);
      else this.javelinDir.normalize();
    }
    bus.emit('core-notify', {
      title: 'LATTICE JAVELIN',
      body: 'High-speed spear charging — step off the line.',
      kind: 'overload',
    });
  }

  private tickBlobs(dt: number, player: THREE.Vector3, onDamage: (n: number) => void): void {
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.pos.distanceTo(player) <= b.radius + 0.55) {
        onDamage(b.damage);
        this.disposeProj(b);
        this.blobs.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || b.pos.length() > 90) {
        this.disposeProj(b);
        this.blobs.splice(i, 1);
      }
    }
  }

  private tickMines(dt: number, player: THREE.Vector3, onDamage: (n: number) => void): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.fuse -= dt;
      m.mesh.rotation.y += dt * 1.6;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(m.fuse * 8) * 0.3;
      const close = m.pos.distanceTo(player) <= NUCLEUS_MINE_PROXIMITY;
      if (close || m.fuse <= 0) {
        this.detonateMine(m, player, onDamage);
        this.killMine(m, true);
      }
    }
  }

  private detonateMine(m: Mine, player: THREE.Vector3, onDamage: (n: number) => void): void {
    const dmg = NUCLEUS_MINE_BLAST_DAMAGE * nucleusKitDamageScale(this.levelId);
    if (m.pos.distanceTo(player) <= NUCLEUS_MINE_BLAST_RADIUS) onDamage(dmg);
    const n = NUCLEUS_MINE_SHRAPNEL_COUNT;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
      const mesh = new THREE.Mesh(
        this.sph,
        new THREE.MeshBasicMaterial({
          color: 0xffaa55,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.scale.setScalar(0.22);
      const p: Proj = {
        id: `kit_shrap_${this.idSeq++}`,
        mesh,
        pos: m.pos.clone(),
        vel: dir.multiplyScalar(NUCLEUS_MINE_SHRAPNEL_SPEED),
        life: 1.6,
        damage: NUCLEUS_MINE_SHRAPNEL_DAMAGE * nucleusKitDamageScale(this.levelId),
        radius: 0.28,
        hp: 8,
      };
      this.group.add(mesh);
      this.shrapnel.push(p);
    }
  }

  private tickShrapnel(dt: number, player: THREE.Vector3, onDamage: (n: number) => void): void {
    for (let i = this.shrapnel.length - 1; i >= 0; i--) {
      const s = this.shrapnel[i];
      s.life -= dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      if (s.pos.distanceTo(player) <= 0.85) {
        onDamage(s.damage);
        this.disposeProj(s);
        this.shrapnel.splice(i, 1);
        continue;
      }
      if (s.life <= 0) {
        this.disposeProj(s);
        this.shrapnel.splice(i, 1);
      }
    }
  }

  private tickShards(dt: number, origin: THREE.Vector3): void {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      s.angle += dt * 0.85;
      s.mesh.position.set(
        origin.x + Math.cos(s.angle) * NUCLEUS_SHARD_ORBIT_RADIUS,
        origin.y + Math.sin(s.angle * 1.4) * 1.2,
        origin.z + Math.sin(s.angle) * NUCLEUS_SHARD_ORBIT_RADIUS
      );
      s.mesh.lookAt(origin);
      if (s.life <= 0) this.killShard(s);
    }
  }

  private tickWell(
    dt: number,
    origin: THREE.Vector3,
    player: THREE.Vector3,
    onDamage: (n: number) => void
  ): void {
    if (this.wellT <= 0) {
      this.setOp(this.wellMesh, 0);
      return;
    }
    this.wellT -= dt;
    this.wellMesh.position.copy(origin);
    this.wellMesh.scale.setScalar(5.5 + Math.sin(this.wellT * 9) * 0.4);
    this.setOp(this.wellMesh, 0.12 + this.wellT * 0.08);
    const to = origin.clone().sub(player);
    const dist = to.length();
    if (dist > 0.2 && dist < 22) {
      to.normalize();
      this.pendingNudge = {
        yaw: to.x * NUCLEUS_GRAVITY_YAW_STRENGTH,
        pitch: to.y * NUCLEUS_GRAVITY_YAW_STRENGTH * 0.45,
      };
      if (dist < 2.4) onDamage(NUCLEUS_GRAVITY_CORE_DAMAGE * dt);
    }
  }

  private tickRift(
    dt: number,
    origin: THREE.Vector3,
    player: THREE.Vector3,
    onDamage: (n: number) => void
  ): void {
    if (this.riftT > 0) {
      this.riftT -= dt;
      this.riftDir.copy(player).sub(origin);
      if (this.riftDir.lengthSq() < 1e-6) this.riftDir.set(1, 0, 0);
      else this.riftDir.normalize();
      this.placeLine(this.riftLine, origin, this.riftDir, 42, 0.05);
      this.setOp(this.riftLine, 0.2 + (1 - this.riftT / NUCLEUS_RIFT_TELEGRAPH_SECONDS) * 0.45);
      if (this.riftT <= 0) this.riftFire = NUCLEUS_RIFT_FIRE_SECONDS;
      return;
    }
    if (this.riftFire > 0) {
      this.riftFire -= dt;
      this.placeLine(this.riftLine, origin, this.riftDir, 42, 0.11);
      this.setOp(this.riftLine, 0.55);
      const off = this.lineDist(origin, this.riftDir, player);
      if (off < NUCLEUS_RIFT_HIT_RADIUS) {
        onDamage(NUCLEUS_RIFT_DAMAGE_PER_SECOND * nucleusKitDamageScale(this.levelId) * dt);
      }
      if (this.riftFire <= 0) this.setOp(this.riftLine, 0);
      return;
    }
    this.setOp(this.riftLine, 0);
  }

  private tickBloom(dt: number, origin: THREE.Vector3): void {
    if (this.bloomT <= 0) {
      this.setOp(this.bloomMesh, 0);
      return;
    }
    this.bloomT -= dt;
    const u = 1 - this.bloomT / NUCLEUS_BLOOM_DURATION_SECONDS;
    this.bloomMesh.position.copy(origin);
    this.bloomMesh.scale.setScalar(4 + u * 18);
    this.setOp(this.bloomMesh, (1 - u) * 0.35);
  }

  private tickJavelin(
    dt: number,
    origin: THREE.Vector3,
    player: THREE.Vector3,
    onDamage: (n: number) => void
  ): void {
    if (this.javelinTele > 0) {
      this.javelinTele -= dt;
      this.javelinDir.copy(player).sub(origin);
      if (this.javelinDir.lengthSq() < 1e-6) this.javelinDir.set(0, 0, 1);
      else this.javelinDir.normalize();
      this.placeLine(this.javLine, origin, this.javelinDir, 40, 0.045);
      this.setOp(this.javLine, 0.22 + (1 - this.javelinTele / NUCLEUS_JAVELIN_TELEGRAPH_SECONDS) * 0.5);
      if (this.javelinTele <= 0) {
        this.setOp(this.javLine, 0);
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 1.6, 6),
          new THREE.MeshBasicMaterial({
            color: 0xffee88,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        mesh.rotation.x = Math.PI / 2;
        const p: Proj = {
          id: `kit_javelin_${this.idSeq++}`,
          mesh,
          pos: origin.clone().addScaledVector(this.javelinDir, 1.2),
          vel: this.javelinDir.clone().multiplyScalar(NUCLEUS_JAVELIN_SPEED),
          life: 3.2,
          damage: NUCLEUS_JAVELIN_DAMAGE * nucleusKitDamageScale(this.levelId),
          radius: 0.55,
          hp: NUCLEUS_JAVELIN_HIT_POINTS,
        };
        this.group.add(mesh);
        this.javelin = p;
      }
      return;
    }
    if (!this.javelin) return;
    const j = this.javelin;
    j.life -= dt;
    j.pos.addScaledVector(j.vel, dt);
    j.mesh.position.copy(j.pos);
    j.mesh.lookAt(j.pos.clone().add(j.vel));
    if (j.pos.distanceTo(player) <= 1.05) {
      onDamage(j.damage);
      this.disposeProj(j);
      this.javelin = null;
      return;
    }
    if (j.life <= 0 || j.pos.length() > 95) {
      this.disposeProj(j);
      this.javelin = null;
    }
  }

  private ready(key: string, cd: number): boolean {
    if ((this.cd[key] ?? 0) > 0) return false;
    this.cd[key] = cd;
    return true;
  }

  private hurtProj(list: Proj[], id: string, amount: number): boolean {
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return false;
    list[i].hp -= amount;
    if (list[i].hp <= 0) {
      this.disposeProj(list[i]);
      list.splice(i, 1);
      return true;
    }
    return false;
  }

  private killMine(m: Mine, _exploded: boolean): void {
    this.group.remove(m.mesh);
    m.mesh.geometry.dispose();
    (m.mesh.material as THREE.Material).dispose();
    this.mines = this.mines.filter((x) => x !== m);
  }

  private killShard(s: Shard): void {
    this.group.remove(s.mesh);
    s.mesh.geometry.dispose();
    (s.mesh.material as THREE.Material).dispose();
    this.shards = this.shards.filter((x) => x !== s);
  }

  private disposeProj(p: Proj): void {
    this.group.remove(p.mesh);
    const geo = p.mesh.geometry;
    if (geo !== this.sph && geo !== this.cyl) geo.dispose();
    (p.mesh.material as THREE.Material).dispose();
  }

  private glowSphere(color: number, opacity: number): THREE.Mesh {
    const m = new THREE.Mesh(
      this.sph,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    m.visible = opacity > 0.02;
    return m;
  }

  private glowCyl(color: number): THREE.Mesh {
    return new THREE.Mesh(
      this.cyl,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
  }

  private placeLine(
    mesh: THREE.Mesh,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    rad: number
  ): void {
    mesh.position.copy(origin).addScaledVector(dir, len * 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.scale.set(rad, len, rad);
    mesh.visible = true;
  }

  private lineDist(origin: THREE.Vector3, dir: THREE.Vector3, p: THREE.Vector3): number {
    const w = p.clone().sub(origin);
    const t = Math.max(0, w.dot(dir));
    const closest = origin.clone().addScaledVector(dir, t);
    return closest.distanceTo(p);
  }

  private setOp(mesh: THREE.Mesh, opacity: number): void {
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    mesh.visible = opacity > 0.02;
  }
}
