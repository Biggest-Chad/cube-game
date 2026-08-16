/**
 * Central balance curves and hard caps.
 * All combat/economy systems should import from here — no magic numbers in systems.
 * Numeric sources live in `constraints.ts`.
 */

import {
  ARMOR_HYPERBOLIC_K,
  ARMOR_MAX_EFFECTIVE_REDUCTION,
  CRIT_CHANCE_HARD_CAP,
  CRIT_MULT_HARD_CAP,
  DEFENSE_ADAPTIVE_MIN_LEVEL,
  DEFENSE_DRONES_MAX_LEVEL,
  DEFENSE_FACE_MAX_LEVEL,
  DEFENSE_NONE_MAX_LEVEL,
  DEFENSE_SHIELD_MAX_LEVEL,
  DEFENSE_SHIELD_MIN_LEVEL,
  DEFENSE_TURRET_MAX_LEVEL,
  DEFENSE_TURRET_MIN_LEVEL,
  DEFENSE_FACE_MIN_LEVEL,
  DEFENSE_DRONES_MIN_LEVEL,
  DEFENSE_ELITE_MIN_LEVEL,
  DRONE_ABSOLUTE_HARD_CAP,
  DRONE_LEGACY_SOFT_COST_BASE,
  DRONE_LEGACY_COST_GROWTH,
  FIRE_RATE_MULTIPLIER_HARD_CAP,
  FRAGMENT_MULTIPLIER_HARD_CAP,
  HARDPOINT_BETA_ASCENSION_GATE,
  HARDPOINT_BETA_UNLOCK_COST_CORE,
  HARDPOINT_GAMMA_ASCENSION_GATE,
  HARDPOINT_GAMMA_UNLOCK_COST_CORE,
  HARDPOINTS_MAXIMUM,
  HARDPOINTS_STARTING_UNLOCKED,
  INTRO_LEVEL_MAXIMUM,
  LEVEL_HP_SCALE_LINEAR,
  LEVEL_HP_SCALE_POWER,
  LEVEL_HP_SCALE_POWER_WEIGHT,
  LEVEL_REWARD_SCALE_POWER,
  LEVEL_REWARD_SCALE_WEIGHT,
  ORBIT_SPEED_MULTIPLIER_HARD_CAP,
  SHIP_BASE_ARMOR_RATING,
  SHIP_BASE_HULL_HIT_POINTS,
  SHIP_BASE_MAX_HULL,
  SHIP_BASE_MAX_SHIELD,
  SHIP_BASE_SHIELD,
  SHIP_SHIELD_RECHARGE_DELAY_SECONDS,
  SHIP_SHIELD_RECHARGE_PER_SECOND,
} from './constraints';

// ---------------------------------------------------------------------------
// Hard caps (competitor-informed; see PHASED_IMPLEMENTATION_PLAN §1)
// ---------------------------------------------------------------------------

/** Hyperbolic armor constant: effective = rating / (rating + ARMOR_K) */
export const ARMOR_K = ARMOR_HYPERBOLIC_K;

/** Max damage reduction from armor (hard ceiling). */
export const maxEffectiveArmor = ARMOR_MAX_EFFECTIVE_REDUCTION;

export const maxCritChance = CRIT_CHANCE_HARD_CAP;
export const maxCritMult = CRIT_MULT_HARD_CAP;
export const maxFireRateMul = FIRE_RATE_MULTIPLIER_HARD_CAP;
export const maxOrbitSpeedMul = ORBIT_SPEED_MULTIPLIER_HARD_CAP;
export const maxFragmentMul = FRAGMENT_MULTIPLIER_HARD_CAP;

/** Absolute drone fleet cap. Cost curve is the practical limit. */
export const maxDrones = DRONE_ABSOLUTE_HARD_CAP;

// ---------------------------------------------------------------------------
// Armor DR
// ---------------------------------------------------------------------------

/**
 * Hyperbolic armor → effective damage reduction, hard-capped at maxEffectiveArmor.
 * Never use uncapped percent absorb.
 */
export function armorEffective(rating: number): number {
  if (!(rating > 0)) return 0;
  const raw = rating / (rating + ARMOR_K);
  return raw > maxEffectiveArmor ? maxEffectiveArmor : raw;
}

// ---------------------------------------------------------------------------
// Drones
// ---------------------------------------------------------------------------

/**
 * Fragment cost of the next drone when the player already owns `n` drones.
 * Infinite geometric curve — soft soft-cap long before maxDrones.
 */
export function droneCost(n: number): number {
  const owned = Math.max(0, Math.floor(n));
  return Math.floor(DRONE_LEGACY_SOFT_COST_BASE * Math.pow(DRONE_LEGACY_COST_GROWTH, owned));
}

// ---------------------------------------------------------------------------
// Level scaling helpers (P2 consumers retune levels against these)
// ---------------------------------------------------------------------------

/**
 * Relative block-HP multiplier vs level 1.
 * Grows faster than linear so upgrades become required by mid-game.
 *
 * L1 → 1.0, L5 ≈ 1.9, L10 ≈ 3.4, L20 ≈ 8.5, L30 ≈ 18+
 */
export function levelHpScale(levelId: number): number {
  const L = Math.max(1, levelId);
  // Mild early, steeper mid: quadratic-ish with soft floor
  return 1 + (L - 1) * LEVEL_HP_SCALE_LINEAR + Math.pow(L - 1, LEVEL_HP_SCALE_POWER) * LEVEL_HP_SCALE_POWER_WEIGHT;
}

/**
 * Relative clear-reward multiplier vs level 1.
 * Sublinear vs difficulty so income does not outpace HP.
 *
 * L1 → 1.0, L10 ≈ 2.1, L20 ≈ 3.0, L30 ≈ 3.7
 */
export function rewardScale(levelId: number): number {
  const L = Math.max(1, levelId);
  return 1 + Math.pow(L - 1, LEVEL_REWARD_SCALE_POWER) * LEVEL_REWARD_SCALE_WEIGHT;
}

/**
 * Soft-cap a multiplicative stack (e.g. fragment mults) against a hard ceiling.
 */
export function clampMult(value: number, hardCap: number): number {
  if (!(value > 0)) return 0;
  return value > hardCap ? hardCap : value;
}

// ---------------------------------------------------------------------------
// Hardpoint unlocks (Core Energy sinks; HP0 free at start)
// ---------------------------------------------------------------------------

export interface HardpointUnlockDef {
  /** Slot index 0..2 */
  slot: number;
  /** Minimum Ascension tier required (Evolve count). */
  ascensionGate: number;
  /** Core Energy cost */
  coreEnergyCost: number;
  label: string;
}

/** HP0 free. HP1/HP2 gated by Ascension + Core (see weapons.HARDPOINT_UNLOCK). */
export const HARDPOINT_UNLOCKS: readonly HardpointUnlockDef[] = [
  { slot: 0, ascensionGate: 0, coreEnergyCost: 0, label: 'Hardpoint Alpha' },
  {
    slot: 1,
    ascensionGate: HARDPOINT_BETA_ASCENSION_GATE,
    coreEnergyCost: HARDPOINT_BETA_UNLOCK_COST_CORE,
    label: 'Hardpoint Beta',
  },
  {
    slot: 2,
    ascensionGate: HARDPOINT_GAMMA_ASCENSION_GATE,
    coreEnergyCost: HARDPOINT_GAMMA_UNLOCK_COST_CORE,
    label: 'Hardpoint Gamma',
  },
] as const;

export function hardpointUnlockCost(slot: number): number {
  const def = HARDPOINT_UNLOCKS.find((h) => h.slot === slot);
  return def?.coreEnergyCost ?? 0;
}

export function hardpointAscensionGate(slot: number): number {
  const def = HARDPOINT_UNLOCKS.find((h) => h.slot === slot);
  return def?.ascensionGate ?? 999;
}

/** @deprecated use hardpointAscensionGate */
export function hardpointLevelGate(slot: number): number {
  return hardpointAscensionGate(slot);
}

// ---------------------------------------------------------------------------
// Intro / cube-defense level thresholds (P7/P8 staging)
// ---------------------------------------------------------------------------

/** Levels with no cube self-defense. */
export const DEFENSE_NONE_MAX = DEFENSE_NONE_MAX_LEVEL;

/** Core light shield bubble starts. */
export const DEFENSE_SHIELD_MIN = DEFENSE_SHIELD_MIN_LEVEL;
export const DEFENSE_SHIELD_MAX = DEFENSE_SHIELD_MAX_LEVEL;

/** First turret band. */
export const DEFENSE_TURRET_MIN = DEFENSE_TURRET_MIN_LEVEL;
export const DEFENSE_TURRET_MAX = DEFENSE_TURRET_MAX_LEVEL;

/** Face shields + multi-turret. */
export const DEFENSE_FACE_MIN = DEFENSE_FACE_MIN_LEVEL;
export const DEFENSE_FACE_MAX = DEFENSE_FACE_MAX_LEVEL;

/** Enemy drones join. */
export const DEFENSE_DRONES_MIN = DEFENSE_DRONES_MIN_LEVEL;
export const DEFENSE_DRONES_MAX = DEFENSE_DRONES_MAX_LEVEL;

/** Layered elite mix. */
export const DEFENSE_ELITE_MIN = DEFENSE_ELITE_MIN_LEVEL;
export const DEFENSE_ADAPTIVE_MIN = DEFENSE_ADAPTIVE_MIN_LEVEL;

export type DefenseTier =
  | 'none'
  | 'core_shield'
  | 'turret'
  | 'face_shields'
  | 'enemy_drones'
  | 'layered'
  | 'adaptive';

export function defenseTierForLevel(levelId: number): DefenseTier {
  const L = Math.max(1, levelId);
  if (L <= DEFENSE_NONE_MAX) return 'none';
  if (L <= DEFENSE_SHIELD_MAX) return 'core_shield';
  if (L <= DEFENSE_TURRET_MAX) return 'turret';
  if (L <= DEFENSE_FACE_MAX) return 'face_shields';
  if (L <= DEFENSE_DRONES_MAX) return 'enemy_drones';
  if (L < DEFENSE_ADAPTIVE_MIN) return 'layered';
  return 'adaptive';
}

/** Tutorial / intro cinematic levels (deliberate pace, no defenses). */
export const INTRO_LEVEL_MAX = INTRO_LEVEL_MAXIMUM;

export function isIntroLevel(levelId: number): boolean {
  return levelId >= 1 && levelId <= INTRO_LEVEL_MAX;
}

// ---------------------------------------------------------------------------
// Ship vitals baselines (P3 fills systems; defaults for save v2)
// ---------------------------------------------------------------------------

export const VITALS_BASE = {
  hullHp: SHIP_BASE_HULL_HIT_POINTS,
  maxHull: SHIP_BASE_MAX_HULL,
  shield: SHIP_BASE_SHIELD,
  maxShield: SHIP_BASE_MAX_SHIELD,
  armorRating: SHIP_BASE_ARMOR_RATING,
  /** Seconds without damage before shield starts recharging */
  shieldRechargeDelay: SHIP_SHIELD_RECHARGE_DELAY_SECONDS,
  shieldRechargePerSec: SHIP_SHIELD_RECHARGE_PER_SECOND,
} as const;

/** Starting hardpoints unlocked (HP0 only). */
export const HARDPOINTS_START = HARDPOINTS_STARTING_UNLOCKED;
export const HARDPOINTS_MAX = HARDPOINTS_MAXIMUM;
