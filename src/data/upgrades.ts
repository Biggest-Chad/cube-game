/**
 * P2/P3 upgrade catalog — sequential chains, smaller additive bonuses, ship vitals.
 *
 * Damage model (folded in TechTree):
 *   damageMul = min(CAP, (1 + sum(damageAdd)) * product(damageMul rare))
 * Orbit speed total soft-capped at 1.85 via TechTree.
 */

import {
  ARMOR_HYPERBOLIC_K,
  ARMOR_MAX_EFFECTIVE_REDUCTION,
  DRONE_ABSOLUTE_HARD_CAP,
  DRONE_ALLY_PROTOCOL_COST_FRAGMENTS,
  REPEATABLE_UPGRADE_CAP_PER_EVOLUTION,
  REPEATABLE_UPGRADE_GENERATED_RANKS,
  TECH_CORE_ENERGY_MULTIPLIER_CAP,
  TECH_CRIT_CHANCE_CAP,
  TECH_CRIT_MULT_CAP,
  TECH_DAMAGE_MULTIPLIER_CAP,
  TECH_FIRE_RATE_MULTIPLIER_CAP,
  TECH_FRAGMENT_MULTIPLIER_CAP,
  TECH_ORBIT_SPEED_MULTIPLIER_CAP,
} from './constraints';

export type UpgradeBranch =
  | 'ship'
  | 'offense'
  | 'loadouts'
  | 'drones'
  | 'analysis'
  | 'idle'
  | 'global';

export type ShopTabId =
  | 'ship'
  | 'main_gun'
  | 'loadouts'
  | 'drone_bays'
  | 'bases'
  | 'other';

export type CostCurrency = 'fragments' | 'coreEnergy';

export interface UpgradeEffect {
  /** Additive damage rank bonus (e.g. 0.12 = +12%). Prefer over damageMul. */
  damageAdd?: number;
  /** Rare multiplicative damage (global only) — use sparingly. */
  damageMul?: number;
  fireRateAdd?: number;
  fireRateMul?: number;
  multiShotAdd?: number;
  splashAdd?: number;
  orbitSpeedAdd?: number;
  orbitSpeedMul?: number;
  accelAdd?: number;
  zoomRangeAdd?: number;
  droneCountAdd?: number;
  droneDamageAdd?: number;
  droneDamageMul?: number;
  droneFireRateAdd?: number;
  droneFireRateMul?: number;
  dronePriorityCore?: boolean;
  dronePriorityData?: boolean;
  fragmentAdd?: number;
  fragmentMul?: number;
  coreEnergyAdd?: number;
  coreEnergyMul?: number;
  idleRateAdd?: number;
  idleRateMul?: number;
  idleCapAdd?: number;
  idleCapMul?: number;
  critChance?: number;
  beamWidth?: number;
  /** Gentle main-gun cone spread */
  spreadAdd?: number;
  /** Main gun blocks pierced */
  penetrationAdd?: number;
  /** Main gun armor pierce 0–1 */
  armorPierceAdd?: number;
  /** Unlock armor-piercing magazine. */
  unlockAmmoAp?: boolean;
  /** Unlock high-explosive magazine. */
  unlockAmmoHe?: boolean;
  /** Extra AP pierce ranks (only while AP is loaded). */
  ammoApPenAdd?: number;
  /** Extra HE splash ranks (only while HE is loaded). */
  ammoHeSplashAdd?: number;
  /** Main-gun heat bleed add (fraction of base cool rate). */
  heatCoolAdd?: number;
  /** Extra chain-lightning hops off the primary bolt. */
  chainJumpsAdd?: number;
  /** Extra damage multiplier vs armored / regen / siege blocks. */
  shredMul?: number;
  /** Shield restored as a fraction of damage on block destroy. */
  leechOnKill?: number;
  /** Chance 0–1 that a bolt blooms a small splash even without HE. */
  ionChance?: number;
  /** Extra bolt every N shots (0 = off). */
  stutterEvery?: number;
  /** Bonus damage per consecutive hit on the same block. */
  focusLockAdd?: number;
  /** Extra damage fraction applied to the nucleus. */
  phaseNucleusAdd?: number;
  unlockDrones?: boolean;
  unlockAutoFire?: boolean;
  /** Ship vitals */
  maxHullAdd?: number;
  maxShieldAdd?: number;
  armorRatingAdd?: number;
  shieldRegenAdd?: number;
  /** Hardpoint unlocks */
  hardpointAdd?: number;
  /** Drone max HP fraction (0.15 = +15%) */
  droneHpAdd?: number;
  /** Respawn time reduction fraction (0.1 = 10% faster) */
  droneRespawnReduce?: number;
  /** Defender frontal shield capacity fraction */
  droneShieldAdd?: number;
  /** Defender shield regen rate fraction */
  droneShieldRegenAdd?: number;
}

export interface UpgradeNodeDef {
  id: string;
  name: string;
  description: string;
  branch: UpgradeBranch;
  /** Sequential chain id — only the next unpurchased rank is shown in the shop. */
  chain: string;
  /** 1-based rank within chain */
  rank: number;
  cost: number;
  costCurrency: CostCurrency;
  prerequisites: string[];
  effects: UpgradeEffect;
  /** Highly repeatable stat ranks — purchase cap scales with Evolution. */
  repeatable?: boolean;
}

export interface ShopTabDef {
  id: ShopTabId;
  label: string;
  icon: string;
  /** Branches that appear under this tab */
  branches: UpgradeBranch[];
}

/** Compact header tabs — drone tech lives under DRONES upgrades; economy+global → OTHER. */
export const SHOP_TABS: ShopTabDef[] = [
  { id: 'ship', label: 'SHIP', icon: '🚀', branches: ['ship'] },
  { id: 'main_gun', label: 'GUN', icon: '⚡', branches: ['offense'] },
  { id: 'loadouts', label: 'LOAD', icon: '◎', branches: ['loadouts'] },
  { id: 'drone_bays', label: 'DRONES', icon: '⬡', branches: ['drones'] },
  { id: 'bases', label: 'BASE', icon: '▲', branches: [] },
  { id: 'other', label: 'OTHER', icon: '✶', branches: ['analysis', 'idle', 'global'] },
];

export const BRANCH_LABELS: Record<UpgradeBranch, string> = {
  ship: 'SHIP',
  offense: 'MAIN GUN',
  loadouts: 'LOADOUTS',
  drones: 'DRONES',
  analysis: 'ANALYSIS',
  idle: 'IDLE',
  global: 'GLOBAL',
};

export const BRANCH_TO_TAB: Record<UpgradeBranch, ShopTabId> = {
  ship: 'ship',
  offense: 'main_gun',
  loadouts: 'loadouts',
  drones: 'drone_bays',
  analysis: 'other',
  idle: 'other',
  global: 'other',
};

/** Map legacy / deep-link tab ids onto the compact header set. */
export function normalizeShopTabId(tab: string | undefined | null): ShopTabId | undefined {
  if (!tab) return undefined;
  if (tab === 'drones') return 'drone_bays';
  if (tab === 'economy' || tab === 'global') return 'other';
  if (
    tab === 'main_gun' ||
    tab === 'loadouts' ||
    tab === 'drone_bays' ||
    tab === 'bases' ||
    tab === 'ship' ||
    tab === 'other'
  ) {
    return tab;
  }
  return undefined;
}

/** Soft/hard caps referenced by TechTree recompute. */
export const STAT_CAPS = {
  damageMul: TECH_DAMAGE_MULTIPLIER_CAP,
  fireRateMul: TECH_FIRE_RATE_MULTIPLIER_CAP,
  orbitSpeedMul: TECH_ORBIT_SPEED_MULTIPLIER_CAP,
  /** Soft cap — leave headroom for prestige baseline, not infinite farm */
  fragmentMul: TECH_FRAGMENT_MULTIPLIER_CAP,
  coreEnergyMul: TECH_CORE_ENERGY_MULTIPLIER_CAP,
  critChance: TECH_CRIT_CHANCE_CAP,
  critMult: TECH_CRIT_MULT_CAP,
  armorEffective: ARMOR_MAX_EFFECTIVE_REDUCTION,
  armorK: ARMOR_HYPERBOLIC_K,
  droneCount: DRONE_ABSOLUTE_HARD_CAP,
} as const;

function node(
  partial: Omit<UpgradeNodeDef, 'costCurrency'> & { costCurrency?: CostCurrency }
): UpgradeNodeDef {
  return {
    costCurrency: 'fragments',
    ...partial,
  };
}

function chainNodes(
  chain: string,
  branch: UpgradeBranch,
  ranks: Array<{
    id: string;
    name: string;
    description: string;
    cost: number;
    costCurrency?: CostCurrency;
    effects: UpgradeEffect;
    extraPrereq?: string[];
  }>,
  repeatable = false
): UpgradeNodeDef[] {
  return ranks.map((r, i) => {
    const prereqs: string[] = i === 0 ? [...(r.extraPrereq ?? [])] : [ranks[i - 1].id, ...(r.extraPrereq ?? [])];
    return node({
      id: r.id,
      name: r.name,
      description: r.description,
      branch,
      chain,
      rank: i + 1,
      cost: r.cost,
      costCurrency: r.costCurrency,
      prerequisites: prereqs,
      effects: r.effects,
      repeatable,
    });
  });
}

function tableThenGeo(table: number[], growth: number, rank: number): number {
  if (rank <= table.length) return table[rank - 1];
  return Math.round(table[table.length - 1] * Math.pow(growth, rank - table.length));
}

function repeatableChain(
  chain: string,
  branch: UpgradeBranch,
  spec: {
    name: string;
    extraPrereq?: string[];
    cost: (rank: number) => number;
    describe: (rank: number) => { description: string; effects: UpgradeEffect };
  }
): UpgradeNodeDef[] {
  const ranks = [];
  for (let i = 1; i <= REPEATABLE_UPGRADE_GENERATED_RANKS; i++) {
    const d = spec.describe(i);
    ranks.push({
      id: `${chain}_${i}`,
      name: spec.name,
      description: d.description,
      cost: spec.cost(i),
      effects: d.effects,
      extraPrereq: i === 1 ? spec.extraPrereq : undefined,
    });
  }
  return chainNodes(chain, branch, ranks, true);
}

export const UPGRADES: UpgradeNodeDef[] = [
  // ═══════════════════════════════════════════
  // SHIP — speed, accel, hull, shield, armor, zoom
  // ═══════════════════════════════════════════
  ...repeatableChain('ship_speed', 'ship', {
    name: 'Thrusters',
    cost: (r) => tableThenGeo([45, 100, 200, 360, 600, 950, 1400], 1.4, r),
    describe: (r) => {
      const add = r <= 3 ? 0.1 + (r - 1) * 0.01 : r <= 7 ? 0.13 : 0.06;
      return { description: `+${Math.round(add * 100)}% orbit speed`, effects: { orbitSpeedAdd: add } };
    },
  }),
  ...repeatableChain('ship_accel', 'ship', {
    name: 'Vector Coils',
    cost: (r) => tableThenGeo([55, 130, 280, 480, 780], 1.42, r),
    describe: (r) => {
      const add = r <= 5 ? 0.14 + (r > 2 ? 0.02 : 0) : 0.08;
      return { description: `+${Math.round(add * 100)}% angular accel`, effects: { accelAdd: add } };
    },
  }),
  ...repeatableChain('ship_hull', 'ship', {
    name: 'Hull Plating',
    cost: (r) => tableThenGeo([55, 130, 260, 450, 750, 1100], 1.42, r),
    describe: (r) => {
      const add = r <= 6 ? 30 + r * 15 : 28;
      return { description: `+${add} max hull`, effects: { maxHullAdd: add } };
    },
  }),
  ...repeatableChain('ship_shield', 'ship', {
    name: 'Shield Matrix',
    cost: (r) => tableThenGeo([70, 150, 300, 520, 850], 1.42, r),
    describe: (r) => {
      const shield = r <= 5 ? 20 + r * 10 : 24;
      const regen = r <= 5 ? 2 + Math.floor((r - 1) / 2) : 2;
      return {
        description: `+${shield} max shield · +${regen} regen`,
        effects: { maxShieldAdd: shield, shieldRegenAdd: regen },
      };
    },
  }),
  ...repeatableChain('ship_armor', 'ship', {
    name: 'Ablative Weave',
    cost: (r) => tableThenGeo([80, 170, 320, 560, 880, 1300], 1.4, r),
    describe: (r) => {
      const add = r <= 6 ? 22 + r * 4 : 18;
      return { description: `+${add} armor rating`, effects: { armorRatingAdd: add } };
    },
  }),
  ...chainNodes('ship_zoom', 'ship', [
    { id: 'ship_zoom_1', name: 'Long Lens', description: 'Extended zoom range', cost: 90, effects: { zoomRangeAdd: 12 } },
    { id: 'ship_zoom_2', name: 'Deep Focus', description: 'More zoom for large cubes', cost: 240, effects: { zoomRangeAdd: 16 } },
    { id: 'ship_zoom_3', name: 'Far Scan', description: 'Max zoom extension', cost: 520, effects: { zoomRangeAdd: 20 } },
  ]),
  ...chainNodes('ship_beam', 'ship', [
    { id: 'ship_beam_1', name: 'Focus Coil', description: 'Wider beam hit tolerance', cost: 160, effects: { beamWidth: 1.2 }, extraPrereq: ['ship_speed_1'] },
    { id: 'ship_beam_2', name: 'Focus Coil', description: 'Even wider hit tolerance', cost: 400, effects: { beamWidth: 1.15 } },
  ]),

  // ═══════════════════════════════════════════
  // MAIN GUN — damage, rate, unique modifiers
  // ═══════════════════════════════════════════
  ...repeatableChain('off_damage', 'offense', {
    name: 'Pulse Amp',
    cost: (r) => tableThenGeo([40, 95, 200, 380, 650, 1000, 1500, 2200], 1.42, r),
    describe: (r) => {
      const add = r <= 4 ? 0.14 : r <= 8 ? 0.16 : 0.06;
      return { description: `+${Math.round(add * 100)}% main gun damage`, effects: { damageAdd: add } };
    },
  }),
  ...repeatableChain('off_rate', 'offense', {
    name: 'Cycle Boost',
    cost: (r) => tableThenGeo([50, 130, 280, 500, 820, 1200], 1.42, r),
    describe: (r) => {
      const add = r <= 6 ? 0.12 + Math.floor((r - 1) / 2) * 0.01 : 0.06;
      return { description: `+${Math.round(add * 100)}% fire rate`, effects: { fireRateAdd: add } };
    },
  }),
  ...chainNodes('off_multi', 'offense', [
    { id: 'off_multi_1', name: 'Split Beam', description: '+1 concurrent bolt', cost: 180, effects: { multiShotAdd: 1 }, extraPrereq: ['off_rate_1'] },
    { id: 'off_multi_2', name: 'Tri-Beam', description: '+1 concurrent bolt', cost: 480, effects: { multiShotAdd: 1 } },
    { id: 'off_multi_3', name: 'Quad Lattice', description: '+1 concurrent bolt', cost: 980, effects: { multiShotAdd: 1 } },
  ]),
  ...chainNodes('off_spread', 'offense', [
    { id: 'off_spread_1', name: 'Soft Cone', description: 'Gentle bolt spread for wider coverage', cost: 160, effects: { spreadAdd: 0.2 }, extraPrereq: ['off_multi_1'] },
    { id: 'off_spread_2', name: 'Soft Cone', description: 'Slightly wider coverage cone', cost: 380, effects: { spreadAdd: 0.18 } },
    { id: 'off_spread_3', name: 'Soft Cone', description: 'Controlled fan for dense faces', cost: 720, effects: { spreadAdd: 0.16 } },
  ]),
  ...chainNodes('off_pen', 'offense', [
    { id: 'off_pen_1', name: 'Needle Core', description: 'Bolts pierce +1 block', cost: 220, effects: { penetrationAdd: 1 }, extraPrereq: ['off_damage_2'] },
    { id: 'off_pen_2', name: 'Needle Core', description: 'Pierce +1 additional block', cost: 560, effects: { penetrationAdd: 1 } },
    { id: 'off_pen_3', name: 'Needle Core', description: 'Pierce +1 additional block', cost: 1100, effects: { penetrationAdd: 1 } },
  ]),
  ...chainNodes('off_pierce', 'offense', [
    { id: 'off_pierce_1', name: 'Armor Borer', description: '+8% armor pierce vs heavy blocks', cost: 200, effects: { armorPierceAdd: 0.08 }, extraPrereq: ['off_damage_2'] },
    { id: 'off_pierce_2', name: 'Armor Borer', description: '+8% armor pierce', cost: 450, effects: { armorPierceAdd: 0.08 } },
    { id: 'off_pierce_3', name: 'Armor Borer', description: '+10% armor pierce', cost: 900, effects: { armorPierceAdd: 0.1 } },
  ]),
  ...chainNodes('off_splash', 'offense', [
    { id: 'off_splash_1', name: 'Shock Halo', description: 'Small splash radius', cost: 220, effects: { splashAdd: 1.1 }, extraPrereq: ['off_damage_2'] },
    { id: 'off_splash_2', name: 'Nova Ring', description: 'Larger splash', cost: 520, effects: { splashAdd: 1.3 } },
    { id: 'off_splash_3', name: 'Cascade Halo', description: 'Wide detonation ring', cost: 1000, effects: { splashAdd: 1.4 } },
  ]),
  ...chainNodes('off_ammo_ap', 'offense', [
    {
      id: 'off_ammo_ap_1',
      name: 'AP Magazine',
      description: 'Unlock AP rounds (HUD / R). Extra pierce, no splash.',
      cost: 260,
      effects: { unlockAmmoAp: true, ammoApPenAdd: 1 },
      extraPrereq: ['off_damage_2'],
    },
    { id: 'off_ammo_ap_2', name: 'Tungsten Core', description: 'AP: +1 block pierce', cost: 540, effects: { ammoApPenAdd: 1 } },
    { id: 'off_ammo_ap_3', name: 'Depleted Tip', description: 'AP: +1 pierce · +6% armor pierce', cost: 980, effects: { ammoApPenAdd: 1, armorPierceAdd: 0.06 } },
  ]),
  ...chainNodes('off_ammo_he', 'offense', [
    {
      id: 'off_ammo_he_1',
      name: 'HE Magazine',
      description: 'Unlock HE rounds (HUD / R). Extra splash, no pierce.',
      cost: 260,
      effects: { unlockAmmoHe: true, ammoHeSplashAdd: 0.7 },
      extraPrereq: ['off_damage_2'],
    },
    { id: 'off_ammo_he_2', name: 'Burst Sleeve', description: 'HE: +0.8 splash radius', cost: 540, effects: { ammoHeSplashAdd: 0.8 } },
    { id: 'off_ammo_he_3', name: 'Thermobaric Mix', description: 'HE: +1.0 splash radius', cost: 980, effects: { ammoHeSplashAdd: 1.0 } },
  ]),
  ...chainNodes('off_vent', 'offense', [
    { id: 'off_vent_1', name: 'Vent Coils', description: '+18% main gun heat bleed', cost: 180, effects: { heatCoolAdd: 0.18 }, extraPrereq: ['off_rate_1'] },
    { id: 'off_vent_2', name: 'Vent Coils', description: '+16% heat bleed', cost: 420, effects: { heatCoolAdd: 0.16 } },
    { id: 'off_vent_3', name: 'Cryo Jacket', description: '+14% heat bleed', cost: 780, effects: { heatCoolAdd: 0.14 } },
  ]),
  ...repeatableChain('off_crit', 'offense', {
    name: 'Overcharge',
    extraPrereq: ['off_damage_2'],
    cost: (r) => tableThenGeo([260, 480, 820, 1300], 1.38, r),
    describe: (r) => {
      const add = r <= 3 ? 0.07 : r === 4 ? 0.06 : 0.015;
      return {
        description: `+${Math.round(add * 1000) / 10}% crit chance`,
        effects: { critChance: add },
      };
    },
  }),
  ...chainNodes('off_chain', 'offense', [
    {
      id: 'off_chain_1',
      name: 'Chain Arc',
      description: 'Bolts jump to 1 nearby block',
      cost: 280,
      effects: { chainJumpsAdd: 1 },
      extraPrereq: ['off_damage_2'],
    },
    { id: 'off_chain_2', name: 'Chain Arc', description: 'Bolts jump to 2 nearby blocks', cost: 620, effects: { chainJumpsAdd: 1 } },
    { id: 'off_chain_3', name: 'Fork Storm', description: 'Bolts jump to 3 nearby blocks', cost: 1180, effects: { chainJumpsAdd: 1 } },
  ]),
  ...chainNodes('off_shred', 'offense', [
    {
      id: 'off_shred_1',
      name: 'Shredder Rounds',
      description: '+22% damage vs armored / regen / siege',
      cost: 240,
      effects: { shredMul: 0.22 },
      extraPrereq: ['off_pierce_1'],
    },
    { id: 'off_shred_2', name: 'Shredder Rounds', description: '+18% vs armored / regen / siege', cost: 560, effects: { shredMul: 0.18 } },
    { id: 'off_shred_3', name: 'Carbide Teeth', description: '+20% vs armored / regen / siege', cost: 980, effects: { shredMul: 0.2 } },
  ]),
  ...chainNodes('off_leech', 'offense', [
    {
      id: 'off_leech_1',
      name: 'Leech Coil',
      description: 'Destroyed blocks restore 4% of damage as shield',
      cost: 300,
      effects: { leechOnKill: 0.04 },
      extraPrereq: ['off_damage_3'],
    },
    { id: 'off_leech_2', name: 'Leech Coil', description: 'Destroyed blocks restore 5% of damage as shield', cost: 680, effects: { leechOnKill: 0.05 } },
  ]),
  ...chainNodes('off_ion', 'offense', [
    {
      id: 'off_ion_1',
      name: 'Ion Bloom',
      description: '18% chance a bolt blooms a small splash',
      cost: 260,
      effects: { ionChance: 0.18 },
      extraPrereq: ['off_rate_2'],
    },
    { id: 'off_ion_2', name: 'Ion Bloom', description: '16% more bloom chance', cost: 580, effects: { ionChance: 0.16 } },
    { id: 'off_ion_3', name: 'Static Burst', description: '14% more bloom chance', cost: 1020, effects: { ionChance: 0.14 } },
  ]),
  ...chainNodes('off_stutter', 'offense', [
    {
      id: 'off_stutter_1',
      name: 'Stutter Cycle',
      description: 'Every 4th shot fires an extra bolt',
      cost: 320,
      effects: { stutterEvery: 4 },
      extraPrereq: ['off_multi_1'],
    },
    { id: 'off_stutter_2', name: 'Stutter Cycle', description: 'Every 3rd shot fires an extra bolt', cost: 760, effects: { stutterEvery: 3 } },
  ]),
  ...chainNodes('off_focus', 'offense', [
    {
      id: 'off_focus_1',
      name: 'Focus Lock',
      description: '+8% dmg per consecutive hit (max 3)',
      cost: 240,
      effects: { focusLockAdd: 0.08 },
      extraPrereq: ['off_damage_2'],
    },
    { id: 'off_focus_2', name: 'Focus Lock', description: '+7% more per consecutive hit (max 4)', cost: 540, effects: { focusLockAdd: 0.07 } },
  ]),
  ...chainNodes('off_phase', 'offense', [
    {
      id: 'off_phase_1',
      name: 'Phase Needle',
      description: '+12% extra damage vs nucleus',
      cost: 340,
      effects: { phaseNucleusAdd: 0.12 },
      extraPrereq: ['off_pen_1'],
    },
    { id: 'off_phase_2', name: 'Phase Needle', description: '+10% extra nucleus damage', cost: 780, effects: { phaseNucleusAdd: 0.1 } },
    { id: 'off_phase_3', name: 'Ghost Tip', description: '+12% extra nucleus damage', cost: 1400, effects: { phaseNucleusAdd: 0.12 } },
  ]),

  // LOADOUTS tab: hardpoint bays unlock via Ascension (Evolve) + Core Energy in the loadout UI.
  // Weapon catalog / branches live in ShopUI loadout panel — no fragment hardpoint chain here.

  // ═══════════════════════════════════════════
  // DRONES
  // ═══════════════════════════════════════════
  // Drone bays / types: STOCK sub-tab; these chains appear under DRONES → UPGRADES.
  // Ally Protocol still gates "drones unlocked" for tutorials.
  ...chainNodes('drone_unlock', 'drones', [
    {
      id: 'drone_unlock',
      name: 'Ally Protocol',
      description: 'Authorize drones · unlocks first bay',
      cost: DRONE_ALLY_PROTOCOL_COST_FRAGMENTS,
      effects: { unlockDrones: true, droneCountAdd: 0 },
    },
  ]),
  // Hull / respawn / shield upgrades remain sequential chains
  ...repeatableChain('drone_dmg', 'drones', {
    name: 'Drone Lens',
    extraPrereq: ['drone_unlock'],
    cost: (r) => tableThenGeo([150, 338, 600], 1.48, r),
    describe: (r) => {
      const add = r <= 10 ? 0.12 : r <= 20 ? 0.06 : 0.03;
      return { description: `+${Math.round(add * 100)}% drone damage`, effects: { droneDamageAdd: add } };
    },
  }),
  ...repeatableChain('drone_rate', 'drones', {
    name: 'Swarm Cycle',
    extraPrereq: ['drone_dmg_1'],
    cost: (r) => tableThenGeo([180, 390], 1.5, r),
    describe: (r) => {
      const add = r <= 10 ? 0.1 : r <= 20 ? 0.05 : 0.025;
      return { description: `+${Math.round(add * 100)}% drone fire rate`, effects: { droneFireRateAdd: add } };
    },
  }),
  ...chainNodes('drone_prio_core', 'drones', [
    {
      id: 'drone_prio_core',
      name: 'Core Hunter',
      description: 'Bombers prioritize exposed nucleus',
      cost: 263,
      effects: { dronePriorityCore: true },
      extraPrereq: ['drone_unlock'],
    },
  ]),
  ...chainNodes('drone_prio_data', 'drones', [
    {
      id: 'drone_prio_data',
      name: 'Data Sniffer',
      description: 'Bombers prioritize data nodes',
      cost: 315,
      effects: { dronePriorityData: true },
      extraPrereq: ['drone_prio_core'],
    },
  ]),
  ...repeatableChain('drone_hp', 'drones', {
    name: 'Hull Plates',
    extraPrereq: ['drone_unlock'],
    cost: (r) => tableThenGeo([165, 360, 675], 1.48, r),
    describe: (r) => {
      const add = r <= 10 ? 0.1 : r <= 20 ? 0.05 : 0.025;
      return { description: `+${Math.round(add * 100)}% drone max HP`, effects: { droneHpAdd: add } };
    },
  }),
  ...chainNodes('drone_respawn', 'drones', [
    {
      id: 'drone_respawn_1',
      name: 'Rapid Reload Bay',
      description: '−15% drone respawn time',
      cost: 195,
      effects: { droneRespawnReduce: 0.15 },
      extraPrereq: ['drone_hp_1'],
    },
    { id: 'drone_respawn_2', name: 'Rapid Reload Bay', description: '−20% drone respawn time', cost: 420, effects: { droneRespawnReduce: 0.2 } },
    { id: 'drone_respawn_3', name: 'Rapid Reload Bay', description: '−20% drone respawn time', cost: 825, effects: { droneRespawnReduce: 0.2 } },
  ]),
  ...chainNodes('drone_shield', 'drones', [
    {
      id: 'drone_shield_1',
      name: 'Escort Barrier',
      description: '+30% defender frontal shield',
      cost: 225,
      effects: { droneShieldAdd: 0.3 },
      extraPrereq: ['drone_unlock'],
    },
    { id: 'drone_shield_2', name: 'Escort Barrier', description: '+35% defender frontal shield', cost: 480, effects: { droneShieldAdd: 0.35 } },
    {
      id: 'drone_shield_3',
      name: 'Barrier Regen',
      description: '+40% defender shield regen',
      cost: 660,
      effects: { droneShieldRegenAdd: 0.4 },
    },
  ]),

  // ═══════════════════════════════════════════
  // ECONOMY — analysis + idle
  // ═══════════════════════════════════════════
  ...repeatableChain('ana_frag', 'analysis', {
    name: 'Fragment Scan',
    cost: (r) => tableThenGeo([65, 180, 400, 800], 1.45, r),
    describe: (r) => {
      const add = r <= 4 ? 0.08 + r * 0.02 : 0.05;
      return { description: `+${Math.round(add * 100)}% Data Fragments`, effects: { fragmentAdd: add } };
    },
  }),
  ...chainNodes('ana_core', 'analysis', [
    { id: 'ana_core_1', name: 'Core Reader', description: '+12% Core Energy on clear', cost: 160, effects: { coreEnergyAdd: 0.12 }, extraPrereq: ['ana_frag_1'] },
    { id: 'ana_core_2', name: 'Energy Lattice', description: '+15% Core Energy', cost: 480, effects: { coreEnergyAdd: 0.15 } },
  ]),
  ...repeatableChain('idle_rate', 'idle', {
    name: 'Background Tick',
    cost: (r) => tableThenGeo([100, 280, 650], 1.45, r),
    describe: (r) => {
      const add = r <= 3 ? 0.2 + r * 0.05 : 0.1;
      return { description: `+${Math.round(add * 100)}% idle clear rate`, effects: { idleRateAdd: add } };
    },
  }),
  ...chainNodes('idle_cap', 'idle', [
    { id: 'idle_cap_1', name: 'Cache Buffer', description: '+40% offline time cap', cost: 150, effects: { idleCapAdd: 0.4 }, extraPrereq: ['idle_rate_1'] },
    { id: 'idle_cap_2', name: 'Deep Sleep', description: '+60% offline time cap', cost: 450, effects: { idleCapAdd: 0.6 } },
  ]),

  // ═══════════════════════════════════════════
  // GLOBAL — rare mults with hard caps
  // ═══════════════════════════════════════════
  ...chainNodes('glob_all', 'global', [
    {
      id: 'glob_all_1',
      name: 'Sync Field',
      description: '+8% all currency',
      cost: 280,
      effects: { fragmentMul: 1.08, coreEnergyMul: 1.08 },
      extraPrereq: ['ana_frag_1', 'off_damage_1'],
    },
    {
      id: 'glob_all_2',
      name: 'Master Link',
      description: '+10% all currency',
      cost: 750,
      effects: { fragmentMul: 1.1, coreEnergyMul: 1.1 },
      extraPrereq: ['ana_frag_2'],
    },
  ]),
  ...chainNodes('glob_dmg', 'global', [
    {
      id: 'glob_dmg_1',
      name: 'Unity Pulse',
      description: '+10% player & drone damage',
      cost: 420,
      effects: { damageMul: 1.1, droneDamageMul: 1.1 },
      extraPrereq: ['glob_all_1'],
    },
    {
      id: 'glob_dmg_2',
      name: 'Unity Resonance',
      description: '+8% player & drone damage',
      cost: 1400,
      effects: { damageMul: 1.08, droneDamageMul: 1.08 },
    },
    {
      id: 'glob_dmg_3',
      name: 'Unity Apex',
      description: '+8% player & drone damage (pre-evolve cap)',
      cost: 4200,
      effects: { damageMul: 1.08, droneDamageMul: 1.08 },
    },
  ]),

  // Extra bay slots are purchased in the DRONES stock panel (not sequential chains).
];

export function getUpgrade(id: string): UpgradeNodeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export function getChainNodes(chain: string): UpgradeNodeDef[] {
  return UPGRADES.filter((u) => u.chain === chain).sort((a, b) => a.rank - b.rank);
}

export function getChainsForTab(tabId: ShopTabId): string[] {
  const tab = SHOP_TABS.find((t) => t.id === tabId);
  if (!tab) return [];
  const seen = new Set<string>();
  const order: string[] = [];
  for (const u of UPGRADES) {
    if (!tab.branches.includes(u.branch)) continue;
    if (seen.has(u.chain)) continue;
    seen.add(u.chain);
    order.push(u.chain);
  }
  return order;
}

export interface SequentialVisibleNode {
  node: UpgradeNodeDef;
  chain: string;
  rank: number;
  maxRank: number;
  ownedCount: number;
  maxed: boolean;
  /** True when chain is locked by missing branch prereq (show teaser). */
  teaser: boolean;
  teaserLabel?: string;
}

/**
 * One visible card per sequential chain:
 * - next unpurchased rank if prereqs met
 * - MAXED card if chain complete
 * - single teaser if first rank blocked by external prereq
 */
export function getSequentialVisibleNodes(
  owned: Set<string> | string[],
  _currency?: { dataFragments: number; coreEnergy: number },
  tabId?: ShopTabId,
  repeatableCap = REPEATABLE_UPGRADE_CAP_PER_EVOLUTION
): SequentialVisibleNode[] {
  const ownedSet = owned instanceof Set ? owned : new Set(owned);
  const chains = tabId
    ? getChainsForTab(tabId)
    : (() => {
        const s = new Set<string>();
        const o: string[] = [];
        for (const u of UPGRADES) {
          if (!s.has(u.chain)) {
            s.add(u.chain);
            o.push(u.chain);
          }
        }
        return o;
      })();

  const result: SequentialVisibleNode[] = [];

  for (const chain of chains) {
    const ranks = getChainNodes(chain);
    if (ranks.length === 0) continue;
    const generated = ranks.length;
    const capped = ranks[0]?.repeatable
      ? Math.min(generated, Math.max(1, repeatableCap))
      : generated;
    const maxRank = capped;
    let ownedCount = 0;
    for (const r of ranks) {
      if (r.rank > maxRank) break;
      if (ownedSet.has(r.id)) ownedCount++;
    }

    if (ownedCount >= maxRank) {
      const last = ranks[maxRank - 1];
      result.push({
        node: last,
        chain,
        rank: maxRank,
        maxRank,
        ownedCount,
        maxed: true,
        teaser: false,
      });
      continue;
    }

    // Find first unpurchased rank
    const next = ranks.find((r) => !ownedSet.has(r.id))!;
    const prereqsMet = next.prerequisites.every((p) => ownedSet.has(p));

    if (prereqsMet) {
      result.push({
        node: next,
        chain,
        rank: next.rank,
        maxRank,
        ownedCount,
        maxed: false,
        teaser: false,
      });
    } else if (ownedCount === 0) {
      // Teaser: show first node as locked with missing prereq name
      const missing = next.prerequisites.find((p) => !ownedSet.has(p));
      const missingNode = missing ? getUpgrade(missing) : undefined;
      result.push({
        node: next,
        chain,
        rank: next.rank,
        maxRank,
        ownedCount: 0,
        maxed: false,
        teaser: true,
        teaserLabel: missingNode ? `Requires: ${missingNode.name}` : 'Locked',
      });
    }
    // Mid-chain with unmet prereq (external) — still show next as locked teaser
    else {
      const missing = next.prerequisites.find((p) => !ownedSet.has(p));
      const missingNode = missing ? getUpgrade(missing) : undefined;
      result.push({
        node: next,
        chain,
        rank: next.rank,
        maxRank,
        ownedCount,
        maxed: false,
        teaser: true,
        teaserLabel: missingNode ? `Requires: ${missingNode.name}` : 'Locked',
      });
    }
  }

  return result;
}
