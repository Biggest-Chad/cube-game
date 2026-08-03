import { CHUNK_SIZE } from '../data/constants';
import { BlockType } from './BlockTypes';

const CS = CHUNK_SIZE;
const VOLUME = CS * CS * CS;

export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Block type per voxel, 0 = empty */
  readonly types: Uint8Array;
  /** Current HP, packed as uint16 */
  readonly health: Uint16Array;
  /** Max HP for regen */
  readonly maxHealth: Uint16Array;
  aliveCount = 0;
  dirty = true;
  lastHitTime = 0;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.types = new Uint8Array(VOLUME);
    this.health = new Uint16Array(VOLUME);
    this.maxHealth = new Uint16Array(VOLUME);
  }

  static index(x: number, y: number, z: number): number {
    return x + y * CS + z * CS * CS;
  }

  setBlock(lx: number, ly: number, lz: number, type: BlockType, hp: number): void {
    const i = Chunk.index(lx, ly, lz);
    const wasAlive = this.types[i] !== BlockType.Empty;
    this.types[i] = type;
    this.health[i] = hp;
    this.maxHealth[i] = hp;
    if (type !== BlockType.Empty && !wasAlive) this.aliveCount++;
    if (type === BlockType.Empty && wasAlive) this.aliveCount--;
    this.dirty = true;
  }

  clearBlock(i: number): BlockType {
    const t = this.types[i] as BlockType;
    if (t === BlockType.Empty) return BlockType.Empty;
    this.types[i] = BlockType.Empty;
    this.health[i] = 0;
    this.aliveCount--;
    this.dirty = true;
    return t;
  }

  worldOrigin(blockSize: number): { x: number; y: number; z: number } {
    return {
      x: this.cx * CS * blockSize,
      y: this.cy * CS * blockSize,
      z: this.cz * CS * blockSize,
    };
  }
}
