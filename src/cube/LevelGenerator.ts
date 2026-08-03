import { BLOCK_SIZE, CHUNK_SIZE } from '../data/constants';
import type { LevelDefinition } from '../data/levels';
import { BlockType } from './BlockTypes';
import { Chunk } from './Chunk';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickType(rng: () => number, level: LevelDefinition): BlockType {
  const r = rng();
  let acc = 0;
  acc += level.dataNode;
  if (r < acc) return BlockType.DataNode;
  acc += level.explosive;
  if (r < acc) return BlockType.Explosive;
  acc += level.regenerating;
  if (r < acc) return BlockType.Regenerating;
  acc += level.siege ?? 0;
  if (r < acc) return BlockType.Siege;
  acc += level.reinforced;
  if (r < acc) {
    // Late levels: a share of "reinforced" pool is true siege plating
    if (level.id >= 12 && rng() < Math.min(0.35, (level.id - 11) * 0.025)) {
      return BlockType.Siege;
    }
    return BlockType.Reinforced;
  }
  return BlockType.Standard;
}

export interface GeneratedCube {
  chunks: Chunk[];
  size: number;
  totalBlocks: number;
  halfExtent: number;
  blockSize: number;
}

export function generateCube(level: LevelDefinition): GeneratedCube {
  const size = level.size;
  const blockSize = BLOCK_SIZE;
  const half = (size * blockSize) / 2;
  const rng = mulberry32(level.id * 7919 + 42);
  const chunkCount = Math.ceil(size / CHUNK_SIZE);
  const chunkMap = new Map<string, Chunk>();
  void chunkCount;

  const getChunk = (cx: number, cy: number, cz: number): Chunk => {
    const key = `${cx},${cy},${cz}`;
    let c = chunkMap.get(key);
    if (!c) {
      c = new Chunk(cx, cy, cz);
      chunkMap.set(key, c);
    }
    return c;
  };

  let totalBlocks = 0;
  const coreCenter = (size - 1) / 2;
  const coreRadius = level.hasCore ? Math.max(0.6, size * 0.08) : -1;

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Hollow shell for larger cubes keeps density interesting + performance
        const shell =
          x === 0 ||
          y === 0 ||
          z === 0 ||
          x === size - 1 ||
          y === size - 1 ||
          z === size - 1;
        const dx = x - coreCenter;
        const dy = y - coreCenter;
        const dz = z - coreCenter;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const isCore = level.hasCore && dist <= coreRadius + 0.01;

        if (!isCore) {
          if (size >= 10 && !shell && dist > coreRadius + 1.5) {
            // interior fill with density
            if (rng() > level.density * 0.55) continue;
          } else if (rng() > level.density) {
            continue;
          }
        }

        let type: BlockType;
        let hp: number;
        if (isCore) {
          type = BlockType.Core;
          hp = Math.max(
            1,
            Math.round(level.coreHP / Math.max(1, Math.floor(coreRadius * 2 + 1) ** 3 * 0.35))
          );
          if (dist > coreRadius * 0.55 && rng() > 0.4) {
            // armor shell around core — late levels use siege plating
            if (level.id >= 15 && rng() < 0.35) {
              type = BlockType.Siege;
              hp = Math.round(level.avgHP * 3.2);
            } else {
              type = BlockType.Reinforced;
              hp = Math.round(level.avgHP * 2.5);
            }
          } else if (dist > 0.2) {
            if (dist > 0.8) {
              type = pickType(rng, level);
              const defMul =
                type === BlockType.Siege ? 3.5 : type === BlockType.Reinforced ? 2.2 : 1;
              hp = Math.round(level.avgHP * defMul * (0.85 + rng() * 0.3));
            }
          }
        } else {
          type = pickType(rng, level);
          const defMul =
            type === BlockType.Siege
              ? 3.5
              : type === BlockType.Reinforced
                ? 2.2
                : type === BlockType.Regenerating
                  ? 1.3
                  : type === BlockType.DataNode
                    ? 1.1
                    : type === BlockType.Explosive
                      ? 0.9
                      : 1;
          hp = Math.max(1, Math.round(level.avgHP * defMul * (0.85 + rng() * 0.35)));
        }

        // Offset so cube is centered at origin
        const wx = x;
        const wy = y;
        const wz = z;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const lx = wx % CHUNK_SIZE;
        const ly = wy % CHUNK_SIZE;
        const lz = wz % CHUNK_SIZE;
        const chunk = getChunk(cx, cy, cz);
        chunk.setBlock(lx, ly, lz, type, hp);
        totalBlocks++;
      }
    }
  }

  // Ensure at least one core block if hasCore
  if (level.hasCore) {
    const cx = Math.floor(coreCenter / CHUNK_SIZE);
    const cy = Math.floor(coreCenter / CHUNK_SIZE);
    const cz = Math.floor(coreCenter / CHUNK_SIZE);
    const chunk = getChunk(cx, cy, cz);
    const lx = Math.floor(coreCenter) % CHUNK_SIZE;
    const ly = Math.floor(coreCenter) % CHUNK_SIZE;
    const lz = Math.floor(coreCenter) % CHUNK_SIZE;
    const i = Chunk.index(lx, ly, lz);
    if (chunk.types[i] === BlockType.Empty) {
      chunk.setBlock(lx, ly, lz, BlockType.Core, level.coreHP);
      totalBlocks++;
    } else {
      chunk.types[i] = BlockType.Core;
      chunk.health[i] = level.coreHP;
      chunk.maxHealth[i] = level.coreHP;
      chunk.dirty = true;
    }
  }

  return {
    chunks: Array.from(chunkMap.values()),
    size,
    totalBlocks,
    halfExtent: half,
    blockSize,
  };
}

export function chunkWorldPosition(
  chunk: Chunk,
  lx: number,
  ly: number,
  lz: number,
  size: number,
  blockSize: number
): { x: number; y: number; z: number } {
  const half = (size * blockSize) / 2;
  return {
    x: chunk.cx * CHUNK_SIZE * blockSize + lx * blockSize + blockSize * 0.5 - half,
    y: chunk.cy * CHUNK_SIZE * blockSize + ly * blockSize + blockSize * 0.5 - half,
    z: chunk.cz * CHUNK_SIZE * blockSize + lz * blockSize + blockSize * 0.5 - half,
  };
}
