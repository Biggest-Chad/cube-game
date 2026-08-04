/**
 * Stage-1 cinematic — clean rewrite.
 *
 * 0–5s   Portal blooms with energy; cube rises through it while Rubik-shifting
 * 5–8.5s Sweeping orbit over neon city; cube hovers
 * 8.5–12s Low hero angle + title THE CUBE HAS ARRIVED
 * 12–15s  Camera docks to gameplay seat + DESTROY IT — SAVE HUMANITY
 *
 * Ship stays hidden until the final frame handoff (never spawns inside the cube).
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
  private readonly duration = 15;

  private cube: CubeManager | null = null;
  private animator: CubeAnimator | null = null;
  private camera: OrbitalCamera | null = null;
  private ship: Ship | null = null;
  private particles: ParticlePool | null = null;
  private half = 6;

  private portalRoot = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private portalLight!: THREE.PointLight;
  private portalLight2!: THREE.PointLight;
  private energyBeams: THREE.Mesh[] = [];
  private sparkPoints!: THREE.Points;
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPos!: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkCount = 280;

  private cityRoot = new THREE.Group();
  private titleHost: HTMLElement | null = null;
  private titleA: HTMLElement | null = null;
  private titleB: HTMLElement | null = null;
  private nextShiftAt = 1.5;
  private shiftCount = 0;

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
    this.nextShiftAt = 1.4;
    this.shiftCount = 0;

    const s = Math.max(1.4, this.half * 0.7);
    this.portalRoot.scale.setScalar(s);
    this.portalRoot.position.set(0, -this.half * 0.15, 0);
    this.cityRoot.position.set(0, -this.half * 2.4 - 8, 0);
    this.cityRoot.scale.setScalar(Math.max(1, this.half / 5.5));

    // Park cube deep under portal
    const bury = -(this.half * 3 + 10);
    this.cube.group.position.set(0, bury, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.quaternion.identity();
    this.cube.group.scale.setScalar(0.8);

    // Ship: hide AND park far away so it can never clip the cube mid-shot
    this.ship.group.visible = false;
    this.ship.group.position.set(0, -200, 80);

    this.animator.reset();
    this.animator.setEnabled(true);
    this.animator.beginCinematicBurst();

    this.camera.beginScriptedCinematic({
      yaw: 0.6,
      pitch: 0.1,
      radius: this.half * 4.8,
      lookY: -this.half * 0.5,
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

  private drivePortal(t: number, dt: number): void {
    let open = 0;
    if (t < 1.4) open = smooth(t / 1.4);
    else if (t < 6) open = 1;
    else open = Math.max(0, 1 - (t - 6) / 2.5);

    const pulse = 0.85 + Math.sin(t * 9) * 0.15;
    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i].material as THREE.MeshBasicMaterial;
      const base = i === 0 ? 0.95 : i === 1 ? 0.55 : 0.35;
      m.opacity = open * base * pulse;
      this.rings[i].rotation.z += dt * (0.8 + i * 0.35) * (i % 2 === 0 ? 1 : -1);
    }
    for (const b of this.energyBeams) {
      (b.material as THREE.MeshBasicMaterial).opacity = open * (0.25 + pulse * 0.2);
      b.rotation.z += dt * 0.5;
    }
    this.portalLight.intensity = open * 55 * pulse;
    this.portalLight2.intensity = open * 30;
    this.portalRoot.visible = open > 0.01;
    this.portalRoot.scale.setScalar(Math.max(1.4, this.half * 0.7) * (0.7 + open * 0.4));
  }

  private driveCube(t: number, dt: number, H: number): void {
    if (!this.cube) return;
    const g = this.cube.group;
    const bury = -(H * 3 + 10);
    const rotating = this.animator?.isRotating ?? false;

    if (t < 1.3) {
      g.position.set(0, bury, 0);
      g.scale.setScalar(0.75);
      if (!rotating) g.rotation.y += dt * 0.3;
      return;
    }

    if (t < 5.0) {
      const u = smooth((t - 1.3) / 3.5);
      const y = lerp(bury, H * 0.2, u);
      const chaos = 1 - u;
      g.position.set(
        Math.sin(t * 2.1) * chaos * H * 0.06,
        y,
        Math.cos(t * 1.6) * chaos * H * 0.05
      );
      // Only tumble group when NOT mid lattice slice (prevents compound jitter)
      if (!rotating) {
        g.rotation.x = Math.sin(t * 2.8) * chaos * 0.4;
        g.rotation.z = Math.cos(t * 2.2) * chaos * 0.35;
        g.rotation.y += dt * (0.35 + chaos * 1.8);
      }
      g.scale.setScalar(lerp(0.75, 1, u));
      return;
    }

    if (t < 8.5) {
      const hover = H * 0.28 + Math.sin(t * 1.6) * H * 0.035;
      g.position.set(0, hover, 0);
      if (!rotating) {
        g.rotation.x = Math.sin(t * 0.6) * 0.06;
        g.rotation.z = Math.cos(t * 0.5) * 0.05;
        g.rotation.y += dt * 0.25;
      }
      g.scale.setScalar(1 + Math.sin(t * 4) * 0.025);
      return;
    }

    if (t < 12) {
      const u = smooth((t - 8.5) / 3.5);
      g.position.set(0, lerp(H * 0.28, 0.05, u), 0);
      if (!rotating) {
        g.rotation.x *= 0.94;
        g.rotation.z *= 0.94;
        g.rotation.y += dt * 0.15;
      }
      g.scale.setScalar(1);
      return;
    }

    // Final settle to origin — no ship yet
    const u = smooth((t - 12) / 3);
    g.position.lerp(new THREE.Vector3(0, 0, 0), 0.1 + u * 0.25);
    g.rotation.x *= 0.9;
    g.rotation.z *= 0.9;
    if (!rotating) g.rotation.y += dt * 0.08 * (1 - u);
    g.scale.setScalar(1);
  }

  private driveCamera(t: number, H: number): void {
    if (!this.camera) return;

    if (t < 1.3) {
      const p = t / 1.3;
      this.camera.setScriptedPose({
        yaw: 0.5 + p * 0.25,
        pitch: lerp(0.02, 0.15, p),
        radius: H * 4.6,
        lookY: -H * 0.4,
        lag: 3.5,
      });
      return;
    }
    if (t < 5) {
      const p = (t - 1.3) / 3.7;
      this.camera.setScriptedPose({
        yaw: 0.75 + p * 2.0,
        pitch: lerp(0.15, 0.4, p),
        radius: lerp(H * 4.3, H * 3.0, p),
        lookY: lerp(-H * 0.15, H * 0.2, p),
        lag: 3,
      });
      return;
    }
    if (t < 8.5) {
      const p = (t - 5) / 3.5;
      this.camera.setScriptedPose({
        yaw: 2.75 + p * 1.5,
        pitch: lerp(0.45, 0.25, p),
        radius: lerp(H * 3.5, H * 3.9, p),
        lookY: lerp(H * 0.22, H * 0.08, p),
        lag: 2.5,
      });
      return;
    }
    if (t < 8.55) {
      this.camera.setScriptedPose({
        yaw: -0.7,
        pitch: -0.24,
        radius: H * 2.35,
        lookY: H * 0.22,
        hard: true,
      });
      return;
    }
    if (t < 12) {
      const p = (t - 8.55) / 3.45;
      this.camera.setScriptedPose({
        yaw: -0.7 + p * 0.45,
        pitch: lerp(-0.24, -0.12, p),
        radius: lerp(H * 2.35, H * 2.1, p),
        lookY: H * 0.2,
        lag: 2,
      });
      return;
    }
    // Dock to gameplay orbit — ship still hidden until finish()
    const p = smooth((t - 12) / 3);
    const yaw = lerp(-0.25, 0.85, p);
    const pitch = lerp(-0.12, 0.28, p);
    const radius = lerp(H * 2.1, H * 2.75, p);
    this.camera.setScriptedPose({
      yaw,
      pitch,
      radius,
      lookY: lerp(H * 0.2, 0, p),
      lag: 2.3,
    });
    this.camera.yaw = yaw;
    this.camera.pitch = pitch;
  }

  private driveTitles(t: number): void {
    if (t >= 8.7 && t < 12.05) {
      this.showTitleA('THE CUBE HAS ARRIVED');
      this.showTitleB('');
    } else if (t >= 12.05) {
      this.showTitleA('');
      this.showTitleB('DESTROY IT — SAVE HUMANITY');
    } else {
      this.showTitleA('');
      this.showTitleB('');
    }
  }

  private driveShifts(t: number): void {
    if (!this.animator) return;
    if (t < 1.4 || t > 8.2) return;
    if (this.shiftCount >= 12) return;
    if (t < this.nextShiftAt) return;
    this.animator.forceQuickShift(1);
    this.shiftCount++;
    const left = Math.max(1, 12 - this.shiftCount);
    const window = Math.max(0.25, 8.2 - t);
    this.nextShiftAt = t + (window / left) * (0.6 + Math.random() * 0.5);
  }

  private spawnWorldParticles(t: number, d: number, H: number): void {
    if (!this.particles) return;
    if (t > 0.5 && t < 6 && Math.random() < d * 30) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 2.5) * Math.max(1.2, H * 0.4);
      this.particles.spawn(
        Math.cos(a) * r,
        this.portalRoot.position.y + Math.random() * 3,
        Math.sin(a) * r,
        Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
        3,
        2 + Math.random() * 3,
        Math.random() < 0.5 ? 'glow' : 'ember'
      );
    }
  }

  // ── Portal sparks (local system) ──────────────────────────

  private resetSparks(): void {
    for (let i = 0; i < this.sparkCount; i++) {
      this.respawnSpark(i, true);
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }

  private respawnSpark(i: number, cold: boolean): void {
    const i3 = i * 3;
    const a = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 4.5;
    this.sparkPos[i3] = Math.cos(a) * r;
    this.sparkPos[i3 + 1] = Math.sin(a) * r;
    this.sparkPos[i3 + 2] = (Math.random() - 0.5) * 0.4;
    // Shoot outward + up in portal local space
    this.sparkVel[i3] = Math.cos(a) * (1 + Math.random() * 4);
    this.sparkVel[i3 + 1] = Math.sin(a) * (1 + Math.random() * 4);
    this.sparkVel[i3 + 2] = 2 + Math.random() * 6;
    this.sparkLife[i] = cold ? Math.random() : 0.4 + Math.random() * 0.8;
  }

  private updateSparks(dt: number, t: number): void {
    let open = 0;
    if (t < 1.4) open = smooth(t / 1.4);
    else if (t < 6) open = 1;
    else open = Math.max(0, 1 - (t - 6) / 2.5);

    const mat = this.sparkPoints.material as THREE.PointsMaterial;
    mat.opacity = open * 0.9;
    this.sparkPoints.visible = open > 0.05;

    for (let i = 0; i < this.sparkCount; i++) {
      const i3 = i * 3;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) {
        if (open > 0.15) this.respawnSpark(i, false);
        else {
          this.sparkPos[i3 + 1] = -999;
        }
        continue;
      }
      this.sparkPos[i3] += this.sparkVel[i3] * dt;
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt;
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt;
      this.sparkVel[i3 + 2] -= 4 * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }

  // ── UI ────────────────────────────────────────────────────

  private mountUI(): void {
    this.uiRoot.classList.remove('panel-hidden');
    this.uiRoot.style.display = 'block';
    this.uiRoot.style.pointerEvents = 'auto';
    this.uiRoot.innerHTML = `
      <div id="cin-layer" style="
        position:absolute;inset:0;z-index:50;pointer-events:none;
        display:flex;align-items:center;justify-content:center;
        font-family:Segoe UI,system-ui,monospace;">
        <div style="position:absolute;left:0;right:0;top:0;height:10%;background:#000;z-index:2;"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:10%;background:#000;z-index:2;"></div>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.7) 100%);z-index:1;"></div>
        <div id="cin-title-a" style="
          position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);
          z-index:10;width:90%;text-align:center;
          font-size:clamp(18px,3.5vw,40px);font-weight:700;
          letter-spacing:0.35em;color:#00f0ff;
          text-shadow:0 0 20px rgba(0,240,255,0.8),0 0 48px rgba(255,0,170,0.35),0 2px 4px #000;
          opacity:0;transition:opacity 0.5s ease;"></div>
        <div id="cin-title-b" style="
          position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);
          z-index:10;width:90%;text-align:center;
          font-size:clamp(16px,3vw,34px);font-weight:700;
          letter-spacing:0.32em;color:#ff00aa;
          text-shadow:0 0 20px rgba(255,0,170,0.75),0 0 40px rgba(0,240,255,0.25),0 2px 4px #000;
          opacity:0;transition:opacity 0.5s ease;"></div>
        <button type="button" id="cin-skip" style="
          position:absolute;bottom:14%;right:4%;z-index:20;pointer-events:auto;
          font-size:11px;letter-spacing:0.2em;color:#e8ffff;
          background:rgba(0,0,0,0.55);border:1px solid rgba(0,240,255,0.35);
          padding:10px 16px;cursor:pointer;font-family:inherit;">SKIP INTRO</button>
      </div>
    `;
    this.titleHost = this.uiRoot.querySelector('#cin-layer');
    this.titleA = this.uiRoot.querySelector('#cin-title-a');
    this.titleB = this.uiRoot.querySelector('#cin-title-b');
    this.uiRoot.querySelector('#cin-skip')?.addEventListener('click', () => this.skip());
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
    // Ship appears ONLY now, already at correct orbit seat
    if (this.ship && this.camera) {
      this.ship.group.visible = true;
      // Snap ship to orbit (multiple frames of lag would leave it at park coords)
      for (let i = 0; i < 8; i++) this.ship.update(this.camera, 0.05);
    }

    this.group.visible = false;
    this.uiRoot.classList.add('panel-hidden');
    this.uiRoot.style.display = '';
    this.uiRoot.innerHTML = '';
    this.titleA = null;
    this.titleB = null;
    this.titleHost = null;
  }

  // ── Geometry ──────────────────────────────────────────────

  private buildPortal(): void {
    // Flat portal facing up so cube rises through it
    this.portalRoot.rotation.x = -Math.PI / 2;

    const ringSpecs = [
      { r: 5.0, tube: 0.32, color: COLORS.magenta },
      { r: 5.7, tube: 0.12, color: COLORS.cyan },
      { r: 6.4, tube: 0.06, color: 0xffffff },
    ];
    for (const spec of ringSpecs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(spec.r, spec.tube, 12, 72),
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

    // Soft additive glow plane (NOT a solid black disc)
    const glowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.rings.push(glowPlane);
    this.portalRoot.add(glowPlane);

    // Energy pillars
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, 5, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      beam.position.set(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 2.2);
      beam.rotation.x = Math.PI / 2;
      this.energyBeams.push(beam);
      this.portalRoot.add(beam);
    }

    this.portalLight = new THREE.PointLight(COLORS.magenta, 0, 50, 2);
    this.portalLight.position.set(0, 0, 2);
    this.portalLight2 = new THREE.PointLight(COLORS.cyan, 0, 40, 2);
    this.portalLight2.position.set(0, 0, -1);
    this.portalRoot.add(this.portalLight, this.portalLight2);

    // Local spark field
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        color: COLORS.cyan,
        size: 0.18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.portalRoot.add(this.sparkPoints);
  }

  private buildCity(): void {
    const dark = new THREE.MeshStandardMaterial({
      color: 0x060c14,
      emissive: 0x001a28,
      emissiveIntensity: 0.5,
      metalness: 0.75,
      roughness: 0.4,
    });
    const lit = new THREE.MeshStandardMaterial({
      color: 0x040810,
      emissive: COLORS.cyan,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.35,
    });
    for (let i = 0; i < 55; i++) {
      const h = 2 + Math.random() * 16;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(1 + Math.random() * 2, h, 1 + Math.random() * 2),
        Math.random() < 0.15 ? lit : dark
      );
      b.position.set((Math.random() - 0.5) * 80, h * 0.5, (Math.random() - 0.5) * 80);
      this.cityRoot.add(b);
    }
    const grid = new THREE.GridHelper(100, 50, 0x00f0ff, 0x001a22);
    grid.position.y = 0.05;
    this.cityRoot.add(grid);
  }

  dispose(): void {
    if (this.active) this.finish();
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
