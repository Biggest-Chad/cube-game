/**
 * Stage-1 cinematic director (~15s) — rewritten from scratch.
 *
 * Storyboard:
 *  0.0–1.2  Portal ignites in the void
 *  1.2–5.0  Cube erupts through the portal, Rubik-shifting erratically
 *  5.0–8.5  Hero orbit over a neon city; cube floats ominously
 *  8.5–12.0 Menacing low-angle hold — "THE CUBE HAS ARRIVED"
 * 12.0–15.0 Pull back into ship third-person — "DESTROY IT — SAVE HUMANITY"
 *
 * Camera is driven only via OrbitalCamera scripted poses (no raw camera.position fights).
 * Cube transform is keyframed smoothly and fully reset on finish.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import type { CubeAnimator } from '../cube/CubeAnimator';
import type { OrbitalCamera } from '../player/OrbitalCamera';
import type { Ship } from '../player/Ship';
import type { ParticlePool } from './ParticlePool';

function smoothstep(t: number): number {
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
  private readonly duration = 15;

  private cube: CubeManager | null = null;
  private animator: CubeAnimator | null = null;
  private camera: OrbitalCamera | null = null;
  private ship: Ship | null = null;
  private particles: ParticlePool | null = null;
  private half = 6;

  private portalRoot = new THREE.Group();
  private portalRing!: THREE.Mesh;
  private portalCore!: THREE.Mesh;
  private portalHalo!: THREE.Mesh;
  private cityRoot = new THREE.Group();
  private titleEl: HTMLElement | null = null;
  private lastTitle = '';
  private nextShiftAt = 1.4;
  private shiftCount = 0;

  constructor(uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.group.name = 'CinematicIntro';
    this.buildPortal();
    this.buildCity();
    this.group.add(this.portalRoot, this.cityRoot);
    this.group.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  /**
   * Begin cinematic after the level cube is loaded at origin.
   */
  start(opts: {
    cube: CubeManager;
    animator: CubeAnimator;
    camera: OrbitalCamera;
    ship: Ship;
    particles?: ParticlePool;
  }): void {
    this.cube = opts.cube;
    this.animator = opts.animator;
    this.camera = opts.camera;
    this.ship = opts.ship;
    this.particles = opts.particles ?? null;
    this.half = Math.max(3, opts.cube.halfExtent);
    this.active = true;
    this.t = 0;
    this.lastTitle = '';
    this.nextShiftAt = 1.35;
    this.shiftCount = 0;

    // Scale portal to cube
    const s = Math.max(1.2, this.half * 0.65);
    this.portalRoot.scale.setScalar(s);
    this.portalRoot.position.set(0, -this.half * 0.2, 0);
    this.cityRoot.position.set(0, -this.half * 2.2 - 6, 0);
    this.cityRoot.scale.setScalar(Math.max(1, this.half / 6));

    // Cube buried under portal, ready to rise
    const bury = -(this.half * 2.6 + 8);
    this.cube.group.position.set(0, bury, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.scale.setScalar(0.85);
    this.cube.group.quaternion.identity();

    // Scramble engine hot for emerge phase
    this.animator.reset();
    this.animator.setEnabled(true);
    this.animator.beginCinematicBurst();

    // Ship hidden until final handoff
    this.ship.group.visible = false;

    // Opening camera: looking at portal from mid distance
    this.camera.beginScriptedCinematic({
      yaw: 0.55,
      pitch: 0.12,
      radius: this.half * 4.6,
      lookY: -this.half * 0.4,
    });

    this.group.visible = true;
    this.portalRoot.visible = true;
    this.cityRoot.visible = true;
    this.mountUI();
  }

  /**
   * @returns true when finished
   */
  update(dt: number): boolean {
    if (!this.active || !this.cube || !this.camera || !this.animator) return true;

    // Clamp huge hitch frames so skips don't jump whole acts
    const d = Math.min(0.05, dt);
    this.t += d;
    const t = this.t;
    const H = this.half;

    // Always tick animator for slice drama (controlled schedule below)
    this.animator.update(d);

    // ── Portal VFX ──
    this.drivePortal(t, d);

    // ── Cube transform keyframes ──
    this.driveCube(t, d, H);

    // ── Controlled Rubik shifts during emerge / pulse ──
    if (t >= 1.2 && t < 8.0 && t >= this.nextShiftAt && this.shiftCount < 14) {
      this.animator.forceQuickShift(0.8 + Math.random() * 0.6);
      this.shiftCount++;
      const remaining = Math.max(1, 14 - this.shiftCount);
      const windowLeft = Math.max(0.2, 8.0 - t);
      this.nextShiftAt = t + (windowLeft / remaining) * (0.55 + Math.random() * 0.55);
    }

    // ── Particles from portal ──
    if (this.particles && t > 0.6 && t < 5.5 && Math.random() < d * 22) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.5 + Math.random() * 2.2) * Math.max(1, H * 0.35);
      const py = this.portalRoot.position.y + (Math.random() - 0.3) * 2;
      this.particles.spawn(
        Math.cos(a) * r,
        py,
        Math.sin(a) * r,
        Math.random() < 0.55 ? COLORS.cyan : COLORS.magenta,
        2,
        1.5 + Math.random() * 2,
        Math.random() < 0.4 ? 'glow' : 'ember'
      );
    }

    // ── Camera storyboard ──
    this.driveCamera(t, H);

    // ── Titles ──
    if (t >= 8.6 && t < 12.0) {
      this.setTitle('THE CUBE HAS ARRIVED');
    } else if (t >= 12.0) {
      this.setTitle('DESTROY IT — SAVE HUMANITY');
    } else {
      this.setTitle('');
    }

    // Keep scripted camera lag advancing
    this.camera.updateScriptedCinematic(d);

    if (t >= this.duration) {
      this.finish();
      return true;
    }
    return false;
  }

  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  // ─────────────────────────────────────────────
  // Drivers
  // ─────────────────────────────────────────────

  private drivePortal(t: number, dt: number): void {
    // Ignite 0–1.2, hold, then fade after cube is free
    let open = 0;
    if (t < 1.2) open = smoothstep(t / 1.2);
    else if (t < 5.5) open = 1;
    else open = Math.max(0, 1 - (t - 5.5) / 2.2);

    const pulse = 0.85 + Math.sin(t * 8) * 0.15;
    (this.portalRing.material as THREE.MeshBasicMaterial).opacity = open * 0.9 * pulse;
    (this.portalCore.material as THREE.MeshBasicMaterial).opacity = open * 0.45 * pulse;
    (this.portalHalo.material as THREE.MeshBasicMaterial).opacity = open * 0.25;
    this.portalRing.rotation.z += dt * (1.1 + open);
    this.portalHalo.rotation.z -= dt * 0.6;
    this.portalRoot.scale.setScalar(
      Math.max(1.2, this.half * 0.65) * (0.75 + open * 0.35)
    );
    this.portalRoot.visible = open > 0.02;
  }

  private driveCube(t: number, dt: number, H: number): void {
    if (!this.cube) return;
    const g = this.cube.group;
    const bury = -(H * 2.6 + 8);

    if (t < 1.2) {
      // Waiting under portal
      g.position.set(0, bury, 0);
      g.scale.setScalar(0.75);
      g.rotation.set(0, t * 0.4, 0);
      return;
    }

    if (t < 5.0) {
      // Rise through portal with chaotic tumble that settles
      const u = smoothstep((t - 1.2) / 3.6);
      const y = lerp(bury, H * 0.15, u);
      const chaos = 1 - u;
      g.position.set(
        Math.sin(t * 2.4) * chaos * H * 0.08,
        y,
        Math.cos(t * 1.7) * chaos * H * 0.06
      );
      g.rotation.x = Math.sin(t * 3.1) * chaos * 0.55;
      g.rotation.z = Math.cos(t * 2.6) * chaos * 0.45;
      g.rotation.y += dt * (0.4 + chaos * 2.2);
      g.scale.setScalar(lerp(0.75, 1, u));
      return;
    }

    if (t < 8.5) {
      // Hover pulse above city
      const hover = H * 0.25 + Math.sin(t * 1.8) * H * 0.04;
      g.position.set(0, hover, 0);
      g.rotation.x = Math.sin(t * 0.7) * 0.08;
      g.rotation.z = Math.cos(t * 0.55) * 0.06;
      g.rotation.y += dt * 0.28;
      const pulse = 1 + Math.sin(t * 4.5) * 0.035;
      g.scale.setScalar(pulse);
      return;
    }

    if (t < 12.0) {
      // Menacing settle slightly lower
      const u = smoothstep((t - 8.5) / 3.5);
      g.position.set(0, lerp(H * 0.25, H * 0.05, u), 0);
      g.rotation.x *= 0.92;
      g.rotation.z *= 0.92;
      g.rotation.y += dt * 0.18;
      g.scale.setScalar(1);
      return;
    }

    // Final dock to origin for gameplay
    const u = smoothstep((t - 12) / 3);
    g.position.lerp(new THREE.Vector3(0, 0, 0), 0.12 + u * 0.2);
    g.rotation.x *= 0.88;
    g.rotation.z *= 0.88;
    g.rotation.y += dt * 0.1 * (1 - u);
    g.scale.setScalar(1);
    if (u > 0.55 && this.ship) this.ship.group.visible = true;
  }

  private driveCamera(t: number, H: number): void {
    if (!this.camera) return;

    if (t < 1.2) {
      // Hold on portal ignition
      const p = t / 1.2;
      this.camera.setScriptedPose({
        yaw: 0.55 + p * 0.2,
        pitch: lerp(0.05, 0.18, p),
        radius: H * 4.4,
        lookY: -H * 0.35,
        lag: 4,
      });
      return;
    }

    if (t < 5.0) {
      // Orbit the emerging cube
      const p = (t - 1.2) / 3.8;
      this.camera.setScriptedPose({
        yaw: 0.75 + p * 2.1,
        pitch: lerp(0.18, 0.38, p),
        radius: lerp(H * 4.2, H * 3.0, p),
        lookY: lerp(-H * 0.2, H * 0.15, p),
        lag: 3.2,
      });
      return;
    }

    if (t < 8.5) {
      // Sweeping cinematic arc above the city
      const p = (t - 5.0) / 3.5;
      this.camera.setScriptedPose({
        yaw: 2.85 + p * 1.6,
        pitch: lerp(0.42, 0.22, p),
        radius: lerp(H * 3.4, H * 3.8, p),
        lookY: lerp(H * 0.2, H * 0.05, p),
        lag: 2.6,
      });
      return;
    }

    if (t < 8.55) {
      // Hard cut to menacing low angle
      this.camera.setScriptedPose({
        yaw: -0.65,
        pitch: -0.22,
        radius: H * 2.4,
        lookY: H * 0.2,
        hard: true,
      });
      return;
    }

    if (t < 12.0) {
      // Slow push-in under the cube
      const p = (t - 8.55) / 3.45;
      this.camera.setScriptedPose({
        yaw: -0.65 + p * 0.4,
        pitch: lerp(-0.22, -0.1, p),
        radius: lerp(H * 2.4, H * 2.15, p),
        lookY: H * 0.18,
        lag: 2.0,
      });
      return;
    }

    // Blend toward gameplay third-person seat
    const p = smoothstep((t - 12) / 3);
    this.camera.setScriptedPose({
      yaw: lerp(-0.25, 0.85, p),
      pitch: lerp(-0.1, 0.28, p),
      radius: lerp(H * 2.15, H * 2.7, p),
      lookY: lerp(H * 0.18, 0, p),
      lag: 2.4,
    });
    // Seed gameplay orbit so endCinematic lands cleanly
    this.camera.yaw = lerp(-0.25, 0.85, p);
    this.camera.pitch = lerp(-0.1, 0.28, p);
  }

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  private mountUI(): void {
    this.uiRoot.classList.remove('panel-hidden');
    this.uiRoot.innerHTML = `
      <div class="cinematic-overlay">
        <div class="cinematic-letterbox top"></div>
        <div class="cinematic-letterbox bottom"></div>
        <div class="cinematic-vignette"></div>
        <div class="cinematic-title" id="cin-title"></div>
        <button type="button" class="cinematic-skip" id="cin-skip">SKIP INTRO</button>
      </div>
    `;
    this.titleEl = this.uiRoot.querySelector('#cin-title');
    this.uiRoot.querySelector('#cin-skip')?.addEventListener('click', () => this.skip());
  }

  private setTitle(text: string): void {
    if (!this.titleEl) return;
    if (text === this.lastTitle) return;
    this.lastTitle = text;
    this.titleEl.textContent = text;
    this.titleEl.classList.toggle('cinematic-title-visible', text.length > 0);
    if (text) {
      this.titleEl.classList.remove('cinematic-title-pop');
      void this.titleEl.offsetWidth;
      this.titleEl.classList.add('cinematic-title-pop');
    }
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;

    if (this.cube) {
      this.cube.group.position.set(0, 0, 0);
      this.cube.group.rotation.set(0, 0, 0);
      this.cube.group.quaternion.identity();
      this.cube.group.scale.setScalar(1);
    }
    if (this.animator) {
      this.animator.endCinematicBurst();
      this.animator.reset();
      this.animator.setEnabled(true);
    }
    if (this.camera) {
      this.camera.yaw = 0.85;
      this.camera.pitch = 0.28;
      if (this.cube) this.camera.setOrbitLimits(this.cube.halfExtent);
      this.camera.endCinematic();
    }
    if (this.ship) {
      this.ship.group.visible = true;
      if (this.camera) this.ship.update(this.camera, 1 / 30);
    }

    this.group.visible = false;
    this.uiRoot.classList.add('panel-hidden');
    this.uiRoot.innerHTML = '';
    this.titleEl = null;
    this.lastTitle = '';
  }

  // ─────────────────────────────────────────────
  // Geometry
  // ─────────────────────────────────────────────

  private buildPortal(): void {
    this.portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.28, 14, 64),
      new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.portalCore = new THREE.Mesh(
      new THREE.CircleGeometry(4.9, 48),
      new THREE.MeshBasicMaterial({
        color: 0x1a0030,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.portalHalo = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 0.08, 8, 64),
      new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    // Lay portal flat-ish so cube rises "through" the floor of space
    this.portalRoot.rotation.x = -Math.PI / 2.4;
    this.portalRoot.add(this.portalRing, this.portalCore, this.portalHalo);

    // Spokes
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 3.2),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const a = (i / 8) * Math.PI * 2;
      spoke.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
      spoke.lookAt(0, 0, 0);
      this.portalRoot.add(spoke);
    }
  }

  private buildCity(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x081018,
      emissive: 0x002233,
      emissiveIntensity: 0.45,
      metalness: 0.7,
      roughness: 0.45,
    });
    const neon = new THREE.MeshStandardMaterial({
      color: 0x001018,
      emissive: COLORS.cyan,
      emissiveIntensity: 0.55,
      metalness: 0.4,
      roughness: 0.35,
    });

    for (let i = 0; i < 48; i++) {
      const h = 2 + Math.random() * 14;
      const w = 1.1 + Math.random() * 1.8;
      const d = 1.1 + Math.random() * 1.8;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        Math.random() < 0.18 ? neon : mat
      );
      b.position.set(
        (Math.random() - 0.5) * 70,
        h * 0.5,
        (Math.random() - 0.5) * 70
      );
      this.cityRoot.add(b);
    }

    const grid = new THREE.GridHelper(90, 45, 0x00f0ff, 0x002233);
    grid.position.y = 0.02;
    this.cityRoot.add(grid);

    // Horizon glow disc
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(50, 32),
      new THREE.MeshBasicMaterial({
        color: 0x001a22,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    this.cityRoot.add(glow);
  }

  dispose(): void {
    if (this.active) this.finish();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
  }
}
