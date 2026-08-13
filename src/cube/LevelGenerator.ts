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
        // Living nucleus occupies the center cavity — never place Core voxels
        if (level.hasCore && dist <= coreRadius) continue;

        if (size >= 10 && !shell && dist > coreRadius + 1.5) {
          // interior fill with density
          if (rng() > level.density * 0.55) continue;
        } else if (rng() > level.density) {
          continue;
        }

        let type = pickType(rng, level);
        // Surface defense nodes (lattice turrets) — more common mid/late game
        if (shell && level.id >= 5) {
          const tChance =
            level.id <= 7 ? 0.04 : level.id <= 14 ? 0.07 : level.id <= 22 ? 0.1 : 0.13;
          if (rng() < tChance) type = BlockType.Turret;
        }
        const defMul =
          type === BlockType.Siege
            ? 3.5
            : type === BlockType.Turret
              ? 2.4
              : type === BlockType.Reinforced
                ? 2.2
                : type === BlockType.Regenerating
                  ? 1.3
                  : type === BlockType.DataNode
                    ? 1.1
                    : type === BlockType.Explosive
                      ? 0.9
                      : 1;
        const hp = Math.max(1, Math.round(level.avgHP * defMul * (0.85 + rng() * 0.35)));

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
