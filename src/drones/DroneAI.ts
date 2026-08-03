import { BlockType } from '../cube/BlockTypes';
import type { PlayerStats } from '../progression/TechTree';
import type { DroneRole } from '../data/drones';
import { armorClassForBlock } from '../combat/DamageModel';

export interface EnemyUnitRef {
  id: string;
  position: { x: number; y: number; z: number };
  hp: number;
}

/**
 * Block priority scoring for mining / breaking drones.
 */
export function targetPriority(type: BlockType, stats: PlayerStats, role: DroneRole = 'miner'): number {
  if (role === 'fighter') {
    // Fighters mostly ignore blocks
    return type === BlockType.Core ? 0.5 : 0.2;
  }

  let p = 1;
  switch (type) {
    case BlockType.Core:
      p = stats.dronePriorityCore ? 20 : 8;
      break;
    case BlockType.DataNode:
      p = stats.dronePriorityData ? 16 : 6;
      break;
    case BlockType.Explosive:
      p = 5;
      break;
    case BlockType.Reinforced:
      p = role === 'breaker' ? 14 : 3;
      break;
    case BlockType.Regenerating:
      p = 4;
      break;
    default:
      p = 2;
  }

  // Breakers prefer high armor; miners slightly avoid siege
  if (role === 'breaker') {
    const ac = armorClassForBlock(type);
    if (ac === 'siege') p += 12;
    if (ac === 'heavy') p += 8;
  } else if (role === 'miner') {
    const ac = armorClassForBlock(type);
    if (ac === 'siege') p *= 0.25;
  }

  return p;
}

/**
 * Score enemy drones for fighter targeting (higher = better).
 */
export function enemyPriority(
  enemy: EnemyUnitRef,
  selfPos: { x: number; y: number; z: number }
): number {
  const dx = enemy.position.x - selfPos.x;
  const dy = enemy.position.y - selfPos.y;
  const dz = enemy.position.z - selfPos.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
  return 100 / d + (enemy.hp < 30 ? 5 : 0);
}

export function pickBestEnemy(
  enemies: EnemyUnitRef[],
  selfPos: { x: number; y: number; z: number },
  maxDist: number
): EnemyUnitRef | null {
  let best: EnemyUnitRef | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    const dx = e.position.x - selfPos.x;
    const dy = e.position.y - selfPos.y;
    const dz = e.position.z - selfPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxDist) continue;
    const s = enemyPriority(e, selfPos);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}
