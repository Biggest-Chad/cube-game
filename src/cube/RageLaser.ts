/**
 * Rage nucleus sweep laser — anime-arcade charge then a heavy continuous beam.
 * Telegraph is long and readable; slew stays slower than base orbit so it is dodgeable.
 */
import * as THREE from 'three';
import { CORE } from '../data/core';
import { bus } from '../core/EventBus';

export type RageLaserPhase = 'idle' | 'warmup' | 'charge' | 'fire' | 'cooldown';

const RING_COUNT = 8;
const CHEVRON_COUNT = 7;
const SPARK_COUNT = 12;
const HASH_COUNT = 14;
const PIP_COUNT = 8;

export class RageLaser {
  readonly group = new THREE.Group();
  private phase: RageLaserPhase = 'idle';
  private timer = 0;
  private readonly aim = new THREE.Vector3(0, 0, 1);
  private readonly desired = new THREE.Vector3(0, 0, 1);
  private readonly origin = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _fwd = new THREE.Vector3(0, 0, 1);
  private readonly _end = new THREE.Vector3();
  private readonly _closest = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();
  private readonly _binorm = new THREE.Vector3();
  private hitAccum = 0;
  private announcedCharge = false;
  private shakeMarks = 0;
  private fireFlash = 0;

  private telegraph!: THREE.Mesh;
  private danger!: THREE.Mesh;
  private core!: THREE.Mesh;
  private mid!: THREE.Mesh;
  private outer!: THREE.Mesh;
  private bloom!: THREE.Mesh;
  private corona!: THREE.Mesh;
  private flash!: THREE.Mesh;
  private reticle!: THREE.Mesh;
  private reticleInner!: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private chevrons: THREE.Mesh[] = [];
  private sparks: THREE.Mesh[] = [];
  private hashes: THREE.Mesh[] = [];
  private pips: THREE.Mesh[] = [];
  private brackets: THREE.Mesh[] = [];

  private readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  private readonly sph = new THREE.SphereGeometry(1, 14, 10);
  private readonly torus = new THREE.TorusGeometry(1, 0.085, 8, 28);
  private readonly cone = new THREE.ConeGeometry(0.22, 0.55, 4, 1);
  private readonly pipGeo = new THREE.BoxGeometry(0.18, 0.18, 0.55);

  constructor() {
    this.telegraph = this.cylMesh(0xffcc66, 0);
    this.danger = this.cylMesh(0xff2208, 0);
    this.outer = this.cylMesh(0xff1408, 0);
    this.bloom = this.cylMesh(0xff6622, 0);
    this.mid = this.cylMesh(0xff8844, 0);
    this.core = this.cylMesh(0xfff4e0, 0);
    this.corona = this.sphMesh(0xff2208, 0);
    this.flash = this.sphMesh(0xffeedd, 0);
    this.reticle = this.torusMesh(0xffee88, 0);
    this.reticleInner = this.torusMesh(0xff3310, 0);
    this.group.add(
      this.danger,
      this.outer,
      this.bloom,
      this.mid,
      this.core,
      this.telegraph,
      this.corona,
      this.flash,
      this.reticle,
      this.reticleInner
    );

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = this.torusMesh(i % 2 === 0 ? 0xff6622 : 0xffaa66, 0);
      this.rings.push(ring);
      this.group.add(ring);
    }
    for (let i = 0; i < CHEVRON_COUNT; i++) {
      const c = new THREE.Mesh(
        this.cone,
        new THREE.MeshBasicMaterial({
          color: 0xffcc55,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      c.visible = false;
      this.chevrons.push(c);
      this.group.add(c);
    }
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = this.sphMesh(i % 2 === 0 ? 0xffaa44 : 0xffeeaa, 0);
      this.sparks.push(s);
      this.group.add(s);
    }
    for (let i = 0; i < HASH_COUNT; i++) {
      const h = this.cylMesh(0xffe8c0, 0);
      this.hashes.push(h);
      this.group.add(h);
    }
    for (let i = 0; i < PIP_COUNT; i++) {
      const p = new THREE.Mesh(
        this.pipGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff6622,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      p.visible = false;
      this.pips.push(p);
      this.group.add(p);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(
        this.pipGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffee88,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      b.visible = false;
      this.brackets.push(b);
      this.group.add(b);
    }
    this.group.visible = false;
  }

  get phaseId(): RageLaserPhase {
    return this.phase;
  }

  get glow(): number {
    if (this.phase === 'charge') return 0.4 + (1 - this.timer / CORE.rageLaserChargeSec) * 0.7;
    if (this.phase === 'fire') return 1;
    if (this.phase === 'warmup') return 0.22 + (1 - this.timer / CORE.rageLaserWarmup) * 0.25;
    return 0;
  }

  update(
    dt: number,
    opts: {
      active: boolean;
      origin: THREE.Vector3;
      player: THREE.Vector3;
      overloading: boolean;
      allowFire: boolean;
      onPlayerDamage: (amount: number) => void;
      damageMul?: number;
    }
  ): void {
    if (!opts.active) {
      this.stop();
      return;
    }

    this.origin.copy(opts.origin);
    this.desired.copy(opts.player).sub(this.origin);
    if (this.desired.lengthSq() < 1e-6) this.desired.set(0, 0, 1);
    else this.desired.normalize();

    const over = opts.overloading;
    if (!opts.allowFire && this.phase !== 'fire') {
      this.layout(0);
      return;
    }

    this.fireFlash = Math.max(0, this.fireFlash - dt * 2.4);

    switch (this.phase) {
      case 'idle':
        this.enter('warmup', CORE.rageLaserWarmup);
        this.shakeMarks = 0;
        bus.emit('camera-shake-request', { amount: 0.06 });
        break;
      case 'warmup':
        this.aim.copy(this.desired);
        this.timer -= dt;
        if (this.timer <= 0) this.beginCharge();
        break;
      case 'charge': {
        this.slew(over ? CORE.rageLaserSlewFire : CORE.rageLaserSlewCharge, dt);
        this.timer -= dt;
        const u = 1 - Math.max(0, this.timer) / CORE.rageLaserChargeSec;
        if (u > 0.42 && this.shakeMarks < 1) {
          this.shakeMarks = 1;
          bus.emit('camera-shake-request', { amount: 0.07 });
        }
        if (u > 0.78 && this.shakeMarks < 2) {
          this.shakeMarks = 2;
          bus.emit('camera-shake-request', { amount: 0.11 });
        }
        if (this.timer <= 0) this.beginFire();
        break;
      }
      case 'fire':
        this.slew(over ? CORE.rageLaserSlewOverload : CORE.rageLaserSlewFire, dt);
        this.timer -= dt;
        this.applyHit(dt, opts.player, opts.onPlayerDamage, over, opts.damageMul ?? 1);
        if (this.timer <= 0) {
          this.enter('cooldown', over ? CORE.rageLaserCooldown * 0.4 : CORE.rageLaserCooldown);
          bus.emit('core-rage-laser-end');
        }
        break;
      case 'cooldown':
        this.timer -= dt;
        if (this.timer <= 0) this.beginCharge();
        break;
    }

    this.layout(performance.now() * 0.001);
  }

  reset(): void {
    this.stop();
  }

  dispose(): void {
    this.stop();
    this.group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const mat = c.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.group.clear();
    this.cyl.dispose();
    this.sph.dispose();
    this.torus.dispose();
    this.cone.dispose();
    this.pipGeo.dispose();
  }

  private beginCharge(): void {
    this.enter('charge', CORE.rageLaserChargeSec);
    this.aim.copy(this.desired);
    this.shakeMarks = 0;
    if (!this.announcedCharge) {
      this.announcedCharge = true;
      bus.emit('core-notify', {
        title: 'RAGE CANNON LOCK',
        body: 'Leave the burning line — it is about to dump.',
        kind: 'rage',
      });
    }
    bus.emit('core-rage-laser-charge');
    bus.emit('camera-shake-request', { amount: 0.08 });
  }

  private beginFire(): void {
    this.enter('fire', CORE.rageLaserDuration);
    this.hitAccum = 0;
    this.fireFlash = 1;
    bus.emit('core-rage-laser-fire');
    bus.emit('camera-shake-request', { amount: 0.28 });
    bus.emit('core-notify', {
      title: 'RAGE LASER',
      body: 'Full dump — stay off the line!',
      kind: 'overload',
    });
  }

  private enter(phase: RageLaserPhase, duration: number): void {
    this.phase = phase;
    this.timer = duration;
  }

  private stop(): void {
    if (this.phase !== 'idle') bus.emit('core-rage-laser-end');
    this.phase = 'idle';
    this.timer = 0;
    this.hitAccum = 0;
    this.announcedCharge = false;
    this.shakeMarks = 0;
    this.fireFlash = 0;
    this.group.visible = false;
  }

  private slew(radPerSec: number, dt: number): void {
    const ang = this.aim.angleTo(this.desired);
    if (ang < 1e-5) {
      this.aim.copy(this.desired);
      return;
    }
    const t = Math.min(1, (radPerSec * dt) / ang);
    this.aim.lerp(this.desired, t).normalize();
  }

  private applyHit(
    dt: number,
    player: THREE.Vector3,
    onDamage: (n: number) => void,
    over: boolean,
    damageMul = 1
  ): void {
    const range = CORE.rageLaserRange;
    const to = this._end.copy(player).sub(this.origin);
    const along = THREE.MathUtils.clamp(to.dot(this.aim), 0, range);
    this._closest.copy(this.origin).addScaledVector(this.aim, along);
    const dist = this._closest.distanceTo(player);
    if (dist > CORE.rageLaserHitRadius) {
      this.hitAccum = 0;
      return;
    }
    this.hitAccum += dt;
    const tick = 0.12;
    if (this.hitAccum < tick) return;
    const dps = (over ? CORE.rageLaserOverloadDps : CORE.rageLaserDps) * damageMul;
    onDamage(dps * this.hitAccum);
    this.hitAccum = 0;
    bus.emit('camera-shake-request', { amount: 0.09 });
  }

  private layout(now: number): void {
    const charging = this.phase === 'charge';
    const firing = this.phase === 'fire';
    const warming = this.phase === 'warmup';
    const cooling = this.phase === 'cooldown';
    if (!charging && !firing && !warming && !cooling) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const range = CORE.rageLaserRange;
    const warm01 = warming ? 1 - Math.max(0, this.timer) / CORE.rageLaserWarmup : warming ? 0 : 1;
    const charge01 = charging
      ? 1 - Math.max(0, this.timer) / CORE.rageLaserChargeSec
      : firing
        ? 1
        : warming
          ? warm01 * 0.2
          : 0;
    const beat = 0.5 + 0.5 * Math.sin(now * (6 + charge01 * 14));
    this.basis();

    // Danger envelope + lock line
    const teleR = warming
      ? 0.035 + warm01 * 0.04
      : charging
        ? 0.055 + charge01 * 0.09 + beat * 0.02
        : firing
          ? 0.02
          : 0.01;
    this.placeBeam(this.telegraph, teleR, range);
    this.setOp(
      this.telegraph,
      warming ? 0.12 + warm01 * 0.2 : charging ? 0.28 + charge01 * 0.55 + beat * 0.12 : 0
    );
    (this.telegraph.material as THREE.MeshBasicMaterial).color.setHex(
      charge01 > 0.7 ? 0xfff2c8 : 0xffaa44
    );

    this.placeBeam(this.danger, charging ? 0.22 + charge01 * 0.35 : firing ? 0.55 : 0.12, range);
    this.setOp(this.danger, charging ? 0.06 + charge01 * 0.12 : firing ? 0.14 : warming ? 0.05 : 0);

    // Fire beam — heavy layered dump
    const rumble = firing ? 1 + Math.sin(now * 38) * 0.07 + Math.sin(now * 71) * 0.04 : 1;
    const ignite = this.fireFlash;
    const fireR = 0.28 * rumble + ignite * 0.22;
    this.placeBeam(this.outer, firing ? fireR * 2.8 : 0.01, range);
    this.placeBeam(this.bloom, firing ? fireR * 1.85 : 0.01, range);
    this.placeBeam(this.mid, firing ? fireR * 1.15 : 0.01, range);
    this.placeBeam(this.core, firing ? fireR * 0.38 : 0.01, range);
    this.setOp(this.outer, firing ? 0.22 + ignite * 0.25 : 0);
    this.setOp(this.bloom, firing ? 0.4 + ignite * 0.3 : 0);
    this.setOp(this.mid, firing ? 0.62 + ignite * 0.2 : 0);
    this.setOp(this.core, firing ? 0.98 : 0);

    // Nucleus mouth
    this.corona.position.copy(this.origin);
    const coronaR = firing
      ? 1.15 + Math.sin(now * 16) * 0.18 + ignite * 0.9
      : 0.35 + charge01 * 1.15 + beat * 0.12;
    this.corona.scale.setScalar(coronaR);
    this.setOp(this.corona, firing ? 0.82 : 0.18 + charge01 * 0.65);
    this.flash.position.copy(this.origin);
    this.flash.scale.setScalar(0.4 + ignite * 2.8);
    this.setOp(this.flash, ignite * 0.85);

    // Charge rings traveling down the lock
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const show = charging || warming;
      if (!show) {
        this.setOp(ring, 0);
        continue;
      }
      const travel = ((charge01 * 1.35 + now * 0.35 + i / RING_COUNT) % 1);
      const u = 0.08 + travel * 0.9;
      ring.position.copy(this.origin).addScaledVector(this.aim, range * u);
      this.orientTorus(ring);
      const rad = 0.55 + (1 - travel) * 1.6 + beat * 0.1;
      ring.scale.set(rad, rad, 0.35 + charge01 * 0.5);
      this.setOp(ring, (charging ? 0.22 : 0.1) + (1 - travel) * 0.45);
    }

    // Chevrons marching toward the player
    for (let i = 0; i < this.chevrons.length; i++) {
      const c = this.chevrons[i];
      const show = charging || warming;
      c.visible = show;
      if (!show) continue;
      const march = (charge01 * 0.85 + now * 0.55 + i * 0.12) % 1;
      c.position.copy(this.origin).addScaledVector(this.aim, 4 + march * (range - 8));
      this._q.setFromUnitVectors(this._up, this.aim);
      c.quaternion.copy(this._q);
      const s = 0.7 + charge01 * 0.9;
      c.scale.setScalar(s);
      (c.material as THREE.MeshBasicMaterial).opacity = 0.2 + charge01 * 0.65;
    }

    // Orbiting sparks collapsing into the barrel
    const orbitR = firing ? 0.35 : 1.8 - charge01 * 1.35;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      const show = charging || warming || (firing && ignite > 0.05);
      if (!show) {
        this.setOp(s, 0);
        continue;
      }
      const a = now * (2.2 + charge01 * 6) + (i / SPARK_COUNT) * Math.PI * 2;
      const along = 0.7 + (i % 4) * 0.35;
      this._end
        .copy(this.origin)
        .addScaledVector(this.aim, along)
        .addScaledVector(this._side, Math.cos(a) * orbitR)
        .addScaledVector(this._binorm, Math.sin(a) * orbitR);
      s.position.copy(this._end);
      s.scale.setScalar(0.08 + charge01 * 0.12);
      this.setOp(s, 0.35 + charge01 * 0.55);
    }

    // Pips filling along the telegraph
    for (let i = 0; i < this.pips.length; i++) {
      const p = this.pips[i];
      const filled = charge01 > (i + 0.15) / PIP_COUNT;
      const show = charging || warming;
      p.visible = show;
      if (!show) continue;
      const u = (i + 0.6) / (PIP_COUNT + 0.4);
      p.position.copy(this.origin).addScaledVector(this.aim, range * u);
      this._q.setFromUnitVectors(this._fwd, this.aim);
      p.quaternion.copy(this._q);
      p.scale.set(filled ? 1.4 : 0.7, filled ? 1.4 : 0.7, 1);
      (p.material as THREE.MeshBasicMaterial).color.setHex(filled ? 0xffeeaa : 0x882200);
      (p.material as THREE.MeshBasicMaterial).opacity = filled ? 0.9 : 0.2 + warm01 * 0.2;
    }

    // Lock reticle at the far kill-point
    const retU = 0.72 + charge01 * 0.18;
    this.reticle.position.copy(this.origin).addScaledVector(this.aim, range * retU);
    this.reticleInner.position.copy(this.reticle.position);
    this.orientTorus(this.reticle);
    this.orientTorus(this.reticleInner);
    const lock = charging || warming;
    const spin = now * (2.4 + charge01 * 7);
    this.reticle.rotateZ(spin);
    const retR = firing ? 0.4 : 2.4 - charge01 * 1.5;
    this.reticle.scale.set(retR, retR, 0.45);
    this.reticleInner.scale.set(retR * 0.55, retR * 0.55, 0.4);
    this.setOp(this.reticle, lock ? 0.35 + charge01 * 0.5 : firing ? 0.2 : 0);
    this.setOp(this.reticleInner, lock ? 0.2 + charge01 * 0.45 : 0);

    // Corner brackets around the reticle
    for (let i = 0; i < this.brackets.length; i++) {
      const b = this.brackets[i];
      const show = charging;
      b.visible = show;
      if (!show) continue;
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4 + now * 0.4;
      const rad = 1.8 - charge01 * 1.1;
      b.position
        .copy(this.reticle.position)
        .addScaledVector(this._side, Math.cos(ang) * rad)
        .addScaledVector(this._binorm, Math.sin(ang) * rad);
      this._q.setFromUnitVectors(this._fwd, this.aim);
      b.quaternion.copy(this._q);
      b.scale.set(0.7, 0.7, 1.6);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.35 + charge01 * 0.55;
    }

    // Fire hashes scrolling down the beam
    for (let i = 0; i < this.hashes.length; i++) {
      const h = this.hashes[i];
      if (!firing) {
        this.setOp(h, 0);
        continue;
      }
      const u = ((now * 1.8 + i / HASH_COUNT) % 1);
      this.placeBeamAt(h, 0.16, 1.15, range * u);
      this.setOp(h, 0.18 + (1 - u) * 0.35);
    }
  }

  private basis(): void {
    this._side.crossVectors(this.aim, this._up);
    if (this._side.lengthSq() < 1e-6) this._side.set(1, 0, 0);
    else this._side.normalize();
    this._binorm.crossVectors(this.aim, this._side).normalize();
  }

  private placeBeam(mesh: THREE.Mesh, radius: number, length: number): void {
    this.placeBeamAt(mesh, radius, length, length * 0.5);
  }

  private placeBeamAt(mesh: THREE.Mesh, radius: number, length: number, along: number): void {
    this._end.copy(this.origin).addScaledVector(this.aim, along);
    mesh.position.copy(this._end);
    if (this.aim.lengthSq() > 1e-8) {
      this._q.setFromUnitVectors(this._up, this.aim);
      mesh.quaternion.copy(this._q);
    }
    mesh.scale.set(Math.max(0.008, radius), length, Math.max(0.008, radius));
    mesh.visible = radius > 0.012;
  }

  private orientTorus(mesh: THREE.Mesh): void {
    if (this.aim.lengthSq() < 1e-8) return;
    this._q.setFromUnitVectors(this._fwd, this.aim);
    mesh.quaternion.copy(this._q);
  }

  private cylMesh(color: number, opacity: number): THREE.Mesh {
    return new THREE.Mesh(
      this.cyl,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
  }

  private sphMesh(color: number, opacity: number): THREE.Mesh {
    return new THREE.Mesh(
      this.sph,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
  }

  private torusMesh(color: number, opacity: number): THREE.Mesh {
    return new THREE.Mesh(
      this.torus,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
  }

  private setOp(mesh: THREE.Mesh, opacity: number): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
    mesh.visible = opacity > 0.02;
  }
}
