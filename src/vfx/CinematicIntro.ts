/**
 * Epic first-stage cinematic (~15s).
 * Storyboard:
 *  0–5s  Dimensional portal opens; cube emerges, erratic slice adjustments
 *  5–8s  Cube pulses above cybercity; sweeping camera
 *  9–12s Low menacing angle; title "THE CUBE HAS ARRIVED"
 * 12–15s Pull out to third-person ship view; "DESTROY IT - SAVE HUMANITY"
 */
import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';
import type { CubeAnimator } from '../cube/CubeAnimator';
import type { OrbitalCamera } from '../player/OrbitalCamera';
import type { Ship } from '../player/Ship';
import { COLORS } from '../data/constants';

export type CinematicPhase = 'portal' | 'sweep' | 'title' | 'dock' | 'done';

export class CinematicIntro {
  readonly group = new THREE.Group();
  private root: HTMLElement;
  private active = false;
  private t = 0;
  private readonly duration = 15;
  private portalRing: THREE.Mesh;
  private portalDisc: THREE.Mesh;
  private portalGlow: THREE.PointLight;
  private cityGroup = new THREE.Group();
  private titleEl: HTMLElement | null = null;
  private lastTitle = '';

  constructor(uiRoot: HTMLElement) {
    this.root = uiRoot;

    // Portal
    this.portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(6, 0.35, 12, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.portalDisc = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x220033,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.portalGlow = new THREE.PointLight(COLORS.magenta, 0, 40, 2);
    this.portalRing.position.set(0, 2, -14);
    this.portalDisc.position.copy(this.portalRing.position);
    this.portalGlow.position.copy(this.portalRing.position);
    this.group.add(this.portalRing, this.portalDisc, this.portalGlow);

    // Minimal cybercity silhouette far below
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x0a1520,
      emissive: 0x003344,
      emissiveIntensity: 0.35,
      metalness: 0.6,
      roughness: 0.5,
    });
    for (let i = 0; i < 40; i++) {
      const h = 1 + Math.random() * 8;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random(), h, 1.2 + Math.random()), buildingMat);
      b.position.set((Math.random() - 0.5) * 60, -18 - h / 2, (Math.random() - 0.5) * 60);
      this.cityGroup.add(b);
    }
    // Neon grid floor
    const grid = new THREE.GridHelper(80, 40, 0x00f0ff, 0x003344);
    grid.position.y = -18;
    this.cityGroup.add(grid);
    this.cityGroup.visible = false;
    this.group.add(this.cityGroup);

    this.group.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  get progress(): number {
    return Math.min(1, this.t / this.duration);
  }

  start(): void {
    this.active = true;
    this.t = 0;
    this.lastTitle = '';
    this.group.visible = true;
    this.cityGroup.visible = true;
    this.root.classList.remove('panel-hidden');
    this.root.innerHTML = `
      <div class="cinematic-overlay interactive">
        <div class="cinematic-vignette"></div>
        <div class="cinematic-title" id="cin-title"></div>
        <div class="cinematic-skip" id="cin-skip">TAP TO SKIP</div>
      </div>
    `;
    this.titleEl = this.root.querySelector('#cin-title');
    this.root.querySelector('#cin-skip')?.addEventListener('click', () => {
      this.t = this.duration;
    });
  }

  /**
   * Drive cinematic. Returns true when finished.
   */
  update(
    dt: number,
    camera: OrbitalCamera,
    cube: CubeManager,
    animator: CubeAnimator,
    ship: Ship
  ): boolean {
    if (!this.active) return true;
    this.t += dt;
    const t = this.t;

    // Nudge cube scramble during emerge
    if (t < 8 && Math.random() < dt * 2.5) {
      animator.notifyDamage(40);
    }

    // Portal open 0–5
    if (t < 5) {
      const p = t / 5;
      const open = Math.min(1, p * 1.4);
      (this.portalRing.material as THREE.MeshBasicMaterial).opacity = open * 0.95;
      (this.portalDisc.material as THREE.MeshBasicMaterial).opacity = open * 0.55;
      this.portalGlow.intensity = open * 40;
      this.portalRing.rotation.z += dt * 1.2;
      this.portalRing.scale.setScalar(0.6 + open * 0.7);

      // Cube emerges from portal toward origin
      const emerge = Math.min(1, Math.max(0, (t - 0.8) / 3.5));
      const ease = emerge * emerge * (3 - 2 * emerge);
      cube.group.position.set(0, 2 + (1 - ease) * 4, -14 + ease * 14);
      cube.group.rotation.y += dt * (1.5 + (1 - ease) * 3);
      cube.group.rotation.x = Math.sin(t * 2) * 0.35 * (1 - ease);
      cube.group.scale.setScalar(0.4 + ease * 0.6);

      camera.camera.position.set(
        Math.sin(t * 0.4) * 8,
        3 + Math.sin(t * 0.7) * 1.5,
        8 + (1 - open) * 6
      );
      camera.camera.lookAt(cube.group.position);
      this.setTitle('');
    } else if (t < 9) {
      // Sweep 5–9 over city
      (this.portalRing.material as THREE.MeshBasicMaterial).opacity *= 0.92;
      (this.portalDisc.material as THREE.MeshBasicMaterial).opacity *= 0.9;
      this.portalGlow.intensity *= 0.9;
      cube.group.position.set(0, 2 + Math.sin(t) * 0.3, 0);
      cube.group.scale.setScalar(1);
      const pulse = 1 + Math.sin(t * 5) * 0.03;
      cube.group.scale.setScalar(pulse);
      cube.group.rotation.y += dt * 0.35;

      const u = (t - 5) / 4;
      const ang = u * Math.PI * 1.2 + 0.5;
      camera.camera.position.set(
        Math.cos(ang) * 22,
        6 + Math.sin(u * Math.PI) * 8,
        Math.sin(ang) * 22
      );
      camera.camera.lookAt(0, 1, 0);
      this.setTitle('');
    } else if (t < 12) {
      // Menacing low angle + title
      cube.group.position.set(0, 1.5, 0);
      cube.group.rotation.y += dt * 0.2;
      camera.camera.position.set(6, -2.5, 10);
      camera.camera.lookAt(0, 2, 0);
      this.setTitle('THE CUBE HAS ARRIVED');
    } else {
      // Dock to gameplay third-person
      const u = Math.min(1, (t - 12) / 3);
      const ease = u * u * (3 - 2 * u);
      cube.group.position.lerp(new THREE.Vector3(0, 0, 0), 0.15);
      cube.group.rotation.x *= 0.9;
      cube.group.rotation.z *= 0.9;

      // Blend camera toward orbital third-person seat
      ship.update(camera, dt);
      camera.yaw = 0.9;
      camera.pitch = 0.28;
      camera.setOrbitLimits(cube.halfExtent);
      // Manual blend
      const target = new THREE.Vector3();
      camera.getShipPosition(target);
      // Approximate third person from ship
      const camTarget = new THREE.Vector3(
        Math.sin(0.9) * Math.cos(0.28) * cube.halfExtent * 2.8 + 2.4,
        Math.sin(0.28) * cube.halfExtent * 2.8 + 2.2,
        Math.cos(0.9) * Math.cos(0.28) * cube.halfExtent * 2.8 + 3.4
      );
      const startCam = new THREE.Vector3(6, -2.5, 10);
      camera.camera.position.lerpVectors(startCam, camTarget, ease);
      camera.camera.lookAt(0, 0, 0);

      this.setTitle(u > 0.25 ? 'DESTROY IT — SAVE HUMANITY' : 'THE CUBE HAS ARRIVED');
    }

    if (t >= this.duration) {
      this.finish(cube, camera);
      return true;
    }
    return false;
  }

  private setTitle(text: string): void {
    if (!this.titleEl || text === this.lastTitle) return;
    this.lastTitle = text;
    this.titleEl.textContent = text;
    this.titleEl.classList.toggle('cinematic-title-visible', text.length > 0);
    this.titleEl.classList.remove('cinematic-title-pop');
    void this.titleEl.offsetWidth;
    if (text) this.titleEl.classList.add('cinematic-title-pop');
  }

  private finish(cube: CubeManager, camera: OrbitalCamera): void {
    this.active = false;
    this.group.visible = false;
    cube.group.position.set(0, 0, 0);
    cube.group.rotation.set(0, 0, 0);
    cube.group.scale.setScalar(1);
    camera.endCinematic();
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
    this.titleEl = null;
  }

  skip(cube: CubeManager, camera: OrbitalCamera): void {
    if (!this.active) return;
    this.finish(cube, camera);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}
