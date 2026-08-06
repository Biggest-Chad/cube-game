/**
 * Weapon roster — Rocket Pod is the first modular loadout unlock (stage 3+).
 * Arc Beam and other families unlock later.
 */

export type WeaponFamily =
  | 'beam'
  | 'pulse'
  | 'rocket'
  | 'missile'
  | 'rail'
  | 'flak'
  | 'torpedo';

export interface WeaponStats {
  damage: number;
  fireRate: number;
  /** Projectile speed (0 = hitscan / continuous) */
  projectileSpeed: number;
  range: number;
  splashRadius: number;
  splashFalloff: number;
  armorPierce: number;
  critChance: number;
  critMult: number;
  heatPerShot: number;
  heatCapacity: number;
  heatCoolRate: number;
  chargeTime: number;
  projectileCount: number;
  homing: number;
  burstSize: number;
  /** Surface bounces (beam / rail) */
  bounceCount?: number;
  /** Blocks the shot can pierce through */
  penetration?: number;
  /** Gentle cone spread (radians-ish scale used by weapons) */
  spread?: number;
}

export interface BranchRankEffect {
  damageAdd?: number;
  fireRateAdd?: number;
  splashAdd?: number;
  armorPierceAdd?: number;
  critChanceAdd?: number;
  critMultAdd?: number;
  projectileCountAdd?: number;
  chargeTimeMul?: number;
  heatCoolAdd?: number;
  bounceAdd?: number;
  penetrationAdd?: number;
  spreadAdd?: number;
  rangeAdd?: number;
  flags?: string[];
}

export interface UpgradeBranchDef {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  baseCost: number;
  costGrowth: number;
  ranks: BranchRankEffect[];
}

export type UnlockRule =
  | { type: 'level'; minLevel: number }
  /** Shop purchase; optional minLevel = campaign stage gate (highestLevel). */
  | { type: 'shop'; costFragments: number; costCore?: number; minLevel?: number }
  | { type: 'start' }
  | { type: 'core'; costCore: number; minLevel?: number };

export interface WeaponDef {
  id: string;
  name: string;
  family: WeaponFamily;
  description: string;
  baseStats: WeaponStats;
  branches: UpgradeBranchDef[];
  tags: string[];
  unlock: UnlockRule;
  color: number;
  colorCss: string;
}

const defaultExtras = { bounceCount: 0, penetration: 0, spread: 0 };

/** Continuous beam — second modular unlock */
const arcBeam: WeaponDef = {
  id: 'pulse_laser',
  name: 'Arc Beam',
  family: 'beam',
  description:
    'Continuous energy beam. Hold fire to melt lattice. Upgrade for bounce & refract chains.',
  color: 0xff00aa,
  colorCss: '#ff00aa',
  tags: ['sustained', 'hitscan', 'beam'],
  unlock: { type: 'shop', costFragments: 200, minLevel: 4 },
  baseStats: {
    damage: 9,
    fireRate: 10,
    projectileSpeed: 0,
    range: 95,
    splashRadius: 0,
    splashFalloff: 0.5,
    armorPierce: 0.08,
    critChance: 0.06,
    critMult: 1.9,
    heatPerShot: 0.11,
    heatCapacity: 1,
    heatCoolRate: 0.42,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 0,
    ...defaultExtras,
  },
  branches: [
    {
      id: 'sustained',
      name: 'Sustained Output',
      description: 'Higher DPS and heat management.',
      maxRank: 8,
      baseCost: 70,
      costGrowth: 1.48,
      ranks: [
        { damageAdd: 0.12, heatCoolAdd: 0.04 },
        { damageAdd: 0.12, fireRateAdd: 0.06 },
        { damageAdd: 0.14, heatCoolAdd: 0.05, flags: ['overcharge_glow'] },
        { damageAdd: 0.14, critChanceAdd: 0.02 },
        { damageAdd: 0.16, fireRateAdd: 0.08 },
        { damageAdd: 0.16, heatCoolAdd: 0.06 },
        { damageAdd: 0.18, critMultAdd: 0.1 },
        { damageAdd: 0.2, fireRateAdd: 0.1, flags: ['overcharge_max'] },
      ],
    },
    {
      id: 'bounce',
      name: 'Surface Bounce',
      description: 'Beam ricochets off block faces onto other blocks.',
      maxRank: 6,
      baseCost: 120,
      costGrowth: 1.55,
      ranks: [
        { bounceAdd: 1, flags: ['bounce_1'] },
        { damageAdd: 0.08, bounceAdd: 0, flags: ['bounce_1'] },
        { bounceAdd: 1, flags: ['bounce_2'] },
        { damageAdd: 0.1, flags: ['bounce_2', 'bounce_strong'] },
        { bounceAdd: 1, flags: ['bounce_3'] },
        { damageAdd: 0.12, bounceAdd: 0, flags: ['bounce_3', 'bounce_strong'] },
      ],
    },
    {
      id: 'refract',
      name: 'Lattice Refract',
      description: 'On impact, spawn bent secondary rays that crawl the surface.',
      maxRank: 5,
      baseCost: 160,
      costGrowth: 1.6,
      ranks: [
        { flags: ['refract'], bounceAdd: 1 },
        { damageAdd: 0.08, flags: ['refract'] },
        { projectileCountAdd: 0, flags: ['refract'], bounceAdd: 1 },
        { damageAdd: 0.1, flags: ['refract', 'bounce_2'] },
        { damageAdd: 0.14, flags: ['refract_max', 'bounce_3'] },
      ],
    },
    {
      id: 'prism',
      name: 'Prism Split',
      description: 'Extra concurrent beams with gentle spread.',
      maxRank: 5,
      baseCost: 110,
      costGrowth: 1.55,
      ranks: [
        { projectileCountAdd: 1, spreadAdd: 0.15 },
        { damageAdd: -0.06, fireRateAdd: 0.05 },
        { projectileCountAdd: 1, spreadAdd: 0.1, flags: ['prism_tri'] },
        { damageAdd: 0.08, splashAdd: 0.15 },
        { projectileCountAdd: 1, flags: ['prism_quad'] },
      ],
    },
  ],
};

/** First modular loadout weapon — wing-mounted rocket pods */
const rocket: WeaponDef = {
  id: 'rocket_pod',
  name: 'Rocket Pod',
  family: 'rocket',
  description:
    'Heavy dumb-fire rockets. Drop from the wings, ignite, and smash clusters with punchy splash.',
  color: 0xff6622,
  colorCss: '#ff6622',
  tags: ['splash', 'burst', 'first-loadout'],
  // First hardpoint weapon — stage 3+
  unlock: { type: 'shop', costFragments: 140, minLevel: 3 },
  baseStats: {
    damage: 58,
    fireRate: 0.85,
    projectileSpeed: 36,
    range: 95,
    splashRadius: 3.1,
    splashFalloff: 0.42,
    armorPierce: 0.12,
    critChance: 0.05,
    critMult: 1.85,
    heatPerShot: 0.2,
    heatCapacity: 1,
    heatCoolRate: 0.26,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 2,
    ...defaultExtras,
  },
  branches: [
    {
      id: 'payload',
      name: 'Payload',
      description: 'Bigger warheads and splash.',
      maxRank: 8,
      baseCost: 90,
      costGrowth: 1.5,
      ranks: [
        { damageAdd: 0.12, splashAdd: 0.25 },
        { damageAdd: 0.12, splashAdd: 0.25 },
        { damageAdd: 0.14, flags: ['payload_heavy'] },
        { splashAdd: 0.35, damageAdd: 0.1 },
        { damageAdd: 0.15 },
        { damageAdd: 0.15, splashAdd: 0.4 },
        { damageAdd: 0.16, armorPierceAdd: 0.05 },
        { damageAdd: 0.18, splashAdd: 0.45, flags: ['payload_max'] },
      ],
    },
    {
      id: 'barrage',
      name: 'Barrage',
      description: 'More rockets per volley, higher RoF.',
      maxRank: 6,
      baseCost: 110,
      costGrowth: 1.52,
      ranks: [
        { projectileCountAdd: 1, damageAdd: -0.1 },
        { fireRateAdd: 0.1 },
        { projectileCountAdd: 1, flags: ['barrage_triple'] },
        { fireRateAdd: 0.12, spreadAdd: 0.08 },
        { projectileCountAdd: 1 },
        { projectileCountAdd: 1, flags: ['barrage_quad'] },
      ],
    },
    {
      id: 'thermobaric',
      name: 'Thermobaric',
      description: 'Lingering splash and armor soften.',
      maxRank: 6,
      baseCost: 120,
      costGrowth: 1.55,
      ranks: [
        { splashAdd: 0.3, armorPierceAdd: 0.04 },
        { damageAdd: 0.1, armorPierceAdd: 0.04 },
        { splashAdd: 0.35, flags: ['thermo_cloud'] },
        { armorPierceAdd: 0.06, damageAdd: 0.1 },
        { splashAdd: 0.4, penetrationAdd: 1 },
        { splashAdd: 0.5, armorPierceAdd: 0.08, flags: ['thermo_max'] },
      ],
    },
  ],
};

const missile: WeaponDef = {
  id: 'guided_missile',
  name: 'Guided Missiles',
  family: 'missile',
  description: 'Homing seekers. Prioritize data nodes and cores.',
  color: 0xaa66ff,
  colorCss: '#aa66ff',
  tags: ['homing', 'anti-priority'],
  unlock: { type: 'shop', costFragments: 420, minLevel: 4 },
  baseStats: {
    damage: 48,
    fireRate: 0.85,
    projectileSpeed: 38,
    range: 100,
    splashRadius: 1.1,
    splashFalloff: 0.5,
    armorPierce: 0.15,
    critChance: 0.08,
    critMult: 2.0,
    heatPerShot: 0.18,
    heatCapacity: 1,
    heatCoolRate: 0.25,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0.65,
    burstSize: 2,
    ...defaultExtras,
  },
  branches: [
    {
      id: 'swarm',
      name: 'Swarm',
      description: 'Multiple micro-missiles.',
      maxRank: 6,
      baseCost: 130,
      costGrowth: 1.52,
      ranks: [
        { projectileCountAdd: 1, damageAdd: -0.18 },
        { projectileCountAdd: 1, damageAdd: -0.1 },
        { fireRateAdd: 0.1, flags: ['swarm_pack'] },
        { projectileCountAdd: 1 },
        { spreadAdd: 0.12, projectileCountAdd: 1 },
        { projectileCountAdd: 1, flags: ['swarm_cloud'] },
      ],
    },
    {
      id: 'hunter',
      name: 'Hunter-Killer',
      description: 'Stronger homing and priority damage.',
      maxRank: 8,
      baseCost: 140,
      costGrowth: 1.5,
      ranks: [
        { damageAdd: 0.1 },
        { damageAdd: 0.1, armorPierceAdd: 0.04, flags: ['hunter_lock'] },
        { critChanceAdd: 0.04, damageAdd: 0.08 },
        { damageAdd: 0.12, flags: ['hunter_core'] },
        { armorPierceAdd: 0.08, critMultAdd: 0.1 },
        { damageAdd: 0.12, penetrationAdd: 1 },
        { damageAdd: 0.14 },
        { damageAdd: 0.18, flags: ['hunter_max'] },
      ],
    },
    {
      id: 'warhead_m',
      name: 'Payload',
      description: 'Splash and raw damage.',
      maxRank: 6,
      baseCost: 125,
      costGrowth: 1.52,
      ranks: [
        { splashAdd: 0.35, damageAdd: 0.1 },
        { splashAdd: 0.3, damageAdd: 0.1 },
        { damageAdd: 0.12, flags: ['missile_he'] },
        { splashAdd: 0.4 },
        { damageAdd: 0.15, splashAdd: 0.3 },
        { damageAdd: 0.18, splashAdd: 0.35, flags: ['missile_he_max'] },
      ],
    },
  ],
};

const rail: WeaponDef = {
  id: 'railgun',
  name: 'Railgun',
  family: 'rail',
  description: 'Charge shot with high armor pierce. Siege specialist.',
  color: 0x4488ff,
  colorCss: '#4488ff',
  tags: ['armor-pierce', 'charge', 'siege'],
  unlock: { type: 'shop', costFragments: 560, minLevel: 5 },
  baseStats: {
    damage: 95,
    fireRate: 0.55,
    projectileSpeed: 180,
    range: 140,
    splashRadius: 0.4,
    splashFalloff: 0.3,
    armorPierce: 0.75,
    critChance: 0.12,
    critMult: 2.1,
    heatPerShot: 0.28,
    heatCapacity: 1,
    heatCoolRate: 0.22,
    chargeTime: 0.55,
    projectileCount: 1,
    homing: 0,
    burstSize: 0,
    bounceCount: 0,
    penetration: 1,
    spread: 0,
  },
  branches: [
    {
      id: 'capacitor',
      name: 'Capacitor',
      description: 'Faster charge, more heat capacity.',
      maxRank: 6,
      baseCost: 150,
      costGrowth: 1.52,
      ranks: [
        { chargeTimeMul: 0.92, heatCoolAdd: 0.04 },
        { chargeTimeMul: 0.92, fireRateAdd: 0.08 },
        { chargeTimeMul: 0.88, flags: ['cap_fast'] },
        { heatCoolAdd: 0.08, fireRateAdd: 0.1 },
        { chargeTimeMul: 0.85 },
        { chargeTimeMul: 0.8, flags: ['cap_max'] },
      ],
    },
    {
      id: 'spike',
      name: 'Spike',
      description: 'Raw damage, pierce, and penetration.',
      maxRank: 8,
      baseCost: 160,
      costGrowth: 1.52,
      ranks: [
        { damageAdd: 0.12, armorPierceAdd: 0.04 },
        { damageAdd: 0.1, penetrationAdd: 1 },
        { damageAdd: 0.12, critChanceAdd: 0.02, flags: ['spike_tip'] },
        { armorPierceAdd: 0.06, damageAdd: 0.1 },
        { damageAdd: 0.14, critMultAdd: 0.08 },
        { penetrationAdd: 1, damageAdd: 0.1 },
        { damageAdd: 0.15 },
        { damageAdd: 0.18, armorPierceAdd: 0.08, flags: ['spike_max'] },
      ],
    },
    {
      id: 'ricochet',
      name: 'Ricochet',
      description: 'Secondary bounce hits.',
      maxRank: 5,
      baseCost: 180,
      costGrowth: 1.58,
      ranks: [
        { bounceAdd: 1, flags: ['rico_1'] },
        { damageAdd: 0.08, flags: ['rico_1'] },
        { bounceAdd: 1, flags: ['rico_2'] },
        { damageAdd: 0.1, flags: ['rico_2'] },
        { bounceAdd: 1, flags: ['rico_2', 'rico_strong'] },
      ],
    },
  ],
};

const flak: WeaponDef = {
  id: 'flak_cannon',
  name: 'Flak Cannon',
  family: 'flak',
  description: 'Proximity bursts. Excellent vs drones and soft clusters.',
  color: 0xffd060,
  colorCss: '#ffd060',
  tags: ['anti-drone', 'aoe', 'splash'],
  unlock: { type: 'shop', costFragments: 700, minLevel: 6 },
  baseStats: {
    damage: 22,
    fireRate: 3.2,
    projectileSpeed: 55,
    range: 70,
    splashRadius: 2.8,
    splashFalloff: 0.55,
    armorPierce: 0.0,
    critChance: 0.06,
    critMult: 1.7,
    heatPerShot: 0.09,
    heatCapacity: 1,
    heatCoolRate: 0.32,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 6,
    bounceCount: 0,
    penetration: 0,
    spread: 0.2,
  },
  branches: [
    {
      id: 'shrapnel',
      name: 'Shrapnel',
      description: 'Larger burst radius and pellet count.',
      maxRank: 6,
      baseCost: 120,
      costGrowth: 1.5,
      ranks: [
        { splashAdd: 0.35, projectileCountAdd: 1 },
        { splashAdd: 0.3, damageAdd: 0.08 },
        { projectileCountAdd: 1, flags: ['flak_cloud'] },
        { splashAdd: 0.4, damageAdd: 0.1 },
        { projectileCountAdd: 1, spreadAdd: 0.1 },
        { projectileCountAdd: 1, splashAdd: 0.35, flags: ['flak_storm'] },
      ],
    },
    {
      id: 'proximity',
      name: 'Proximity Fuse',
      description: 'Detonate earlier, better anti-drone.',
      maxRank: 6,
      baseCost: 130,
      costGrowth: 1.52,
      ranks: [
        { splashAdd: 0.25, flags: ['prox_early'] },
        { fireRateAdd: 0.1, damageAdd: 0.08 },
        { flags: ['prox_smart'], damageAdd: 0.1 },
        { fireRateAdd: 0.12, splashAdd: 0.25 },
        { damageAdd: 0.12, splashAdd: 0.2 },
        { flags: ['prox_max'], damageAdd: 0.15 },
      ],
    },
    {
      id: 'magdump',
      name: 'Mag Dump',
      description: 'Burst RoF with controlled spread.',
      maxRank: 5,
      baseCost: 140,
      costGrowth: 1.55,
      ranks: [
        { fireRateAdd: 0.18 },
        { fireRateAdd: 0.18, spreadAdd: 0.1 },
        { fireRateAdd: 0.2, flags: ['mag_dump'] },
        { fireRateAdd: 0.22, projectileCountAdd: 1 },
        { fireRateAdd: 0.25, projectileCountAdd: 1, flags: ['mag_dump_max'] },
      ],
    },
  ],
};

const torpedo: WeaponDef = {
  id: 'torpedo',
  name: 'Heavy Torpedo',
  family: 'torpedo',
  description: 'Huge delayed boom. Core and shield breaker. Telegraphed.',
  color: 0xff00aa,
  colorCss: '#ff00aa',
  tags: ['burst', 'siege', 'shield-break', 'telegraph'],
  unlock: { type: 'shop', costFragments: 950, minLevel: 8 },
  baseStats: {
    damage: 220,
    fireRate: 0.28,
    projectileSpeed: 22,
    range: 95,
    splashRadius: 3.6,
    splashFalloff: 0.4,
    armorPierce: 0.55,
    critChance: 0.1,
    critMult: 2.0,
    heatPerShot: 0.45,
    heatCapacity: 1,
    heatCoolRate: 0.18,
    chargeTime: 0.9,
    projectileCount: 1,
    homing: 0.15,
    burstSize: 0,
    bounceCount: 0,
    penetration: 2,
    spread: 0,
  },
  branches: [
    {
      id: 'warhead_t',
      name: 'Warhead',
      description: 'Massive damage and splash.',
      maxRank: 8,
      baseCost: 200,
      costGrowth: 1.55,
      ranks: [
        { damageAdd: 0.12, splashAdd: 0.25 },
        { damageAdd: 0.12, splashAdd: 0.25 },
        { damageAdd: 0.15, flags: ['torp_he'] },
        { splashAdd: 0.35, damageAdd: 0.1 },
        { damageAdd: 0.15 },
        { damageAdd: 0.15, splashAdd: 0.35 },
        { damageAdd: 0.18, penetrationAdd: 1 },
        { damageAdd: 0.22, splashAdd: 0.45, flags: ['torp_max'] },
      ],
    },
    {
      id: 'magnetic',
      name: 'Magnetic',
      description: 'Homing pull toward core / dense mass.',
      maxRank: 6,
      baseCost: 210,
      costGrowth: 1.55,
      ranks: [
        { flags: ['mag_seek'] },
        { damageAdd: 0.1, armorPierceAdd: 0.04 },
        { flags: ['mag_strong'], armorPierceAdd: 0.06 },
        { damageAdd: 0.12 },
        { armorPierceAdd: 0.08, damageAdd: 0.1 },
        { flags: ['mag_lock'], armorPierceAdd: 0.1, damageAdd: 0.14 },
      ],
    },
    {
      id: 'cluster',
      name: 'Cluster',
      description: 'Splits into submunitions near impact.',
      maxRank: 5,
      baseCost: 230,
      costGrowth: 1.58,
      ranks: [
        { projectileCountAdd: 2, damageAdd: -0.22, flags: ['cluster_2'] },
        { splashAdd: 0.25, damageAdd: 0.08 },
        { projectileCountAdd: 1, flags: ['cluster_3'] },
        { damageAdd: 0.1, splashAdd: 0.3 },
        { damageAdd: 0.12, splashAdd: 0.3, flags: ['cluster_max'] },
      ],
    },
  ],
};

/** Rocket Pod listed first — primary early loadout unlock. */
export const WEAPONS: WeaponDef[] = [rocket, arcBeam, missile, rail, flak, torpedo];

export const WEAPON_BY_ID: Record<string, WeaponDef> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w])
);

export function getWeaponDef(id: string): WeaponDef | undefined {
  return WEAPON_BY_ID[id];
}

export function weaponUnlockCost(def: WeaponDef): { fragments: number; core: number } {
  if (def.unlock.type === 'shop') {
    return { fragments: def.unlock.costFragments, core: def.unlock.costCore ?? 0 };
  }
  if (def.unlock.type === 'core') {
    return { fragments: 0, core: def.unlock.costCore };
  }
  return { fragments: 0, core: 0 };
}

export function isWeaponUnlocked(
  def: WeaponDef,
  highestLevel: number,
  ownedWeaponIds: Set<string>
): boolean {
  if (ownedWeaponIds.has(def.id)) return true;
  switch (def.unlock.type) {
    case 'start':
      return true;
    case 'level':
      return highestLevel >= def.unlock.minLevel;
    case 'shop':
    case 'core':
      return ownedWeaponIds.has(def.id);
    default:
      return false;
  }
}

/**
 * True if weapon can be purchased with currency (not yet owned).
 * @param highestLevel campaign progress gate for shop.minLevel / core.minLevel
 */
export function isWeaponPurchasable(
  def: WeaponDef,
  ownedWeaponIds: Set<string>,
  highestLevel = 99
): boolean {
  if (ownedWeaponIds.has(def.id)) return false;
  if (def.unlock.type === 'shop') {
    if (def.unlock.minLevel != null && highestLevel < def.unlock.minLevel) return false;
    return true;
  }
  if (def.unlock.type === 'core') {
    if (def.unlock.minLevel != null && highestLevel < def.unlock.minLevel) return false;
    return true;
  }
  return false;
}

export function branchRankCost(branch: UpgradeBranchDef, nextRank: number): number {
  if (nextRank < 1 || nextRank > branch.maxRank) return Infinity;
  return Math.round(branch.baseCost * Math.pow(branch.costGrowth, nextRank - 1));
}

export function computeWeaponStats(
  def: WeaponDef,
  branchRanks: Record<string, number>
): WeaponStats & { flags: Set<string> } {
  const s: WeaponStats = { ...def.baseStats };
  const flags = new Set<string>();
  let damageMul = 1;
  let fireRateMul = 1;
  let chargeMul = 1;

  for (const branch of def.branches) {
    const rank = branchRanks[branch.id] ?? 0;
    for (let i = 0; i < rank && i < branch.ranks.length; i++) {
      const e = branch.ranks[i];
      if (e.damageAdd) damageMul += e.damageAdd;
      if (e.fireRateAdd) fireRateMul += e.fireRateAdd;
      if (e.splashAdd) s.splashRadius += e.splashAdd;
      if (e.armorPierceAdd) s.armorPierce = Math.min(0.95, s.armorPierce + e.armorPierceAdd);
      if (e.critChanceAdd) s.critChance += e.critChanceAdd;
      if (e.critMultAdd) s.critMult += e.critMultAdd;
      if (e.projectileCountAdd) s.projectileCount += e.projectileCountAdd;
      if (e.chargeTimeMul) chargeMul *= e.chargeTimeMul;
      if (e.heatCoolAdd) s.heatCoolRate = Math.max(0.05, s.heatCoolRate + e.heatCoolAdd);
      if (e.bounceAdd) s.bounceCount = (s.bounceCount ?? 0) + e.bounceAdd;
      if (e.penetrationAdd) s.penetration = (s.penetration ?? 0) + e.penetrationAdd;
      if (e.spreadAdd) s.spread = (s.spread ?? 0) + e.spreadAdd;
      if (e.rangeAdd) s.range += e.rangeAdd;
      if (e.flags) for (const f of e.flags) flags.add(f);
    }
  }

  s.damage = def.baseStats.damage * damageMul;
  s.fireRate = def.baseStats.fireRate * fireRateMul;
  s.chargeTime = def.baseStats.chargeTime * chargeMul;
  s.projectileCount = Math.max(1, Math.floor(s.projectileCount));
  s.bounceCount = Math.max(0, Math.floor(s.bounceCount ?? 0));
  s.penetration = Math.max(0, Math.floor(s.penetration ?? 0));
  s.spread = s.spread ?? 0;
  s.critChance = Math.min(0.45, s.critChance);
  s.critMult = Math.min(2.4, s.critMult);

  return { ...s, flags };
}

export const HARDPOINT_UNLOCK = [
  { slot: 0, costCore: 0, minLevel: 1 },
  { slot: 1, costCore: 160, minLevel: 1 },
  { slot: 2, costCore: 480, minLevel: 1 },
] as const;

export const MAX_HARDPOINTS = 3;

/** Cheapest shop weapon not yet owned (for HUD hints). */
export function cheapestPurchasableWeapon(
  owned: Set<string>,
  fragments: number,
  highestLevel = 99
): WeaponDef | null {
  let best: WeaponDef | null = null;
  for (const w of WEAPONS) {
    if (!isWeaponPurchasable(w, owned, highestLevel)) continue;
    const cost = weaponUnlockCost(w);
    if (cost.fragments <= 0 && cost.core > 0) continue;
    if (fragments < cost.fragments) continue;
    if (!best || cost.fragments < weaponUnlockCost(best).fragments) best = w;
  }
  return best;
}
