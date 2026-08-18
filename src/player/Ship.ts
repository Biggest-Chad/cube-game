import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, ORBIT } from '../data/constants';
import type { OrbitalCamera } from './OrbitalCamera';
import { SHIP_MUZZLE, SHIP_THRUSTERS } from './ShipMounts';

/**
 * Aggressive cinematic interceptor — dagger silhouette, forward-swept wings,
 * exposed nose cannon, layered armor. Local -Z is forward (toward cube).
 */
export class Ship {
  readonly group = new THREE.Group();
  private body: THREE.Group;
  private engineGlow: THREE.Mesh[] = [];
  /** Local-space muzzle tip (nose cannon aperture). */
  private muzzleLocal = SHIP_MUZZLE.clone();
  private _muzzleWorld = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _targetQuat = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _m = new THREE.Matrix4();
  private thrusterPulse = 0;
  private motionIntensity = 0;
  /** Local-space thruster exhaust origins (rear of ship). */
  private thrusterLocals: THREE.Vector3[] = [];
  private plumeMeshes: THREE.Mesh[] = [];
  private accentMats: THREE.MeshStandardMaterial[] = [];
  private runningLights: THREE.Mesh[] = [];
  private readonly _thrusterWorld = new THREE.Vector3();
  private readonly _aft = new THREE.Vector3();

  constructor() {
    this.body = this.buildMesh();
    this.group.add(this.body);
    this.setupLights();
    this.setupThrusterLights();
    void this.adoptHeroVisual();
  }

  /**
   * Prefer the 3DHaupt Intergalactic hull (CC-BY-NC). Fall back to interceptor-v2.
   * Mounts stay on `ship.group` (see ShipMounts).
   */
  async adoptHeroVisual(): Promise<void> {
    const loader = new GLTFLoader();
    const tryUrls = ['./ships/intergalactic.glb', './ships/interceptor-v2.glb'];
    for (const url of tryUrls) {
      try {
        const gltf = await loader.loadAsync(url);
        this.installHeroVisual(gltf.scene, url.includes('intergalactic') ? 'Intergalactic' : 'InterceptorV2');
        return;
      } catch {
        // next candidate
      }
    }
  }

  private installHeroVisual(next: THREE.Group, name: string): void {
    next.name = name;
    this.engineGlow = [];
    this.plumeMeshes = [];
    this.accentMats = [];
    this.runningLights = [];
    next.updateMatrixWorld(true);
    next.traverse((o) => {
      const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
      if (!mesh) return;
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (mesh.name.startsWith('Plume')) {
        mesh.visible = false;
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || !('emissive' in m)) continue;
        const std = m as THREE.MeshStandardMaterial;
        std.toneMapped = false;
        std.envMapIntensity = 0.35;
        if (mesh.name.startsWith('EngineGlow') || mesh.name.includes('Nozzle')) {
          std.transparent = true;
          std.depthWrite = false;
          std.emissive.copy(std.color);
          std.emissiveIntensity = Math.max(std.emissiveIntensity, 1.2);
        }
      }
      if (mesh.name.startsWith('EngineGlow') || mesh.name.includes('Nozzle')) {
        this.engineGlow.push(mesh);
      }
    });
    try {
      this.mergeStaticHull(next);
    } catch (err) {
      console.warn('[ship] hull merge failed', err);
      next.userData.hullMergeError = String(err);
      next.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.matrixAutoUpdate = false;
          o.updateMatrix();
        }
      });
    }
    this.group.remove(this.body);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.body = next;
    this.group.add(this.body);
    this.muzzleLocal.copy(SHIP_MUZZLE);
    this.thrusterLocals = SHIP_THRUSTERS.map((v) => v.clone());
  }

  /**
   * Fold authored hull meshes that share a material into one Mesh per map.
   * EngineGlow / Nozzle stay live for the thruster pulse. Maps are reused.
   */
  private mergeStaticHull(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const bake = new THREE.Matrix4();
    type Bucket = { material: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] };
    const buckets = new Map<string, Bucket>();

    const asMesh = (o: THREE.Object3D): THREE.Mesh | null =>
      (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    const isLive = (o: THREE.Mesh): boolean =>
      o.name.startsWith('EngineGlow') ||
      o.name.includes('Nozzle') ||
      o.name.startsWith('Plume');

    const materialKey = (mat: THREE.Material): string => {
      const std = mat as THREE.MeshStandardMaterial;
      const mapId = (t: THREE.Texture | null | undefined) => t?.uuid ?? '-';
      return [
        mat.type,
        mapId(std.map),
        mapId(std.emissiveMap),
        mapId(std.normalMap),
        mapId(std.roughnessMap),
        mapId(std.metalnessMap),
        mapId(std.aoMap),
        std.transparent ? 1 : 0,
        std.side ?? 0,
      ].join('|');
    };

    root.traverse((o) => {
      const mesh = asMesh(o);
      if (!mesh || isLive(mesh)) return;
      if (Array.isArray(mesh.material)) return;
      const mat = mesh.material as THREE.Material;
      const src = mesh.geometry;
      if (!src) return;
      const key = materialKey(mat);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: mat, geos: [], meshes: [] };
        buckets.set(key, bucket);
      }
      const g = src.clone();
      bake.copy(inv).multiply(o.matrixWorld);
      g.applyMatrix4(bake);
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.getAttribute('uv')) {
        const n = g.getAttribute('position')?.count ?? 0;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      g.morphAttributes = {};
      bucket.geos.push(g);
      bucket.meshes.push(mesh);
    });

    const meshCount = [...buckets.values()].reduce((n, b) => n + b.meshes.length, 0);
    if (meshCount < 2) {
      for (const g of buckets.values()) g.geos.forEach((geo) => geo.dispose());
      root.traverse((o) => {
        const mesh = asMesh(o);
        if (mesh && !isLive(mesh)) {
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
        }
      });
      return;
    }

    const hull = new THREE.Group();
    hull.name = 'MergedHull';
    let mergedAny = false;
    for (const bucket of buckets.values()) {
      if (bucket.geos.length === 0) continue;
      let merged: THREE.BufferGeometry | null = null;
      try {
        merged = bucket.geos.length > 1 ? mergeGeometries(bucket.geos, false) : null;
      } catch {
        merged = null;
      }
      for (const g of bucket.geos) g.dispose();
      if (!merged) {
        for (const mesh of bucket.meshes) {
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
        }
        continue;
      }
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.name = 'HullBatch';
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      hull.add(mesh);
      mergedAny = true;
      for (const srcMesh of bucket.meshes) {
        srcMesh.removeFromParent();
        srcMesh.geometry.dispose();
      }
    }

    const prune = (o: THREE.Object3D): void => {
      const kids = o.children.slice();
      for (const c of kids) prune(c);
      const renderable =
        (o as THREE.Mesh).isMesh ||
        (o as THREE.Line).isLine ||
        (o as THREE.Points).isPoints ||
        (o as THREE.Sprite).isSprite ||
        (o as THREE.Light).isLight;
      if (o !== root && o !== hull && o.children.length === 0 && !renderable) {
        o.removeFromParent();
      }
    };
    prune(root);
    if (mergedAny) root.add(hull);
  }

  private hull(color = 0x1a2430, metal = 0.82, rough = 0.26): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
      envMapIntensity: 0.9,
      emissive: 0x143040,
      emissiveIntensity: 0.22,
    });
  }

  private accent(color: number, intensity = 0.75): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.35,
      roughness: 0.18,
    });
  }

  private glass(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x6ad8f0,
      metalness: 0.15,
      roughness: 0.05,
      transparent: true,
      opacity: 0.72,
      emissive: 0x1488aa,
      emissiveIntensity: 0.65,
    });
  }

  private addBox(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  private addCyl(
    parent: THREE.Object3D,
    rt: number,
    rb: number,
    h: number,
    segs: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();
    const hullDark = this.hull(0x0e141c, 0.85, 0.28);
    const hullMid = this.hull(0x182230, 0.78, 0.34);
    const hullLite = this.hull(0x243444, 0.7, 0.4);
    const panel = this.hull(0x080c12, 0.9, 0.45);
    const edge = this.hull(0x2a3848, 0.75, 0.3);
    const cyan = this.accent(COLORS.cyan, 0.85);
    const mag = this.accent(COLORS.magenta, 0.95);
    const white = this.accent(COLORS.white, 0.9);
    const eng = this.accent(0xff44bb, 1.35);
    const warn = this.accent(0xff6622, 0.7);
    this.accentMats.push(cyan, mag, white, eng, warn);

    // ═══════════════════════════════════════════
    // AGGRESSIVE DAGGER FUSELAGE (front = -Z)
    // ═══════════════════════════════════════════

    // Main body — deep wedge
    this.addBox(g, 0.38, 0.22, 1.55, 0, 0.02, 0.05, hullMid);
    this.addBox(g, 0.48, 0.12, 1.2, 0, 0.12, 0.12, hullLite);
    this.addBox(g, 0.34, 0.16, 0.9, 0, -0.08, 0.15, hullDark);

    // Chin plow / armor beak
    this.addBox(g, 0.3, 0.1, 0.7, 0, -0.1, -0.55, hullDark, 0.18, 0, 0);
    this.addBox(g, 0.22, 0.06, 0.45, 0, -0.12, -0.95, panel, 0.12, 0, 0);

    // Tapered nose stack (aggressive needle)
    this.addBox(g, 0.28, 0.14, 0.5, 0, 0.02, -0.7, hullMid);
    this.addBox(g, 0.2, 0.11, 0.4, 0, 0.01, -1.05, hullDark);
    this.addBox(g, 0.12, 0.08, 0.28, 0, 0, -1.32, panel);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 7), hullDark);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, -1.55);
    g.add(nose);

    // Primary plasma cannon barrel (muzzle beyond tip)
    this.addCyl(g, 0.035, 0.042, 0.42, 8, 0, -0.02, -1.48, edge, Math.PI / 2, 0, 0);
    this.addCyl(g, 0.028, 0.028, 0.18, 8, 0, -0.02, -1.68, panel, Math.PI / 2, 0, 0);
    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.01, 6, 14),
      cyan
    );
    muzzleRing.rotation.y = Math.PI / 2;
    muzzleRing.position.set(0, -0.02, -1.78);
    g.add(muzzleRing);
    const muzzleGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 10),
      new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    muzzleGlow.position.set(0, -0.02, -1.8);
    g.add(muzzleGlow);
    this.muzzleLocal.set(0, -0.02, -1.88);

    // Twin secondary barrels under chin
    for (const side of [-1, 1]) {
      this.addCyl(g, 0.018, 0.022, 0.28, 6, side * 0.1, -0.12, -1.15, cyan, Math.PI / 2, 0, 0);
    }

    // ── Cockpit (recessed, armored) ──
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      this.glass()
    );
    canopy.scale.set(1.05, 0.65, 1.35);
    canopy.position.set(0, 0.16, -0.28);
    g.add(canopy);
    this.addBox(g, 0.3, 0.04, 0.42, 0, 0.1, -0.28, panel);
    // Canopy frame rails
    this.addBox(g, 0.02, 0.06, 0.38, 0.12, 0.14, -0.28, edge);
    this.addBox(g, 0.02, 0.06, 0.38, -0.12, 0.14, -0.28, edge);

    // Dorsal spine ridge (predator line)
    this.addBox(g, 0.05, 0.1, 1.1, 0, 0.2, 0.1, panel);
    this.addBox(g, 0.08, 0.04, 0.5, 0, 0.24, -0.1, cyan);
    // Sensor fin
    this.addBox(g, 0.02, 0.22, 0.18, 0, 0.34, 0.35, hullMid, 0.15, 0, 0);
    this.addBox(g, 0.015, 0.08, 0.06, 0, 0.46, 0.32, mag);

    // Side cheek armor (angular)
    for (const side of [-1, 1]) {
      this.addBox(g, 0.12, 0.18, 0.85, side * 0.28, 0.02, 0.0, hullDark, 0, 0, side * -0.35);
      this.addBox(g, 0.08, 0.1, 0.55, side * 0.32, -0.02, -0.35, panel, 0, 0, side * -0.25);
      // Intake scoops
      this.addBox(g, 0.1, 0.08, 0.22, side * 0.26, -0.06, -0.15, panel, 0.2, 0, 0);
      this.addBox(g, 0.06, 0.04, 0.12, side * 0.26, -0.06, -0.28, warn);
    }

    // Panel greebles / heat vents
    for (const z of [-0.45, -0.1, 0.25, 0.55]) {
      this.addBox(g, 0.42, 0.008, 0.018, 0, 0.14, z, panel);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        this.addBox(g, 0.04, 0.015, 0.06, side * 0.2, -0.14, 0.2 + i * 0.12, edge);
      }
    }

    // Accent strips
    this.addBox(g, 0.015, 0.025, 1.0, 0.2, 0.06, 0.0, cyan);
    this.addBox(g, 0.015, 0.025, 1.0, -0.2, 0.06, 0.0, cyan);
    this.addBox(g, 0.18, 0.015, 0.03, 0, -0.14, -0.7, mag);

    // ── Forward-swept combat wings ──
    for (const side of [-1, 1]) {
      // Main wing — swept forward aggressively
      this.addBox(g, 1.05, 0.03, 0.32, side * 0.62, -0.02, 0.05, hullLite, 0, side * 0.35, side * 0.22);
      // Leading edge blade
      this.addBox(g, 0.7, 0.02, 0.1, side * 0.75, 0.0, -0.12, edge, 0, side * 0.4, side * 0.15);
      // Wing tip blade
      this.addBox(g, 0.35, 0.02, 0.12, side * 1.05, 0.02, 0.18, cyan, 0, side * 0.25, side * 0.1);
      // Underside hardpoint rail
      this.addBox(g, 0.4, 0.04, 0.08, side * 0.55, -0.08, 0.08, panel);
      // Tip light
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mag);
      tip.position.set(side * 1.15, 0.02, 0.22);
      g.add(tip);
    }

    // Canard / forward fins
    for (const side of [-1, 1]) {
      this.addBox(g, 0.35, 0.02, 0.14, side * 0.28, 0.0, -0.75, hullMid, 0, side * -0.2, side * 0.3);
      this.addBox(g, 0.12, 0.015, 0.06, side * 0.4, 0.01, -0.82, cyan);
    }

    // Vertical stabs — canted outward (aggressive)
    for (const side of [-1, 1]) {
      this.addBox(g, 0.025, 0.32, 0.28, side * 0.16, 0.26, 0.55, hullMid, 0.25, 0, side * 0.35);
      this.addBox(g, 0.02, 0.14, 0.1, side * 0.18, 0.4, 0.5, mag);
      // Rudder stripe
      this.addBox(g, 0.012, 0.2, 0.04, side * 0.17, 0.28, 0.62, cyan);
    }

    // ── Engine cluster ──
    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(side * 0.36, -0.04, 0.55);

      this.addCyl(pod, 0.09, 0.12, 0.5, 10, 0, 0, 0, hullDark, Math.PI / 2, 0, 0);
      this.addCyl(pod, 0.07, 0.085, 0.18, 10, 0, 0, 0.28, panel, Math.PI / 2, 0, 0);
      // Intake lip front of pod
      this.addCyl(pod, 0.1, 0.08, 0.08, 10, 0, 0, -0.28, edge, Math.PI / 2, 0, 0);

      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.14, 10), eng);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.z = 0.4;
      pod.add(nozzle);
      this.engineGlow.push(nozzle);

      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.38, 8),
        new THREE.MeshBasicMaterial({
          color: COLORS.magenta,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      plume.rotation.x = -Math.PI / 2;
      plume.position.z = 0.62;
      pod.add(plume);
      this.engineGlow.push(plume);
      this.plumeMeshes.push(plume);
      // Exhaust spawn (world via localToWorld later) — pod local
      this.thrusterLocals.push(new THREE.Vector3(side * 0.36, -0.04, 0.55 + 0.72));

      // Outer glow shell on plume
      const shell = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.45, 8),
        new THREE.MeshBasicMaterial({
          color: 0xaa44ff,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      shell.rotation.x = -Math.PI / 2;
      shell.position.z = 0.68;
      pod.add(shell);
      this.plumeMeshes.push(shell);

      this.addBox(pod, 0.05, 0.14, 0.1, -side * 0.1, 0.06, -0.1, hullMid);
      g.add(pod);
    }

    // Center afterburner
    this.addCyl(g, 0.09, 0.13, 0.32, 10, 0, 0, 0.85, hullDark, Math.PI / 2, 0, 0);
    const mainNoz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 10), eng);
    mainNoz.rotation.x = Math.PI / 2;
    mainNoz.position.set(0, 0, 1.02);
    g.add(mainNoz);
    this.engineGlow.push(mainNoz);

    const mainPlume = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.5, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff66cc,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mainPlume.rotation.x = -Math.PI / 2;
    mainPlume.position.set(0, 0, 1.28);
    g.add(mainPlume);
    this.engineGlow.push(mainPlume);
    this.plumeMeshes.push(mainPlume);
    this.thrusterLocals.push(new THREE.Vector3(0, 0, 1.45));

    const mainShell = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.62, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mainShell.rotation.x = -Math.PI / 2;
    mainShell.position.set(0, 0, 1.35);
    g.add(mainShell);
    this.plumeMeshes.push(mainShell);

    // Engine ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 20), cyan);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 0, 0.75);
    g.add(ring);

    // Ventral thruster banks
    for (const side of [-1, 1]) {
      this.addBox(g, 0.14, 0.05, 0.18, side * 0.18, -0.16, 0.25, panel);
      this.addBox(g, 0.08, 0.02, 0.1, side * 0.18, -0.19, 0.25, mag);
    }

    // Wingtip / nav running lights (bloom catchers)
    for (const side of [-1, 1]) {
      const nav = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 10),
        new THREE.MeshBasicMaterial({
          color: side > 0 ? COLORS.magenta : COLORS.cyan,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      nav.position.set(side * 0.72, 0.02, 0.15);
      g.add(nav);
      this.runningLights.push(nav);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 10),
        new THREE.MeshBasicMaterial({
          color: side > 0 ? COLORS.magenta : COLORS.cyan,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.copy(nav.position);
      g.add(halo);
      this.runningLights.push(halo);
    }

    // ── Headlights in cheek mounts ──
    const lampMat = this.hull(0x1a2028, 0.5, 0.35);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0xfff2c8,
      emissiveIntensity: 1.4,
      metalness: 0.15,
      roughness: 0.12,
    });
    for (const side of [-1, 1]) {
      this.addBox(g, 0.09, 0.07, 0.1, side * 0.18, -0.02, -1.2, lampMat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), lensMat);
      lens.position.set(side * 0.18, -0.02, -1.26);
      g.add(lens);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 12),
        new THREE.MeshBasicMaterial({
          color: 0xfff0c0,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.set(side * 0.18, -0.02, -1.265);
      g.add(glow);
    }

    // Kill markings / hazard stripe near rear
    this.addBox(g, 0.35, 0.01, 0.04, 0, 0.16, 0.7, warn);

    // Slight overall scale for third-person readability
    g.scale.setScalar(1.12);
    // Mounts live on ship.group — already final size (see ShipMounts).
    this.muzzleLocal.copy(SHIP_MUZZLE);
    this.thrusterLocals = SHIP_THRUSTERS.map((v) => v.clone());
    return g;
  }

  private setupLights(): void {
    // No SpotLights/PointLights — they lit the PBR cube. Emissive/additive glow meshes stay.
  }

  /**
   * World-space position of the nose cannon aperture.
   * Use this as main-gun projectile origin (not ship center).
   */
  getMuzzleWorldPosition(out = this._muzzleWorld): THREE.Vector3 {
    out.copy(this.muzzleLocal);
    this.group.localToWorld(out);
    return out;
  }

  /** Forward direction in world space (toward cube / -local Z). */
  getForward(out = new THREE.Vector3()): THREE.Vector3 {
    // After lookAt(0,0,0), local -Z faces the cube
    out.set(0, 0, -1).applyQuaternion(this.group.quaternion).normalize();
    return out;
  }

  private setupThrusterLights(): void {
    // No thruster PointLights — plume/engine glow meshes remain.
  }

  /**
   * @param particles optional pool for exhaust sparks while maneuvering
   */
  update(
    camera: OrbitalCamera,
    dt: number,
    particles?: {
      spawn: (
        x: number,
        y: number,
        z: number,
        color: number,
        count: number,
        speed?: number,
        style?: 'spark' | 'debris' | 'glow' | 'ember'
      ) => void;
      spray?: (
        x: number,
        y: number,
        z: number,
        nx: number,
        ny: number,
        nz: number,
        color: number,
        count: number,
        speed?: number
      ) => void;
    } | null
  ): void {
    camera.getShipPosition(this._desired);
    const posLag =
      typeof camera.getShipVisualLagRate === 'function'
        ? camera.getShipVisualLagRate(ORBIT.shipPosLag)
        : ORBIT.shipPosLag;
    const posK = 1 - Math.exp(-posLag * dt);
    this.group.position.lerp(this._desired, posK);

    this._look.set(0, 0, 0);
    this._m.lookAt(this.group.position, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    // Bank into turn for epic dogfight silhouette
    const yawV =
      typeof camera.yawVelocity === 'number' ? camera.yawVelocity : 0;
    const bank = THREE.MathUtils.clamp(-yawV * 0.55, -0.45, 0.45);
    const pitchBob = Math.sin(this.thrusterPulse * 0.7) * 0.02 * (0.4 + this.motionIntensity);
    const bankQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitchBob, 0, bank, 'YXZ')
    );
    this._targetQuat.multiply(bankQ);
    const rotK = 1 - Math.exp(-ORBIT.shipRotLag * dt);
    this.group.quaternion.slerp(this._targetQuat, rotK);

    // Motion intensity: turn rate + subtle idle cruise
    const targetMotion = THREE.MathUtils.clamp(camera.turnRate * 1.8 + 0.12, 0.08, 1.4);
    const mK = 1 - Math.exp(-6 * dt);
    this.motionIntensity += (targetMotion - this.motionIntensity) * mK;

    this.thrusterPulse += dt * (5 + this.motionIntensity * 10);
    const flicker =
      0.85 +
      Math.sin(this.thrusterPulse) * 0.15 +
      Math.sin(this.thrusterPulse * 2.3) * 0.08;
    const boost = this.motionIntensity;

    for (const m of this.engineGlow) {
      if (m.material instanceof THREE.MeshStandardMaterial) {
        m.material.emissiveIntensity = 0.7 + flicker * 0.65 + boost * 1.35;
      } else if (m.material instanceof THREE.MeshBasicMaterial) {
        m.material.opacity = 0.4 + flicker * 0.4 + boost * 0.45;
      }
    }
    for (const p of this.plumeMeshes) {
      const s = 0.75 + boost * 1.35 + Math.sin(this.thrusterPulse * 1.7) * 0.14;
      p.scale.set(s * 0.9, s * 0.9, s * (1.15 + boost * 1.05));
      if (p.material instanceof THREE.MeshBasicMaterial) {
        p.material.opacity = 0.3 + boost * 0.6 + flicker * 0.18;
      }
    }
    // Accent strips + nav lights breathe with thrusters
    for (const mat of this.accentMats) {
      mat.emissiveIntensity = 0.55 + flicker * 0.35 + boost * 0.45;
    }
    for (const n of this.runningLights) {
      if (n.material instanceof THREE.MeshBasicMaterial) {
        n.material.opacity = 0.35 + flicker * 0.45 + boost * 0.25;
      }
    }
    if (particles && this.group.visible) {
      const aft = this._aft.set(0, 0, 1).applyQuaternion(this.group.quaternion);
      const n = this.thrusterLocals.length || 1;
      const puffs = boost > 0.2 ? 1 + (Math.random() < boost * 0.7 ? 1 : 0) : Math.random() < 0.35 ? 1 : 0;
      for (let p = 0; p < puffs; p++) {
        const local = this.thrusterLocals[(Math.random() * n) | 0];
        if (!local) continue;
        this._thrusterWorld.copy(local);
        this.group.localToWorld(this._thrusterWorld);
        this._thrusterWorld.addScaledVector(aft, 0.08 + Math.random() * 0.22);
        const col = Math.random() < 0.45 ? 0xffaa44 : Math.random() < 0.5 ? COLORS.magenta : 0x66e8ff;
        if (particles.spray) {
          particles.spray(
            this._thrusterWorld.x,
            this._thrusterWorld.y,
            this._thrusterWorld.z,
            aft.x,
            aft.y,
            aft.z,
            col,
            2 + (boost > 0.6 ? 2 : 1),
            5 + boost * 9
          );
        } else {
          particles.spawn(
            this._thrusterWorld.x,
            this._thrusterWorld.y,
            this._thrusterWorld.z,
            col,
            2,
            4 + boost * 6,
            Math.random() < 0.5 ? 'glow' : 'ember'
          );
        }
      }
    }
  }

  getMotionIntensity(): number {
    return this.motionIntensity;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
      if (o instanceof THREE.SpotLight || o instanceof THREE.PointLight) {
        o.dispose();
      }
    });
  }
}
