import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArenaId } from '../../data/arenas';
import type { ArenaInstance } from '../ArenaInstance';
import { addCityLife } from './cityLife';

/** Place the hex field under the cube; floor sits below the combat volume. */
const FLOOR_Y = -22;
const HEX_CENTER_Z = 14;

/** Combat + arena share this extra camera layer so city is not point-lit. */
export const ARENA_LAYER = 1;

function isArenaRing(name: string): boolean {
  return (
    name.startsWith('Ring_') ||
    name === 'RingSparkles' ||
    name.startsWith('RingSpark')
  );
}

function stampArenaLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(ARENA_LAYER);
  });
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
  private fog = new THREE.Fog(0x000000, 90, 260);
  private envMap: THREE.Texture | null = null;
  private quality: 0 | 1 | 2 = 1;
  private elapsed = 0;
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
      // Drop the sky rings + sparkles (large additive tori). Leave the city alone.
      if (isArenaRing(o.name)) {
        o.visible = false;
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          o.geometry = new THREE.BufferGeometry();
        }
        return;
      }
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = true;
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !('emissive' in m)) continue;
        const em = m as THREE.MeshStandardMaterial;
        em.toneMapped = false;
        em.envMap = null;
        em.envMapIntensity = 0;
        em.fog = true;
        const floorish = /^(Square|Hex|Ground|Horizon|CityStreet|CityLot|Debris|MetroBed)/.test(o.name);
        if (!floorish && em.emissiveIntensity < 1.4) em.emissiveIntensity = 1.6;
      }
    });
    arena.root.add(gltf.scene);

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

    addCityLife(arena.root, arena.quality);
    freezeStaticArena(arena.root);
    stampArenaLayer(arena.root);
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
    this.root.userData.lifeQuality = tier;
    const life = this.root.getObjectByName('CityLife');
    if (life) life.visible = tier > 0;
    this.fog.near = tier === 0 ? 55 : 90;
    this.fog.far = tier === 0 ? 170 : 260;
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.elapsed += dt;
    const tick = this.root.userData.tick as ((t: number, dt: number) => void) | undefined;
    tick?.(this.elapsed, dt);
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
