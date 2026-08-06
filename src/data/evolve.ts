/**
 * Evolve (Ascension) — permanent hull baselines + combat shop retrain loop.
 * Brand: EVOLVE / Ascension Tier, not generic "prestige".
 */

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
  damageMul: 1.08,
  hullMul: 1.1,
  shieldMul: 1.1,
  droneDamageMul: 1.08,
  orbitSpeedMul: 1.04,
  idleRateMul: 1.05,
};

const TIER_3_PLUS: TierBonus = {
  damageMul: 1.07,
  hullMul: 1.08,
  shieldMul: 1.08,
  droneDamageMul: 1.07,
  orbitSpeedMul: 1.03,
  idleRateMul: 1.04,
};

/** Soft cap on stacked damage baseline. */
export const BASELINE_DAMAGE_SOFT_CAP = 1.8;

/** evolveCost(tier) = 100_000 * (tier + 1) — cost to go from `tier` → tier+1. */
export function evolveCost(currentAscension: number): number {
  const t = Math.max(0, Math.floor(currentAscension));
  return 100_000 * (t + 1);
}

/** Soft gate: highestLevel >= 8 + ascension * 3 */
export function evolveMinLevel(currentAscension: number): number {
  return 8 + Math.max(0, Math.floor(currentAscension)) * 3;
}

/**
 * Core Energy grant on reaching `newTier` (after increment).
 * Tuned so Ascension 1 grant covers HP2 (160 Core).
 */
export function evolveCoreGrant(newTier: number): number {
  return 100 + 60 * Math.max(1, Math.floor(newTier));
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
export const EVOLVE_UI_PREVIEW_RATIO = 0.5;
