/**
 * Research Lattice — main-menu meta tree, spent with Core Energy only.
 * Percentage mult nodes are stackable up to 100 ranks with scaling Core costs.
 * Numeric sources live in `constraints.ts`.
 */

import {
  AD_CORE_ENERGY_REWARD,
  EVOLVE_FRAGMENTS_PER_CORE,
  RESEARCH_AUTHORITY_CORE_COST,
  RESEARCH_AUTHORITY_CORE_MULTIPLIER,
  RESEARCH_AUTO_COLLECT_COST,
  RESEARCH_BARRIER_MESH_COST,
  RESEARCH_BARRIER_MESH_SHIELD_MULTIPLIER,
  RESEARCH_COMPOSITE_SKIN_ARMOR_ADD,
  RESEARCH_COMPOSITE_SKIN_COST,
  RESEARCH_CRITICAL_WEAVE_COST,
  RESEARCH_CRITICAL_WEAVE_CRIT_ADD,
  RESEARCH_DATA_SIPHON_COST,
  RESEARCH_DATA_SIPHON_FRAGMENT_MULTIPLIER,
  RESEARCH_DEEP_FRAME_COST,
  RESEARCH_DEEP_FRAME_HULL_ADD,
  RESEARCH_DEFAULT_COST_GROWTH,
  RESEARCH_HULL_WEAVE_COST,
  RESEARCH_HULL_WEAVE_HULL_MULTIPLIER,
  RESEARCH_IDLE_LATTICE_COST,
  RESEARCH_IDLE_LATTICE_RATE_MULTIPLIER,
  RESEARCH_IFF_BUFFER_COST,
  RESEARCH_IFF_BUFFER_IMMUNITY_BONUS_SECONDS,
  RESEARCH_LATTICE_FOCUS_COST,
  RESEARCH_LATTICE_FOCUS_DAMAGE_MULTIPLIER,
  RESEARCH_OVERSHIELD_COST,
  RESEARCH_SCAN_PULSE_COST,
  RESEARCH_STACKABLE_MAX_RANK,
  RESEARCH_SWARM_PROTOCOL_COST,
  RESEARCH_SWARM_PROTOCOL_DRONE_DAMAGE_MULTIPLIER,
  RESEARCH_THRUSTER_LATTICE_COST,
  RESEARCH_THRUSTER_LATTICE_ORBIT_MULTIPLIER,
  RESEARCH_TRAIL_CYAN_COST,
} from './constraints';

export type ResearchEffectKey =
  | 'damageMul'
  | 'hullMul'
  | 'shieldMul'
  | 'droneDamageMul'
  | 'orbitSpeedMul'
  | 'fragmentMul'
  | 'idleRateMul'
  | 'critChanceAdd'
  | 'maxHullAdd'
  | 'maxShieldAdd'
  | 'armorRatingAdd'
  | 'reviveImmunityBonus'
  | 'unlockOvershield'
  | 'unlockScanPulse'
  | 'unlockAutoIdle'
  | 'cosmeticTrail';

export interface ResearchNodeDef {
  id: string;
  name: string;
  description: string;
  /** Base Core Energy cost (rank 1). Scaling uses costGrowth^rank. */
  cost: number;
  /** Cost multiplier per additional rank (stackable only). */
  costGrowth?: number;
  /** Max ranks; 1 = one-shot unlock. Stackable +% default 100. */
  maxRank?: number;
  /** Row 0 free; row N needs ascensionTier >= N */
  row: number;
  col: number;
  prerequisites: string[];
  effects: Partial<Record<ResearchEffectKey, number | boolean>>;
  /** True for permanent % / mult stacks that can be bought repeatedly. */
  stackable?: boolean;
}

function n(
  partial: Omit<ResearchNodeDef, 'prerequisites'> & { prerequisites?: string[] }
): ResearchNodeDef {
  return { prerequisites: [], maxRank: 1, ...partial };
}

/** Stackable +% lattice nodes (max 100 ranks). */
function stack(
  partial: Omit<ResearchNodeDef, 'prerequisites' | 'stackable' | 'maxRank'> & {
    prerequisites?: string[];
  }
): ResearchNodeDef {
  return {
    prerequisites: [],
    stackable: true,
    maxRank: RESEARCH_STACKABLE_MAX_RANK,
    costGrowth: partial.costGrowth ?? RESEARCH_DEFAULT_COST_GROWTH,
    ...partial,
  };
}

export function researchRankCost(node: ResearchNodeDef, nextRank: number): number {
  if (nextRank < 1) return Infinity;
  const growth = node.costGrowth ?? RESEARCH_DEFAULT_COST_GROWTH;
  return Math.max(1, Math.round(node.cost * Math.pow(growth, nextRank - 1)));
}

/**
 * Compact lattice — permanent mults (stackable), unlocks, QoL, cosmetics.
 */
export const RESEARCH_NODES: ResearchNodeDef[] = [
  // —— Row 0 (any Ascension) — stackable sinks ——
  stack({
    id: 'lat_focus',
    name: 'Lattice Focus',
    description: '+1.5% all damage per rank (max 100)',
    cost: RESEARCH_LATTICE_FOCUS_COST,
    row: 0,
    col: 0,
    effects: { damageMul: RESEARCH_LATTICE_FOCUS_DAMAGE_MULTIPLIER },
  }),
  stack({
    id: 'lat_plate',
    name: 'Hull Weave',
    description: '+1.2% max hull per rank (max 100)',
    cost: RESEARCH_HULL_WEAVE_COST,
    row: 0,
    col: 1,
    effects: { hullMul: RESEARCH_HULL_WEAVE_HULL_MULTIPLIER },
  }),
  stack({
    id: 'lat_frag',
    name: 'Data Siphon',
    description: '+1.5% fragment find per rank (max 100)',
    cost: RESEARCH_DATA_SIPHON_COST,
    row: 0,
    col: 2,
    effects: { fragmentMul: RESEARCH_DATA_SIPHON_FRAGMENT_MULTIPLIER },
  }),
  stack({
    id: 'lat_idle',
    name: 'Idle Lattice',
    description: '+2% offline income per rank (max 100)',
    cost: RESEARCH_IDLE_LATTICE_COST,
    row: 0,
    col: 3,
    effects: { idleRateMul: RESEARCH_IDLE_LATTICE_RATE_MULTIPLIER },
  }),
  n({
    id: 'lat_trail_cyan',
    name: 'Trail: Cyan Arc',
    description: 'Cosmetic thruster trail tint',
    cost: RESEARCH_TRAIL_CYAN_COST,
    row: 0,
    col: 4,
    effects: { cosmeticTrail: true },
  }),

  // —— Row 1 (Ascension ≥ 1) ——
  stack({
    id: 'lat_drone',
    name: 'Swarm Protocol',
    description: '+1.5% drone damage per rank (max 100)',
    cost: RESEARCH_SWARM_PROTOCOL_COST,
    costGrowth: 1.09,
    row: 1,
    col: 0,
    prerequisites: ['lat_focus'],
    effects: { droneDamageMul: RESEARCH_SWARM_PROTOCOL_DRONE_DAMAGE_MULTIPLIER },
  }),
  stack({
    id: 'lat_shield',
    name: 'Barrier Mesh',
    description: '+1.5% max shield per rank (max 100)',
    cost: RESEARCH_BARRIER_MESH_COST,
    row: 1,
    col: 1,
    prerequisites: ['lat_plate'],
    effects: { shieldMul: RESEARCH_BARRIER_MESH_SHIELD_MULTIPLIER },
  }),
  stack({
    id: 'lat_orbit',
    name: 'Thruster Lattice',
    description: '+0.8% orbit speed per rank (max 100)',
    cost: RESEARCH_THRUSTER_LATTICE_COST,
    costGrowth: 1.09,
    row: 1,
    col: 2,
    prerequisites: ['lat_focus'],
    effects: { orbitSpeedMul: RESEARCH_THRUSTER_LATTICE_ORBIT_MULTIPLIER },
  }),
  n({
    id: 'lat_overshield',
    name: 'Overshield Protocol',
    description: 'Unlock once-per-clear emergency overshield',
    cost: RESEARCH_OVERSHIELD_COST,
    row: 1,
    col: 3,
    prerequisites: ['lat_shield'],
    effects: { unlockOvershield: true },
  }),
  n({
    id: 'lat_grace',
    name: 'IFF Buffer',
    description: '+1.5s revive immunity after ad repair',
    cost: RESEARCH_IFF_BUFFER_COST,
    row: 1,
    col: 4,
    prerequisites: ['lat_plate'],
    effects: { reviveImmunityBonus: RESEARCH_IFF_BUFFER_IMMUNITY_BONUS_SECONDS },
  }),

  // —— Row 2 (Ascension ≥ 2) ——
  stack({
    id: 'lat_crit',
    name: 'Critical Weave',
    description: '+0.15% crit chance per rank (max 100)',
    cost: RESEARCH_CRITICAL_WEAVE_COST,
    costGrowth: 1.1,
    row: 2,
    col: 0,
    prerequisites: ['lat_focus'],
    effects: { critChanceAdd: RESEARCH_CRITICAL_WEAVE_CRIT_ADD },
  }),
  n({
    id: 'lat_armor_1',
    name: 'Composite Skin',
    description: '+8 armor rating',
    cost: RESEARCH_COMPOSITE_SKIN_COST,
    row: 2,
    col: 1,
    prerequisites: ['lat_shield'],
    effects: { armorRatingAdd: RESEARCH_COMPOSITE_SKIN_ARMOR_ADD },
  }),
  n({
    id: 'lat_scan',
    name: 'Scan Pulse',
    description: 'Unlock tactical scan pulse ability',
    cost: RESEARCH_SCAN_PULSE_COST,
    row: 2,
    col: 2,
    prerequisites: ['lat_overshield'],
    effects: { unlockScanPulse: true },
  }),
  n({
    id: 'lat_auto_idle',
    name: 'Auto-Collect',
    description: 'Offline income auto-claims on login',
    cost: RESEARCH_AUTO_COLLECT_COST,
    row: 2,
    col: 3,
    prerequisites: ['lat_idle'],
    effects: { unlockAutoIdle: true },
  }),
  n({
    id: 'lat_hull_deep',
    name: 'Deep Frame',
    description: '+25 max hull',
    cost: RESEARCH_DEEP_FRAME_COST,
    row: 2,
    col: 4,
    prerequisites: ['lat_plate'],
    effects: { maxHullAdd: RESEARCH_DEEP_FRAME_HULL_ADD },
  }),

  // —— Row 3 (Ascension ≥ 3) ——
  n({
    id: 'lat_flagship',
    name: 'Authority Core',
    description: '+5% damage, +5% hull, +5% drone damage (one-shot)',
    cost: RESEARCH_AUTHORITY_CORE_COST,
    row: 3,
    col: 0,
    prerequisites: ['lat_focus', 'lat_hull_deep'],
    effects: {
      damageMul: RESEARCH_AUTHORITY_CORE_MULTIPLIER,
      hullMul: RESEARCH_AUTHORITY_CORE_MULTIPLIER,
      droneDamageMul: RESEARCH_AUTHORITY_CORE_MULTIPLIER,
    },
  }),
];

export function getResearchNode(id: string): ResearchNodeDef | undefined {
  return RESEARCH_NODES.find((r) => r.id === id);
}

export function researchRows(): number[] {
  const rows = new Set(RESEARCH_NODES.map((n) => n.row));
  return Array.from(rows).sort((a, b) => a - b);
}

/** IAP / store packs — Core Energy premium currency. */
export interface CorePackDef {
  id: string;
  name: string;
  core: number;
  priceLabel: string;
  bonusTrail?: boolean;
}

export const CORE_PACKS: CorePackDef[] = [
  { id: 'core_pack_s', name: 'Core Shard', core: 80, priceLabel: '$0.99' },
  { id: 'core_pack_m', name: 'Core Cluster', core: 250, priceLabel: '$2.99' },
  { id: 'core_pack_l', name: 'Core Lattice', core: 700, priceLabel: '$6.99', bonusTrail: true },
  { id: 'core_pack_xl', name: 'Authority Bundle', core: 1800, priceLabel: '$14.99', bonusTrail: true },
];

export const AD_CORE_REWARD = AD_CORE_ENERGY_REWARD;

/** Fragments converted to Core on Evolve (remainder kept). */
export const EVOLVE_FRAG_PER_CORE = EVOLVE_FRAGMENTS_PER_CORE;
