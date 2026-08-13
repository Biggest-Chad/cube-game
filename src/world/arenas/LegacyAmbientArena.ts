import type { Scene } from 'three';
import type { ArenaId } from '../../data/arenas';
import type { ArenaInstance } from '../ArenaInstance';
import { AmbientEnvironment } from '../AmbientEnvironment';

/** Procedural fallback if a GLB arena fails to load. */
export class LegacyAmbientArena implements ArenaInstance {
  readonly id: ArenaId = 'grid-void';
  private readonly env = new AmbientEnvironment();

  applyToScene(scene: Scene): void {
    this.env.applyToScene(scene);
  }

  detach(scene: Scene): void {
    scene.remove(this.env.group);
  }

  setQuality(tier: 0 | 1 | 2): void {
    this.env.setQuality(tier);
  }

  update(dt: number): void {
    this.env.update(dt);
  }

  dispose(): void {
    this.env.dispose();
  }
}
