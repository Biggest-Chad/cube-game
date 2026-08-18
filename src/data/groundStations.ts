/**
 * Ground station loadout — 4 fixed pads, weapon types unlock/buy/assign like drones.
 */
import {
  GROUND_ARTILLERY_DAMAGE,
  GROUND_ARTILLERY_FIRE_RATE,
  GROUND_ARTILLERY_SPLASH,
  GROUND_ARTILLERY_UNIT_COST,
  GROUND_ARTILLERY_UNLOCK_COST,
  GROUND_ARTILLERY_UNLOCK_LEVEL,
  GROUND_CIWS_DAMAGE,
  GROUND_CIWS_FIRE_RATE,
  GROUND_CIWS_SPREAD,
  GROUND_CIWS_UNIT_COST,
  GROUND_CIWS_UNLOCK_COST,
  GROUND_CIWS_UNLOCK_LEVEL,
  GROUND_SAM_DAMAGE,
  GROUND_SAM_FIRE_RATE,
  GROUND_SAM_SPLASH,
  GROUND_SAM_SWARM_COUNT,
  GROUND_SAM_UNIT_COST,
  GROUND_SAM_UNLOCK_COST,
  GROUND_SAM_UNLOCK_LEVEL,
  GROUND_STATION_COUNT,
  GROUND_WEAPON_UPGRADE_BASE_COST,
  GROUND_WEAPON_UPGRADE_COST_GROWTH,
  GROUND_WEAPON_UPGRADE_MAX_RANK,
} from './constraints';

export type GroundWeaponId = 'sam' | 'artillery' | 'ciws';

export interface GroundWeaponDef {
  id: GroundWeaponId;
  name: string;
  description: string;
  unitCost: number;
  unlockCost: number;
  unlockLevel: number;
  damage: number;
  fireRate: number;
  splash: number;
  color: number;
  colorCss: string;
}

export const GROUND_WEAPONS: Record<GroundWeaponId, GroundWeaponDef> = {
  sam: {
    id: 'sam',
    name: 'SAM Swarm',
    description: 'Lock-on swarm missiles. Each bird picks its own lattice target.',
    unitCost: GROUND_SAM_UNIT_COST,
    unlockCost: GROUND_SAM_UNLOCK_COST,
    unlockLevel: GROUND_SAM_UNLOCK_LEVEL,
    damage: GROUND_SAM_DAMAGE,
    fireRate: GROUND_SAM_FIRE_RATE,
    splash: GROUND_SAM_SPLASH,
    color: 0x88ff66,
    colorCss: '#88ff66',
  },
  artillery: {
    id: 'artillery',
    name: 'Plasma Howitzer',
    description: 'Heavy arcing plasma. Slow, huge splash, cracks clusters.',
    unitCost: GROUND_ARTILLERY_UNIT_COST,
    unlockCost: GROUND_ARTILLERY_UNLOCK_COST,
    unlockLevel: GROUND_ARTILLERY_UNLOCK_LEVEL,
    damage: GROUND_ARTILLERY_DAMAGE,
    fireRate: GROUND_ARTILLERY_FIRE_RATE,
    splash: GROUND_ARTILLERY_SPLASH,
    color: 0xff66cc,
    colorCss: '#ff66cc',
  },
  ciws: {
    id: 'ciws',
    name: 'Phalanx CIWS',
    description: 'Point defense. Priority fire on nucleus projectiles, then drones.',
    unitCost: GROUND_CIWS_UNIT_COST,
    unlockCost: GROUND_CIWS_UNLOCK_COST,
    unlockLevel: GROUND_CIWS_UNLOCK_LEVEL,
    damage: GROUND_CIWS_DAMAGE,
    fireRate: GROUND_CIWS_FIRE_RATE,
    splash: 0,
    color: 0xffd060,
    colorCss: '#ffd060',
  },
};

export const GROUND_WEAPON_IDS: GroundWeaponId[] = ['sam', 'artillery', 'ciws'];

export interface GroundStationState {
  owned: Record<GroundWeaponId, number>;
  slots: Array<GroundWeaponId | null>;
  unlockedTypes: GroundWeaponId[];
  ranks: Record<GroundWeaponId, number>;
}

export function defaultGroundStationState(): GroundStationState {
  return {
    owned: { sam: 0, artillery: 0, ciws: 0 },
    slots: [null, null, null, null],
    unlockedTypes: [],
    ranks: { sam: 0, artillery: 0, ciws: 0 },
  };
}

export function normalizeGroundStationState(
  raw: Partial<GroundStationState> | null | undefined
): GroundStationState {
  const base = defaultGroundStationState();
  if (!raw) return base;
  const unlockedTypes = Array.isArray(raw.unlockedTypes)
    ? (raw.unlockedTypes.filter((t) => t in GROUND_WEAPONS) as GroundWeaponId[])
    : [];
  const owned: Record<GroundWeaponId, number> = {
    sam: Math.max(0, Math.floor(raw.owned?.sam ?? 0)),
    artillery: Math.max(0, Math.floor(raw.owned?.artillery ?? 0)),
    ciws: Math.max(0, Math.floor(raw.owned?.ciws ?? 0)),
  };
  const ranks: Record<GroundWeaponId, number> = {
    sam: clampRank(raw.ranks?.sam),
    artillery: clampRank(raw.ranks?.artillery),
    ciws: clampRank(raw.ranks?.ciws),
  };
  const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: Array<GroundWeaponId | null> = [];
  const used: Record<GroundWeaponId, number> = { sam: 0, artillery: 0, ciws: 0 };
  for (let i = 0; i < GROUND_STATION_COUNT; i++) {
    const s = rawSlots[i];
    if (s === 'sam' || s === 'artillery' || s === 'ciws') {
      used[s]++;
      if (used[s] > owned[s] || !unlockedTypes.includes(s)) slots.push(null);
      else slots.push(s);
    } else {
      slots.push(null);
    }
  }
  return { owned, slots, unlockedTypes, ranks };
}

function clampRank(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(GROUND_WEAPON_UPGRADE_MAX_RANK, Math.floor(n)));
}

export function freeGroundInventory(state: GroundStationState, id: GroundWeaponId): number {
  const equipped = state.slots.filter((s) => s === id).length;
  return Math.max(0, (state.owned[id] ?? 0) - equipped);
}

export function groundUpgradeCost(nextRank: number): number {
  if (nextRank < 1 || nextRank > GROUND_WEAPON_UPGRADE_MAX_RANK) return Infinity;
  return Math.round(
    GROUND_WEAPON_UPGRADE_BASE_COST * Math.pow(GROUND_WEAPON_UPGRADE_COST_GROWTH, nextRank - 1)
  );
}

export function groundWeaponStats(
  id: GroundWeaponId,
  rank: number
): { damage: number; fireRate: number; splash: number; swarm: number; spread: number } {
  const def = GROUND_WEAPONS[id];
  const r = Math.max(0, rank);
  let dmgMul = 1;
  let rateMul = 1;
  for (let i = 1; i <= r; i++) {
    dmgMul += i <= 10 ? 0.1 : i <= 20 ? 0.05 : 0.025;
    rateMul += i <= 10 ? 0.07 : i <= 20 ? 0.035 : 0.015;
  }
  const dmg = def.damage * dmgMul;
  const rate = def.fireRate * rateMul;
  return {
    damage: dmg,
    fireRate: rate,
    splash: def.splash,
    swarm: id === 'sam' ? GROUND_SAM_SWARM_COUNT + Math.floor(r / 2) : 1,
    spread: id === 'ciws' ? GROUND_CIWS_SPREAD : 0,
  };
}
