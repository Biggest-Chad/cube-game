/**
 * Stage-1 cinematic — full rebuild.
 *
 * Timeline (~16s):
 *  0–2s    Portal rips open (rings, glows, sparks, beams, particles)
 *  2–6s    Cube rises through portal while Rubik-shifting
 *  6–9s    Hero orbit over neon skyline
 *  9–12.5s Title: THE CUBE HAS ARRIVED
 *  12.5–16s Dock to gameplay + DESTROY IT — SAVE HUMANITY
 *
 * Ship is fully parked & invisible until finish() — never mid-cube.
 * Titles mount on document.body (z-index 99999) so nothing can bury them.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import type { CubeAnimator } from '../cube/CubeAnimator';
import type { OrbitalCamera } from '../player/OrbitalCamera';
import type { Ship } from '../player/Ship';
import type { ParticlePool } from './ParticlePool';

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
  private readonly duration = 16;

  private cube: CubeManager | null = null;
  private animator: CubeAnimator | null = null;
  private camera: OrbitalCamera | null = null;
  private ship: Ship | null = null;
  private particles: ParticlePool | null = null;
  private half = 6;

  private portalRoot = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private glowDiscs: THREE.Mesh[] = [];
  private energyBeams: THREE.Mesh[] = [];
  private portalLight!: THREE.PointLight;
  private portalLight2!: THREE.PointLight;
  private portalLight3!: THREE.PointLight;

  private sparkPoints!: THREE.Points;
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPos!: Float32Array;
  private sparkCol!: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkCount = 480;

  private cityRoot = new THREE.Group();
  private overlayEl: HTMLElement | null = null;
  private titleA: HTMLElement | null = null;
  private titleB: HTMLElement | null = null;
  private nextShiftAt = 1.5;
  private shiftCount = 0;
  private particleBurstAccum = 0;

  constructor(uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.group.name = 'CinematicIntro';
    this.sparkVel = new Float32Array(this.sparkCount * 3);
    this.sparkLife = new Float32Array(this.sparkCount);
    this.buildPortal();
    this.buildCity();
    this.group.add(this.portalRoot, this.cityRoot);
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
  }): void {
    this.cube = opts.cube;
    this.animator = opts.animator;
    this.camera = opts.camera;
    this.ship = opts.ship;
    this.particles = opts.particles ?? null;
    this.half = Math.max(3.5, opts.cube.halfExtent);
    this.active = true;
    this.t = 0;
    this.nextShiftAt = 1.6;
    this.shiftCount = 0;
    this.particleBurstAccum = 0;

    const s = Math.max(1.6, this.half * 0.85);
    this.portalRoot.scale.setScalar(s);
    this.portalRoot.position.set(0, -this.half * 0.05, 0);
    // City far below — never clips the portal
    this.cityRoot.position.set(0, -this.half * 4.5 - 18, 0);
    this.cityRoot.scale.setScalar(Math.max(1.2, this.half / 4.5));

    const bury = -(this.half * 3.5 + 14);
    this.cube.group.position.set(0, bury, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.quaternion.identity();
    this.cube.group.scale.setScalar(0.72);

    // Ship: hard hide — scale 0 + far park + invisible (no mid-cube ghost)
    this.ship.group.visible = false;
    this.ship.group.scale.setScalar(0);
    this.ship.group.position.set(0, -500, 0);

    this.animator.reset();
    this.animator.setEnabled(true);
    this.animator.beginCinematicBurst();

    this.camera.beginScriptedCinematic({
      yaw: 0.55,
      pitch: 0.08,
      radius: this.half * 5.2,
      lookY: -this.half * 0.35,
    });

    this.resetSparks();
    this.group.visible = true;
    this.mountUI();
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

    // Keep ship suppressed every frame (nothing can re-show it mid-cut)
    this.ship.group.visible = false;
    this.ship.group.scale.setScalar(0);

    this.animator.update(d);
    this.updateSparks(d, t);
    this.drivePortal(t, d);
    this.driveCube(t, d, H);
    this.driveCamera(t, H);
    this.driveTitles(t);
    this.driveShifts(t);
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

  // ── Timeline drivers ──────────────────────────────────────

  private portalOpen(t: number): number {
    if (t < 0.3) return 0;
    if (t < 2.0) return smooth((t - 0.3) / 1.7);
    if (t < 6.5) return 1;
    if (t < 9) return Math.max(0, 1 - smooth((t - 6.5) / 2.5));
    return 0;
  }

  private drivePortal(t: number, dt: number): void {
    const open = this.portalOpen(t);
    const pulse = 0.8 + Math.sin(t * 11) * 0.2 + Math.sin(t * 23) * 0.08;

    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i].material as THREE.MeshBasicMaterial;
      const base = i === 0 ? 1.0 : i === 1 ? 0.75 : i === 2 ? 0.55 : 0.4;
      m.opacity = open * base * pulse;
      this.rings[i].rotation.z += dt * (0.6 + i * 0.4) * (i % 2 === 0 ? 1 : -1);
      const breathe = 1 + Math.sin(t * 5 + i) * 0.03 * open;
      this.rings[i].scale.setScalar(breathe);
    }

    for (let i = 0; i < this.glowDiscs.length; i++) {
      const m = this.glowDiscs[i].material as THREE.MeshBasicMaterial;
      const base = i === 0 ? 0.55 : i === 1 ? 0.35 : 0.2;
      m.opacity = open * base * pulse;
      this.glowDiscs[i].rotation.z -= dt * (0.3 + i * 0.15);
    }

    for (let i = 0; i < this.energyBeams.length; i++) {
      const b = this.energyBeams[i];
      const m = b.material as THREE.MeshBasicMaterial;
      m.opacity = open * (0.35 + pulse * 0.35);
      b.scale.y = 0.6 + open * (0.8 + Math.sin(t * 8 + i) * 0.35);
      b.rotation.z += dt * 0.15;
    }

    this.portalLight.intensity = open * 90 * pulse;
    this.portalLight2.intensity = open * 55 * pulse;
    this.portalLight3.intensity = open * 40;
    this.portalRoot.visible = open > 0.01;
    const baseScale = Math.max(1.6, this.half * 0.85);
    this.portalRoot.scale.setScalar(baseScale * (0.55 + open * 0.55));
  }

  private driveCube(t: number, dt: number, H: number): void {
    if (!this.cube) return;
    const g = this.cube.group;
    const bury = -(H * 3.5 + 14);
    const rotating = this.animator?.isRotating ?? false;

    if (t < 1.8) {
      g.position.set(0, bury, 0);
      g.scale.setScalar(0.72);
      if (!rotating) g.rotation.y += dt * 0.25;
      return;
    }

    if (t < 6.0) {
      const u = smooth((t - 1.8) / 4.0);
      const y = lerp(bury, H * 0.22, u);
      const chaos = 1 - u;
      g.position.set(
        Math.sin(t * 2.0) * chaos * H * 0.05,
        y,
        Math.cos(t * 1.5) * chaos * H * 0.04
      );
      // Only tumble when lattice slices are idle (no compound jitter)
      if (!rotating) {
        g.rotation.x = Math.sin(t * 2.5) * chaos * 0.32;
        g.rotation.z = Math.cos(t * 2.0) * chaos * 0.28;
        g.rotation.y += dt * (0.3 + chaos * 1.5);
      }
      g.scale.setScalar(lerp(0.72, 1, u));
      return;
    }

    if (t < 9.5) {
      const hover = H * 0.25 + Math.sin(t * 1.5) * H * 0.03;
      g.position.set(0, hover, 0);
      if (!rotating) {
        g.rotation.x = Math.sin(t * 0.55) * 0.05;
        g.rotation.z = Math.cos(t * 0.45) * 0.04;
        g.rotation.y += dt * 0.22;
      }
      g.scale.setScalar(1 + Math.sin(t * 3.5) * 0.02);
      return;
    }

    if (t < 12.5) {
      const u = smooth((t - 9.5) / 3.0);
      g.position.set(0, lerp(H * 0.25, 0.04, u), 0);
      if (!rotating) {
        g.rotation.x *= 0.92;
        g.rotation.z *= 0.92;
        g.rotation.y += dt * 0.12;
      }
      g.scale.setScalar(1);
      return;
    }

    const u = smooth((t - 12.5) / 3.5);
    g.position.x *= 0.9;
    g.position.z *= 0.9;
    g.position.y = lerp(g.position.y, 0, 0.12 + u * 0.2);
    g.rotation.x *= 0.88;
    g.rotation.z *= 0.88;
    if (!rotating) g.rotation.y += dt * 0.06 * (1 - u);
    g.scale.setScalar(1);
  }

  private driveCamera(t: number, H: number): void {
    if (!this.camera) return;

    if (t < 1.8) {
      const p = t / 1.8;
      this.camera.setScriptedPose({
        yaw: 0.5 + p * 0.3,
        pitch: lerp(0.02, 0.18, p),
        radius: H * 5.0,
        lookY: -H * 0.3,
        lag: 3.2,
      });
      return;
    }
    if (t < 6) {
      const p = (t - 1.8) / 4.2;
      this.camera.setScriptedPose({
        yaw: 0.8 + p * 2.2,
        pitch: lerp(0.18, 0.42, p),
        radius: lerp(H * 4.6, H * 3.1, p),
        lookY: lerp(-H * 0.1, H * 0.22, p),
        lag: 2.8,
      });
      return;
    }
    if (t < 9.5) {
      const p = (t - 6) / 3.5;
      this.camera.setScriptedPose({
        yaw: 3.0 + p * 1.4,
        pitch: lerp(0.42, 0.22, p),
        radius: lerp(H * 3.4, H * 3.8, p),
        lookY: lerp(H * 0.2, H * 0.08, p),
        lag: 2.4,
      });
      return;
    }
    if (t < 9.55) {
      // Hard cut to low hero
      this.camera.setScriptedPose({
        yaw: -0.65,
        pitch: -0.26,
        radius: H * 2.4,
        lookY: H * 0.2,
        hard: true,
      });
      return;
    }
    if (t < 12.5) {
      const p = (t - 9.55) / 2.95;
      this.camera.setScriptedPose({
        yaw: -0.65 + p * 0.4,
        pitch: lerp(-0.26, -0.1, p),
        radius: lerp(H * 2.4, H * 2.15, p),
        lookY: H * 0.18,
        lag: 2,
      });
      return;
    }
    const p = smooth((t - 12.5) / 3.5);
    const yaw = lerp(-0.25, 0.85, p);
    const pitch = lerp(-0.1, 0.28, p);
    const radius = lerp(H * 2.15, H * 2.75, p);
    this.camera.setScriptedPose({
      yaw,
      pitch,
      radius,
      lookY: lerp(H * 0.18, 0, p),
      lag: 2.2,
    });
    this.camera.yaw = yaw;
    this.camera.pitch = pitch;
  }

  private driveTitles(t: number): void {
    if (t >= 9.6 && t < 12.6) {
      this.showTitleA('THE CUBE HAS ARRIVED');
      this.showTitleB('');
    } else if (t >= 12.6) {
      this.showTitleA('');
      this.showTitleB('DESTROY IT — SAVE HUMANITY');
    } else {
      this.showTitleA('');
      this.showTitleB('');
    }
  }

  private driveShifts(t: number): void {
    if (!this.animator) return;
    if (t < 1.8 || t > 9) return;
    if (this.shiftCount >= 14) return;
    if (t < this.nextShiftAt) return;
    this.animator.forceQuickShift(1);
    this.shiftCount++;
    const left = Math.max(1, 14 - this.shiftCount);
    const window = Math.max(0.3, 9 - t);
    this.nextShiftAt = t + (window / left) * (0.55 + Math.random() * 0.45);
  }

  private spawnWorldParticles(t: number, d: number, H: number): void {
    if (!this.particles) return;
    const open = this.portalOpen(t);
    if (open < 0.05) return;

    this.particleBurstAccum += d;
    // Dense portal particle fountain
    const rate = 55 * open;
    while (this.particleBurstAccum > 1 / rate) {
      this.particleBurstAccum -= 1 / rate;
      const a = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 2.8) * Math.max(1.4, H * 0.45);
      const py = this.portalRoot.position.y + (Math.random() - 0.2) * 2;
      const col =
        Math.random() < 0.45
          ? COLORS.cyan
          : Math.random() < 0.7
            ? COLORS.magenta
            : COLORS.white;
      this.particles.spawn(
        Math.cos(a) * r,
        py,
        Math.sin(a) * r,
        col,
        2 + Math.floor(Math.random() * 3),
        3 + Math.random() * 5,
        Math.random() < 0.4 ? 'glow' : Math.random() < 0.5 ? 'ember' : 'spark'
      );
    }

    // Extra burst as cube breaches portal
    if (t > 2.2 && t < 4.5 && Math.random() < d * 12) {
      this.particles.spawn(
        (Math.random() - 0.5) * H * 0.4,
        this.portalRoot.position.y + 1,
        (Math.random() - 0.5) * H * 0.4,
        COLORS.magenta,
        8,
        6,
        'glow'
      );
    }
  }

  // ── Portal sparks ─────────────────────────────────────────

  private resetSparks(): void {
    for (let i = 0; i < this.sparkCount; i++) this.respawnSpark(i, true);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  private respawnSpark(i: number, cold: boolean): void {
    const i3 = i * 3;
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 4.8;
    // Local portal space (flat ring, then root rotates -90 X → horizontal world)
    this.sparkPos[i3] = Math.cos(a) * r;
    this.sparkPos[i3 + 1] = Math.sin(a) * r;
    this.sparkPos[i3 + 2] = (Math.random() - 0.5) * 0.5;
    const speed = 1.5 + Math.random() * 5;
    this.sparkVel[i3] = Math.cos(a) * speed;
    this.sparkVel[i3 + 1] = Math.sin(a) * speed;
    this.sparkVel[i3 + 2] = 3 + Math.random() * 8;
    this.sparkLife[i] = cold ? Math.random() * 0.9 : 0.35 + Math.random() * 0.9;
    // Cyan / magenta / white mix
    const roll = Math.random();
    if (roll < 0.45) {
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
    mat.opacity = open * 0.95;
    mat.size = 0.28 + open * 0.22;
    this.sparkPoints.visible = open > 0.04;

    for (let i = 0; i < this.sparkCount; i++) {
      const i3 = i * 3;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) {
        if (open > 0.12) this.respawnSpark(i, false);
        else this.sparkPos[i3 + 2] = -999;
        continue;
      }
      this.sparkPos[i3] += this.sparkVel[i3] * dt;
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt;
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt;
      this.sparkVel[i3 + 2] -= 5 * dt;
      // Fade via life not needed (material global opacity)
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  // ── UI (body-level overlay — always on top) ───────────────

  private mountUI(): void {
    this.teardownUI();
    // Clear legacy root so panel-hidden state is clean
    this.uiRoot.classList.remove('panel-hidden');
    this.uiRoot.style.cssText =
      'display:block;position:absolute;inset:0;z-index:50;pointer-events:none;';
    this.uiRoot.innerHTML = '';

    // Mount on document.body so no parent CSS can hide titles
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
      <div style="position:absolute;left:0;right:0;top:0;height:9%;background:#000;"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:9%;background:#000;"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 28%,rgba(0,0,0,0.72) 100%);"></div>
      <div id="cin-title-a" style="
        position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);
        width:92%;text-align:center;
        font-size:clamp(20px,4.2vw,48px);font-weight:800;
        letter-spacing:0.28em;color:#00f0ff;
        text-shadow:0 0 24px rgba(0,240,255,0.95),0 0 60px rgba(255,0,170,0.45),0 2px 8px #000;
        opacity:0;transition:opacity 0.55s ease;
        text-transform:uppercase;"></div>
      <div id="cin-title-b" style="
        position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);
        width:92%;text-align:center;
        font-size:clamp(16px,3.4vw,38px);font-weight:800;
        letter-spacing:0.24em;color:#ff00aa;
        text-shadow:0 0 24px rgba(255,0,170,0.9),0 0 50px rgba(0,240,255,0.35),0 2px 8px #000;
        opacity:0;transition:opacity 0.55s ease;
        text-transform:uppercase;"></div>
      <button type="button" id="cin-skip" style="
        position:absolute;bottom:12%;right:3%;pointer-events:auto;
        font-size:12px;letter-spacing:0.22em;color:#e8ffff;
        background:rgba(0,0,0,0.65);border:1px solid rgba(0,240,255,0.45);
        padding:12px 18px;cursor:pointer;font-family:inherit;
        z-index:2;">SKIP INTRO</button>
    `;
    document.body.appendChild(el);
    this.overlayEl = el;
    this.titleA = el.querySelector('#cin-title-a');
    this.titleB = el.querySelector('#cin-title-b');
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

  private teardownUI(): void {
    if (this.overlayEl?.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.titleA = null;
    this.titleB = null;
    this.uiRoot.classList.add('panel-hidden');
    this.uiRoot.style.display = '';
    this.uiRoot.innerHTML = '';
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;

    // Park the cinematic cube instance (Game swaps back to the real lattice)
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
      this.camera.yaw = 0.85;
      this.camera.pitch = 0.28;
      if (this.cube) this.camera.setOrbitLimits(this.cube.halfExtent);
      this.camera.endCinematic();
    }
    // Ship seating is finalized by Game.finishIntroImmediate after the cut

    this.group.visible = false;
    this.teardownUI();
  }

  // ── Geometry ──────────────────────────────────────────────

  private buildPortal(): void {
    // Flat horizontal portal (ring faces sky)
    this.portalRoot.rotation.x = -Math.PI / 2;

    const ringSpecs = [
      { r: 4.2, tube: 0.38, color: COLORS.magenta },
      { r: 5.0, tube: 0.18, color: COLORS.cyan },
      { r: 5.7, tube: 0.1, color: 0xffffff },
      { r: 6.3, tube: 0.05, color: COLORS.magenta },
    ];
    for (const spec of ringSpecs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(spec.r, spec.tube, 16, 96),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.rings.push(ring);
      this.portalRoot.add(ring);
    }

    // Additive glow discs only — NEVER opaque / dark (black box cause)
    const glowSpecs = [
      { r: 4.0, color: COLORS.magenta, opacity: 0 },
      { r: 2.6, color: COLORS.cyan, opacity: 0 },
      { r: 1.4, color: 0xffffff, opacity: 0 },
    ];
    for (const g of glowSpecs) {
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
      // Slight Z offset so discs stack without z-fight
      disc.position.z = 0.02 * this.glowDiscs.length;
      this.glowDiscs.push(disc);
      this.portalRoot.add(disc);
    }

    // Energy pillars around rim
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.14, 6.5, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      beam.position.set(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 2.8);
      beam.rotation.x = Math.PI / 2;
      this.energyBeams.push(beam);
      this.portalRoot.add(beam);
    }

    this.portalLight = new THREE.PointLight(COLORS.magenta, 0, 70, 1.8);
    this.portalLight.position.set(0, 0, 3);
    this.portalLight2 = new THREE.PointLight(COLORS.cyan, 0, 55, 1.8);
    this.portalLight2.position.set(0, 0, -1.5);
    this.portalLight3 = new THREE.PointLight(0xffffff, 0, 40, 2);
    this.portalLight3.position.set(0, 0, 5);
    this.portalRoot.add(this.portalLight, this.portalLight2, this.portalLight3);

    // Local multi-color spark field
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkCol = new Float32Array(this.sparkCount * 3);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.35,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.sparkPoints.frustumCulled = false;
    this.portalRoot.add(this.sparkPoints);
  }

  private buildCity(): void {
    // Distant neon skyline only — NO solid dark boxes near portal (that was the black box)
    const neonMat = (color: number, intensity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: intensity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    // Sparse far buildings as thin neon frames (edge strips), not solid black cubes
    for (let i = 0; i < 40; i++) {
      const h = 4 + Math.random() * 22;
      const w = 0.8 + Math.random() * 1.6;
      const d = 0.8 + Math.random() * 1.6;
      const px = (Math.random() - 0.5) * 100;
      const pz = (Math.random() - 0.5) * 100;
      // Skip a wide clear zone under the portal
      if (Math.hypot(px, pz) < 22) continue;

      const col = Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta;
      const edge = neonMat(col, 0.15 + Math.random() * 0.25);
      // Four vertical edge lines
      for (const [ex, ez] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ] as const) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), edge);
        line.position.set(px + ex, h * 0.5, pz + ez);
        this.cityRoot.add(line);
      }
      // Roof rim
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), edge);
      roof.position.set(px, h, pz);
      this.cityRoot.add(roof);
    }

    const grid = new THREE.GridHelper(120, 40, 0x00f0ff, 0x001820);
    grid.position.y = 0.02;
    // Soften grid
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) gm.forEach((m) => {
      m.transparent = true;
      (m as THREE.Material & { opacity: number }).opacity = 0.35;
    });
    else {
      gm.transparent = true;
      (gm as THREE.Material & { opacity: number }).opacity = 0.35;
    }
    this.cityRoot.add(grid);
  }

  dispose(): void {
    if (this.active) this.finish();
    this.teardownUI();
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
