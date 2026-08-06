/**
 * Living neon arena: sky dome, multi-layer grid, orbiting energy rings,
 * distant monolith skyline with glow edges, drifting data dust, beacon lights.
 * GPU-conscious — tiered density via setQuality.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';

export class AmbientEnvironment {
  readonly group = new THREE.Group();

  private sky: THREE.Mesh | null = null;
  private grid: THREE.GridHelper | null = null;
  private grid2: THREE.GridHelper | null = null;
  private floorDisc: THREE.Mesh | null = null;
  private monolithGroup = new THREE.Group();
  private monoliths: THREE.InstancedMesh | null = null;
  private monoGlow: THREE.InstancedMesh | null = null;
  private dust: THREE.Points | null = null;
  private stars: THREE.Points | null = null;
  private horizon: THREE.LineLoop | null = null;
  private energyRings: THREE.Mesh[] = [];
  private beacons: THREE.PointLight[] = [];
  private beaconMeshes: THREE.Mesh[] = [];
  private dataStreams: THREE.Line[] = [];

  private qualityTier: 0 | 1 | 2 = 1;
  private disposed = false;
  private fogApplied: THREE.FogExp2 | null = null;
  private prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  private sceneRef: THREE.Scene | null = null;

  private readonly dustByTier = [28, 64, 110] as const;
  private readonly monoByTier = [6, 12, 18] as const;
  private readonly starByTier = [48, 100, 180] as const;

  private _dummy = new THREE.Object3D();
  private _spin = 0;
  private _pulse = 0;

  constructor() {
    this.group.name = 'AmbientEnvironment';
    this.buildSky();
    this.buildGrid();
    this.buildFloorDisc();
    this.buildHorizon();
    this.buildEnergyRings();
    this.buildStars(this.starByTier[1]);
    this.buildMonoliths(this.monoByTier[1]);
    this.buildDust(this.dustByTier[1]);
    this.buildBeacons();
    this.buildDataStreams();
    this.group.add(this.monolithGroup);
  }

  private buildSky(): void {
    // Inward-facing gradient dome (dark cyan void)
    const geo = new THREE.SphereGeometry(280, 32, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x020810,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // Soft nebula bands (additive shells)
    for (const [col, scale, op] of [
      [0x001a28, 0.92, 0.18],
      [0x1a0022, 0.78, 0.12],
      [0x001428, 0.65, 0.1],
    ] as const) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(260 * scale, 24, 16),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: op,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        })
      );
      shell.renderOrder = -9;
      this.group.add(shell);
    }
  }

  private buildGrid(): void {
    const size = 240;
    const helper = new THREE.GridHelper(size, 48, COLORS.cyan, 0x003848);
    helper.position.y = -28;
    this.tintGrid(helper, 0.18);
    this.grid = helper;
    this.group.add(helper);

    // Secondary finer grid, slightly elevated for depth
    const fine = new THREE.GridHelper(size * 0.55, 36, COLORS.magenta, 0x280018);
    fine.position.y = -27.6;
    this.tintGrid(fine, 0.08);
    this.grid2 = fine;
    this.group.add(fine);
  }

  private tintGrid(helper: THREE.GridHelper, opacity: number): void {
    const mats = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const m of mats) {
      const mat = m as THREE.Material;
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = false;
    }
  }

  private buildFloorDisc(): void {
    // Soft neon arena floor under the cube
    this.floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(42, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.floorDisc.rotation.x = -Math.PI / 2;
    this.floorDisc.position.y = -27.4;
    this.group.add(this.floorDisc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(38, 42, 64),
      new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -27.35;
    this.group.add(ring);
  }

  private buildHorizon(): void {
    const pts: THREE.Vector3[] = [];
    const r = 110;
    const segs = 96;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -4, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.horizon = new THREE.LineLoop(
      geo,
      new THREE.LineBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.group.add(this.horizon);
  }

  private buildEnergyRings(): void {
    // Vertical neon orbitals around the play volume
    for (let i = 0; i < 3; i++) {
      const r = 55 + i * 18;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.08 + i * 0.02, 8, 96),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0.14 - i * 0.02,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.12;
      ring.position.y = -8 + i * 3;
      this.energyRings.push(ring);
      this.group.add(ring);
    }
  }

  private buildStars(count: number): void {
    if (this.stars) {
      this.group.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
    const n = Math.max(0, count);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Outer sphere shell
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const rad = 160 + Math.random() * 90;
      pos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = rad * Math.cos(phi) * 0.55;
      pos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
      const c = Math.random() < 0.2 ? 1 : Math.random() < 0.5 ? 0.7 : 0.4;
      col[i * 3] = c * (Math.random() < 0.3 ? 1 : 0.5);
      col[i * 3 + 1] = c * 0.95;
      col[i * 3 + 2] = c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.55,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
      })
    );
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  private buildMonoliths(count: number): void {
    if (this.monoliths) {
      this.monolithGroup.remove(this.monoliths);
      this.monoliths.geometry.dispose();
      (this.monoliths.material as THREE.Material).dispose();
      this.monoliths = null;
    }
    if (this.monoGlow) {
      this.monolithGroup.remove(this.monoGlow);
      this.monoGlow.geometry.dispose();
      (this.monoGlow.material as THREE.Material).dispose();
      this.monoGlow = null;
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x080e14,
      metalness: 0.7,
      roughness: 0.45,
      transparent: true,
      opacity: 0.72,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const glowGeo = new THREE.BoxGeometry(1.05, 1.02, 1.05);
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.InstancedMesh(glowGeo, glowMat, count);
    glow.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.17;
      const dist = 72 + (i % 5) * 10 + (i % 2) * 5;
      const h = 10 + (i % 7) * 4 + (i % 4) * 1.2;
      const w = 1.5 + (i % 3) * 0.7;
      const d = 1.3 + (i % 4) * 0.55;
      const y = -28 + h * 0.5 + (i % 5) * 0.4;

      this._dummy.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
      this._dummy.rotation.set(0, angle + Math.PI * 0.25, (i % 5) * 0.02);
      this._dummy.scale.set(w, h, d);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(i, this._dummy.matrix);
      // Slightly taller glow silhouette
      this._dummy.scale.set(w * 1.02, h * 1.01, d * 1.02);
      this._dummy.updateMatrix();
      glow.setMatrixAt(i, this._dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    this.monoliths = mesh;
    this.monoGlow = glow;
    this.monolithGroup.add(glow, mesh);
  }

  private buildDust(count: number): void {
    if (this.dust) {
      this.group.remove(this.dust);
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.dust = null;
    }

    const n = Math.max(0, Math.min(200, count));
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 150;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80 - 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 150;
      const magenta = Math.random() < 0.35;
      col[i * 3] = magenta ? 1 : 0;
      col[i * 3 + 1] = magenta ? 0 : 0.94;
      col[i * 3 + 2] = magenta ? 0.67 : 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  private buildBeacons(): void {
    // Orbiting neon beacons in the mid-distance
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 48;
      const y = -12 + (i % 3) * 6;
      const col = i % 2 === 0 ? COLORS.cyan : COLORS.magenta;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 12),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      this.beaconMeshes.push(mesh);
      this.group.add(mesh);

      const light = new THREE.PointLight(col, 2.5, 35, 2);
      light.position.copy(mesh.position);
      this.beacons.push(light);
      this.group.add(light);

      // Vertical beam column
      const colm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, 22, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      colm.position.set(mesh.position.x, y + 8, mesh.position.z);
      this.group.add(colm);
    }
  }

  private buildDataStreams(): void {
    // Arc-like data streams in the background
    for (let s = 0; s < 8; s++) {
      const pts: THREE.Vector3[] = [];
      const baseA = (s / 8) * Math.PI * 2;
      const r = 85 + (s % 3) * 12;
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const a = baseA + t * 0.9;
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * r,
            -20 + Math.sin(t * Math.PI) * 28 + (s % 2) * 4,
            Math.sin(a) * r
          )
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: s % 2 === 0 ? COLORS.cyan : COLORS.magenta,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      this.dataStreams.push(line);
      this.group.add(line);
    }
  }

  applyToScene(scene: THREE.Scene): void {
    this.sceneRef = scene;
    this.prevFog = scene.fog;
    this.fogApplied = new THREE.FogExp2(0x02060c, 0.0038);
    scene.fog = this.fogApplied;
    scene.background = new THREE.Color(0x02060a);
    if (!this.group.parent) {
      scene.add(this.group);
    }
  }

  setQuality(tierOrLow: 0 | 1 | 2 | boolean): void {
    if (this.disposed) return;
    let tier: 0 | 1 | 2;
    if (typeof tierOrLow === 'boolean') {
      tier = tierOrLow ? 0 : 2;
    } else {
      tier = tierOrLow;
    }
    if (this.qualityTier === tier) return;
    this.qualityTier = tier;

    this.buildMonoliths(this.monoByTier[tier]);
    this.buildDust(this.dustByTier[tier]);
    this.buildStars(this.starByTier[tier]);

    const gridOp = tier === 0 ? 0.1 : tier === 1 ? 0.16 : 0.22;
    const horizonOp = tier === 0 ? 0.1 : tier === 1 ? 0.18 : 0.26;
    const fogD = tier === 0 ? 0.0028 : tier === 1 ? 0.0036 : 0.0042;

    if (this.grid) this.tintGrid(this.grid, gridOp);
    if (this.grid2) this.tintGrid(this.grid2, gridOp * 0.45);
    if (this.horizon) {
      (this.horizon.material as THREE.LineBasicMaterial).opacity = horizonOp;
    }
    if (this.fogApplied) this.fogApplied.density = fogD;

    for (const b of this.beacons) {
      b.intensity = tier === 0 ? 1.2 : tier === 1 ? 2.5 : 4;
    }
    for (const r of this.energyRings) {
      r.visible = tier > 0;
    }
  }

  get isLowQuality(): boolean {
    return this.qualityTier === 0;
  }

  update(dt: number): void {
    if (this.disposed) return;
    this._spin += dt * 0.014;
    this._pulse += dt;

    this.monolithGroup.rotation.y = this._spin * 0.35;

    if (this.dust) {
      this.dust.rotation.y += dt * 0.022;
      this.dust.rotation.x = Math.sin(this._spin * 0.7) * 0.03;
      this.dust.position.y = Math.sin(this._pulse * 0.4) * 1.2;
    }
    if (this.stars) {
      this.stars.rotation.y += dt * 0.008;
      this.stars.rotation.z = Math.sin(this._pulse * 0.15) * 0.02;
    }
    if (this.grid2) {
      this.grid2.rotation.y = Math.sin(this._pulse * 0.12) * 0.02;
    }
    if (this.floorDisc) {
      const m = this.floorDisc.material as THREE.MeshBasicMaterial;
      m.opacity = 0.03 + Math.sin(this._pulse * 1.4) * 0.015;
    }

    // Orbit energy rings
    for (let i = 0; i < this.energyRings.length; i++) {
      const r = this.energyRings[i];
      r.rotation.z += dt * (0.05 + i * 0.02) * (i % 2 === 0 ? 1 : -1);
      const mat = r.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.1 + Math.sin(this._pulse * 1.5 + i) * 0.04;
    }

    // Beacons pulse and slowly orbit
    for (let i = 0; i < this.beaconMeshes.length; i++) {
      const mesh = this.beaconMeshes[i];
      const baseA = (i / 6) * Math.PI * 2 + this._spin * 0.25;
      const r = 48;
      mesh.position.x = Math.cos(baseA) * r;
      mesh.position.z = Math.sin(baseA) * r;
      mesh.position.y = -12 + (i % 3) * 6 + Math.sin(this._pulse * 2 + i) * 0.8;
      const pulse = 0.55 + Math.sin(this._pulse * 3 + i * 1.3) * 0.35;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.4;
      if (this.beacons[i]) {
        this.beacons[i].position.copy(mesh.position);
        this.beacons[i].intensity =
          (this.qualityTier === 0 ? 1.2 : this.qualityTier === 1 ? 2.5 : 4) * pulse;
      }
    }

    // Data stream opacity shimmer
    for (let i = 0; i < this.dataStreams.length; i++) {
      const m = this.dataStreams[i].material as THREE.LineBasicMaterial;
      m.opacity = 0.1 + Math.sin(this._pulse * 2.2 + i * 0.7) * 0.08;
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

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Light) o.dispose();
    });
    this.group.clear();
  }
}
