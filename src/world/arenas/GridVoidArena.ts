import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaId } from '../../data/arenas';
import type { ArenaInstance } from '../ArenaInstance';
import { addCityAmbience } from './cityLife';

/** Place the hex field under the cube; floor sits below the combat volume. */
const FLOOR_Y = -22;
const HEX_CENTER_Z = 14;

/** Combat + arena share this extra camera layer so city is not point-lit. */
export const ARENA_LAYER = 1;

/** High-cost décor. Distant ambience does not need any of this. */
function isHeavyDecor(name: string): boolean {
  return (
    name.startsWith('Ring_') ||
    name.startsWith('RingSpark') ||
    name === 'RingSparkles' ||
    name === 'SkySpecs' ||
    /_wire$/i.test(name) ||
    name.includes('_wire') ||
    name.startsWith('HexLines') ||
    name.startsWith('HexPads') ||
    name.startsWith('SquareGrid') ||
    name.startsWith('Debris') ||
    name.startsWith('Metro') ||
    name === 'HorizonGlow' ||
    name === 'CityAccents' ||
    name === 'CityPodiums'
  );
}

function isBuildingBody(name: string): boolean {
  return name.startsWith('Proto_') && !name.includes('wire');
}

function stampArenaLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(ARENA_LAYER);
  });
}

function emissiveToBasic(src: THREE.Material, dim = 0.45): THREE.MeshBasicMaterial {
  const em = src as THREE.MeshStandardMaterial;
  const color = new THREE.Color(em.emissive?.r ?? 0.08, em.emissive?.g ?? 0.09, em.emissive?.b ?? 0.1);
  const intensity = Math.max(0.2, (em.emissiveIntensity || 1) * dim);
  color.multiplyScalar(Math.min(1.4, intensity));
  if (em.color) color.lerp(em.color, 0.18);
  return new THREE.MeshBasicMaterial({
    color,
    map: em.map ?? null,
    transparent: true,
    opacity: 0.78,
    toneMapped: false,
    fog: true,
    side: em.side ?? THREE.FrontSide,
    depthWrite: true,
  });
}

function downgradeCityMaterial(mesh: THREE.Mesh): void {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = list.map((m) => {
    if (!m) return m;
    if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return m;
    const baked = emissiveToBasic(m);
    m.dispose();
    return baked;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
}

function stripMesh(o: THREE.Mesh): void {
  o.visible = false;
  o.geometry.dispose();
  o.geometry = new THREE.BufferGeometry();
}

/** Drop wire cages (~98k tris) and merge leftover building bodies into one draw. */
function simplifyCity(city: THREE.Object3D): void {
  city.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(city.matrixWorld).invert();
  const baked: THREE.BufferGeometry[] = [];
  const remove: THREE.Mesh[] = [];
  city.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (isHeavyDecor(o.name)) {
      stripMesh(o);
      remove.push(o);
      return;
    }
    if (!isBuildingBody(o.name)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    baked.push(g);
    stripMesh(o);
    remove.push(o);
  });
  for (const m of remove) m.removeFromParent();
  if (!baked.length) return;
  const merged = mergeGeometries(baked, false);
  baked.forEach((g) => g.dispose());
  if (!merged) return;
  const skyline = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({
      color: 0x1c3a48,
      toneMapped: false,
      fog: true,
      transparent: true,
      opacity: 0.7,
    })
  );
  skyline.name = 'CitySkyline';
  skyline.frustumCulled = true;
  city.add(skyline);
}

function freezeStaticArena(root: THREE.Object3D): void {
  root.traverse((o) => {
    let p: THREE.Object3D | null = o;
    let underLife = false;
    while (p) {
      if (p.name === 'CityLife') {
        underLife = true;
        break;
      }
      p = p.parent;
    }
    if (underLife) return;
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

export class GridVoidArena implements ArenaInstance {
  readonly id: ArenaId = 'grid-void';
  private readonly root = new THREE.Group();
  private scene: THREE.Scene | null = null;
  private prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  private prevBg: THREE.Color | THREE.Texture | null = null;
  private fog = new THREE.Fog(0x000000, 38, 130);
  private envMap: THREE.Texture | null = null;
  private quality: 0 | 1 | 2 = 1;
  private disposed = false;

  private constructor() {
    this.root.name = 'GridVoidArena';
    this.root.position.set(0, FLOOR_Y, HEX_CENTER_Z);
  }

  static async load(quality: 0 | 1 | 2 = 1): Promise<GridVoidArena> {
    const arena = new GridVoidArena();
    arena.quality = quality;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('./arenas/grid-void/city.glb');
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = true;
      o.castShadow = false;
      o.receiveShadow = false;
      if (isHeavyDecor(o.name)) {
        stripMesh(o);
        return;
      }
      downgradeCityMaterial(o);
    });
    arena.root.add(gltf.scene);
    simplifyCity(gltf.scene);

    try {
      const sky = await new THREE.TextureLoader().loadAsync('./arenas/grid-void/sky.png');
      sky.mapping = THREE.EquirectangularReflectionMapping;
      sky.colorSpace = THREE.SRGBColorSpace;
      sky.anisotropy = 1;
      sky.generateMipmaps = true;
      arena.envMap = sky;
      // Background only — a second full-screen sky dome was drawing the same texture twice.
    } catch (err) {
      console.warn('[arena] grid-void sky missing', err);
    }

    addCityAmbience(arena.root);
    freezeStaticArena(arena.root);
    stampArenaLayer(arena.root);
    arena.setQuality(arena.quality);
    return arena;
  }

  applyToScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.prevFog = scene.fog;
    this.prevBg = scene.background as THREE.Color | THREE.Texture | null;
    scene.fog = this.fog;
    if (this.envMap) {
      scene.background = this.envMap;
      // No scene.environment — IBL on every city MeshStandardMaterial is a mobile killer.
      scene.environment = null;
    } else {
      scene.background = new THREE.Color(0x02060a);
    }
    if (!this.root.parent) scene.add(this.root);
  }

  detach(scene: THREE.Scene): void {
    scene.remove(this.root);
    if (scene.fog === this.fog) scene.fog = this.prevFog;
    if (this.envMap && scene.background === this.envMap) {
      scene.background = this.prevBg;
    }
    if (scene.environment === this.envMap) scene.environment = null;
    this.scene = null;
  }

  setQuality(tier: 0 | 1 | 2): void {
    this.quality = tier;
    // Same cheap ambience on every tier — gameplay keeps the GPU.
    this.fog.near = 38;
    this.fog.far = 130;
  }

  update(_dt: number): void {
    // Static backdrop — no per-frame city animation.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.scene) this.detach(this.scene);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material).dispose();
      }
    });
    this.envMap?.dispose();
    this.root.clear();
  }
}
