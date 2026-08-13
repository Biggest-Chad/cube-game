import type { Scene } from 'three';
import type { ArenaId } from '../data/arenas';

export interface ArenaInstance {
  readonly id: ArenaId;
  applyToScene(scene: Scene): void;
  detach(scene: Scene): void;
  setQuality(tier: 0 | 1 | 2): void;
  update(dt: number): void;
  dispose(): void;
}
