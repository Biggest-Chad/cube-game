import { COLORS } from '../data/constants';
import {
  BLOCK_CORE_FRAGMENT_MULTIPLIER,
  BLOCK_DATA_NODE_FRAGMENT_MULTIPLIER,
  BLOCK_DATA_NODE_HP_MULTIPLIER,
  BLOCK_EXPLOSIVE_FRAGMENT_MULTIPLIER,
  BLOCK_EXPLOSIVE_HP_MULTIPLIER,
  BLOCK_REGENERATING_FRAGMENT_MULTIPLIER,
  BLOCK_REGENERATING_HP_MULTIPLIER,
  BLOCK_REINFORCED_FRAGMENT_MULTIPLIER,
  BLOCK_REINFORCED_HP_MULTIPLIER,
  BLOCK_SIEGE_FRAGMENT_MULTIPLIER,
  BLOCK_SIEGE_HP_MULTIPLIER,
  BLOCK_TURRET_FRAGMENT_MULTIPLIER,
  BLOCK_TURRET_HP_MULTIPLIER,
  IDLE_ARMOR_DAMAGE_HEAVY,
  IDLE_ARMOR_DAMAGE_LIGHT,
  IDLE_ARMOR_DAMAGE_NONE,
  IDLE_ARMOR_DAMAGE_SIEGE,
} from '../data/constraints';

export enum BlockType {
  Empty = 0,
  Standard = 1,
  Reinforced = 2,
  Regenerating = 3,
  Explosive = 4,
  DataNode = 5,
  Core = 6,
  /** Ultra-armor wall — idle / drones nearly useless without armor-pierce. */
  Siege = 7,
  /** Surface defense turret — lattice block that fires at the player. */
  Turret = 8,
}

/** Armor class for idle walls, drone effectiveness, and future weapon pierce. */
export type ArmorClass = 'none' | 'light' | 'heavy' | 'siege';

export interface BlockTypeDef {
  type: BlockType;
  name: string;
  hpMul: number;
  color: number;
  emissiveIntensity: number;
  fragmentMul: number;
  priority: number;
  armorClass: ArmorClass;
}

export const BLOCK_DEFS: Record<number, BlockTypeDef> = {
  [BlockType.Standard]: {
    type: BlockType.Standard,
    name: 'Standard',
    hpMul: 1,
    color: COLORS.cyan,
    emissiveIntensity: 0.35,
    fragmentMul: 1,
    priority: 1,
    armorClass: 'none',
  },
  [BlockType.Reinforced]: {
    type: BlockType.Reinforced,
    name: 'Reinforced',
    hpMul: BLOCK_REINFORCED_HP_MULTIPLIER,
    color: COLORS.reinforced,
    emissiveIntensity: 0.3,
    fragmentMul: BLOCK_REINFORCED_FRAGMENT_MULTIPLIER,
    priority: 2,
    armorClass: 'light',
  },
  [BlockType.Regenerating]: {
    type: BlockType.Regenerating,
    name: 'Regenerating',
    hpMul: BLOCK_REGENERATING_HP_MULTIPLIER,
    color: COLORS.regen,
    emissiveIntensity: 0.32,
    fragmentMul: BLOCK_REGENERATING_FRAGMENT_MULTIPLIER,
    priority: 2,
    armorClass: 'light',
  },
  [BlockType.Explosive]: {
    type: BlockType.Explosive,
    name: 'Explosive',
    hpMul: BLOCK_EXPLOSIVE_HP_MULTIPLIER,
    color: COLORS.explosive,
    emissiveIntensity: 0.4,
    fragmentMul: BLOCK_EXPLOSIVE_FRAGMENT_MULTIPLIER,
    priority: 3,
    armorClass: 'none',
  },
  [BlockType.DataNode]: {
    type: BlockType.DataNode,
    name: 'Data Node',
    hpMul: BLOCK_DATA_NODE_HP_MULTIPLIER,
    color: COLORS.dataNode,
    emissiveIntensity: 0.45,
    fragmentMul: BLOCK_DATA_NODE_FRAGMENT_MULTIPLIER,
    priority: 5,
    armorClass: 'light',
  },
  [BlockType.Core]: {
    type: BlockType.Core,
    name: 'Core',
    hpMul: 1,
    color: COLORS.core,
    emissiveIntensity: 0.5,
    fragmentMul: BLOCK_CORE_FRAGMENT_MULTIPLIER,
    priority: 10,
    armorClass: 'heavy',
  },
  [BlockType.Siege]: {
    type: BlockType.Siege,
    name: 'Siege',
    hpMul: BLOCK_SIEGE_HP_MULTIPLIER,
    color: 0x6688aa,
    emissiveIntensity: 0.22,
    fragmentMul: BLOCK_SIEGE_FRAGMENT_MULTIPLIER,
    priority: 4,
    armorClass: 'siege',
  },
  [BlockType.Turret]: {
    type: BlockType.Turret,
    name: 'Turret Node',
    hpMul: BLOCK_TURRET_HP_MULTIPLIER,
    color: 0xff3355,
    emissiveIntensity: 0.7,
    fragmentMul: BLOCK_TURRET_FRAGMENT_MULTIPLIER,
    priority: 7,
    armorClass: 'light',
  },
};

/** Idle / miner damage multipliers by armor class (AFK wall). */
export const IDLE_ARMOR_DAMAGE_MUL: Record<ArmorClass, number> = {
  none: IDLE_ARMOR_DAMAGE_NONE,
  light: IDLE_ARMOR_DAMAGE_LIGHT,
  heavy: IDLE_ARMOR_DAMAGE_HEAVY,
  siege: IDLE_ARMOR_DAMAGE_SIEGE,
};

export function armorClassOf(type: BlockType): ArmorClass {
  return BLOCK_DEFS[type]?.armorClass ?? 'none';
}

export function colorForType(type: BlockType): number {
  return BLOCK_DEFS[type]?.color ?? COLORS.cyan;
}
