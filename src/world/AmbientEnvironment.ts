import * as THREE from 'three';
import { COLORS } from '../data/constants';

/**
 * Lightweight Tron ambient layer: floor grid, distant monoliths, dust, mild fog.
 * GPU-cheap — no shadows, no extra post passes. Adaptive density via setQuality.
 */
export class AmbientEnvironment {
  readonly group = new THREE.Group();

  private grid: THREE.GridHelper | null = null;
  private monolithGroup = new THREE.Group();
  private monoliths: THREE.InstancedMesh | null = null;
  private dust: THREE.Points | null = null;
  private horizon: THREE.LineLoop | null = null;

  private qualityLow = false;
  private disposed = false;
  private fogApplied: THREE.FogExp2 | null = null;
  private prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  private sceneRef: THREE.Scene | null = null;

  private readonly dustHigh = 120;
  private readonly dustLow = 48;
  private readonly monoHigh = 16;
  private readonly monoLow = 10;

  private _dummy = new THREE.Object3D();
  private _spin = 0;

  constructor() {
    this.group.name = 'AmbientEnvironment';
    this.buildGrid();
    this.buildHorizon();
    this.buildMonoliths(this.monoHigh);
    this.buildDust(this.dustHigh);
    this.group.add(this.monolithGroup);
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  private buildGrid(): void {
    // Large cyan grid plane under the play space
    const size = 220;
    const divisions = 44;
    const helper = new THREE.GridHelper(size, divisions, COLORS.cyan, COLORS.cyan);
    helper.position.y = -28;
    const mats = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const m of mats) {
      const mat = m as THREE.Material;
      mat.transparent = true;
      mat.opacity = 0.11;
      mat.depthWrite = false;
      if ('color' in mat) {
        (mat as THREE.LineBasicMaterial).color.setHex(COLORS.cyan);
      }
    }
    this.grid = helper;
    this.group.add(helper);
  }

  private buildHorizon(): void {
    // Thin data-equator ring
    const pts: THREE.Vector3[] = [];
    const r = 95;
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -6, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: COLORS.magenta,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    this.horizon = new THREE.LineLoop(geo, mat);
    this.group.add(this.horizon);
  }

  private buildMonoliths(count: number): void {
    if (this.monoliths) {
      this.monolithGroup.remove(this.monoliths);
      this.monoliths.geometry.dispose();
      (this.monoliths.material as THREE.Material).dispose();
      this.monoliths = null;
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a1218,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    // Wireframe edge feel via emissive-ish second pass not needed — dark silhouettes
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const edgeColor = new THREE.Color(COLORS.cyan);
    // Optional: tint via dummy scale only; keep simple
    void edgeColor;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.17;
      const dist = 70 + (i % 5) * 9 + (i % 2) * 4;
      const h = 8 + (i % 7) * 3.5 + (i % 4);
      const w = 1.4 + (i % 3) * 0.6;
      const d = 1.2 + (i % 4) * 0.5;
      const y = -28 + h * 0.5 + (i % 5) * 0.4;

      this._dummy.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
      this._dummy.rotation.set(0, angle + Math.PI * 0.25, (i % 5) * 0.02);
      this._dummy.scale.set(w, h, d);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(i, this._dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.monoliths = mesh;
    this.monolithGroup.add(mesh);
  }

  private buildDust(count: number): void {
    if (this.dust) {
      this.group.remove(this.dust);
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.dust = null;
    }

    const n = Math.max(0, Math.min(120, count));
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 70 - 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: COLORS.cyan,
      size: 0.07,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attach mild FogExp2 to the scene (stores previous fog for dispose restore).
   */
  applyToScene(scene: THREE.Scene): void {
    this.sceneRef = scene;
    this.prevFog = scene.fog;
    // Very mild — readability of cube blocks must stay intact
    this.fogApplied = new THREE.FogExp2(0x02060a, 0.0045);
    scene.fog = this.fogApplied;
    if (!this.group.parent) {
      scene.add(this.group);
    }
  }

  /**
   * Adaptive quality: low reduces dust and monolith density, dims grid slightly.
   */
  setQuality(low: boolean): void {
    if (this.disposed) return;
    if (this.qualityLow === low) return;
    this.qualityLow = low;

    this.buildMonoliths(low ? this.monoLow : this.monoHigh);
    this.buildDust(low ? this.dustLow : this.dustHigh);

    if (this.grid) {
      const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
      for (const m of mats) {
        (m as THREE.Material).opacity = low ? 0.07 : 0.11;
      }
    }
    if (this.horizon) {
      (this.horizon.material as THREE.LineBasicMaterial).opacity = low ? 0.08 : 0.14;
    }
    if (this.fogApplied) {
      this.fogApplied.density = low ? 0.0035 : 0.0045;
    }
  }

  get isLowQuality(): boolean {
    return this.qualityLow;
  }

  /** Slow parallax spin of distant monoliths + gentle dust drift. */
  update(dt: number): void {
    if (this.disposed) return;
    this._spin += dt * 0.012;
    this.monolithGroup.rotation.y = this._spin;
    if (this.dust) {
      this.dust.rotation.y += dt * 0.018;
      this.dust.rotation.x = Math.sin(this._spin * 0.7) * 0.02;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.sceneRef) {
      this.sceneRef.remove(this.group);
      if (this.sceneRef.fog === this.fogApplied) {
        this.sceneRef.fog = this.prevFog;
      }
      this.sceneRef = null;
    }
    this.fogApplied = null;
    this.prevFog = null;

    if (this.grid) {
      this.grid.geometry.dispose();
      const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
      for (const m of mats) m.dispose();
      this.grid = null;
    }
    if (this.horizon) {
      this.horizon.geometry.dispose();
      (this.horizon.material as THREE.Material).dispose();
      this.horizon = null;
    }
    if (this.monoliths) {
      this.monoliths.geometry.dispose();
      (this.monoliths.material as THREE.Material).dispose();
      this.monoliths = null;
    }
    if (this.dust) {
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.dust = null;
    }
    this.group.clear();
  }
}
