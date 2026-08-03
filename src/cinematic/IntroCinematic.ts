/**
 * Level-1 action-movie intro (~10s).
 * Storyboard:
 *  0–3s  Cube rises from floor portal while Rubik-shifting
 *  4–5s  Hard cut to low hero angle (looking slightly up)
 *  6–8s  Title: THE CUBE ARRIVES
 *  9–10s Title: DESTROY IT
 * ~10 rapid Rubik shifts across the first ~5 seconds.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';
import type { CubeAnimator } from '../cube/CubeAnimator';
import type { OrbitalCamera } from '../player/OrbitalCamera';
import type { ParticlePool } from '../vfx/ParticlePool';

export const INTRO_CINEMATIC_DURATION = 10;

export type CinematicPhase =
  | 'portal_rise'
  | 'hero_cut'
  | 'title_arrives'
  | 'title_destroy'
  | 'done';

export class IntroCinematic {
  readonly group = new THREE.Group();
  private active = false;
  private t = 0;
  private duration = INTRO_CINEMATIC_DURATION;
  private cube: CubeManager | null = null;
  private animator: CubeAnimator | null = null;
  private camera: OrbitalCamera | null = null;
  private particles: ParticlePool | null = null;
  private halfExtent = 4;
  private riseStartY = -22;
  private riseEndY = 0;
  private shiftsDone = 0;
  private shiftsTarget = 10;
  private nextShiftAt = 0.35;
  private titleEl: HTMLElement | null = null;
  private phase: CinematicPhase = 'portal_rise';
  private portalRing: THREE.Mesh;
  private portalInner: THREE.Mesh;
  private portalGlow: THREE.Mesh;
  private beams: THREE.Group;
  private _tmp = new THREE.Vector3();
  private onComplete: (() => void) | null = null;
  /** When true, do not auto-enter gameplay (replay preview). */
  private previewOnly = false;

  constructor() {
    this.group.name = 'IntroCinematic';

    // Floor portal — emissive torus + disc + radial beams
    const ringGeo = new THREE.TorusGeometry(3.2, 0.12, 12, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.portalRing = new THREE.Mesh(ringGeo, ringMat);
    this.portalRing.rotation.x = -Math.PI / 2;

    const innerGeo = new THREE.CircleGeometry(2.8, 48);
    const innerMat = new THREE.MeshBasicMaterial({
      color: COLORS.magenta,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.portalInner = new THREE.Mesh(innerGeo, innerMat);
    this.portalInner.rotation.x = -Math.PI / 2;
    this.portalInner.position.y = 0.02;

    const glowGeo = new THREE.CircleGeometry(5.5, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.portalGlow = new THREE.Mesh(glowGeo, glowMat);
    this.portalGlow.rotation.x = -Math.PI / 2;
    this.portalGlow.position.y = 0.01;

    this.beams = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 4.5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? COLORS.magenta : COLORS.cyan,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      beam.position.set(Math.cos(a) * 1.2, 0.05, Math.sin(a) * 1.2);
      beam.lookAt(0, 0.05, 0);
      this.beams.add(beam);
    }

    this.group.add(this.portalGlow, this.portalInner, this.portalRing, this.beams);
    this.group.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isPreview(): boolean {
    return this.previewOnly;
  }

  get progress(): number {
    return this.active ? Math.min(1, this.t / this.duration) : 1;
  }

  get currentPhase(): CinematicPhase {
    return this.phase;
  }

  /**
   * @param previewOnly when true, completion does not imply combat start (caller handles UI).
   */
  start(opts: {
    cube: CubeManager;
    animator: CubeAnimator;
    camera: OrbitalCamera;
    particles: ParticlePool;
    titleHost: HTMLElement;
    previewOnly?: boolean;
    onComplete?: () => void;
  }): void {
    this.cube = opts.cube;
    this.animator = opts.animator;
    this.camera = opts.camera;
    this.particles = opts.particles;
    this.previewOnly = !!opts.previewOnly;
    this.onComplete = opts.onComplete ?? null;
    this.halfExtent = opts.cube.halfExtent;
    this.riseStartY = -(this.halfExtent * 2.8 + 10);
    this.riseEndY = 0;

    this.t = 0;
    this.active = true;
    this.shiftsDone = 0;
    this.nextShiftAt = 0.28;
    this.phase = 'portal_rise';
    this.duration = INTRO_CINEMATIC_DURATION;

    // Scale portal to cube footprint
    const portalScale = Math.max(1.1, this.halfExtent * 0.55);
    this.portalRing.scale.setScalar(portalScale);
    this.portalInner.scale.setScalar(portalScale);
    this.portalGlow.scale.setScalar(portalScale * 1.15);
    this.beams.scale.setScalar(portalScale);
    this.group.position.set(0, -this.halfExtent * 0.15 - 0.5, 0);
    this.group.visible = true;

    // Hide ship-adjacent gameplay; bury cube under portal
    opts.cube.group.position.set(0, this.riseStartY, 0);
    opts.cube.group.quaternion.identity();
    opts.animator.reset();
    opts.animator.setEnabled(false);
    opts.animator.beginCinematicBurst();

    // Opening camera: sweeping low orbit looking at portal
    opts.camera.beginScriptedCinematic({
      yaw: 0.4,
      pitch: 0.08,
      radius: this.halfExtent * 4.2,
      lookY: -2,
    });

    this.ensureTitle(opts.titleHost);
    this.setTitle('', false);
  }

  update(dt: number): void {
    if (!this.active || !this.cube || !this.camera || !this.animator) return;
    this.t += dt;
    const t = this.t;

    // —— Phase bookkeeping ——
    if (t < 3.5) this.phase = 'portal_rise';
    else if (t < 5.5) this.phase = 'hero_cut';
    else if (t < 8.5) this.phase = 'title_arrives';
    else if (t < this.duration) this.phase = 'title_destroy';
    else this.phase = 'done';

    // —— Cube rise + Rubik shifts (0–5s) ——
    const riseT = THREE.MathUtils.clamp(t / 3.0, 0, 1);
    const easeRise = 1 - Math.pow(1 - riseT, 3);
    const y = THREE.MathUtils.lerp(this.riseStartY, this.riseEndY, easeRise);
    // Subtle lateral wobble while emerging
    const wobble = Math.sin(t * 3.2) * (1 - riseT) * 0.35;
    this.cube.group.position.set(wobble, y, Math.cos(t * 2.1) * (1 - riseT) * 0.2);

    if (t < 5.2 && this.shiftsDone < this.shiftsTarget && t >= this.nextShiftAt) {
      this.animator.forceQuickShift(0.28 + Math.random() * 0.12);
      this.shiftsDone++;
      // Distribute ~10 shifts across ~5s with slight irregularity
      const remaining = this.shiftsTarget - this.shiftsDone;
      const timeLeft = Math.max(0.15, 5.0 - t);
      this.nextShiftAt = t + timeLeft / Math.max(1, remaining) * (0.75 + Math.random() * 0.5);
    }
    this.animator.update(dt);

    // Portal pulse
    const pulse = 0.55 + Math.sin(t * 9) * 0.25;
    (this.portalRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.4;
    (this.portalInner.material as THREE.MeshBasicMaterial).opacity =
      t < 3.2 ? 0.25 + pulse * 0.35 : Math.max(0, 0.45 - (t - 3.2) * 0.2);
    this.portalRing.rotation.z += dt * 1.4;
    this.beams.rotation.y += dt * 0.8;

    // Particles from portal
    if (this.particles && t < 4.5 && Math.random() < dt * 28) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 1.8) * Math.max(1, this.halfExtent * 0.4);
      this.particles.spawn(
        Math.cos(a) * r,
        this.group.position.y + Math.random() * 2,
        Math.sin(a) * r,
        Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
        2,
        1.2 + Math.random(),
        'ember'
      );
    }

    // —— Camera storyboard ——
    if (t < 3.5) {
      // Sweeping rise orbit
      const p = t / 3.5;
      this.camera.setScriptedPose({
        yaw: 0.4 + p * 1.85,
        pitch: THREE.MathUtils.lerp(0.05, 0.32, p),
        radius: THREE.MathUtils.lerp(this.halfExtent * 4.4, this.halfExtent * 3.1, p),
        lookY: THREE.MathUtils.lerp(-2.5, y * 0.35, p),
        hard: false,
        lag: 3.5,
      });
    } else if (t < 3.55) {
      // Hard cut frame
      this.camera.setScriptedPose({
        yaw: -0.55,
        pitch: -0.18,
        radius: this.halfExtent * 2.55,
        lookY: this.halfExtent * 0.15,
        hard: true,
        lag: 20,
      });
    } else if (t < 8.8) {
      // Hero low-angle hold with slow push-in
      const p = (t - 3.55) / 5.25;
      this.camera.setScriptedPose({
        yaw: -0.55 + p * 0.35,
        pitch: THREE.MathUtils.lerp(-0.18, -0.08, p),
        radius: THREE.MathUtils.lerp(this.halfExtent * 2.55, this.halfExtent * 2.2, p),
        lookY: this.halfExtent * 0.12,
        hard: false,
        lag: 2.2,
      });
    } else {
      // Hand off toward gameplay orbit
      const p = (t - 8.8) / 1.2;
      this.camera.setScriptedPose({
        yaw: -0.2 + p * 0.9,
        pitch: THREE.MathUtils.lerp(-0.08, 0.22, p),
        radius: THREE.MathUtils.lerp(this.halfExtent * 2.2, this.halfExtent * 2.7, p),
        lookY: THREE.MathUtils.lerp(this.halfExtent * 0.12, 0, p),
        hard: false,
        lag: 2.8,
      });
    }

    // —— Titles ——
    if (t >= 6.0 && t < 8.8) {
      this.setTitle('THE CUBE ARRIVES', true);
    } else if (t >= 8.8) {
      this.setTitle('DESTROY IT', true, true);
    }

    if (t >= this.duration) {
      this.finish();
    }
  }

  private ensureTitle(host: HTMLElement): void {
    let el = host.querySelector('#cinematic-title') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'cinematic-title';
      el.className = 'cinematic-title panel-hidden';
      el.innerHTML = `<div class="cine-title-text"></div>`;
      host.appendChild(el);
    }
    this.titleEl = el;
  }

  private setTitle(text: string, show: boolean, destroyVariant = false): void {
    if (!this.titleEl) return;
    const textEl = this.titleEl.querySelector('.cine-title-text') as HTMLElement | null;
    if (textEl && textEl.textContent !== text) {
      textEl.textContent = text;
      textEl.classList.remove('cine-pop');
      // retrigger animation
      void textEl.offsetWidth;
      textEl.classList.add('cine-pop');
    }
    this.titleEl.classList.toggle('panel-hidden', !show || !text);
    this.titleEl.classList.toggle('cine-destroy', destroyVariant);
    this.titleEl.classList.toggle('cine-arrives', !destroyVariant && !!text);
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    this.phase = 'done';

    if (this.cube) {
      this.cube.group.position.set(0, 0, 0);
      this.cube.group.quaternion.identity();
    }
    if (this.animator) {
      this.animator.endCinematicBurst();
      this.animator.setEnabled(true);
      this.animator.reset();
    }
    this.group.visible = false;
    this.setTitle('', false);

    const cb = this.onComplete;
    this.onComplete = null;
    cb?.();
  }

  /** Abort early (e.g. user opens menu mid-cinematic). */
  abort(): void {
    if (!this.active) return;
    this.onComplete = null;
    this.finish();
  }

  dispose(): void {
    this.abort();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.group.clear();
    this.titleEl?.remove();
    this.titleEl = null;
  }
}
