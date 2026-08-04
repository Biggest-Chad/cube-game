import { COLORS } from '../data/constants';

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
    hpMul: 2.2,
    color: COLORS.reinforced,
    emissiveIntensity: 0.3,
    fragmentMul: 1.4,
    priority: 2,
    armorClass: 'light',
  },
  [BlockType.Regenerating]: {
    type: BlockType.Regenerating,
    name: 'Regenerating',
    hpMul: 1.3,
    color: COLORS.regen,
    emissiveIntensity: 0.32,
    fragmentMul: 1.2,
    priority: 2,
    armorClass: 'light',
  },
  [BlockType.Explosive]: {
    type: BlockType.Explosive,
    name: 'Explosive',
    hpMul: 0.9,
    color: COLORS.explosive,
    emissiveIntensity: 0.4,
    fragmentMul: 1.1,
    priority: 3,
    armorClass: 'none',
  },
  [BlockType.DataNode]: {
    type: BlockType.DataNode,
    name: 'Data Node',
    hpMul: 1.1,
    color: COLORS.dataNode,
    emissiveIntensity: 0.45,
    fragmentMul: 4,
    priority: 5,
    armorClass: 'light',
  },
  [BlockType.Core]: {
    type: BlockType.Core,
    name: 'Core',
    hpMul: 1,
    color: COLORS.core,
    emissiveIntensity: 0.5,
    fragmentMul: 8,
    priority: 10,
    armorClass: 'heavy',
  },
  [BlockType.Siege]: {
    type: BlockType.Siege,
    name: 'Siege',
    hpMul: 3.5,
    color: 0x6688aa,
    emissiveIntensity: 0.22,
    fragmentMul: 1.8,
    priority: 4,
    armorClass: 'siege',
  },
  [BlockType.Turret]: {
    type: BlockType.Turret,
    name: 'Turret Node',
    hpMul: 2.4,
    color: 0xff3355,
    emissiveIntensity: 0.7,
    fragmentMul: 2.2,
    priority: 7,
    armorClass: 'light',
  },
};

/** Idle / miner damage multipliers by armor class (AFK wall). */
export const IDLE_ARMOR_DAMAGE_MUL: Record<ArmorClass, number> = {
  none: 1,
  light: 0.45,
  heavy: 0.1,
  siege: 0.05,
};

export function armorClassOf(type: BlockType): ArmorClass {
  return BLOCK_DEFS[type]?.armorClass ?? 'none';
}

export function colorForType(type: BlockType): number {
  return BLOCK_DEFS[type]?.color ?? COLORS.cyan;
}
