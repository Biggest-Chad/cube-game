/**
 * Weapon roster definitions — 6 families × multi-branch upgrades.
 * Balance numbers live here (not scattered in behaviors).
 */

export type WeaponFamily =
  | 'pulse'
  | 'rocket'
  | 'missile'
  | 'rail'
  | 'flak'
  | 'torpedo';

export interface WeaponStats {
  damage: number;
  fireRate: number;
  /** Projectile speed (0 = hitscan) */
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
  /** Charge time for rail / torpedo (0 = none) */
  chargeTime: number;
  projectileCount: number;
  homing: number;
  /** Ammo-style burst budget before cooldown stretch */
  burstSize: number;
}

export interface BranchRankEffect {
  /** Additive % on base damage (0.12 = +12%) */
  damageAdd?: number;
  fireRateAdd?: number;
  splashAdd?: number;
  armorPierceAdd?: number;
  critChanceAdd?: number;
  critMultAdd?: number;
  projectileCountAdd?: number;
  chargeTimeMul?: number;
  heatCoolAdd?: number;
  /** Behavior flags flipped at rank thresholds */
  flags?: string[];
}

export interface UpgradeBranchDef {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  /** Cost per rank (fragments); rank n costs costs[n-1] or last * growth */
  baseCost: number;
  costGrowth: number;
  /** Per-rank effects (index 0 = rank 1) */
  ranks: BranchRankEffect[];
}

export type UnlockRule =
  | { type: 'level'; minLevel: number }
  | { type: 'shop'; costFragments: number; costCore?: number }
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
  /** Hardpoint muzzle accent color */
  color: number;
  /** UI accent */
  colorCss: string;
}

const pulse: WeaponDef = {
  id: 'pulse_laser',
  name: 'Pulse Laser',
  family: 'pulse',
  description: 'Reliable hitscan bolts. Low heat, consistent DPS, modest armor break.',
  color: 0x00f0ff,
  colorCss: '#00f0ff',
  tags: ['sustained', 'hitscan'],
  unlock: { type: 'start' },
  baseStats: {
    damage: 14,
    fireRate: 6,
    projectileSpeed: 110,
    range: 120,
    splashRadius: 0,
    splashFalloff: 0.5,
    armorPierce: 0.05,
    critChance: 0.05,
    critMult: 1.8,
    heatPerShot: 0.06,
    heatCapacity: 1,
    heatCoolRate: 0.35,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 0,
  },
  branches: [
    {
      id: 'overcharge',
      name: 'Overcharge',
      description: 'Higher damage and crit, more heat.',
      maxRank: 6,
      baseCost: 80,
      costGrowth: 1.55,
      ranks: [
        { damageAdd: 0.12, critChanceAdd: 0.02 },
        { damageAdd: 0.12, critChanceAdd: 0.02, heatCoolAdd: -0.02 },
        { damageAdd: 0.14, critMultAdd: 0.1, flags: ['overcharge_glow'] },
        { damageAdd: 0.14, critChanceAdd: 0.03 },
        { damageAdd: 0.16, critMultAdd: 0.15 },
        { damageAdd: 0.18, critChanceAdd: 0.04, flags: ['overcharge_max'] },
      ],
    },
    {
      id: 'prism',
      name: 'Prism Split',
      description: 'Extra projectiles / beam width.',
      maxRank: 5,
      baseCost: 100,
      costGrowth: 1.6,
      ranks: [
        { projectileCountAdd: 1 },
        { damageAdd: -0.08, projectileCountAdd: 0, fireRateAdd: 0.05 },
        { projectileCountAdd: 1, flags: ['prism_tri'] },
        { damageAdd: 0.08, splashAdd: 0.2 },
        { projectileCountAdd: 1, flags: ['prism_quad'] },
      ],
    },
    {
      id: 'coolant',
      name: 'Coolant Loop',
      description: 'Heat dissipation and fire rate.',
      maxRank: 5,
      baseCost: 70,
      costGrowth: 1.5,
      ranks: [
        { heatCoolAdd: 0.08, fireRateAdd: 0.06 },
        { heatCoolAdd: 0.08, fireRateAdd: 0.06 },
        { heatCoolAdd: 0.1, flags: ['coolant_vent'] },
        { fireRateAdd: 0.1, heatCoolAdd: 0.06 },
        { fireRateAdd: 0.12, heatCoolAdd: 0.12, flags: ['coolant_max'] },
      ],
    },
  ],
};

const rocket: WeaponDef = {
  id: 'rocket_pod',
  name: 'Rocket Pod',
  family: 'rocket',
  description: 'Dumb-fire splash rockets. Clears clusters, slow travel.',
  color: 0xff6622,
  colorCss: '#ff6622',
  tags: ['splash', 'burst'],
  unlock: { type: 'level', minLevel: 3 },
  baseStats: {
    damage: 38,
    fireRate: 1.4,
    projectileSpeed: 42,
    range: 90,
    splashRadius: 2.2,
    splashFalloff: 0.45,
    armorPierce: 0.1,
    critChance: 0.04,
    critMult: 1.75,
    heatPerShot: 0.14,
    heatCapacity: 1,
    heatCoolRate: 0.28,
    chargeTime: 0,
    projectileCount: 1,
    homing: 0,
    burstSize: 3,
  },
  branches: [
    {
      id: 'payload',
      name: 'Payload',
      description: 'Bigger warheads and splash.',
      maxRank: 6,
      baseCost: 90,
      costGrowth: 1.55,
      ranks: [
        { damageAdd: 0.15, splashAdd: 0.25 },
        { damageAdd: 0.12, splashAdd: 0.3 },
        { damageAdd: 0.15, flags: ['payload_heavy'] },
        { splashAdd: 0.4, damageAdd: 0.1 },
        { damageAdd: 0.18 },
        { damageAdd: 0.2, splashAdd: 0.5, flags: ['payload_max'] },
      ],
    },
    {
      id: 'barrage',
      name: 'Barrage',
      description: 'More rockets per volley, higher RoF.',
      maxRank: 5,
      baseCost: 110,
      costGrowth: 1.58,
      ranks: [
        { projectileCountAdd: 1, damageAdd: -0.1 },
        { fireRateAdd: 0.12 },
        { projectileCountAdd: 1, flags: ['barrage_triple'] },
        { fireRateAdd: 0.15 },
        { projectileCountAdd: 1, flags: ['barrage_quad'] },
      ],
    },
    {
      id: 'thermobaric',
      name: 'Thermobaric',
      description: 'Lingering splash and armor soften.',
      maxRank: 5,
      baseCost: 120,
      costGrowth: 1.62,
      ranks: [
        { splashAdd: 0.35, armorPierceAdd: 0.05 },
        { damageAdd: 0.1, armorPierceAdd: 0.05 },
        { splashAdd: 0.4, flags: ['thermo_cloud'] },
        { armorPierceAdd: 0.08, damageAdd: 0.12 },
        { splashAdd: 0.55, armorPierceAdd: 0.1, flags: ['thermo_max'] },
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
  unlock: { type: 'level', minLevel: 6 },
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
  },
  branches: [
    {
      id: 'swarm',
      name: 'Swarm',
      description: 'Multiple micro-missiles.',
      maxRank: 5,
      baseCost: 130,
      costGrowth: 1.6,
      ranks: [
        { projectileCountAdd: 1, damageAdd: -0.2 },
        { projectileCountAdd: 1, damageAdd: -0.1 },
        { fireRateAdd: 0.1, flags: ['swarm_pack'] },
        { projectileCountAdd: 1 },
        { projectileCountAdd: 1, flags: ['swarm_cloud'] },
      ],
    },
    {
      id: 'hunter',
      name: 'Hunter-Killer',
      description: 'Stronger homing and priority damage.',
      maxRank: 6,
      baseCost: 140,
      costGrowth: 1.58,
      ranks: [
        { damageAdd: 0.12 },
        { damageAdd: 0.12, armorPierceAdd: 0.05, flags: ['hunter_lock'] },
        { critChanceAdd: 0.05, damageAdd: 0.1 },
        { damageAdd: 0.15, flags: ['hunter_core'] },
        { armorPierceAdd: 0.1, critMultAdd: 0.15 },
        { damageAdd: 0.2, flags: ['hunter_max'] },
      ],
    },
    {
      id: 'warhead_m',
      name: 'Payload',
      description: 'Splash and raw damage.',
      maxRank: 5,
      baseCost: 125,
      costGrowth: 1.55,
      ranks: [
        { splashAdd: 0.4, damageAdd: 0.1 },
        { splashAdd: 0.35, damageAdd: 0.12 },
        { damageAdd: 0.15, flags: ['missile_he'] },
        { splashAdd: 0.5 },
        { damageAdd: 0.2, splashAdd: 0.4, flags: ['missile_he_max'] },
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
  unlock: { type: 'level', minLevel: 8 },
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
  },
  branches: [
    {
      id: 'capacitor',
      name: 'Capacitor',
      description: 'Faster charge, more heat capacity.',
      maxRank: 5,
      baseCost: 150,
      costGrowth: 1.6,
      ranks: [
        { chargeTimeMul: 0.9, heatCoolAdd: 0.04 },
        { chargeTimeMul: 0.9, fireRateAdd: 0.08 },
        { chargeTimeMul: 0.85, flags: ['cap_fast'] },
        { heatCoolAdd: 0.08, fireRateAdd: 0.1 },
        { chargeTimeMul: 0.8, flags: ['cap_max'] },
      ],
    },
    {
      id: 'spike',
      name: 'Spike',
      description: 'Raw damage and pierce.',
      maxRank: 6,
      baseCost: 160,
      costGrowth: 1.62,
      ranks: [
        { damageAdd: 0.15, armorPierceAdd: 0.05 },
        { damageAdd: 0.12, armorPierceAdd: 0.05 },
        { damageAdd: 0.15, critChanceAdd: 0.03, flags: ['spike_tip'] },
        { armorPierceAdd: 0.08, damageAdd: 0.1 },
        { damageAdd: 0.18, critMultAdd: 0.1 },
        { damageAdd: 0.22, armorPierceAdd: 0.1, flags: ['spike_max'] },
      ],
    },
    {
      id: 'ricochet',
      name: 'Ricochet',
      description: 'Secondary bounce hits.',
      maxRank: 4,
      baseCost: 180,
      costGrowth: 1.7,
      ranks: [
        { flags: ['rico_1'] },
        { damageAdd: 0.08, flags: ['rico_1'] },
        { flags: ['rico_2'] },
        { damageAdd: 0.12, flags: ['rico_2', 'rico_strong'] },
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
  unlock: { type: 'level', minLevel: 10 },
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
  },
  branches: [
    {
      id: 'shrapnel',
      name: 'Shrapnel',
      description: 'Larger burst radius and pellet count.',
      maxRank: 5,
      baseCost: 120,
      costGrowth: 1.55,
      ranks: [
        { splashAdd: 0.4, projectileCountAdd: 1 },
        { splashAdd: 0.35, damageAdd: 0.08 },
        { projectileCountAdd: 1, flags: ['flak_cloud'] },
        { splashAdd: 0.45, damageAdd: 0.1 },
        { projectileCountAdd: 1, splashAdd: 0.4, flags: ['flak_storm'] },
      ],
    },
    {
      id: 'proximity',
      name: 'Proximity Fuse',
      description: 'Detonate earlier, better anti-drone.',
      maxRank: 5,
      baseCost: 130,
      costGrowth: 1.58,
      ranks: [
        { splashAdd: 0.25, flags: ['prox_early'] },
        { fireRateAdd: 0.1, damageAdd: 0.08 },
        { flags: ['prox_smart'], damageAdd: 0.1 },
        { fireRateAdd: 0.12, splashAdd: 0.3 },
        { flags: ['prox_max'], damageAdd: 0.15 },
      ],
    },
    {
      id: 'magdump',
      name: 'Mag Dump',
      description: 'Burst RoF at heat cost.',
      maxRank: 4,
      baseCost: 140,
      costGrowth: 1.65,
      ranks: [
        { fireRateAdd: 0.2 },
        { fireRateAdd: 0.2, heatCoolAdd: -0.04 },
        { fireRateAdd: 0.25, flags: ['mag_dump'] },
        { fireRateAdd: 0.3, projectileCountAdd: 1, flags: ['mag_dump_max'] },
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
  unlock: { type: 'level', minLevel: 12 },
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
  },
  branches: [
    {
      id: 'warhead_t',
      name: 'Warhead',
      description: 'Massive damage and splash.',
      maxRank: 6,
      baseCost: 200,
      costGrowth: 1.65,
      ranks: [
        { damageAdd: 0.15, splashAdd: 0.3 },
        { damageAdd: 0.15, splashAdd: 0.25 },
        { damageAdd: 0.18, flags: ['torp_he'] },
        { splashAdd: 0.4, damageAdd: 0.12 },
        { damageAdd: 0.2 },
        { damageAdd: 0.25, splashAdd: 0.5, flags: ['torp_max'] },
      ],
    },
    {
      id: 'magnetic',
      name: 'Magnetic',
      description: 'Homing pull toward core / dense mass.',
      maxRank: 5,
      baseCost: 210,
      costGrowth: 1.62,
      ranks: [
        { flags: ['mag_seek'] },
        { damageAdd: 0.1, armorPierceAdd: 0.05 },
        { flags: ['mag_strong'], armorPierceAdd: 0.08 },
        { damageAdd: 0.12 },
        { flags: ['mag_lock'], armorPierceAdd: 0.12, damageAdd: 0.15 },
      ],
    },
    {
      id: 'cluster',
      name: 'Cluster',
      description: 'Splits into submunitions near impact.',
      maxRank: 4,
      baseCost: 230,
      costGrowth: 1.7,
      ranks: [
        { projectileCountAdd: 2, damageAdd: -0.25, flags: ['cluster_2'] },
        { splashAdd: 0.3, damageAdd: 0.08 },
        { projectileCountAdd: 1, flags: ['cluster_3'] },
        { damageAdd: 0.12, splashAdd: 0.35, flags: ['cluster_max'] },
      ],
    },
  ],
};

export const WEAPONS: WeaponDef[] = [pulse, rocket, missile, rail, flak, torpedo];

export const WEAPON_BY_ID: Record<string, WeaponDef> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w])
);

export function getWeaponDef(id: string): WeaponDef | undefined {
  return WEAPON_BY_ID[id];
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

export function branchRankCost(branch: UpgradeBranchDef, nextRank: number): number {
  // nextRank is 1-based
  if (nextRank < 1 || nextRank > branch.maxRank) return Infinity;
  return Math.round(branch.baseCost * Math.pow(branch.costGrowth, nextRank - 1));
}

/** Derive live stats from base + branch ranks. */
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
      if (e.flags) for (const f of e.flags) flags.add(f);
    }
  }

  s.damage = def.baseStats.damage * damageMul;
  s.fireRate = def.baseStats.fireRate * fireRateMul;
  s.chargeTime = def.baseStats.chargeTime * chargeMul;
  s.projectileCount = Math.max(1, Math.floor(s.projectileCount));
  // Soft-cap crit in data layer; DamageModel enforces hard caps at apply time
  s.critChance = Math.min(0.4, s.critChance);
  s.critMult = Math.min(2.25, s.critMult);

  return { ...s, flags };
}

/** Hardpoint unlock costs (Core Energy). Slot 0 free. */
export const HARDPOINT_UNLOCK = [
  { slot: 0, costCore: 0, minLevel: 1 },
  { slot: 1, costCore: 180, minLevel: 8 },
  { slot: 2, costCore: 520, minLevel: 18 },
] as const;

export const MAX_HARDPOINTS = 3;
