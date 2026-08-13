/**
 * Rage nucleus sweep laser.
 * Charges with a thin telegraph, then fires a continuous beam that slowly
 * tracks the ship. Slew is slower than base orbit yaw so the shot is dodgeable.
 */
import * as THREE from 'three';
import { CORE } from '../data/core';
import { bus } from '../core/EventBus';

export type RageLaserPhase = 'idle' | 'warmup' | 'charge' | 'fire' | 'cooldown';

export class RageLaser {
  readonly group = new THREE.Group();
  private phase: RageLaserPhase = 'idle';
  private timer = 0;
  private readonly aim = new THREE.Vector3(0, 0, 1);
  private readonly desired = new THREE.Vector3(0, 0, 1);
  private readonly origin = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _end = new THREE.Vector3();
  private readonly _closest = new THREE.Vector3();
  private hitAccum = 0;
  private announcedCharge = false;

  private telegraph!: THREE.Mesh;
  private core!: THREE.Mesh;
  private mid!: THREE.Mesh;
  private outer!: THREE.Mesh;
  private corona!: THREE.Mesh;
  private muzzle!: THREE.PointLight;
  private ticks: THREE.Mesh[] = [];
  private readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  private readonly sph = new THREE.SphereGeometry(1, 12, 10);

  constructor() {
    this.telegraph = this.cylMesh(0xff6633, 0);
    this.outer = this.cylMesh(0xff2208, 0);
    this.mid = this.cylMesh(0xff6622, 0);
    this.core = this.cylMesh(0xffe8d0, 0);
    this.corona = new THREE.Mesh(
      this.sph,
      new THREE.MeshBasicMaterial({
        color: 0xff3310,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.muzzle = new THREE.PointLight(0xff4410, 0, 28, 2);
    this.group.add(this.outer, this.mid, this.core, this.telegraph, this.corona, this.muzzle);

    for (let i = 0; i < 6; i++) {
      const tick = new THREE.Mesh(
        this.sph,
        new THREE.MeshBasicMaterial({
          color: 0xff8844,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      tick.visible = false;
      this.ticks.push(tick);
      this.group.add(tick);
    }
    this.group.visible = false;
  }

  get phaseId(): RageLaserPhase {
    return this.phase;
  }

  /** 0..1 visual stress for the nucleus heart. */
  get glow(): number {
    if (this.phase === 'charge') return 0.35 + (1 - this.timer / CORE.rageLaserChargeSec) * 0.55;
    if (this.phase === 'fire') return 0.95;
    if (this.phase === 'warmup') return 0.2;
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

    switch (this.phase) {
      case 'idle':
        this.enter('warmup', CORE.rageLaserWarmup);
        break;
      case 'warmup':
        this.aim.copy(this.desired);
        this.timer -= dt;
        if (this.timer <= 0) this.beginCharge();
        break;
      case 'charge':
        this.slew(over ? CORE.rageLaserSlewFire : CORE.rageLaserSlewCharge, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.beginFire();
        break;
      case 'fire':
        this.slew(over ? CORE.rageLaserSlewOverload : CORE.rageLaserSlewFire, dt);
        this.timer -= dt;
        this.applyHit(dt, opts.player, opts.onPlayerDamage, over);
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
  }

  private beginCharge(): void {
    this.enter('charge', CORE.rageLaserChargeSec);
    this.aim.copy(this.desired);
    if (!this.announcedCharge) {
      this.announcedCharge = true;
      bus.emit('core-notify', {
        title: 'RAGE LASER CHARGING',
        body: 'Sweep inbound — keep orbiting.',
        kind: 'rage',
      });
    }
    bus.emit('core-rage-laser-charge');
  }

  private beginFire(): void {
    this.enter('fire', CORE.rageLaserDuration);
    this.hitAccum = 0;
    bus.emit('core-rage-laser-fire');
    bus.emit('core-notify', {
      title: 'RAGE LASER',
      body: 'Continuous sweep — stay off the line.',
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
    this.group.visible = false;
    this.muzzle.intensity = 0;
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
    over: boolean
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
    const dps = over ? CORE.rageLaserOverloadDps : CORE.rageLaserDps;
    onDamage(dps * this.hitAccum);
    this.hitAccum = 0;
    bus.emit('camera-shake-request', { amount: 0.05 });
  }

  private layout(t: number): void {
    const charging = this.phase === 'charge';
    const firing = this.phase === 'fire';
    const warming = this.phase === 'warmup';
    if (!charging && !firing && !warming) {
      this.group.visible = false;
      this.muzzle.intensity = 0;
      return;
    }
    this.group.visible = true;

    const range = CORE.rageLaserRange;
    const charge01 = charging
      ? 1 - Math.max(0, this.timer) / CORE.rageLaserChargeSec
      : firing
        ? 1
        : 0.15;
    const flicker = firing ? 1 + Math.sin(t * 42) * 0.08 : 1;
    const teleR = 0.045 + charge01 * 0.05;
    const fireR = 0.22 * flicker;

    this.placeBeam(this.telegraph, charging || warming ? teleR : 0.01, range);
    this.setOpacity(this.telegraph, charging ? 0.18 + charge01 * 0.45 : warming ? 0.12 : 0);

    this.placeBeam(this.outer, firing ? fireR * 2.4 : 0.01, range);
    this.placeBeam(this.mid, firing ? fireR * 1.25 : 0.01, range);
    this.placeBeam(this.core, firing ? fireR * 0.42 : 0.01, range);
    this.setOpacity(this.outer, firing ? 0.28 : 0);
    this.setOpacity(this.mid, firing ? 0.55 : 0);
    this.setOpacity(this.core, firing ? 0.95 : 0);

    this.corona.position.copy(this.origin);
    const coronaR = firing ? 0.85 + Math.sin(t * 18) * 0.12 : 0.25 + charge01 * 0.55;
    this.corona.scale.setScalar(coronaR);
    this.setOpacity(this.corona, firing ? 0.7 : 0.15 + charge01 * 0.5);

    this.muzzle.position.copy(this.origin);
    this.muzzle.intensity = firing ? 14 : charge01 * 5;
    this.muzzle.distance = firing ? 36 : 22;

    for (let i = 0; i < this.ticks.length; i++) {
      const tick = this.ticks[i];
      const show = charging || warming;
      tick.visible = show;
      if (!show) continue;
      const u = (i + 1) / (this.ticks.length + 1);
      tick.position.copy(this.origin).addScaledVector(this.aim, range * u);
      const pulse = 0.07 + Math.sin(t * 8 + i) * 0.03 + charge01 * 0.08;
      tick.scale.setScalar(pulse);
      this.setOpacity(tick, 0.25 + charge01 * 0.55);
    }
  }

  private placeBeam(mesh: THREE.Mesh, radius: number, length: number): void {
    this._end.copy(this.origin).addScaledVector(this.aim, length * 0.5);
    mesh.position.copy(this._end);
    if (this.aim.lengthSq() > 1e-8) {
      this._q.setFromUnitVectors(this._up, this.aim);
      mesh.quaternion.copy(this._q);
    }
    mesh.scale.set(Math.max(0.008, radius), length, Math.max(0.008, radius));
    mesh.visible = radius > 0.012;
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
      })
    );
  }

  private setOpacity(mesh: THREE.Mesh, opacity: number): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
    mesh.visible = opacity > 0.02;
  }
}
