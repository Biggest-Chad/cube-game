import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

function stampArenaLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(ARENA_LAYER);
  });
}

function stripMesh(o: THREE.Mesh): void {
  o.visible = false;
  o.geometry.dispose();
  o.geometry = new THREE.BufferGeometry();
}

function keepAuthoredMaterial(mesh: THREE.Mesh): void {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of list) {
    if (!m || !('emissive' in m)) continue;
    const std = m as THREE.MeshStandardMaterial;
    std.toneMapped = false;
    std.envMap = null;
    std.envMapIntensity = 0;
    std.fog = true;
  }
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
  private fog = new THREE.Fog(0x02060c, 48, 155);
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
      keepAuthoredMaterial(o);
      // Ground discs are almost black in the GLB — lift them so the pit isn't a hole
      if (o.name === 'Ground' || o.name === 'GroundApron') {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (!m || !('color' in m)) continue;
          const std = m as THREE.MeshStandardMaterial;
          std.color.setHex(0x081018);
          std.emissive.setHex(0x041018);
          std.emissiveIntensity = Math.max(std.emissiveIntensity, 0.35);
        }
      }
    });
    arena.root.add(gltf.scene);

    try {
      const skyFull = await new THREE.TextureLoader().loadAsync('./arenas/grid-void/sky.png');
      // Downscale 4K equirect — full-res background has lost WebGL on phones.
      const img = skyFull.image as HTMLImageElement | ImageBitmap;
      const w = 1024;
      const h = 512;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (ctx && img) ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
      skyFull.dispose();
      const sky = new THREE.CanvasTexture(c);
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
    this.fog.near = 48;
    this.fog.far = 155;
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
