import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArenaId } from '../../data/arenas';
import type { ArenaInstance } from '../ArenaInstance';
import { addCityLife } from './cityLife';

/** Place the hex field under the cube; floor sits below the combat volume. */
const FLOOR_Y = -22;
const HEX_CENTER_Z = 14;

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
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !('emissive' in m)) continue;
        const em = m as THREE.MeshStandardMaterial;
        em.toneMapped = false;
        const floorish = /^(Square|Hex|Ground|Horizon|CityStreet|CityLot|Debris|MetroBed)/.test(o.name);
        if (!floorish && em.emissiveIntensity < 1.4) em.emissiveIntensity = 1.6;
      }
    });
    arena.root.add(gltf.scene);

    try {
      const sky = await new THREE.TextureLoader().loadAsync('./arenas/grid-void/sky.png');
      sky.mapping = THREE.EquirectangularReflectionMapping;
      sky.colorSpace = THREE.SRGBColorSpace;
      sky.anisotropy = 4;
      arena.envMap = sky;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(380, 48, 32),
        new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, depthWrite: false, fog: false })
      );
      dome.name = 'SkyDome';
      // Counter the floor offset so the sky stays world-centered
      dome.position.set(0, -FLOOR_Y, -HEX_CENTER_Z);
      arena.root.add(dome);
    } catch (err) {
      console.warn('[arena] grid-void sky missing', err);
    }

    const rings: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      if (o.name.startsWith('Ring_') && !o.name.includes('mesh') && !o.name.includes('glow')) {
        rings.push(o);
      }
    });
    arena.root.userData.tick = (t: number) => {
      for (const r of rings) {
        const spin = typeof r.userData.spin === 'number' ? r.userData.spin : 0.12;
        r.rotation.z = t * spin;
      }
    };

    addCityLife(arena.root, arena.quality);
    return arena;
  }

  applyToScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.prevFog = scene.fog;
    this.prevBg = scene.background as THREE.Color | THREE.Texture | null;
    scene.fog = this.fog;
    if (this.envMap) {
      scene.background = this.envMap;
      scene.environment = this.envMap;
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
    const life = this.root.getObjectByName('CityLife');
    if (life) life.visible = tier > 0;
    this.fog.near = tier === 0 ? 70 : 90;
    this.fog.far = tier === 0 ? 200 : 260;
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
