/**
 * Drone fleet definitions — roles, costs, caps.
 */

export type DroneRole = 'miner' | 'breaker' | 'fighter' | 'guardian';

export interface DroneRoleDef {
  id: DroneRole;
  name: string;
  description: string;
  /** Base damage multiplier vs blocks */
  blockDamageMul: number;
  /** Armor pierce 0–1 */
  armorPierce: number;
  /** Damage vs enemy drones */
  antiDroneMul: number;
  /** Shield repair per second to player (guardian) */
  shieldRepairPerSec: number;
  /** Fire rate multiplier */
  fireRateMul: number;
  color: number;
  colorCss: string;
  /** Min level / unlock shop flag */
  unlockLevel: number;
  unlockCoreCost: number;
}

export const DRONE_ROLES: Record<DroneRole, DroneRoleDef> = {
  miner: {
    id: 'miner',
    name: 'Miner',
    description: 'Standard block clear. Weak vs siege armor.',
    blockDamageMul: 1,
    armorPierce: 0,
    antiDroneMul: 0.15,
    shieldRepairPerSec: 0,
    fireRateMul: 1,
    color: 0xff00aa,
    colorCss: '#ff00aa',
    unlockLevel: 1,
    unlockCoreCost: 0,
  },
  breaker: {
    id: 'breaker',
    name: 'Breaker',
    description: 'Partial armor pierce for heavy / siege blocks.',
    blockDamageMul: 0.85,
    armorPierce: 0.45,
    antiDroneMul: 0.2,
    shieldRepairPerSec: 0,
    fireRateMul: 0.9,
    color: 0x4488ff,
    colorCss: '#4488ff',
    unlockLevel: 8,
    unlockCoreCost: 40,
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    description: 'Engages enemy drones. Ignores blocks mostly.',
    blockDamageMul: 0.12,
    armorPierce: 0,
    antiDroneMul: 1.4,
    shieldRepairPerSec: 0,
    fireRateMul: 1.35,
    color: 0xffd060,
    colorCss: '#ffd060',
    unlockLevel: 12,
    unlockCoreCost: 80,
  },
  guardian: {
    id: 'guardian',
    name: 'Guardian',
    description: 'Repairs player shield slowly; light block fire.',
    blockDamageMul: 0.35,
    armorPierce: 0,
    antiDroneMul: 0.4,
    shieldRepairPerSec: 2.5,
    fireRateMul: 0.7,
    color: 0x00ffaa,
    colorCss: '#00ffaa',
    unlockLevel: 10,
    unlockCoreCost: 60,
  },
};

export const DRONE_HARD_CAP = 24;

/** cost(n) = base * growth^n  for the n-th drone (0-indexed purchase). */
export const DRONE_COST = {
  base: 45,
  growth: 1.42,
} as const;

export function dronePurchaseCost(ownedCount: number): number {
  return Math.round(DRONE_COST.base * Math.pow(DRONE_COST.growth, ownedCount));
}

/** Cost to convert / assign a drone to a role (fragments). */
export function droneRoleAssignCost(role: DroneRole, roleCount: number): number {
  const base = role === 'miner' ? 0 : role === 'breaker' ? 30 : role === 'guardian' ? 40 : 50;
  return Math.round(base * Math.pow(1.25, roleCount));
}

export interface DroneFleetSnapshot {
  /** Total drones owned (capped at 24) */
  count: number;
  /** Role unlocked flags */
  unlockedRoles: DroneRole[];
  /** Assignment counts per role; sum should equal count */
  roles: Partial<Record<DroneRole, number>>;
}

export function defaultFleet(): DroneFleetSnapshot {
  return {
    count: 0,
    unlockedRoles: ['miner'],
    roles: { miner: 0 },
  };
}

/** Expand role counts into an ordered list of roles for spawn. */
export function expandFleetRoles(fleet: DroneFleetSnapshot): DroneRole[] {
  const list: DroneRole[] = [];
  const order: DroneRole[] = ['miner', 'breaker', 'fighter', 'guardian'];
  for (const r of order) {
    const n = fleet.roles[r] ?? 0;
    for (let i = 0; i < n; i++) list.push(r);
  }
  // Pad / trim to count
  while (list.length < fleet.count) list.push('miner');
  return list.slice(0, Math.min(DRONE_HARD_CAP, fleet.count));
}

/**
 * Build fleet from legacy PlayerStats.droneCount (all miners).
 * Used until shop wires full role UI.
 */
export function fleetFromLegacyCount(count: number, unlocked: boolean): DroneFleetSnapshot {
  const n = unlocked ? Math.min(DRONE_HARD_CAP, Math.max(0, count)) : 0;
  return {
    count: n,
    unlockedRoles: ['miner'],
    roles: { miner: n },
  };
}
