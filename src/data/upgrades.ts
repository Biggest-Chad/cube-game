/**
 * P2/P3 upgrade catalog — sequential chains, smaller additive bonuses, ship vitals.
 *
 * Damage model (folded in TechTree):
 *   damageMul = min(CAP, (1 + sum(damageAdd)) * product(damageMul rare))
 * Orbit speed total soft-capped at 1.85 via TechTree.
 */

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
  if (tab === 'main_gun' || tab === 'loadouts' || tab === 'drone_bays' || tab === 'ship' || tab === 'other') {
    return tab;
  }
  return undefined;
}

/** Soft/hard caps referenced by TechTree recompute. */
export const STAT_CAPS = {
  damageMul: 5.0,
  fireRateMul: 3.0,
  orbitSpeedMul: 1.95,
  /** Soft cap — leave headroom for prestige baseline, not infinite farm */
  fragmentMul: 1.75,
  coreEnergyMul: 2.5,
  critChance: 0.45,
  critMult: 2.4,
  armorEffective: 0.55,
  armorK: 100,
  droneCount: 24,
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
  }>
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
    });
  });
}

export const UPGRADES: UpgradeNodeDef[] = [
  // ═══════════════════════════════════════════
  // SHIP — speed, accel, hull, shield, armor, zoom
  // ═══════════════════════════════════════════
  ...chainNodes('ship_speed', 'ship', [
    { id: 'ship_speed_1', name: 'Thrusters', description: '+10% orbit speed', cost: 45, effects: { orbitSpeedAdd: 0.1 } },
    { id: 'ship_speed_2', name: 'Thrusters', description: '+11% orbit speed', cost: 100, effects: { orbitSpeedAdd: 0.11 } },
    { id: 'ship_speed_3', name: 'Thrusters', description: '+12% orbit speed', cost: 200, effects: { orbitSpeedAdd: 0.12 } },
    { id: 'ship_speed_4', name: 'Thrusters', description: '+12% orbit speed', cost: 360, effects: { orbitSpeedAdd: 0.12 } },
    { id: 'ship_speed_5', name: 'Thrusters', description: '+13% orbit speed', cost: 600, effects: { orbitSpeedAdd: 0.13 } },
    { id: 'ship_speed_6', name: 'Thrusters', description: '+13% orbit speed', cost: 950, effects: { orbitSpeedAdd: 0.13 } },
    { id: 'ship_speed_7', name: 'Thrusters', description: '+14% orbit speed (cap band)', cost: 1400, effects: { orbitSpeedAdd: 0.14 } },
  ]),
  ...chainNodes('ship_accel', 'ship', [
    { id: 'ship_accel_1', name: 'Vector Coils', description: '+14% angular accel', cost: 55, effects: { accelAdd: 0.14 } },
    { id: 'ship_accel_2', name: 'Vector Coils', description: '+14% angular accel', cost: 130, effects: { accelAdd: 0.14 } },
    { id: 'ship_accel_3', name: 'Vector Coils', description: '+16% angular accel', cost: 280, effects: { accelAdd: 0.16 } },
    { id: 'ship_accel_4', name: 'Vector Coils', description: '+16% angular accel', cost: 480, effects: { accelAdd: 0.16 } },
    { id: 'ship_accel_5', name: 'Vector Coils', description: '+18% angular accel', cost: 780, effects: { accelAdd: 0.18 } },
  ]),
  ...chainNodes('ship_hull', 'ship', [
    { id: 'ship_hull_1', name: 'Hull Plating', description: '+40 max hull', cost: 55, effects: { maxHullAdd: 40 } },
    { id: 'ship_hull_2', name: 'Hull Plating', description: '+50 max hull', cost: 130, effects: { maxHullAdd: 50 } },
    { id: 'ship_hull_3', name: 'Hull Plating', description: '+65 max hull', cost: 260, effects: { maxHullAdd: 65 } },
    { id: 'ship_hull_4', name: 'Hull Plating', description: '+80 max hull', cost: 450, effects: { maxHullAdd: 80 } },
    { id: 'ship_hull_5', name: 'Hull Plating', description: '+100 max hull', cost: 750, effects: { maxHullAdd: 100 } },
    { id: 'ship_hull_6', name: 'Hull Plating', description: '+120 max hull', cost: 1100, effects: { maxHullAdd: 120 } },
  ]),
  ...chainNodes('ship_shield', 'ship', [
    { id: 'ship_shield_1', name: 'Shield Matrix', description: '+30 max shield · +2 regen', cost: 70, effects: { maxShieldAdd: 30, shieldRegenAdd: 2 } },
    { id: 'ship_shield_2', name: 'Shield Matrix', description: '+40 max shield · +2 regen', cost: 150, effects: { maxShieldAdd: 40, shieldRegenAdd: 2 } },
    { id: 'ship_shield_3', name: 'Shield Matrix', description: '+50 max shield · +3 regen', cost: 300, effects: { maxShieldAdd: 50, shieldRegenAdd: 3 } },
    { id: 'ship_shield_4', name: 'Shield Matrix', description: '+65 max shield · +3 regen', cost: 520, effects: { maxShieldAdd: 65, shieldRegenAdd: 3 } },
    { id: 'ship_shield_5', name: 'Shield Matrix', description: '+80 max shield · +4 regen', cost: 850, effects: { maxShieldAdd: 80, shieldRegenAdd: 4 } },
  ]),
  ...chainNodes('ship_armor', 'ship', [
    { id: 'ship_armor_1', name: 'Ablative Weave', description: '+25 armor rating', cost: 80, effects: { armorRatingAdd: 25 } },
    { id: 'ship_armor_2', name: 'Ablative Weave', description: '+28 armor rating', cost: 170, effects: { armorRatingAdd: 28 } },
    { id: 'ship_armor_3', name: 'Ablative Weave', description: '+32 armor rating', cost: 320, effects: { armorRatingAdd: 32 } },
    { id: 'ship_armor_4', name: 'Ablative Weave', description: '+36 armor rating', cost: 560, effects: { armorRatingAdd: 36 } },
    { id: 'ship_armor_5', name: 'Ablative Weave', description: '+40 armor rating', cost: 880, effects: { armorRatingAdd: 40 } },
    { id: 'ship_armor_6', name: 'Ablative Weave', description: '+45 armor rating', cost: 1300, effects: { armorRatingAdd: 45 } },
  ]),
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
  ...chainNodes('off_damage', 'offense', [
    { id: 'off_damage_1', name: 'Pulse Amp', description: '+14% main gun damage', cost: 40, effects: { damageAdd: 0.14 } },
    { id: 'off_damage_2', name: 'Pulse Amp', description: '+14% main gun damage', cost: 95, effects: { damageAdd: 0.14 } },
    { id: 'off_damage_3', name: 'Pulse Amp', description: '+15% main gun damage', cost: 200, effects: { damageAdd: 0.15 } },
    { id: 'off_damage_4', name: 'Pulse Amp', description: '+15% main gun damage', cost: 380, effects: { damageAdd: 0.15 } },
    { id: 'off_damage_5', name: 'Pulse Amp', description: '+16% main gun damage', cost: 650, effects: { damageAdd: 0.16 } },
    { id: 'off_damage_6', name: 'Pulse Amp', description: '+16% main gun damage', cost: 1000, effects: { damageAdd: 0.16 } },
    { id: 'off_damage_7', name: 'Pulse Amp', description: '+18% main gun damage', cost: 1500, effects: { damageAdd: 0.18 } },
    { id: 'off_damage_8', name: 'Pulse Amp', description: '+18% main gun damage', cost: 2200, effects: { damageAdd: 0.18 } },
  ]),
  ...chainNodes('off_rate', 'offense', [
    { id: 'off_rate_1', name: 'Cycle Boost', description: '+12% fire rate', cost: 50, effects: { fireRateAdd: 0.12 } },
    { id: 'off_rate_2', name: 'Cycle Boost', description: '+12% fire rate', cost: 130, effects: { fireRateAdd: 0.12 } },
    { id: 'off_rate_3', name: 'Cycle Boost', description: '+13% fire rate', cost: 280, effects: { fireRateAdd: 0.13 } },
    { id: 'off_rate_4', name: 'Cycle Boost', description: '+14% fire rate', cost: 500, effects: { fireRateAdd: 0.14 } },
    { id: 'off_rate_5', name: 'Cycle Boost', description: '+14% fire rate', cost: 820, effects: { fireRateAdd: 0.14 } },
    { id: 'off_rate_6', name: 'Cycle Boost', description: '+15% fire rate', cost: 1200, effects: { fireRateAdd: 0.15 } },
  ]),
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
  ...chainNodes('off_crit', 'offense', [
    { id: 'off_crit_1', name: 'Overcharge', description: '+7% crit chance', cost: 260, effects: { critChance: 0.07 }, extraPrereq: ['off_damage_2'] },
    { id: 'off_crit_2', name: 'Overcharge', description: '+7% crit chance', cost: 480, effects: { critChance: 0.07 } },
    { id: 'off_crit_3', name: 'Overcharge', description: '+7% crit chance', cost: 820, effects: { critChance: 0.07 } },
    { id: 'off_crit_4', name: 'Overcharge', description: '+6% crit chance (soft cap)', cost: 1300, effects: { critChance: 0.06 } },
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
      description: 'Authorize drone operations · opens first bay purchase',
      cost: 150,
      effects: { unlockDrones: true, droneCountAdd: 0 },
    },
  ]),
  // Hull / respawn / shield upgrades remain sequential chains
  ...chainNodes('drone_dmg', 'drones', [
    { id: 'drone_dmg_1', name: 'Drone Lens', description: '+20% drone damage', cost: 200, effects: { droneDamageAdd: 0.2 }, extraPrereq: ['drone_unlock'] },
    { id: 'drone_dmg_2', name: 'Drone Lens', description: '+22% drone damage', cost: 450, effects: { droneDamageAdd: 0.22 } },
    { id: 'drone_dmg_3', name: 'Drone Lens', description: '+25% drone damage', cost: 800, effects: { droneDamageAdd: 0.25 } },
  ]),
  ...chainNodes('drone_rate', 'drones', [
    { id: 'drone_rate_1', name: 'Swarm Cycle', description: '+18% drone fire rate', cost: 240, effects: { droneFireRateAdd: 0.18 }, extraPrereq: ['drone_dmg_1'] },
    { id: 'drone_rate_2', name: 'Swarm Cycle', description: '+20% drone fire rate', cost: 520, effects: { droneFireRateAdd: 0.2 } },
  ]),
  ...chainNodes('drone_prio_core', 'drones', [
    {
      id: 'drone_prio_core',
      name: 'Core Hunter',
      description: 'Bombers prioritize exposed nucleus',
      cost: 350,
      effects: { dronePriorityCore: true },
      extraPrereq: ['drone_unlock'],
    },
  ]),
  ...chainNodes('drone_prio_data', 'drones', [
    {
      id: 'drone_prio_data',
      name: 'Data Sniffer',
      description: 'Bombers prioritize data nodes',
      cost: 420,
      effects: { dronePriorityData: true },
      extraPrereq: ['drone_prio_core'],
    },
  ]),
  ...chainNodes('drone_hp', 'drones', [
    {
      id: 'drone_hp_1',
      name: 'Hull Plates',
      description: '+20% drone max HP',
      cost: 220,
      effects: { droneHpAdd: 0.2 },
      extraPrereq: ['drone_unlock'],
    },
    { id: 'drone_hp_2', name: 'Hull Plates', description: '+25% drone max HP', cost: 480, effects: { droneHpAdd: 0.25 } },
    { id: 'drone_hp_3', name: 'Hull Plates', description: '+30% drone max HP', cost: 900, effects: { droneHpAdd: 0.3 } },
  ]),
  ...chainNodes('drone_respawn', 'drones', [
    {
      id: 'drone_respawn_1',
      name: 'Rapid Reload Bay',
      description: '−15% drone respawn time',
      cost: 260,
      effects: { droneRespawnReduce: 0.15 },
      extraPrereq: ['drone_hp_1'],
    },
    { id: 'drone_respawn_2', name: 'Rapid Reload Bay', description: '−20% drone respawn time', cost: 560, effects: { droneRespawnReduce: 0.2 } },
    { id: 'drone_respawn_3', name: 'Rapid Reload Bay', description: '−20% drone respawn time', cost: 1100, effects: { droneRespawnReduce: 0.2 } },
  ]),
  ...chainNodes('drone_shield', 'drones', [
    {
      id: 'drone_shield_1',
      name: 'Escort Barrier',
      description: '+30% defender frontal shield',
      cost: 300,
      effects: { droneShieldAdd: 0.3 },
      extraPrereq: ['drone_unlock'],
    },
    { id: 'drone_shield_2', name: 'Escort Barrier', description: '+35% defender frontal shield', cost: 640, effects: { droneShieldAdd: 0.35 } },
    {
      id: 'drone_shield_3',
      name: 'Barrier Regen',
      description: '+40% defender shield regen',
      cost: 880,
      effects: { droneShieldRegenAdd: 0.4 },
    },
  ]),

  // ═══════════════════════════════════════════
  // ECONOMY — analysis + idle
  // ═══════════════════════════════════════════
  ...chainNodes('ana_frag', 'analysis', [
    { id: 'ana_frag_1', name: 'Fragment Scan', description: '+10% Data Fragments', cost: 65, effects: { fragmentAdd: 0.1 } },
    { id: 'ana_frag_2', name: 'Deep Extract', description: '+12% Data Fragments', cost: 180, effects: { fragmentAdd: 0.12 } },
    { id: 'ana_frag_3', name: 'Parity Harvest', description: '+14% Data Fragments', cost: 400, effects: { fragmentAdd: 0.14 } },
    { id: 'ana_frag_4', name: 'Lattice Siphon', description: '+14% Data Fragments (cap band)', cost: 800, effects: { fragmentAdd: 0.14 } },
  ]),
  ...chainNodes('ana_core', 'analysis', [
    { id: 'ana_core_1', name: 'Core Reader', description: '+12% Core Energy on clear', cost: 160, effects: { coreEnergyAdd: 0.12 }, extraPrereq: ['ana_frag_1'] },
    { id: 'ana_core_2', name: 'Energy Lattice', description: '+15% Core Energy', cost: 480, effects: { coreEnergyAdd: 0.15 } },
  ]),
  ...chainNodes('idle_rate', 'idle', [
    { id: 'idle_rate_1', name: 'Background Tick', description: '+25% idle clear rate', cost: 100, effects: { idleRateAdd: 0.25 } },
    { id: 'idle_rate_2', name: 'Ghost Protocol', description: '+30% idle clear rate', cost: 280, effects: { idleRateAdd: 0.3 } },
    { id: 'idle_rate_3', name: 'Autonomous Siege', description: '+35% idle clear rate', cost: 650, effects: { idleRateAdd: 0.35 }, extraPrereq: ['drone_unlock'] },
  ]),
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

  // Late-tier sinks until EVOLVE / prestige ships — expensive, diminishing
  ...chainNodes('off_damage_late', 'offense', [
    {
      id: 'off_damage_late_1',
      name: 'Overclock Lattice',
      description: '+6% main damage (late)',
      cost: 2200,
      effects: { damageAdd: 0.06 },
      extraPrereq: ['off_damage_8'],
    },
    {
      id: 'off_damage_late_2',
      name: 'Overclock Lattice',
      description: '+6% main damage (late)',
      cost: 5500,
      effects: { damageAdd: 0.06 },
    },
    {
      id: 'off_damage_late_3',
      name: 'Overclock Lattice',
      description: '+7% main damage (late)',
      cost: 12000,
      effects: { damageAdd: 0.07 },
    },
    {
      id: 'off_damage_late_4',
      name: 'Overclock Lattice',
      description: '+7% main damage (soft cap)',
      cost: 28000,
      effects: { damageAdd: 0.07 },
    },
  ]),
  ...chainNodes('ship_hull_late', 'ship', [
    {
      id: 'ship_hull_late_1',
      name: 'Deep Plating',
      description: '+25 max hull (late)',
      cost: 1800,
      effects: { maxHullAdd: 25 },
      extraPrereq: ['ship_hull_6'],
    },
    {
      id: 'ship_hull_late_2',
      name: 'Deep Plating',
      description: '+30 max hull (late)',
      cost: 4800,
      effects: { maxHullAdd: 30 },
    },
    {
      id: 'ship_hull_late_3',
      name: 'Deep Plating',
      description: '+35 max hull (late)',
      cost: 11000,
      effects: { maxHullAdd: 35 },
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
  tabId?: ShopTabId
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
    const maxRank = ranks.length;
    let ownedCount = 0;
    for (const r of ranks) if (ownedSet.has(r.id)) ownedCount++;

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
