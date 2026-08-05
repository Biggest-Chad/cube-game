/**
 * Stage-1 epic intro cinematic (~19s).
 *
 * Timeline:
 *  0–2.8s   Portal tears open — opaque mouth + dense glow (occludes anything below)
 *  2.8–7.2s Cube materializes *through* the portal (not seen rising underneath)
 *  7.2–11s  Hero orbit / skyline + lattice chaos
 *  11–14.5s Hard hero cut — THE CUBE HAS ARRIVED
 *  14.5–19s DESTROY IT — SAVE HUMANITY + dock to combat seat
 *
 * Portal uses depth-writing occluders so the cube cannot be seen “under” the floor.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import type { CubeAnimator } from '../cube/CubeAnimator';
import type { OrbitalCamera } from '../player/OrbitalCamera';
import type { Ship } from '../player/Ship';
import type { ParticlePool } from './ParticlePool';
import type { AudioEngine } from '../audio/AudioEngine';

function smooth(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class CinematicIntro {
  readonly group = new THREE.Group();
  private uiRoot: HTMLElement;
  private active = false;
  private t = 0;
  private readonly duration = 19;

  private cube: CubeManager | null = null;
  private animator: CubeAnimator | null = null;
  private camera: OrbitalCamera | null = null;
  private ship: Ship | null = null;
  private particles: ParticlePool | null = null;
  private audio: AudioEngine | null = null;
  private half = 6;

  private portalRoot = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private glowDiscs: THREE.Mesh[] = [];
  private occluders: THREE.Mesh[] = [];
  private shaftLayers: THREE.Mesh[] = [];
  private mistColumns: THREE.Mesh[] = [];
  private energyBeams: THREE.Mesh[] = [];
  private shockRings: THREE.Mesh[] = [];
  private portalLight!: THREE.PointLight;
  private portalLight2!: THREE.PointLight;
  private portalLight3!: THREE.PointLight;
  private portalLight4!: THREE.PointLight;

  private sparkPoints!: THREE.Points;
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPos!: Float32Array;
  private sparkCol!: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkCount = 720;

  private cityRoot = new THREE.Group();
  private debrisRoot = new THREE.Group();
  private debris: Array<{
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    spin: THREE.Vector3;
    life: number;
  }> = [];

  private overlayEl: HTMLElement | null = null;
  private titleA: HTMLElement | null = null;
  private titleB: HTMLElement | null = null;
  private titleSub: HTMLElement | null = null;
  private nextShiftAt = 1.5;
  private shiftCount = 0;
  private particleBurstAccum = 0;

  /** Audio cue latches (one-shot markers) */
  private cuePortal = false;
  private cueBreach = false;
  private cueImpact = false;
  private cueTitleA = false;
  private cueTitleB = false;
  private cueHero = false;
  private lastHum = 0;

  constructor(uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.group.name = 'CinematicIntro';
    this.sparkVel = new Float32Array(this.sparkCount * 3);
    this.sparkLife = new Float32Array(this.sparkCount);
    this.buildPortal();
    this.buildCity();
    this.buildDebrisPool();
    this.group.add(this.portalRoot, this.cityRoot, this.debrisRoot);
    this.group.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(opts: {
    cube: CubeManager;
    animator: CubeAnimator;
    camera: OrbitalCamera;
    ship: Ship;
    particles?: ParticlePool;
    audio?: AudioEngine;
  }): void {
    this.cube = opts.cube;
    this.animator = opts.animator;
    this.camera = opts.camera;
    this.ship = opts.ship;
    this.particles = opts.particles ?? null;
    this.audio = opts.audio ?? null;
    this.half = Math.max(3.5, opts.cube.halfExtent);
    this.active = true;
    this.t = 0;
    this.nextShiftAt = 2.0;
    this.shiftCount = 0;
    this.particleBurstAccum = 0;
    this.cuePortal = false;
    this.cueBreach = false;
    this.cueImpact = false;
    this.cueTitleA = false;
    this.cueTitleB = false;
    this.cueHero = false;
    this.lastHum = 0;

    const s = Math.max(1.75, this.half * 0.9);
    this.portalRoot.scale.setScalar(s);
    // Portal sits just under world origin — cube emerges from the plane
    this.portalRoot.position.set(0, -this.half * 0.02, 0);
    this.cityRoot.position.set(0, -this.half * 4.8 - 20, 0);
    this.cityRoot.scale.setScalar(Math.max(1.2, this.half / 4.5));

    // Park cube deep under the portal (occluded by depth-writing mouth)
    const bury = -(this.half * 4.2 + 16);
    this.cube.group.position.set(0, bury, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.quaternion.identity();
    this.cube.group.scale.setScalar(0.55);
    this.cube.group.visible = false;

    this.ship.group.visible = false;
    this.ship.group.scale.setScalar(0);
    this.ship.group.position.set(0, -500, 0);

    this.animator.reset();
    this.animator.setEnabled(true);
    this.animator.beginCinematicBurst();

    this.camera.beginScriptedCinematic({
      yaw: 0.35,
      pitch: 0.04,
      radius: this.half * 5.6,
      lookY: -this.half * 0.4,
    });

    this.resetSparks();
    this.resetDebris();
    this.group.visible = true;
    this.mountUI();

    try {
      this.audio?.startCinematicBed();
      this.audio?.playCinematicStinger('open');
    } catch {
      /* audio may be locked */
    }
  }

  /** @returns true when finished */
  update(dt: number): boolean {
    if (!this.active || !this.cube || !this.camera || !this.animator || !this.ship) {
      return true;
    }
    const d = Math.min(0.05, Math.max(0, dt));
    this.t += d;
    const t = this.t;
    const H = this.half;

    this.ship.group.visible = false;
    this.ship.group.scale.setScalar(0);

    this.animator.update(d);
    this.updateSparks(d, t);
    this.updateDebris(d, t);
    this.drivePortal(t, d);
    this.driveCube(t, d, H);
    this.driveCamera(t, H);
    this.driveTitles(t);
    this.driveShifts(t);
    this.driveAudio(t);
    this.spawnWorldParticles(t, d, H);

    this.camera.updateScriptedCinematic(d);

    if (t >= this.duration) {
      this.finish();
      return true;
    }
    return false;
  }

  skip(): void {
    if (this.active) this.finish();
  }

  // ── Timeline ──────────────────────────────────────────────

  private portalOpen(t: number): number {
    if (t < 0.25) return 0;
    if (t < 2.6) return smooth((t - 0.25) / 2.35);
    if (t < 8.2) return 1;
    if (t < 11.2) return Math.max(0, 1 - smooth((t - 8.2) / 3.0));
    return 0;
  }

  private drivePortal(t: number, dt: number): void {
    const open = this.portalOpen(t);
    const pulse =
      0.82 + Math.sin(t * 12) * 0.14 + Math.sin(t * 27) * 0.06 + Math.sin(t * 4.2) * 0.05;
    // Breach flash around emergence
    const breach =
      t > 2.9 && t < 4.2 ? smooth(1 - Math.abs(t - 3.4) / 0.9) : 0;

    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i].material as THREE.MeshBasicMaterial;
      const base = i === 0 ? 1.0 : i === 1 ? 0.85 : i === 2 ? 0.65 : i === 3 ? 0.5 : 0.35;
      m.opacity = Math.min(1, open * base * pulse + breach * 0.4);
      this.rings[i].rotation.z += dt * (0.55 + i * 0.35) * (i % 2 === 0 ? 1 : -1);
      const breathe = 1 + Math.sin(t * 5.5 + i) * 0.04 * open + breach * 0.08;
      this.rings[i].scale.setScalar(breathe);
    }

    // Opaque / semi-opaque mouth — hides anything below the plane
    for (let i = 0; i < this.occluders.length; i++) {
      const m = this.occluders[i].material as THREE.MeshBasicMaterial;
      // Stay nearly solid while portal is open so cube cannot be seen underneath
      const solid = i === 0 ? 0.97 : i === 1 ? 0.88 : 0.72;
      m.opacity = open * solid;
      this.occluders[i].visible = open > 0.02;
    }

    // Additive glow discs (above occluder) — bloom / haze
    for (let i = 0; i < this.glowDiscs.length; i++) {
      const m = this.glowDiscs[i].material as THREE.MeshBasicMaterial;
      const base = [0.95, 0.75, 0.55, 0.4, 0.28, 0.18][i] ?? 0.2;
      m.opacity = Math.min(1, open * base * pulse + breach * 0.5);
      this.glowDiscs[i].rotation.z -= dt * (0.25 + i * 0.12);
      const sc = 1 + Math.sin(t * 6 + i * 0.7) * 0.04 * open + breach * 0.12;
      this.glowDiscs[i].scale.setScalar(sc);
    }

    // Vertical shaft mist (down into the void + slight up plume)
    for (let i = 0; i < this.shaftLayers.length; i++) {
      const b = this.shaftLayers[i];
      const m = b.material as THREE.MeshBasicMaterial;
      const down = i < 4;
      m.opacity = open * (down ? 0.55 - i * 0.08 : 0.35) * pulse;
      b.rotation.y += dt * (0.2 + i * 0.05) * (i % 2 ? 1 : -1);
      b.scale.y = 0.85 + open * (0.4 + Math.sin(t * 7 + i) * 0.15);
    }

    // Soft vertical mist columns for “blur”
    for (let i = 0; i < this.mistColumns.length; i++) {
      const c = this.mistColumns[i];
      const m = c.material as THREE.MeshBasicMaterial;
      m.opacity = open * (0.22 + (i % 3) * 0.06) * pulse;
      c.rotation.y += dt * 0.35 * (i % 2 ? 1 : -1);
      c.scale.x = c.scale.z = 1 + Math.sin(t * 3 + i) * 0.08 * open;
    }

    for (let i = 0; i < this.energyBeams.length; i++) {
      const b = this.energyBeams[i];
      const m = b.material as THREE.MeshBasicMaterial;
      m.opacity = open * (0.4 + pulse * 0.4 + breach * 0.3);
      b.scale.y = 0.55 + open * (1.0 + Math.sin(t * 9 + i) * 0.4);
      b.rotation.z += dt * 0.18;
    }

    // Expanding shock rings on open + breach
    for (let i = 0; i < this.shockRings.length; i++) {
      const ring = this.shockRings[i];
      const m = ring.material as THREE.MeshBasicMaterial;
      const phase = (t * (0.55 + i * 0.15) + i * 0.4) % 1.4;
      const u = phase / 1.4;
      const show = open > 0.2 ? 1 : 0;
      m.opacity = show * (1 - u) * (0.45 + breach * 0.4);
      const sc = 0.4 + u * 2.2;
      ring.scale.set(sc, sc, sc);
    }

    this.portalLight.intensity = open * (110 + breach * 80) * pulse;
    this.portalLight2.intensity = open * (70 + breach * 50) * pulse;
    this.portalLight3.intensity = open * (55 + breach * 40);
    this.portalLight4.intensity = open * (40 + breach * 60);
    this.portalRoot.visible = open > 0.01;
    const baseScale = Math.max(1.75, this.half * 0.9);
    this.portalRoot.scale.setScalar(baseScale * (0.5 + open * 0.6 + breach * 0.08));
  }

  private driveCube(t: number, dt: number, H: number): void {
    if (!this.cube) return;
    const g = this.cube.group;
    const portalY = this.portalRoot.position.y;
    // Hold well below occluder mouth
    const bury = portalY - (H * 2.8 + 10);
    const rotating = this.animator?.isRotating ?? false;

    // Hidden until portal is fully open enough to birth the cube
    if (t < 2.7) {
      g.visible = false;
      g.position.set(0, bury, 0);
      g.scale.setScalar(0.55);
      if (!rotating) g.rotation.y += dt * 0.4;
      return;
    }

    g.visible = true;

    // Emergence: start just under the mouth (still occluded) then breach
    if (t < 7.0) {
      const u = smooth((t - 2.7) / 4.3);
      // Begin slightly under plane so depth occluder hides the approach
      const y0 = portalY - H * 0.35;
      const y1 = H * 0.28;
      const y = lerp(y0, y1, u);
      const chaos = Math.max(0, 1 - u * 1.15);
      g.position.set(
        Math.sin(t * 2.1) * chaos * H * 0.04,
        y,
        Math.cos(t * 1.6) * chaos * H * 0.035
      );
      if (!rotating) {
        g.rotation.x = Math.sin(t * 2.4) * chaos * 0.28;
        g.rotation.z = Math.cos(t * 1.9) * chaos * 0.24;
        g.rotation.y += dt * (0.35 + chaos * 1.6);
      }
      // Scale pop as it clears the mouth
      const scalePop = u < 0.35 ? smooth(u / 0.35) : 1;
      g.scale.setScalar(lerp(0.55, 1, scalePop) * (1 + Math.sin(t * 4) * 0.015 * (1 - u)));
      return;
    }

    if (t < 11.0) {
      const hover = H * 0.28 + Math.sin(t * 1.4) * H * 0.035;
      g.position.set(0, hover, 0);
      if (!rotating) {
        g.rotation.x = Math.sin(t * 0.5) * 0.05;
        g.rotation.z = Math.cos(t * 0.42) * 0.04;
        g.rotation.y += dt * 0.2;
      }
      g.scale.setScalar(1 + Math.sin(t * 3.2) * 0.02);
      return;
    }

    if (t < 14.5) {
      const u = smooth((t - 11.0) / 3.5);
      g.position.set(0, lerp(H * 0.28, 0.06, u), 0);
      if (!rotating) {
        g.rotation.x *= 0.9;
        g.rotation.z *= 0.9;
        g.rotation.y += dt * 0.1;
      }
      g.scale.setScalar(1);
      return;
    }

    const u = smooth((t - 14.5) / 4.5);
    g.position.x *= 0.88;
    g.position.z *= 0.88;
    g.position.y = lerp(g.position.y, 0, 0.1 + u * 0.22);
    g.rotation.x *= 0.86;
    g.rotation.z *= 0.86;
    if (!rotating) g.rotation.y += dt * 0.05 * (1 - u);
    g.scale.setScalar(1);
  }

  private driveCamera(t: number, H: number): void {
    if (!this.camera) return;

    // Establishing: low angle on dark floor as portal tears
    if (t < 2.6) {
      const p = t / 2.6;
      this.camera.setScriptedPose({
        yaw: 0.4 + p * 0.45,
        pitch: lerp(0.02, 0.22, smooth(p)),
        radius: lerp(H * 5.4, H * 4.4, smooth(p)),
        lookY: lerp(-H * 0.35, -H * 0.05, smooth(p)),
        lag: 3.0,
      });
      return;
    }
    // Pull back + orbit as cube emerges
    if (t < 7.0) {
      const p = (t - 2.6) / 4.4;
      this.camera.setScriptedPose({
        yaw: 0.85 + p * 2.4,
        pitch: lerp(0.22, 0.48, smooth(p)),
        radius: lerp(H * 4.4, H * 3.0, smooth(p)),
        lookY: lerp(-H * 0.05, H * 0.25, smooth(p)),
        lag: 2.6,
      });
      return;
    }
    // Hero orbit over skyline
    if (t < 11.0) {
      const p = (t - 7.0) / 4.0;
      this.camera.setScriptedPose({
        yaw: 3.25 + p * 1.5,
        pitch: lerp(0.48, 0.2, smooth(p)),
        radius: lerp(H * 3.2, H * 3.7, smooth(p)),
        lookY: lerp(H * 0.22, H * 0.1, smooth(p)),
        lag: 2.3,
      });
      return;
    }
    // Hard cut — low hero
    if (t < 11.08) {
      this.camera.setScriptedPose({
        yaw: -0.7,
        pitch: -0.28,
        radius: H * 2.35,
        lookY: H * 0.22,
        hard: true,
      });
      return;
    }
    if (t < 14.5) {
      const p = (t - 11.08) / 3.42;
      this.camera.setScriptedPose({
        yaw: -0.7 + p * 0.45,
        pitch: lerp(-0.28, -0.08, smooth(p)),
        radius: lerp(H * 2.35, H * 2.1, smooth(p)),
        lookY: H * 0.18,
        lag: 1.9,
      });
      return;
    }
    // Dock to combat seat
    const p = smooth((t - 14.5) / 4.5);
    const yaw = lerp(-0.25, 0.85, p);
    const pitch = lerp(-0.08, 0.28, p);
    const combatR = Math.max(H * 2.7, this.camera.radius * 0.9);
    const radius = lerp(H * 2.1, combatR, p);
    this.camera.setScriptedPose({
      yaw,
      pitch,
      radius,
      lookY: lerp(H * 0.18, 0, p),
      lag: 2.1,
    });
    this.camera.yaw = yaw;
    this.camera.pitch = pitch;
    this.camera.radius = radius;
  }

  private driveTitles(t: number): void {
    if (t >= 11.15 && t < 14.6) {
      this.showTitleA('THE CUBE HAS ARRIVED');
      this.showTitleB('');
      this.showSub('SECTOR 01 · FIRST CONTACT');
    } else if (t >= 14.7) {
      this.showTitleA('');
      this.showTitleB('DESTROY IT — SAVE HUMANITY');
      this.showSub('ALL UNITS ENGAGE');
    } else if (t >= 2.8 && t < 5.5) {
      this.showTitleA('');
      this.showTitleB('');
      this.showSub('ANOMALY BREACH DETECTED');
    } else {
      this.showTitleA('');
      this.showTitleB('');
      this.showSub('');
    }
  }

  private driveShifts(t: number): void {
    if (!this.animator) return;
    if (t < 2.9 || t > 11) return;
    if (this.shiftCount >= 16) return;
    if (t < this.nextShiftAt) return;
    this.animator.forceQuickShift(1);
    this.shiftCount++;
    try {
      this.audio?.playCubeShift();
    } catch {
      /* ignore */
    }
    const left = Math.max(1, 16 - this.shiftCount);
    const window = Math.max(0.25, 11 - t);
    this.nextShiftAt = t + (window / left) * (0.5 + Math.random() * 0.4);
  }

  private driveAudio(t: number): void {
    if (!this.audio) return;
    try {
      const open = this.portalOpen(t);
      // Portal open stinger
      if (!this.cuePortal && t >= 0.35) {
        this.cuePortal = true;
        this.audio.playCinematicPortalOpen();
      }
      // Continuous hum intensity
      if (t - this.lastHum > 0.12) {
        this.lastHum = t;
        this.audio.setCinematicPortalHum(open);
      }
      // Cube breach
      if (!this.cueBreach && t >= 3.15) {
        this.cueBreach = true;
        this.audio.playCinematicBreach();
      }
      // Settling impact when fully out
      if (!this.cueImpact && t >= 6.9) {
        this.cueImpact = true;
        this.audio.playCinematicImpact();
      }
      if (!this.cueHero && t >= 11.05) {
        this.cueHero = true;
        this.audio.playCinematicStinger('hero');
      }
      if (!this.cueTitleA && t >= 11.2) {
        this.cueTitleA = true;
        this.audio.playCinematicTitle(0);
      }
      if (!this.cueTitleB && t >= 14.75) {
        this.cueTitleB = true;
        this.audio.playCinematicTitle(1);
      }
    } catch {
      /* ignore */
    }
  }

  private spawnWorldParticles(t: number, d: number, H: number): void {
    if (!this.particles) return;
    const open = this.portalOpen(t);
    if (open < 0.04) return;

    this.particleBurstAccum += d;
    const rate = 70 * open;
    const py = this.portalRoot.position.y;
    while (this.particleBurstAccum > 1 / rate) {
      this.particleBurstAccum -= 1 / rate;
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 3.2) * Math.max(1.5, H * 0.48);
      // Bias particles around the mouth plane (not deep below)
      const y = py + (Math.random() - 0.15) * 1.6;
      const col =
        Math.random() < 0.4
          ? COLORS.cyan
          : Math.random() < 0.75
            ? COLORS.magenta
            : COLORS.white;
      this.particles.spawn(
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        col,
        2 + Math.floor(Math.random() * 3),
        3 + Math.random() * 6,
        Math.random() < 0.45 ? 'glow' : Math.random() < 0.5 ? 'ember' : 'spark'
      );
    }

    // Breach geyser
    if (t > 2.95 && t < 5.0 && Math.random() < d * 18) {
      this.particles.spawn(
        (Math.random() - 0.5) * H * 0.5,
        py + 0.4 + Math.random() * 1.5,
        (Math.random() - 0.5) * H * 0.5,
        Math.random() < 0.5 ? COLORS.magenta : COLORS.cyan,
        10,
        8,
        'glow'
      );
    }

    // Spawn debris chunks on breach
    if (t > 3.0 && t < 3.6 && Math.random() < d * 25) {
      this.spawnDebrisBit(py + 0.2, H);
    }
  }

  // ── Debris ────────────────────────────────────────────────

  private buildDebrisPool(): void {
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 + Math.random() * 0.25, 0.1, 0.15 + Math.random() * 0.2),
        new THREE.MeshBasicMaterial({
          color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      this.debrisRoot.add(mesh);
      this.debris.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
      });
    }
  }

  private resetDebris(): void {
    for (const d of this.debris) {
      d.life = 0;
      d.mesh.visible = false;
    }
  }

  private spawnDebrisBit(y: number, H: number): void {
    const d = this.debris.find((x) => x.life <= 0);
    if (!d) return;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * H * 0.25;
    d.mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    d.vel.set(
      (Math.random() - 0.5) * 6,
      2 + Math.random() * 5,
      (Math.random() - 0.5) * 6
    );
    d.spin.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
    d.life = 0.8 + Math.random() * 0.9;
    d.mesh.visible = true;
    d.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
  }

  private updateDebris(dt: number, _t: number): void {
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= 6 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const m = d.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, d.life * 0.9);
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  // ── Sparks ────────────────────────────────────────────────

  private resetSparks(): void {
    for (let i = 0; i < this.sparkCount; i++) this.respawnSpark(i, true);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  private respawnSpark(i: number, cold: boolean): void {
    const i3 = i * 3;
    const a = Math.random() * Math.PI * 2;
    const r = 0.1 + Math.random() * 4.6;
    // Local portal space (ring flat, root -90 X → world horizontal)
    this.sparkPos[i3] = Math.cos(a) * r;
    this.sparkPos[i3 + 1] = Math.sin(a) * r;
    // Mostly on/above the mouth — less deep spray that reads as “cube under”
    this.sparkPos[i3 + 2] = (Math.random() - 0.15) * 0.8;
    const speed = 1.2 + Math.random() * 5.5;
    this.sparkVel[i3] = Math.cos(a) * speed;
    this.sparkVel[i3 + 1] = Math.sin(a) * speed;
    this.sparkVel[i3 + 2] = 2 + Math.random() * 9;
    this.sparkLife[i] = cold ? Math.random() * 0.9 : 0.3 + Math.random() * 0.95;
    const roll = Math.random();
    if (roll < 0.42) {
      this.sparkCol[i3] = 0;
      this.sparkCol[i3 + 1] = 0.94;
      this.sparkCol[i3 + 2] = 1;
    } else if (roll < 0.85) {
      this.sparkCol[i3] = 1;
      this.sparkCol[i3 + 1] = 0;
      this.sparkCol[i3 + 2] = 0.67;
    } else {
      this.sparkCol[i3] = 1;
      this.sparkCol[i3 + 1] = 1;
      this.sparkCol[i3 + 2] = 1;
    }
  }

  private updateSparks(dt: number, t: number): void {
    const open = this.portalOpen(t);
    const mat = this.sparkPoints.material as THREE.PointsMaterial;
    mat.opacity = open * 0.98;
    mat.size = 0.32 + open * 0.28;
    this.sparkPoints.visible = open > 0.03;

    for (let i = 0; i < this.sparkCount; i++) {
      const i3 = i * 3;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) {
        if (open > 0.1) this.respawnSpark(i, false);
        else this.sparkPos[i3 + 2] = -999;
        continue;
      }
      this.sparkPos[i3] += this.sparkVel[i3] * dt;
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt;
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt;
      this.sparkVel[i3 + 2] -= 4.5 * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  // ── UI ────────────────────────────────────────────────────

  private mountUI(): void {
    this.teardownUI();
    this.uiRoot.classList.remove('panel-hidden');
    this.uiRoot.style.cssText =
      'display:block;position:absolute;inset:0;z-index:50;pointer-events:none;';
    this.uiRoot.innerHTML = '';

    const el = document.createElement('div');
    el.id = 'cin-overlay-live';
    el.setAttribute(
      'style',
      [
        'position:fixed',
        'inset:0',
        'z-index:99999',
        'pointer-events:none',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-family:Segoe UI,system-ui,monospace',
      ].join(';')
    );
    el.innerHTML = `
      <div style="position:absolute;left:0;right:0;top:0;height:10%;background:linear-gradient(#000,transparent);"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:10%;background:linear-gradient(transparent,#000);"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 22%,rgba(0,0,0,0.55) 70%,rgba(0,0,0,0.88) 100%);"></div>
      <div id="cin-title-sub" style="
        position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
        width:90%;text-align:center;
        font-size:clamp(10px,1.8vw,14px);font-weight:600;
        letter-spacing:0.42em;color:rgba(0,240,255,0.75);
        text-shadow:0 0 12px rgba(0,240,255,0.6);
        opacity:0;transition:opacity 0.4s ease;
        text-transform:uppercase;"></div>
      <div id="cin-title-a" style="
        position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);
        width:92%;text-align:center;
        font-size:clamp(22px,4.5vw,52px);font-weight:800;
        letter-spacing:0.28em;color:#00f0ff;
        text-shadow:0 0 28px rgba(0,240,255,1),0 0 70px rgba(255,0,170,0.5),0 2px 10px #000;
        opacity:0;transition:opacity 0.55s ease;
        text-transform:uppercase;"></div>
      <div id="cin-title-b" style="
        position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);
        width:92%;text-align:center;
        font-size:clamp(18px,3.6vw,42px);font-weight:800;
        letter-spacing:0.22em;color:#ff00aa;
        text-shadow:0 0 28px rgba(255,0,170,0.95),0 0 60px rgba(0,240,255,0.4),0 2px 10px #000;
        opacity:0;transition:opacity 0.55s ease;
        text-transform:uppercase;"></div>
      <button type="button" id="cin-skip" style="
        position:absolute;bottom:max(12px, env(safe-area-inset-bottom, 12px));right:max(12px, env(safe-area-inset-right, 12px));
        pointer-events:auto;
        font-size:11px;letter-spacing:0.22em;color:#e8ffff;
        background:rgba(0,0,0,0.7);border:1px solid rgba(0,240,255,0.5);
        padding:12px 16px;cursor:pointer;font-family:inherit;
        z-index:2;">SKIP INTRO</button>
    `;
    document.body.appendChild(el);
    this.overlayEl = el;
    this.titleA = el.querySelector('#cin-title-a');
    this.titleB = el.querySelector('#cin-title-b');
    this.titleSub = el.querySelector('#cin-title-sub');
    el.querySelector('#cin-skip')?.addEventListener('click', () => this.skip());
  }

  private showTitleA(text: string): void {
    if (!this.titleA) return;
    if (this.titleA.textContent !== text) this.titleA.textContent = text;
    this.titleA.style.opacity = text ? '1' : '0';
  }

  private showTitleB(text: string): void {
    if (!this.titleB) return;
    if (this.titleB.textContent !== text) this.titleB.textContent = text;
    this.titleB.style.opacity = text ? '1' : '0';
  }

  private showSub(text: string): void {
    if (!this.titleSub) return;
    if (this.titleSub.textContent !== text) this.titleSub.textContent = text;
    this.titleSub.style.opacity = text ? '1' : '0';
  }

  private teardownUI(): void {
    if (this.overlayEl?.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.titleA = null;
    this.titleB = null;
    this.titleSub = null;
    this.uiRoot.classList.add('panel-hidden');
    this.uiRoot.style.display = '';
    this.uiRoot.innerHTML = '';
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;

    try {
      this.audio?.setCinematicPortalHum(0);
      this.audio?.stopCinematicBed();
      this.audio?.playCinematicStinger('end');
    } catch {
      /* ignore */
    }

    if (this.cube) {
      this.cube.group.position.set(0, 0, 0);
      this.cube.group.rotation.set(0, 0, 0);
      this.cube.group.quaternion.identity();
      this.cube.group.scale.setScalar(1);
      this.cube.group.visible = false;
    }
    if (this.animator) {
      this.animator.endCinematicBurst();
      this.animator.reset();
    }
    if (this.camera) {
      if (this.cube) this.camera.setOrbitLimits(this.cube.halfExtent, false);
      const seat = this.camera.getDefaultCombatPose();
      this.camera.endCinematic(seat);
    }

    this.group.visible = false;
    this.teardownUI();
  }

  // ── Geometry ──────────────────────────────────────────────

  private buildPortal(): void {
    this.portalRoot.rotation.x = -Math.PI / 2;

    // Depth-writing OPAQUE mouth discs — hide anything under the portal plane
    const occluderSpecs = [
      { r: 4.6, color: 0x030014, z: -0.02 },
      { r: 3.8, color: 0x0a0020, z: 0.0 },
      { r: 2.6, color: 0x120028, z: 0.015 },
    ];
    for (const o of occluderSpecs) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(o.r, 72),
        new THREE.MeshBasicMaterial({
          color: o.color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: true,
          depthTest: true,
          // Normal blending — not additive — so it actually occludes
          blending: THREE.NormalBlending,
        })
      );
      disc.position.z = o.z;
      disc.renderOrder = 1;
      this.occluders.push(disc);
      this.portalRoot.add(disc);
    }

    // Bright additive rings on top of occluder
    const ringSpecs = [
      { r: 4.0, tube: 0.42, color: COLORS.magenta },
      { r: 4.7, tube: 0.22, color: COLORS.cyan },
      { r: 5.35, tube: 0.12, color: 0xffffff },
      { r: 5.9, tube: 0.07, color: COLORS.magenta },
      { r: 6.4, tube: 0.04, color: COLORS.cyan },
    ];
    for (const spec of ringSpecs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(spec.r, spec.tube, 18, 96),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.renderOrder = 3;
      this.rings.push(ring);
      this.portalRoot.add(ring);
    }

    // Layered additive glow discs (bloom volume)
    const glowSpecs = [
      { r: 4.3, color: COLORS.magenta },
      { r: 3.5, color: 0xff44cc },
      { r: 2.8, color: COLORS.cyan },
      { r: 2.0, color: 0x88ffff },
      { r: 1.3, color: 0xffffff },
      { r: 0.7, color: 0xffffff },
    ];
    for (let i = 0; i < glowSpecs.length; i++) {
      const g = glowSpecs[i];
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(g.r, 64),
        new THREE.MeshBasicMaterial({
          color: g.color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      disc.position.z = 0.03 + i * 0.025;
      disc.renderOrder = 4;
      this.glowDiscs.push(disc);
      this.portalRoot.add(disc);
    }

    // Vertical shaft layers (local Z is “up” after root X rotation)
    // Dark occluding shaft below
    for (let i = 0; i < 4; i++) {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4 - i * 0.15, 2.9 - i * 0.1, 3.5 + i * 1.2, 28, 1, true),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x0a0018 : 0x001520,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: i < 2,
          blending: i < 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
        })
      );
      // Cylinder along local Z so it goes below the plane in world after rotation
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -(1.8 + i * 1.1);
      shaft.renderOrder = 0;
      this.shaftLayers.push(shaft);
      this.portalRoot.add(shaft);
    }
    // Upward glow plume
    for (let i = 0; i < 3; i++) {
      const plume = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2 - i * 0.4, 3.0 - i * 0.3, 2.2 + i * 0.6, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      plume.rotation.x = Math.PI / 2;
      plume.position.z = 1.0 + i * 0.7;
      plume.renderOrder = 5;
      this.shaftLayers.push(plume);
      this.portalRoot.add(plume);
    }

    // Soft mist spheres for blur (around mouth)
    for (let i = 0; i < 8; i++) {
      const mist = new THREE.Mesh(
        new THREE.SphereGeometry(1.4 + (i % 3) * 0.5, 16, 12),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.magenta : COLORS.cyan,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const a = (i / 8) * Math.PI * 2;
      mist.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.4);
      mist.renderOrder = 6;
      this.mistColumns.push(mist);
      this.portalRoot.add(mist);
    }

    // Energy pillars
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.16, 7.5, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      beam.position.set(Math.cos(a) * 3.7, Math.sin(a) * 3.7, 3.0);
      beam.rotation.x = Math.PI / 2;
      beam.renderOrder = 5;
      this.energyBeams.push(beam);
      this.portalRoot.add(beam);
    }

    // Shockwave rings
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.05, 48),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.position.z = 0.08;
      ring.renderOrder = 7;
      this.shockRings.push(ring);
      this.portalRoot.add(ring);
    }

    this.portalLight = new THREE.PointLight(COLORS.magenta, 0, 85, 1.6);
    this.portalLight.position.set(0, 0, 3.5);
    this.portalLight2 = new THREE.PointLight(COLORS.cyan, 0, 70, 1.6);
    this.portalLight2.position.set(0, 0, -2);
    this.portalLight3 = new THREE.PointLight(0xffffff, 0, 50, 1.8);
    this.portalLight3.position.set(0, 0, 6);
    this.portalLight4 = new THREE.PointLight(0xff66cc, 0, 60, 1.7);
    this.portalLight4.position.set(0, 0, 1);
    this.portalRoot.add(
      this.portalLight,
      this.portalLight2,
      this.portalLight3,
      this.portalLight4
    );

    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkCol = new Float32Array(this.sparkCount * 3);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.4,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 8;
    this.portalRoot.add(this.sparkPoints);
  }

  private buildCity(): void {
    const neonMat = (color: number, intensity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: intensity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    for (let i = 0; i < 55; i++) {
      const h = 5 + Math.random() * 28;
      const w = 0.7 + Math.random() * 1.8;
      const d = 0.7 + Math.random() * 1.8;
      const px = (Math.random() - 0.5) * 120;
      const pz = (Math.random() - 0.5) * 120;
      if (Math.hypot(px, pz) < 26) continue;

      const col = Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta;
      const edge = neonMat(col, 0.12 + Math.random() * 0.28);
      for (const [ex, ez] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ] as const) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), edge);
        line.position.set(px + ex, h * 0.5, pz + ez);
        this.cityRoot.add(line);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), edge);
      roof.position.set(px, h, pz);
      this.cityRoot.add(roof);
      // Occasional roof beacon
      if (Math.random() < 0.25) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          neonMat(col, 0.7)
        );
        beacon.position.set(px, h + 0.4, pz);
        this.cityRoot.add(beacon);
      }
    }

    const grid = new THREE.GridHelper(140, 48, 0x00f0ff, 0x001820);
    grid.position.y = 0.02;
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm))
      gm.forEach((m) => {
        m.transparent = true;
        (m as THREE.Material & { opacity: number }).opacity = 0.3;
      });
    else {
      gm.transparent = true;
      (gm as THREE.Material & { opacity: number }).opacity = 0.3;
    }
    this.cityRoot.add(grid);
  }

  dispose(): void {
    if (this.active) this.finish();
    this.teardownUI();
    try {
      this.audio?.stopCinematicBed();
      this.audio?.setCinematicPortalHum(0);
    } catch {
      /* ignore */
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}
