/**
 * Drone fleet — bay slots + Fighter / Bomber / Defender inventory.
 *
 * Loop: unlock bays → buy type units → drag into bay slots.
 * Numeric sources live in `constraints.ts`.
 */

import {
  BOMBER_ANTI_DRONE_MULTIPLIER,
  BOMBER_ARMOR_PIERCE,
  BOMBER_BASE_HIT_POINTS,
  BOMBER_BLOCK_DAMAGE_MULTIPLIER,
  BOMBER_FIRE_RATE_MULTIPLIER,
  BOMBER_FRONTAL_SHIELD,
  BOMBER_ORBIT_RADIUS_BIAS,
  BOMBER_POINT_DEFENSE_MULTIPLIER,
  BOMBER_SPLASH_RADIUS,
  BOMBER_TYPE_UNLOCK_COST_FRAGMENTS,
  BOMBER_UNIT_COST_FRAGMENTS,
  BOMBER_UNLOCK_LEVEL,
  DEFENDER_ANTI_DRONE_MULTIPLIER,
  DEFENDER_ARMOR_PIERCE,
  DEFENDER_BASE_HIT_POINTS,
  DEFENDER_BLOCK_DAMAGE_MULTIPLIER,
  DEFENDER_FIRE_RATE_MULTIPLIER,
  DEFENDER_FRONTAL_SHIELD,
  DEFENDER_ORBIT_RADIUS_BIAS,
  DEFENDER_POINT_DEFENSE_MULTIPLIER,
  DEFENDER_SPLASH_RADIUS,
  DEFENDER_TYPE_UNLOCK_COST_FRAGMENTS,
  DEFENDER_UNIT_COST_FRAGMENTS,
  DEFENDER_UNLOCK_LEVEL,
  DRONE_ALLY_PROTOCOL_COST_FRAGMENTS,
  DRONE_BAY_MAXIMUM,
  DRONE_BAY_STARTING_COUNT,
  DRONE_BAY_UNLOCK_COST_BASE,
  DRONE_BAY_UNLOCK_COST_GROWTH,
  DRONE_LEGACY_COST_BASE,
  DRONE_LEGACY_COST_GROWTH,
  DRONE_RESPAWN_SECONDS,
  DRONE_SHIELD_REGEN_DELAY_SECONDS,
  DRONE_SHIELD_REGEN_PER_SECOND,
  FIGHTER_ANTI_DRONE_MULTIPLIER,
  FIGHTER_ARMOR_PIERCE,
  FIGHTER_BASE_HIT_POINTS,
  FIGHTER_BLOCK_DAMAGE_MULTIPLIER,
  FIGHTER_FIRE_RATE_MULTIPLIER,
  FIGHTER_FRONTAL_SHIELD,
  FIGHTER_ORBIT_RADIUS_BIAS,
  FIGHTER_POINT_DEFENSE_MULTIPLIER,
  FIGHTER_SPLASH_RADIUS,
  FIGHTER_TYPE_UNLOCK_COST_FRAGMENTS,
  FIGHTER_UNIT_COST_FRAGMENTS,
  FIGHTER_UNLOCK_LEVEL,
} from './constraints';

export type DroneRole = 'fighter' | 'bomber' | 'defender';

export interface DroneRoleDef {
  id: DroneRole;
  name: string;
  description: string;
  blockDamageMul: number;
  splashRadius: number;
  armorPierce: number;
  antiDroneMul: number;
  pointDefenseMul: number;
  frontalShield: number;
  fireRateMul: number;
  orbitRadiusBias: number;
  baseHp: number;
  color: number;
  colorCss: string;
  /** Frag cost to buy one unit of this type (after type unlock). */
  unitCost: number;
  unlockCost: number;
  unlockLevel: number;
}

export const DRONE_ROLES: Record<DroneRole, DroneRoleDef> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    description:
      'Agile interceptor. Hunts enemy drones and kamikazes, then peels hull. Nucleus shots are defender / CIWS work.',
    blockDamageMul: FIGHTER_BLOCK_DAMAGE_MULTIPLIER,
    splashRadius: FIGHTER_SPLASH_RADIUS,
    armorPierce: FIGHTER_ARMOR_PIERCE,
    antiDroneMul: FIGHTER_ANTI_DRONE_MULTIPLIER,
    pointDefenseMul: FIGHTER_POINT_DEFENSE_MULTIPLIER,
    frontalShield: FIGHTER_FRONTAL_SHIELD,
    fireRateMul: FIGHTER_FIRE_RATE_MULTIPLIER,
    orbitRadiusBias: FIGHTER_ORBIT_RADIUS_BIAS,
    baseHp: FIGHTER_BASE_HIT_POINTS,
    color: 0xffd060,
    colorCss: '#ffd060',
    unitCost: FIGHTER_UNIT_COST_FRAGMENTS,
    unlockCost: FIGHTER_TYPE_UNLOCK_COST_FRAGMENTS,
    unlockLevel: FIGHTER_UNLOCK_LEVEL,
  },
  bomber: {
    id: 'bomber',
    name: 'Bomber',
    description:
      'Heavy stand-off craft. Slow plasma bombs with splash. Prefers exposed nucleus.',
    blockDamageMul: BOMBER_BLOCK_DAMAGE_MULTIPLIER,
    splashRadius: BOMBER_SPLASH_RADIUS,
    armorPierce: BOMBER_ARMOR_PIERCE,
    antiDroneMul: BOMBER_ANTI_DRONE_MULTIPLIER,
    pointDefenseMul: BOMBER_POINT_DEFENSE_MULTIPLIER,
    frontalShield: BOMBER_FRONTAL_SHIELD,
    fireRateMul: BOMBER_FIRE_RATE_MULTIPLIER,
    orbitRadiusBias: BOMBER_ORBIT_RADIUS_BIAS,
    baseHp: BOMBER_BASE_HIT_POINTS,
    color: 0xff6622,
    colorCss: '#ff6622',
    unitCost: BOMBER_UNIT_COST_FRAGMENTS,
    unlockCost: BOMBER_TYPE_UNLOCK_COST_FRAGMENTS,
    unlockLevel: BOMBER_UNLOCK_LEVEL,
  },
  defender: {
    id: 'defender',
    name: 'Defender',
    description:
      'Escort with a shield bubble. The only drone that shoots nucleus projectiles (spikes, blobs, mines).',
    blockDamageMul: DEFENDER_BLOCK_DAMAGE_MULTIPLIER,
    splashRadius: DEFENDER_SPLASH_RADIUS,
    armorPierce: DEFENDER_ARMOR_PIERCE,
    antiDroneMul: DEFENDER_ANTI_DRONE_MULTIPLIER,
    pointDefenseMul: DEFENDER_POINT_DEFENSE_MULTIPLIER,
    frontalShield: DEFENDER_FRONTAL_SHIELD,
    fireRateMul: DEFENDER_FIRE_RATE_MULTIPLIER,
    orbitRadiusBias: DEFENDER_ORBIT_RADIUS_BIAS,
    baseHp: DEFENDER_BASE_HIT_POINTS,
    color: 0x00ffaa,
    colorCss: '#00ffaa',
    unitCost: DEFENDER_UNIT_COST_FRAGMENTS,
    unlockCost: DEFENDER_TYPE_UNLOCK_COST_FRAGMENTS,
    unlockLevel: DEFENDER_UNLOCK_LEVEL,
  },
};

/** +50% over the original 12-bay hull. */
export const DRONE_BAY_MAX = DRONE_BAY_MAXIMUM;
export const DRONE_BAY_START = DRONE_BAY_STARTING_COUNT;
/** Ally Protocol — first drone purchase. */
export const FIRST_DRONE_COST = DRONE_ALLY_PROTOCOL_COST_FRAGMENTS;
/** Frag cost for bay slot n (0-indexed next purchase). ~25% below the old 150×1.48^n curve. */
export function droneBayUnlockCost(ownedBays: number): number {
  return Math.round(
    DRONE_BAY_UNLOCK_COST_BASE * Math.pow(DRONE_BAY_UNLOCK_COST_GROWTH, Math.max(0, ownedBays))
  );
}

export const DRONE_HARD_CAP = DRONE_BAY_MAX;

export const DRONE_COST = {
  base: DRONE_LEGACY_COST_BASE,
  growth: DRONE_LEGACY_COST_GROWTH,
} as const;

/** FRAG needed to field a second active drone (bay and/or another fighter). */
export function secondDroneAffordCost(state: DroneBayState): number {
  const equipped = state.slots.filter((s) => s != null).length;
  if (equipped >= 2) return 0;
  const freeFighter = freeInventory(state, 'fighter');
  const emptyBay = state.slots.some((s) => s == null);
  const unit = DRONE_ROLES.fighter.unitCost;
  const bay = droneBayUnlockCost(state.bays);
  if (emptyBay && freeFighter > 0) return 0;
  if (emptyBay) return unit;
  if (freeFighter > 0) return bay;
  return bay + unit;
}

export function canAffordSecondDrone(state: DroneBayState, fragments: number): boolean {
  if (state.slots.filter((s) => s != null).length >= 2) return false;
  return fragments >= secondDroneAffordCost(state);
}

/** @deprecated use droneBayUnlockCost / unit costs */
export function dronePurchaseCost(ownedCount: number): number {
  return droneBayUnlockCost(ownedCount);
}

export function droneRoleAssignCost(_role: DroneRole, _roleCount: number): number {
  return 0;
}

export const DRONE_BASE_RESPAWN = DRONE_RESPAWN_SECONDS;
export const DRONE_BASE_SHIELD_REGEN_DELAY = DRONE_SHIELD_REGEN_DELAY_SECONDS;
export const DRONE_BASE_SHIELD_REGEN_PER_SEC = DRONE_SHIELD_REGEN_PER_SECOND;

/**
 * Full drone meta state for save + shop.
 * - bays: unlocked slot count
 * - owned: inventory counts of each type (not necessarily equipped)
 * - slots: assignment into bays (null = empty bay)
 * - unlockedTypes: which types can be purchased
 */
export interface DroneBayState {
  bays: number;
  owned: Record<DroneRole, number>;
  slots: Array<DroneRole | null>;
  unlockedTypes: DroneRole[];
}

export function defaultDroneBayState(): DroneBayState {
  return {
    bays: 0,
    owned: { fighter: 0, bomber: 0, defender: 0 },
    slots: [],
    unlockedTypes: ['fighter'],
  };
}

/** Normalize slots length to bays; drop illegal types. */
export function normalizeDroneBayState(raw: Partial<DroneBayState> | null | undefined): DroneBayState {
  const base = defaultDroneBayState();
  if (!raw) return base;
  const bays = Math.min(
    DRONE_BAY_MAX,
    Math.max(0, Math.floor(raw.bays ?? 0))
  );
  const unlockedTypes: DroneRole[] = Array.isArray(raw.unlockedTypes)
    ? (raw.unlockedTypes.filter((t) => t in DRONE_ROLES) as DroneRole[])
    : ['fighter'];
  if (!unlockedTypes.includes('fighter')) unlockedTypes.unshift('fighter');

  const owned: Record<DroneRole, number> = {
    fighter: Math.max(0, Math.floor(raw.owned?.fighter ?? 0)),
    bomber: Math.max(0, Math.floor(raw.owned?.bomber ?? 0)),
    defender: Math.max(0, Math.floor(raw.owned?.defender ?? 0)),
  };

  const slots: Array<DroneRole | null> = [];
  const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
  for (let i = 0; i < bays; i++) {
    const s = rawSlots[i];
    if (s === 'fighter' || s === 'bomber' || s === 'defender') slots.push(s);
    else slots.push(null);
  }

  // Ensure equipped counts never exceed owned
  const used: Record<DroneRole, number> = { fighter: 0, bomber: 0, defender: 0 };
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    if (!r) continue;
    used[r]++;
    if (used[r] > owned[r] || !unlockedTypes.includes(r)) {
      slots[i] = null;
      used[r]--;
    }
  }

  return { bays, owned, slots, unlockedTypes };
}

/** Active roles from equipped bays (for spawning). */
export function expandBaySlots(state: DroneBayState): DroneRole[] {
  return state.slots.filter((s): s is DroneRole => s != null);
}

/** How many of a type are free in inventory (owned - equipped). */
export function freeInventory(state: DroneBayState, role: DroneRole): number {
  const equipped = state.slots.filter((s) => s === role).length;
  return Math.max(0, (state.owned[role] ?? 0) - equipped);
}

/**
 * Legacy bridge: tech droneCount → provisional bay state if save empty.
 */
export function fleetFromLegacyCount(count: number, unlocked: boolean): DroneBayState {
  const n = unlocked ? Math.min(DRONE_BAY_MAX, Math.max(0, count)) : 0;
  if (n <= 0) return defaultDroneBayState();
  const owned = { fighter: n, bomber: 0, defender: 0 };
  const slots: Array<DroneRole | null> = Array.from({ length: n }, () => 'fighter' as DroneRole);
  return {
    bays: n,
    owned,
    slots,
    unlockedTypes: ['fighter'],
  };
}

/** @deprecated name kept for DroneManager imports */
export type DroneFleetSnapshot = DroneBayState;

export function defaultFleet(): DroneBayState {
  return defaultDroneBayState();
}

export function expandFleetRoles(fleet: DroneBayState): DroneRole[] {
  return expandBaySlots(fleet);
}
