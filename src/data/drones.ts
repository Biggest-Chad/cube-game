/**
 * Drone fleet — bay slots + Fighter / Bomber / Defender inventory.
 *
 * Loop: unlock bays → buy type units → drag into bay slots.
 */

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
      'Agile interceptor. Hunts enemy drones & large projectiles. Light block damage.',
    blockDamageMul: 0.65625,
    splashRadius: 0,
    armorPierce: 0,
    antiDroneMul: 2.25,
    pointDefenseMul: 1.2,
    frontalShield: 0,
    fireRateMul: 1.4,
    orbitRadiusBias: 0,
    baseHp: 40,
    color: 0xffd060,
    colorCss: '#ffd060',
    unitCost: 90,
    unlockCost: 0,
    unlockLevel: 1,
  },
  bomber: {
    id: 'bomber',
    name: 'Bomber',
    description:
      'Heavy stand-off craft. Slow plasma bombs with splash. Prefers exposed nucleus.',
    blockDamageMul: 1.65,
    splashRadius: 1.6,
    armorPierce: 0.2,
    antiDroneMul: 0.15,
    pointDefenseMul: 0,
    frontalShield: 0,
    fireRateMul: 0.38,
    orbitRadiusBias: 4.5,
    baseHp: 70,
    color: 0xff6622,
    colorCss: '#ff6622',
    unitCost: 150,
    unlockCost: 135,
    unlockLevel: 4,
  },
  defender: {
    id: 'defender',
    name: 'Defender',
    description:
      'Escort with a tight personal shield bubble + point defense. Does not mine the cube.',
    blockDamageMul: 0,
    splashRadius: 0,
    armorPierce: 0,
    antiDroneMul: 0.9,
    pointDefenseMul: 1.5,
    frontalShield: 22,
    fireRateMul: 1.1,
    orbitRadiusBias: -2.5,
    baseHp: 55,
    color: 0x00ffaa,
    colorCss: '#00ffaa',
    unitCost: 165,
    unlockCost: 180,
    unlockLevel: 6,
  },
};

/** +50% over the original 12-bay hull. */
export const DRONE_BAY_MAX = 18;
export const DRONE_BAY_START = 0;
/** Ally Protocol — first drone purchase. */
export const FIRST_DRONE_COST = 100;
/** Frag cost for bay slot n (0-indexed next purchase). ~25% below the old 150×1.48^n curve. */
export function droneBayUnlockCost(ownedBays: number): number {
  return Math.round(113 * Math.pow(1.48, Math.max(0, ownedBays)));
}

export const DRONE_HARD_CAP = DRONE_BAY_MAX;

export const DRONE_COST = {
  base: 34,
  growth: 1.42,
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

export const DRONE_BASE_RESPAWN = 8;
export const DRONE_BASE_SHIELD_REGEN_DELAY = 4;
export const DRONE_BASE_SHIELD_REGEN_PER_SEC = 6;

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
