import { BlockType } from '../cube/BlockTypes';
import type { PlayerStats } from '../progression/TechTree';
import type { DroneRole } from '../data/drones';
import { armorClassForBlock } from '../combat/DamageModel';

export interface EnemyUnitRef {
  id: string;
  position: { x: number; y: number; z: number };
  hp: number;
}

export interface InterceptTarget {
  id: string;
  position: { x: number; y: number; z: number };
  /** Larger = easier to shoot (missiles/arcs). */
  radius: number;
}

/**
 * Block priority for bombers (and light fighter mining).
 */
export function targetPriority(
  type: BlockType,
  stats: PlayerStats,
  role: DroneRole = 'fighter'
): number {
  if (role === 'defender') return 0;
  if (role === 'fighter') {
    if (type === BlockType.Core) return stats.dronePriorityCore ? 8 : 3;
    if (type === BlockType.Turret) return 6;
    return 1;
  }
  // Bomber
  let p = 1;
  switch (type) {
    case BlockType.Core:
      p = stats.dronePriorityCore ? 40 : 22;
      break;
    case BlockType.Turret:
      p = 14;
      break;
    case BlockType.DataNode:
      p = stats.dronePriorityData ? 16 : 6;
      break;
    case BlockType.Explosive:
      p = 8;
      break;
    case BlockType.Reinforced:
    case BlockType.Siege:
      p = 10;
      break;
    default:
      p = 4;
  }
  const ac = armorClassForBlock(type);
  if (ac === 'siege') p += 4;
  return p;
}

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

export function pickBestIntercept(
  targets: InterceptTarget[],
  selfPos: { x: number; y: number; z: number },
  maxDist: number
): InterceptTarget | null {
  let best: InterceptTarget | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const dx = t.position.x - selfPos.x;
    const dy = t.position.y - selfPos.y;
    const dz = t.position.z - selfPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxDist) continue;
    const s = 120 / (d + 0.01) + t.radius * 8;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}
