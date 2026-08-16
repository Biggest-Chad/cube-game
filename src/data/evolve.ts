/**
 * Evolve (Ascension) — permanent hull baselines + combat shop retrain loop.
 * Brand: EVOLVE / Ascension Tier, not generic "prestige".
 * Numeric sources live in `constraints.ts`.
 */

import {
  EVOLVE_BASELINE_DAMAGE_SOFT_CAP,
  EVOLVE_CORE_GRANT_BASE,
  EVOLVE_CORE_GRANT_PER_TIER,
  EVOLVE_COST_PER_TIER,
  EVOLVE_MIN_LEVEL_BASE,
  EVOLVE_MIN_LEVEL_PER_ASCENSION,
  EVOLVE_TIER_1_2_DAMAGE_MULTIPLIER,
  EVOLVE_TIER_1_2_DRONE_DAMAGE_MULTIPLIER,
  EVOLVE_TIER_1_2_HULL_MULTIPLIER,
  EVOLVE_TIER_1_2_IDLE_RATE_MULTIPLIER,
  EVOLVE_TIER_1_2_ORBIT_SPEED_MULTIPLIER,
  EVOLVE_TIER_1_2_SHIELD_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_DAMAGE_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_DRONE_DAMAGE_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_HULL_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_IDLE_RATE_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_ORBIT_SPEED_MULTIPLIER,
  EVOLVE_TIER_3_PLUS_SHIELD_MULTIPLIER,
  EVOLVE_UI_PREVIEW_RATIO,
} from './constraints';

export interface AscensionBaseline {
  damageMul: number;
  hullMul: number;
  shieldMul: number;
  droneDamageMul: number;
  orbitSpeedMul: number;
  idleRateMul: number;
}

export const BASELINE_IDENTITY: AscensionBaseline = {
  damageMul: 1,
  hullMul: 1,
  shieldMul: 1,
  droneDamageMul: 1,
  orbitSpeedMul: 1,
  idleRateMul: 1,
};

/** Per-tier permanent bonuses applied when ascending into that tier (tier 1, 2, …). */
export interface TierBonus {
  damageMul: number;
  hullMul: number;
  shieldMul: number;
  droneDamageMul: number;
  orbitSpeedMul: number;
  idleRateMul: number;
}

/** Tier 1–2 table from design; 3+ soft-step. */
const TIER_1_2: TierBonus = {
  damageMul: EVOLVE_TIER_1_2_DAMAGE_MULTIPLIER,
  hullMul: EVOLVE_TIER_1_2_HULL_MULTIPLIER,
  shieldMul: EVOLVE_TIER_1_2_SHIELD_MULTIPLIER,
  droneDamageMul: EVOLVE_TIER_1_2_DRONE_DAMAGE_MULTIPLIER,
  orbitSpeedMul: EVOLVE_TIER_1_2_ORBIT_SPEED_MULTIPLIER,
  idleRateMul: EVOLVE_TIER_1_2_IDLE_RATE_MULTIPLIER,
};

const TIER_3_PLUS: TierBonus = {
  damageMul: EVOLVE_TIER_3_PLUS_DAMAGE_MULTIPLIER,
  hullMul: EVOLVE_TIER_3_PLUS_HULL_MULTIPLIER,
  shieldMul: EVOLVE_TIER_3_PLUS_SHIELD_MULTIPLIER,
  droneDamageMul: EVOLVE_TIER_3_PLUS_DRONE_DAMAGE_MULTIPLIER,
  orbitSpeedMul: EVOLVE_TIER_3_PLUS_ORBIT_SPEED_MULTIPLIER,
  idleRateMul: EVOLVE_TIER_3_PLUS_IDLE_RATE_MULTIPLIER,
};

/** Soft cap on stacked damage baseline. */
export const BASELINE_DAMAGE_SOFT_CAP = EVOLVE_BASELINE_DAMAGE_SOFT_CAP;

/** evolveCost(tier) = EVOLVE_COST_PER_TIER * (tier + 1) — cost to go from `tier` → tier+1. */
export function evolveCost(currentAscension: number): number {
  const t = Math.max(0, Math.floor(currentAscension));
  return EVOLVE_COST_PER_TIER * (t + 1);
}

/** Soft gate: highestLevel >= EVOLVE_MIN_LEVEL_BASE + ascension * EVOLVE_MIN_LEVEL_PER_ASCENSION */
export function evolveMinLevel(currentAscension: number): number {
  return EVOLVE_MIN_LEVEL_BASE + Math.max(0, Math.floor(currentAscension)) * EVOLVE_MIN_LEVEL_PER_ASCENSION;
}

/**
 * Core Energy grant on reaching `newTier` (after increment).
 * Tuned so Ascension 1 grant covers HP2 (160 Core).
 */
export function evolveCoreGrant(newTier: number): number {
  return EVOLVE_CORE_GRANT_BASE + EVOLVE_CORE_GRANT_PER_TIER * Math.max(1, Math.floor(newTier));
}

export function tierBonus(forTier: number): TierBonus {
  if (forTier <= 0) {
    return {
      damageMul: 1,
      hullMul: 1,
      shieldMul: 1,
      droneDamageMul: 1,
      orbitSpeedMul: 1,
      idleRateMul: 1,
    };
  }
  if (forTier <= 2) return TIER_1_2;
  return TIER_3_PLUS;
}

/** Stack permanent baseline from total ascension tier (0 = identity). */
export function baselineFromTier(ascensionTier: number): AscensionBaseline {
  let b: AscensionBaseline = { ...BASELINE_IDENTITY };
  const n = Math.max(0, Math.floor(ascensionTier));
  for (let t = 1; t <= n; t++) {
    const step = tierBonus(t);
    b = {
      damageMul: b.damageMul * step.damageMul,
      hullMul: b.hullMul * step.hullMul,
      shieldMul: b.shieldMul * step.shieldMul,
      droneDamageMul: b.droneDamageMul * step.droneDamageMul,
      orbitSpeedMul: b.orbitSpeedMul * step.orbitSpeedMul,
      idleRateMul: b.idleRateMul * step.idleRateMul,
    };
  }
  b.damageMul = Math.min(BASELINE_DAMAGE_SOFT_CAP, b.damageMul);
  return b;
}

export function canEvolve(
  fragments: number,
  highestLevel: number,
  currentAscension: number
): { ok: boolean; cost: number; minLevel: number; reason?: string } {
  const cost = evolveCost(currentAscension);
  const minLevel = evolveMinLevel(currentAscension);
  if (highestLevel < minLevel) {
    return {
      ok: false,
      cost,
      minLevel,
      reason: `Clear sector ${minLevel}+ before evolving`,
    };
  }
  if (fragments < cost) {
    return {
      ok: false,
      cost,
      minLevel,
      reason: `Need ${cost.toLocaleString()} FRAG`,
    };
  }
  return { ok: true, cost, minLevel };
}

/** Preview percent of next cost at which shop shows Evolve panel (0.5 = 50%). */
export { EVOLVE_UI_PREVIEW_RATIO };
