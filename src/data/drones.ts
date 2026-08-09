/**
 * Drone fleet — Fighter / Bomber / Defender.
 */

export type DroneRole = 'fighter' | 'bomber' | 'defender';

export interface DroneRoleDef {
  id: DroneRole;
  name: string;
  description: string;
  /** Base damage multiplier vs blocks */
  blockDamageMul: number;
  /** Splash radius for bomber plasma */
  splashRadius: number;
  /** Armor pierce 0–1 */
  armorPierce: number;
  /** Damage vs enemy drones / projectiles */
  antiDroneMul: number;
  /** Point-defense DPS feel (defender) */
  pointDefenseMul: number;
  /** Frontal shield contribution (defender) */
  frontalShield: number;
  /** Fire rate multiplier */
  fireRateMul: number;
  /** Orbit radius bias (higher = farther) */
  orbitRadiusBias: number;
  /** Base max HP */
  baseHp: number;
  color: number;
  colorCss: string;
  unlockLevel: number;
  unlockCoreCost: number;
}

export const DRONE_ROLES: Record<DroneRole, DroneRoleDef> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    description:
      'Agile interceptor. Hunts enemy drones & large projectiles. Light block damage.',
    blockDamageMul: 0.35,
    splashRadius: 0,
    armorPierce: 0,
    antiDroneMul: 1.5,
    pointDefenseMul: 1.2,
    frontalShield: 0,
    fireRateMul: 1.4,
    orbitRadiusBias: 0,
    baseHp: 40,
    color: 0xffd060,
    colorCss: '#ffd060',
    unlockLevel: 1,
    unlockCoreCost: 0,
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
    unlockLevel: 4,
    unlockCoreCost: 0,
  },
  defender: {
    id: 'defender',
    name: 'Defender',
    description:
      'Escort screen. Frontal shield for the ship + light point defense. Never mines the cube.',
    blockDamageMul: 0,
    splashRadius: 0,
    armorPierce: 0,
    antiDroneMul: 0.9,
    pointDefenseMul: 1.5,
    frontalShield: 28,
    fireRateMul: 1.1,
    orbitRadiusBias: -2.5,
    baseHp: 55,
    color: 0x00ffaa,
    colorCss: '#00ffaa',
    unlockLevel: 6,
    unlockCoreCost: 0,
  },
};

export const DRONE_HARD_CAP = 24;

export const DRONE_COST = {
  base: 45,
  growth: 1.42,
} as const;

export function dronePurchaseCost(ownedCount: number): number {
  return Math.round(DRONE_COST.base * Math.pow(DRONE_COST.growth, ownedCount));
}

export function droneRoleAssignCost(role: DroneRole, roleCount: number): number {
  const base = role === 'fighter' ? 0 : role === 'bomber' ? 45 : 55;
  return Math.round(base * Math.pow(1.25, roleCount));
}

/** Base respawn seconds before shop upgrades. */
export const DRONE_BASE_RESPAWN = 8;
export const DRONE_BASE_SHIELD_REGEN_DELAY = 4;
export const DRONE_BASE_SHIELD_REGEN_PER_SEC = 6;

export interface DroneFleetSnapshot {
  count: number;
  unlockedRoles: DroneRole[];
  roles: Partial<Record<DroneRole, number>>;
}

export function defaultFleet(): DroneFleetSnapshot {
  return {
    count: 0,
    unlockedRoles: ['fighter'],
    roles: { fighter: 0 },
  };
}

export function expandFleetRoles(fleet: DroneFleetSnapshot): DroneRole[] {
  const list: DroneRole[] = [];
  const order: DroneRole[] = ['fighter', 'bomber', 'defender'];
  for (const r of order) {
    const n = fleet.roles[r] ?? 0;
    for (let i = 0; i < n; i++) list.push(r);
  }
  while (list.length < fleet.count) list.push('fighter');
  return list.slice(0, Math.min(DRONE_HARD_CAP, fleet.count));
}

/**
 * Build fleet from tech droneCount — default mix tilts fighter-heavy.
 */
export function fleetFromLegacyCount(count: number, unlocked: boolean): DroneFleetSnapshot {
  const n = unlocked ? Math.min(DRONE_HARD_CAP, Math.max(0, count)) : 0;
  if (n <= 0) {
    return { count: 0, unlockedRoles: ['fighter'], roles: { fighter: 0 } };
  }
  // Distribute: majority fighters, then bombers, then defenders
  let fighters = Math.ceil(n * 0.5);
  let bombers = Math.floor(n * 0.3);
  let defenders = n - fighters - bombers;
  if (defenders < 0) {
    fighters += defenders;
    defenders = 0;
  }
  const unlockedRoles: DroneRole[] = ['fighter'];
  if (bombers > 0) unlockedRoles.push('bomber');
  if (defenders > 0) unlockedRoles.push('defender');
  return {
    count: n,
    unlockedRoles,
    roles: { fighter: fighters, bomber: bombers, defender: defenders },
  };
}
