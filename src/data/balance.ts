/**
 * Central balance curves and hard caps.
 * All combat/economy systems should import from here — no magic numbers in systems.
 */

// ---------------------------------------------------------------------------
// Hard caps (competitor-informed; see PHASED_IMPLEMENTATION_PLAN §1)
// ---------------------------------------------------------------------------

/** Hyperbolic armor constant: effective = rating / (rating + ARMOR_K) */
export const ARMOR_K = 100;

/** Max damage reduction from armor (hard ceiling). */
export const maxEffectiveArmor = 0.55;

export const maxCritChance = 0.4;
export const maxCritMult = 2.25;
export const maxFireRateMul = 2.75;
export const maxOrbitSpeedMul = 1.85;
export const maxFragmentMul = 2.25;

/** Absolute drone fleet cap. Cost curve is the practical limit. */
export const maxDrones = 24;

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
  return Math.floor(80 * Math.pow(1.42, owned));
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
  return 1 + (L - 1) * 0.12 + Math.pow(L - 1, 1.55) * 0.018;
}

/**
 * Relative clear-reward multiplier vs level 1.
 * Sublinear vs difficulty so income does not outpace HP.
 *
 * L1 → 1.0, L10 ≈ 2.1, L20 ≈ 3.0, L30 ≈ 3.7
 */
export function rewardScale(levelId: number): number {
  const L = Math.max(1, levelId);
  return 1 + Math.pow(L - 1, 0.72) * 0.28;
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
  { slot: 1, ascensionGate: 1, coreEnergyCost: 160, label: 'Hardpoint Beta' },
  { slot: 2, ascensionGate: 2, coreEnergyCost: 480, label: 'Hardpoint Gamma' },
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
export const DEFENSE_NONE_MAX = 4;

/** Core light shield bubble starts. */
export const DEFENSE_SHIELD_MIN = 5;
export const DEFENSE_SHIELD_MAX = 7;

/** First turret band. */
export const DEFENSE_TURRET_MIN = 8;
export const DEFENSE_TURRET_MAX = 10;

/** Face shields + multi-turret. */
export const DEFENSE_FACE_MIN = 11;
export const DEFENSE_FACE_MAX = 14;

/** Enemy drones join. */
export const DEFENSE_DRONES_MIN = 15;
export const DEFENSE_DRONES_MAX = 18;

/** Layered elite mix. */
export const DEFENSE_ELITE_MIN = 19;
export const DEFENSE_ADAPTIVE_MIN = 26;

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
export const INTRO_LEVEL_MAX = 3;

export function isIntroLevel(levelId: number): boolean {
  return levelId >= 1 && levelId <= INTRO_LEVEL_MAX;
}

// ---------------------------------------------------------------------------
// Ship vitals baselines (P3 fills systems; defaults for save v2)
// ---------------------------------------------------------------------------

export const VITALS_BASE = {
  hullHp: 100,
  maxHull: 100,
  shield: 0,
  maxShield: 0,
  armorRating: 0,
  /** Seconds without damage before shield starts recharging */
  shieldRechargeDelay: 3,
  shieldRechargePerSec: 8,
} as const;

/** Starting hardpoints unlocked (HP0 only). */
export const HARDPOINTS_START = 1;
export const HARDPOINTS_MAX = 3;
