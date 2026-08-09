/**
 * Research Lattice — main-menu meta tree, spent with Core Energy only.
 * Percentage mult nodes are stackable up to 100 ranks with scaling Core costs.
 */

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
    maxRank: 100,
    costGrowth: partial.costGrowth ?? 1.085,
    ...partial,
  };
}

export function researchRankCost(node: ResearchNodeDef, nextRank: number): number {
  if (nextRank < 1) return Infinity;
  const growth = node.costGrowth ?? 1.085;
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
    cost: 12,
    row: 0,
    col: 0,
    effects: { damageMul: 1.015 },
  }),
  stack({
    id: 'lat_plate',
    name: 'Hull Weave',
    description: '+1.2% max hull per rank (max 100)',
    cost: 10,
    row: 0,
    col: 1,
    effects: { hullMul: 1.012 },
  }),
  stack({
    id: 'lat_frag',
    name: 'Data Siphon',
    description: '+1.5% fragment find per rank (max 100)',
    cost: 14,
    row: 0,
    col: 2,
    effects: { fragmentMul: 1.015 },
  }),
  stack({
    id: 'lat_idle',
    name: 'Idle Lattice',
    description: '+2% offline income per rank (max 100)',
    cost: 11,
    row: 0,
    col: 3,
    effects: { idleRateMul: 1.02 },
  }),
  n({
    id: 'lat_trail_cyan',
    name: 'Trail: Cyan Arc',
    description: 'Cosmetic thruster trail tint',
    cost: 15,
    row: 0,
    col: 4,
    effects: { cosmeticTrail: true },
  }),

  // —— Row 1 (Ascension ≥ 1) ——
  stack({
    id: 'lat_drone',
    name: 'Swarm Protocol',
    description: '+1.5% drone damage per rank (max 100)',
    cost: 18,
    costGrowth: 1.09,
    row: 1,
    col: 0,
    prerequisites: ['lat_focus'],
    effects: { droneDamageMul: 1.015 },
  }),
  stack({
    id: 'lat_shield',
    name: 'Barrier Mesh',
    description: '+1.5% max shield per rank (max 100)',
    cost: 16,
    row: 1,
    col: 1,
    prerequisites: ['lat_plate'],
    effects: { shieldMul: 1.015 },
  }),
  stack({
    id: 'lat_orbit',
    name: 'Thruster Lattice',
    description: '+0.8% orbit speed per rank (max 100)',
    cost: 20,
    costGrowth: 1.09,
    row: 1,
    col: 2,
    prerequisites: ['lat_focus'],
    effects: { orbitSpeedMul: 1.008 },
  }),
  n({
    id: 'lat_overshield',
    name: 'Overshield Protocol',
    description: 'Unlock once-per-clear emergency overshield',
    cost: 120,
    row: 1,
    col: 3,
    prerequisites: ['lat_shield'],
    effects: { unlockOvershield: true },
  }),
  n({
    id: 'lat_grace',
    name: 'IFF Buffer',
    description: '+1.5s revive immunity after ad repair',
    cost: 40,
    row: 1,
    col: 4,
    prerequisites: ['lat_plate'],
    effects: { reviveImmunityBonus: 1.5 },
  }),

  // —— Row 2 (Ascension ≥ 2) ——
  stack({
    id: 'lat_crit',
    name: 'Critical Weave',
    description: '+0.15% crit chance per rank (max 100)',
    cost: 28,
    costGrowth: 1.1,
    row: 2,
    col: 0,
    prerequisites: ['lat_focus'],
    effects: { critChanceAdd: 0.0015 },
  }),
  n({
    id: 'lat_armor_1',
    name: 'Composite Skin',
    description: '+8 armor rating',
    cost: 160,
    row: 2,
    col: 1,
    prerequisites: ['lat_shield'],
    effects: { armorRatingAdd: 8 },
  }),
  n({
    id: 'lat_scan',
    name: 'Scan Pulse',
    description: 'Unlock tactical scan pulse ability',
    cost: 220,
    row: 2,
    col: 2,
    prerequisites: ['lat_overshield'],
    effects: { unlockScanPulse: true },
  }),
  n({
    id: 'lat_auto_idle',
    name: 'Auto-Collect',
    description: 'Offline income auto-claims on login',
    cost: 200,
    row: 2,
    col: 3,
    prerequisites: ['lat_idle'],
    effects: { unlockAutoIdle: true },
  }),
  n({
    id: 'lat_hull_deep',
    name: 'Deep Frame',
    description: '+25 max hull',
    cost: 180,
    row: 2,
    col: 4,
    prerequisites: ['lat_plate'],
    effects: { maxHullAdd: 25 },
  }),

  // —— Row 3 (Ascension ≥ 3) ——
  n({
    id: 'lat_flagship',
    name: 'Authority Core',
    description: '+5% damage, +5% hull, +5% drone damage (one-shot)',
    cost: 400,
    row: 3,
    col: 0,
    prerequisites: ['lat_focus', 'lat_hull_deep'],
    effects: { damageMul: 1.05, hullMul: 1.05, droneDamageMul: 1.05 },
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

export const AD_CORE_REWARD = 12;

/** Fragments converted to Core on Evolve (remainder kept). */
export const EVOLVE_FRAG_PER_CORE = 1000;
