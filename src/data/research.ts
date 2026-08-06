/**
 * Research Lattice — main-menu meta tree, spent with Core Energy only.
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
  /** Core Energy cost */
  cost: number;
  /** Row 0 free; row N needs ascensionTier >= N */
  row: number;
  /** Horizontal order in row */
  col: number;
  /** Same-row or any prior node prereqs */
  prerequisites: string[];
  effects: Partial<Record<ResearchEffectKey, number | boolean>>;
}

function n(
  partial: Omit<ResearchNodeDef, 'prerequisites'> & { prerequisites?: string[] }
): ResearchNodeDef {
  return { prerequisites: [], ...partial };
}

/**
 * Compact lattice — permanent mults, unlocks, QoL, cosmetics.
 * Costs tuned so early rows are 15–40 Core; flagships 200–400.
 */
export const RESEARCH_NODES: ResearchNodeDef[] = [
  // —— Row 0 (any Ascension) ——
  n({
    id: 'lat_focus_1',
    name: 'Lattice Focus',
    description: '+2% all damage (permanent)',
    cost: 20,
    row: 0,
    col: 0,
    effects: { damageMul: 1.02 },
  }),
  n({
    id: 'lat_plate_1',
    name: 'Hull Weave',
    description: '+3% max hull (permanent)',
    cost: 18,
    row: 0,
    col: 1,
    effects: { hullMul: 1.03 },
  }),
  n({
    id: 'lat_frag_1',
    name: 'Data Siphon',
    description: '+3% fragment find',
    cost: 25,
    row: 0,
    col: 2,
    effects: { fragmentMul: 1.03 },
  }),
  n({
    id: 'lat_idle_1',
    name: 'Idle Lattice',
    description: '+5% offline fragment rate',
    cost: 22,
    row: 0,
    col: 3,
    effects: { idleRateMul: 1.05 },
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
  n({
    id: 'lat_focus_2',
    name: 'Lattice Focus II',
    description: '+3% all damage',
    cost: 55,
    row: 1,
    col: 0,
    prerequisites: ['lat_focus_1'],
    effects: { damageMul: 1.03 },
  }),
  n({
    id: 'lat_shield_1',
    name: 'Barrier Mesh',
    description: '+4% max shield + 5 flat',
    cost: 60,
    row: 1,
    col: 1,
    prerequisites: ['lat_plate_1'],
    effects: { shieldMul: 1.04, maxShieldAdd: 5 },
  }),
  n({
    id: 'lat_drone_1',
    name: 'Swarm Protocol',
    description: '+4% drone damage',
    cost: 50,
    row: 1,
    col: 2,
    prerequisites: ['lat_focus_1'],
    effects: { droneDamageMul: 1.04 },
  }),
  n({
    id: 'lat_overshield',
    name: 'Overshield Protocol',
    description: 'Unlock once-per-clear emergency overshield',
    cost: 120,
    row: 1,
    col: 3,
    prerequisites: ['lat_shield_1'],
    effects: { unlockOvershield: true },
  }),
  n({
    id: 'lat_grace',
    name: 'IFF Buffer',
    description: '+1.5s revive immunity after ad repair',
    cost: 40,
    row: 1,
    col: 4,
    prerequisites: ['lat_plate_1'],
    effects: { reviveImmunityBonus: 1.5 },
  }),

  // —— Row 2 (Ascension ≥ 2) ——
  n({
    id: 'lat_focus_3',
    name: 'Lattice Apex',
    description: '+4% all damage',
    cost: 180,
    row: 2,
    col: 0,
    prerequisites: ['lat_focus_2'],
    effects: { damageMul: 1.04 },
  }),
  n({
    id: 'lat_orbit_1',
    name: 'Thruster Lattice',
    description: '+3% orbit speed',
    cost: 140,
    row: 2,
    col: 1,
    prerequisites: ['lat_drone_1'],
    effects: { orbitSpeedMul: 1.03 },
  }),
  n({
    id: 'lat_armor_1',
    name: 'Composite Skin',
    description: '+8 armor rating',
    cost: 160,
    row: 2,
    col: 2,
    prerequisites: ['lat_shield_1'],
    effects: { armorRatingAdd: 8 },
  }),
  n({
    id: 'lat_scan',
    name: 'Scan Pulse',
    description: 'Unlock tactical scan pulse ability',
    cost: 220,
    row: 2,
    col: 3,
    prerequisites: ['lat_overshield'],
    effects: { unlockScanPulse: true },
  }),
  n({
    id: 'lat_auto_idle',
    name: 'Auto-Collect',
    description: 'Offline income auto-claims on login',
    cost: 200,
    row: 2,
    col: 4,
    prerequisites: ['lat_idle_1'],
    effects: { unlockAutoIdle: true },
  }),

  // —— Row 3 (Ascension ≥ 3) ——
  n({
    id: 'lat_crit_1',
    name: 'Critical Weave',
    description: '+2% crit chance',
    cost: 280,
    row: 3,
    col: 0,
    prerequisites: ['lat_focus_3'],
    effects: { critChanceAdd: 0.02 },
  }),
  n({
    id: 'lat_hull_deep',
    name: 'Deep Frame',
    description: '+25 max hull',
    cost: 320,
    row: 3,
    col: 1,
    prerequisites: ['lat_armor_1'],
    effects: { maxHullAdd: 25 },
  }),
  n({
    id: 'lat_frag_2',
    name: 'Data Siphon II',
    description: '+5% fragment find',
    cost: 300,
    row: 3,
    col: 2,
    prerequisites: ['lat_frag_1', 'lat_focus_3'],
    effects: { fragmentMul: 1.05 },
  }),
  n({
    id: 'lat_flagship',
    name: 'Authority Core',
    description: '+5% damage, +5% hull, +5% drone damage',
    cost: 400,
    row: 3,
    col: 3,
    prerequisites: ['lat_focus_3', 'lat_hull_deep'],
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
  /** Display price (real IAP later); dummy provider grants immediately. */
  priceLabel: string;
  /** Optional bonus cosmetic flag */
  bonusTrail?: boolean;
}

export const CORE_PACKS: CorePackDef[] = [
  { id: 'core_pack_s', name: 'Core Shard', core: 80, priceLabel: '$0.99' },
  { id: 'core_pack_m', name: 'Core Cluster', core: 250, priceLabel: '$2.99' },
  { id: 'core_pack_l', name: 'Core Lattice', core: 700, priceLabel: '$6.99', bonusTrail: true },
  { id: 'core_pack_xl', name: 'Authority Bundle', core: 1800, priceLabel: '$14.99', bonusTrail: true },
];

/** Rewarded ad Core drip (capped daily via AdService). */
export const AD_CORE_REWARD = 12;
