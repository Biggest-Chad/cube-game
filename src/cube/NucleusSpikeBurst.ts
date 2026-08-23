/**
 * Standard-nucleus overload: telegraph, then fire spikes in all directions.
 * One spike is always locked on the ship so the player must leave the line.
 */
import * as THREE from 'three';
import { CORE } from '../data/core';
import { bus } from '../core/EventBus';
import type { SpikeBurstProfile } from '../data/nucleusAtk';
import { spikeBurstProfileForStage } from '../data/nucleusAtk';

export type SpikeBurstPhase = 'idle' | 'telegraph' | 'fire';

interface Spike {
  active: boolean;
  aimed: boolean;
  airBurst: boolean;
  burstAt: number;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  hp: number;
}

const MAX_SPIKES = 96;
const LINE_LEN = 36;
const _fwd = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class NucleusSpikeBurst {
  readonly group = new THREE.Group();
  private phase: SpikeBurstPhase = 'idle';
  private timer = 0;
  private readonly origin = new THREE.Vector3();
  private readonly dirs: THREE.Vector3[] = [];
  private dirCount = 0;
  private aimedIndex = 0;
  private shockHit = false;
  private profile: SpikeBurstProfile = spikeBurstProfileForStage(1);
  private wavesLeft = 0;
  private waveTimer = 0;
  private nextSpikeSlot = 0;

  private readonly spikes: Spike[] = [];
  private readonly lines: THREE.Mesh[] = [];
  private warnSphere: THREE.Mesh;
  private shockMesh: THREE.Mesh;
  private corona: THREE.Mesh;
  private readonly spikeGeo: THREE.BufferGeometry;
  private readonly lineGeo: THREE.BufferGeometry;
  private readonly sphGeo = new THREE.SphereGeometry(1, 18, 12);

  constructor() {
    this.spikeGeo = new THREE.ConeGeometry(0.16, 1.28, 6, 1);
    this.spikeGeo.rotateX(Math.PI / 2);
    this.lineGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);

    for (let i = 0; i < MAX_SPIKES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcc88,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.spikeGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.spikes.push({
        active: false,
        aimed: false,
        airBurst: false,
        burstAt: 0,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        hp: 18,
      });

      const line = new THREE.Mesh(
        this.lineGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff8844,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
      line.visible = false;
      this.lines.push(line);
      this.group.add(line);
      this.dirs.push(new THREE.Vector3(0, 0, 1));
    }

    this.warnSphere = new THREE.Mesh(
      this.sphGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        wireframe: true,
      })
    );
    this.shockMesh = new THREE.Mesh(
      this.sphGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffaa66,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    this.corona = new THREE.Mesh(
      this.sphGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff4408,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.group.add(this.warnSphere, this.shockMesh, this.corona);
    this.group.visible = false;
  }

  get phaseId(): SpikeBurstPhase {
    return this.phase;
  }

  get glow(): number {
    if (this.phase === 'telegraph') {
      return 0.4 + (1 - this.timer / this.profile.telegraphSec) * 0.55;
    }
    if (this.phase === 'fire') return 0.7;
    return 0;
  }

  /** Begin a telegraphed volley. Dirs lock now so the player can step off the line. */
  arm(origin: THREE.Vector3, player: THREE.Vector3, profile: SpikeBurstProfile): boolean {
    if (this.phase === 'telegraph') return false;
    this.profile = profile;
    this.origin.copy(origin);
    this.buildDirs(player, profile.omniCount);
    this.phase = 'telegraph';
    this.timer = profile.telegraphSec;
    this.shockHit = false;
    this.wavesLeft = 0;
    this.nextSpikeSlot = 0;
    this.group.visible = true;
    this.layoutTelegraph(0);
    bus.emit('core-notify', {
      title: 'SPIKE BURST',
      body:
        profile.airBurstChance > 0.05
          ? 'Lines locked — spikes may air-burst. Step off the bright one.'
          : 'Lines locked — move off the bright one.',
      kind: 'overload',
    });
    bus.emit('core-spike-telegraph');
    return true;
  }

  update(
    dt: number,
    player: THREE.Vector3,
    onDamage: (amount: number) => void,
    allowFire: boolean
  ): void {
    if (this.phase === 'idle') {
      this.group.visible = this.anySpike();
      this.simSpikes(dt, player, onDamage);
      return;
    }

    if (this.phase === 'telegraph') {
      this.simSpikes(dt, player, onDamage);
      if (!allowFire) {
        this.layoutTelegraph(1 - this.timer / this.profile.telegraphSec);
        return;
      }
      this.timer -= dt;
      const u = 1 - Math.max(0, this.timer) / this.profile.telegraphSec;
      this.layoutTelegraph(u);
      if (this.timer <= 0) this.fire();
      return;
    }

    // fire — shockwave + flying spikes (optional extra spray waves)
    this.timer -= dt;
    if (this.wavesLeft > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.releaseWave();
    }
    const shockT = 1 - Math.max(0, this.timer) / this.profile.shockDuration;
    this.layoutShock(Math.min(1, Math.max(0, shockT)), player, onDamage);
    this.simSpikes(dt, player, onDamage);
    if (this.timer <= 0) this.hideBurstFx();
    if (!this.anySpike() && this.timer <= 0) {
      this.phase = 'idle';
      this.group.visible = false;
    }
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
    for (let i = 0; i < this.spikes.length; i++) {
      const s = this.spikes[i];
      if (!s.active) continue;
      out.push({
        id: `spike_${i}`,
        position: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        radius: 0.85,
      });
    }
    return out;
  }

  damageIntercept(id: string, amount: number): boolean {
    if (!id.startsWith('spike_')) return false;
    const idx = Number(id.slice(6));
    const s = this.spikes[idx];
    if (!s?.active) return false;
    s.hp -= amount;
    if (s.hp <= 0) {
      this.killSpike(s);
      return true;
    }
    return false;
  }

  reset(): void {
    this.phase = 'idle';
    this.timer = 0;
    this.dirCount = 0;
    this.shockHit = false;
    for (const s of this.spikes) this.killSpike(s);
    for (const line of this.lines) {
      line.visible = false;
      (line.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.setOpacity(this.warnSphere, 0);
    this.setOpacity(this.shockMesh, 0);
    this.setOpacity(this.corona, 0);
    this.group.visible = false;
  }

  dispose(): void {
    this.reset();
    this.group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const mat = c.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.group.clear();
    this.spikeGeo.dispose();
    this.lineGeo.dispose();
    this.sphGeo.dispose();
  }

  private buildDirs(player: THREE.Vector3, omniCount: number): void {
    const n = Math.max(4, Math.min(MAX_SPIKES - 1, omniCount | 0));
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      this.dirs[i].set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();
    }
    this.aimedIndex = n;
    this.dirs[n].copy(player).sub(this.origin);
    if (this.dirs[n].lengthSq() < 1e-6) this.dirs[n].set(0, 0, 1);
    else this.dirs[n].normalize();
    this.dirCount = n + 1;
  }

  private fire(): void {
    this.phase = 'fire';
    this.timer = Math.max(
      this.profile.shockDuration,
      (this.profile.sprayWaves - 1) * 0.28 + 0.15
    );
    this.shockHit = false;
    this.wavesLeft = Math.max(1, this.profile.sprayWaves);
    this.waveTimer = 0;
    this.nextSpikeSlot = 0;
    for (const line of this.lines) line.visible = false;
    this.setOpacity(this.warnSphere, 0);
    this.releaseWave();
    bus.emit('core-spike-fire', { count: this.dirCount, waves: this.profile.sprayWaves });
    bus.emit('camera-shake-request', { amount: 0.08 });
  }

  private releaseWave(): void {
    if (this.wavesLeft <= 0) return;
    const waves = Math.max(1, this.profile.sprayWaves);
    const waveIndex = waves - this.wavesLeft;
    const perWave = Math.ceil(this.dirCount / waves);
    const start = waveIndex * perWave;
    const end = Math.min(this.dirCount, start + perWave);
    const speed = this.profile.speed;
    for (let i = start; i < end; i++) {
      const slot = this.nextSpikeSlot++;
      if (slot >= this.spikes.length) break;
      const s = this.spikes[slot];
      const aimed = i === this.aimedIndex;
      s.active = true;
      s.aimed = aimed;
      s.airBurst = !aimed && Math.random() < this.profile.airBurstChance;
      s.maxLife = this.profile.life;
      s.life = this.profile.life;
      s.burstAt = s.airBurst ? s.maxLife * (0.38 + Math.random() * 0.22) : -1;
      s.hp = aimed ? 24 : 16;
      s.pos.copy(this.origin).addScaledVector(this.dirs[i], 1.1);
      s.vel.copy(this.dirs[i]).multiplyScalar(aimed ? speed * 1.06 : speed);
      s.mesh.visible = true;
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(
        s.airBurst ? 0xff66aa : aimed ? 0xfff4cc : 0xff8844
      );
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      this.orient(s.mesh, s.vel);
      s.mesh.position.copy(s.pos);
      s.mesh.scale.setScalar(aimed ? 1.35 : s.airBurst ? 1.15 : 1);
    }
    this.wavesLeft--;
    this.waveTimer = 0.28;
  }

  private simSpikes(
    dt: number,
    player: THREE.Vector3,
    onDamage: (n: number) => void
  ): void {
    const r = this.profile.hitRadius;
    const r2 = r * r;
    for (const s of this.spikes) {
      if (!s.active) continue;
      s.life -= dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      this.orient(s.mesh, s.vel);
      if (s.airBurst && s.life <= s.burstAt) {
        const d = s.pos.distanceTo(player);
        if (d <= this.profile.airBurstRadius + 0.4) {
          onDamage(this.profile.airBurstDamage);
        }
        s.mesh.scale.setScalar(2.4);
        this.killSpike(s);
        continue;
      }
      if (s.pos.distanceToSquared(player) <= r2) {
        onDamage(this.profile.damage * (s.aimed ? 1.15 : 1));
        this.killSpike(s);
        continue;
      }
      if (s.life <= 0 || s.pos.lengthSq() > 88 * 88) this.killSpike(s);
    }
  }

  private layoutTelegraph(u: number): void {
    const pulse = 0.16 + u * 0.38 + Math.sin(u * 22) * 0.04;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (i >= this.dirCount) {
        line.visible = false;
        continue;
      }
      const aimed = i === this.aimedIndex;
      const len = LINE_LEN;
      line.position.copy(this.origin).addScaledVector(this.dirs[i], len * 0.5);
      _q.setFromUnitVectors(_up, this.dirs[i]);
      line.quaternion.copy(_q);
      const rad = aimed ? 0.07 + u * 0.05 : 0.035 + u * 0.02;
      line.scale.set(rad, len, rad);
      line.visible = true;
      const mat = line.material as THREE.MeshBasicMaterial;
      mat.color.setHex(aimed ? 0xffe8a0 : 0xff6622);
      mat.opacity = aimed ? 0.28 + u * 0.55 : 0.1 + u * 0.22;
    }

    const warnR = 1.4 + u * this.profile.shockRadius;
    this.warnSphere.position.copy(this.origin);
    this.warnSphere.scale.setScalar(warnR);
    this.setOpacity(this.warnSphere, 0.12 + u * 0.28);

    this.corona.position.copy(this.origin);
    this.corona.scale.setScalar(0.55 + u * 1.1 + pulse);
    this.setOpacity(this.corona, 0.25 + u * 0.45);
    this.setOpacity(this.shockMesh, 0);
  }

  private layoutShock(
    t: number,
    player: THREE.Vector3,
    onDamage: (n: number) => void
  ): void {
    const r = this.profile.shockRadius * Math.min(1, t * 1.15);
    this.shockMesh.position.copy(this.origin);
    this.shockMesh.scale.setScalar(Math.max(0.2, r));
    this.setOpacity(this.shockMesh, (1 - t) * 0.35);
    this.corona.position.copy(this.origin);
    this.corona.scale.setScalar(0.8 + t * 2.2);
    this.setOpacity(this.corona, (1 - t) * 0.55);

    if (!this.shockHit && t > 0.12 && player.distanceTo(this.origin) <= r + 0.6) {
      this.shockHit = true;
      onDamage(this.profile.shockDamage);
    }
  }

  private hideBurstFx(): void {
    this.setOpacity(this.shockMesh, 0);
    this.setOpacity(this.corona, 0);
    this.setOpacity(this.warnSphere, 0);
  }

  private anySpike(): boolean {
    for (const s of this.spikes) if (s.active) return true;
    return false;
  }

  private killSpike(s: Spike): void {
    s.active = false;
    s.mesh.visible = false;
  }

  private orient(mesh: THREE.Mesh, vel: THREE.Vector3): void {
    if (vel.lengthSq() < 1e-8) return;
    _q.setFromUnitVectors(_fwd, _tmp.copy(vel).normalize());
    mesh.quaternion.copy(_q);
  }

  private setOpacity(mesh: THREE.Mesh, opacity: number): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
    mesh.visible = opacity > 0.02;
  }
}
