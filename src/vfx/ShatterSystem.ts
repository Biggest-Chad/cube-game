import { colorForType, BlockType } from '../cube/BlockTypes';
import type { ParticlePool } from './ParticlePool';

export class ShatterSystem {
  constructor(private pool: ParticlePool) {}

  shatter(x: number, y: number, z: number, type: BlockType): void {
    const color = colorForType(type);
    const isCore = type === BlockType.Core;
    const isExplosive = type === BlockType.Explosive;
    const isData = type === BlockType.DataNode;

    // Digital debris cloud
    this.pool.spawn(x, y, z, color, isCore ? 28 : 16, isExplosive ? 10 : 7, 'debris');
    // Hot white core flash particles
    this.pool.spawn(x, y, z, 0xffffff, isCore ? 14 : 8, 5, 'glow');
    // Sparks
    this.pool.spawn(x, y, z, color, 12, 11, 'spark');

    if (isExplosive) {
      this.pool.spawn(x, y, z, 0xff6622, 20, 14, 'ember');
      this.pool.spawn(x, y, z, 0xffaa44, 10, 8, 'glow');
    }
    if (isData) {
      this.pool.spawn(x, y, z, 0xaa66ff, 18, 6, 'ember');
    }
    if (isCore) {
      this.pool.spawn(x, y, z, 0xff4488, 22, 12, 'spark');
    }
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, crit = false): void {
    const col = crit ? 0xffffff : 0x00f0ff;
    this.pool.spray(x, y, z, nx, ny, nz, col, crit ? 14 : 8, crit ? 14 : 9);
    this.pool.spawn(x, y, z, crit ? 0xff00aa : 0x00f0ff, crit ? 6 : 3, 3, 'glow');
  }
}
