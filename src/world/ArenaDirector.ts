import type { Scene, PerspectiveCamera } from 'three';
import {
  type ArenaId,
  type ArenaResolveContext,
  DEFAULT_ARENA,
  resolveArenaId,
} from '../data/arenas';
import type { ArenaInstance } from './ArenaInstance';
import { GridVoidArena } from './arenas/GridVoidArena';
import { LegacyAmbientArena } from './arenas/LegacyAmbientArena';

const CAMERA_FAR = 900;

export class ArenaDirector {
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private current: ArenaInstance | null = null;
  private currentId: ArenaId | null = null;
  private quality: 0 | 1 | 2 = 1;
  private loadGen = 0;
  private loading: ArenaId | null = null;

  bind(scene: Scene, camera?: PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera ?? null;
    if (this.camera) this.camera.far = CAMERA_FAR;
    this.camera?.updateProjectionMatrix();
    void this.ensure(DEFAULT_ARENA);
  }

  setContext(ctx: ArenaResolveContext): void {
    void this.ensure(resolveArenaId(ctx));
  }

  setQuality(tier: 0 | 1 | 2): void {
    this.quality = tier;
    this.current?.setQuality(tier);
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  private async ensure(id: ArenaId): Promise<void> {
    if (this.currentId === id || this.loading === id) return;
    const gen = ++this.loadGen;
    this.loading = id;
    let inst: ArenaInstance;
    try {
      inst = await this.create(id);
    } catch (err) {
      console.warn(`[arena] ${id} failed, using procedural fallback`, err);
      inst = new LegacyAmbientArena();
    }
    if (gen !== this.loadGen) {
      inst.dispose();
      return;
    }
    this.swap(inst, id);
    this.loading = null;
  }

  private async create(id: ArenaId): Promise<ArenaInstance> {
    if (id === 'grid-void') return GridVoidArena.load(this.quality);
    // Future implemented arenas branch here.
    return GridVoidArena.load(this.quality);
  }

  private swap(next: ArenaInstance, id: ArenaId): void {
    if (!this.scene) {
      this.current?.dispose();
      this.current = next;
      this.currentId = id;
      return;
    }
    this.current?.detach(this.scene);
    this.current?.dispose();
    this.current = next;
    this.currentId = id;
    next.setQuality(this.quality);
    next.applyToScene(this.scene);
    if (this.camera) {
      this.camera.far = CAMERA_FAR;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.loadGen++;
    if (this.scene && this.current) this.current.detach(this.scene);
    this.current?.dispose();
    this.current = null;
    this.scene = null;
  }
}
