/**
 * Nucleus offensive scaling — one pane for ATK power and stage kits.
 *
 * `nucleusAtkPowerMultiplier(stage)` is the master lethality / cool-factor
 * lever. Spike bursts, blobs, kamikazes, mines, and later kits all read it.
 * Tune `NUCLEUS_ATK_DIFFICULTY_MULTIPLIER` to raise or lower the whole curve.
 */

import {
  NUCLEUS_BLOB_UNLOCK_STAGE,
  NUCLEUS_GRAVITY_WELL_UNLOCK_STAGE,
  NUCLEUS_KAMIKAZE_UNLOCK_STAGE,
  NUCLEUS_LATTICE_JAVELIN_UNLOCK_STAGE,
  NUCLEUS_MINE_UNLOCK_STAGE,
  NUCLEUS_MIRROR_SHARD_UNLOCK_STAGE,
  NUCLEUS_PHASE_RIFT_UNLOCK_STAGE,
  NUCLEUS_SPIKE_DAMAGE,
  NUCLEUS_SPIKE_HIT_RADIUS,
  NUCLEUS_SPIKE_LIFETIME_SECONDS,
  NUCLEUS_SPIKE_OMNI_COUNT,
  NUCLEUS_SPIKE_SHOCK_DAMAGE,
  NUCLEUS_SPIKE_SHOCK_DURATION,
  NUCLEUS_SPIKE_SHOCK_RADIUS,
  NUCLEUS_SPIKE_SPEED,
  NUCLEUS_SPIKE_TELEGRAPH_SECONDS,
  NUCLEUS_STATIC_BLOOM_UNLOCK_STAGE,
  nucleusAtkPowerMultiplier,
} from './constraints';

export { nucleusAtkPowerMultiplier };

export interface SpikeBurstProfile {
  omniCount: number;
  damage: number;
  speed: number;
  life: number;
  hitRadius: number;
  shockRadius: number;
  shockDamage: number;
  shockDuration: number;
  airBurstChance: number;
  airBurstRadius: number;
  airBurstDamage: number;
  sprayWaves: number;
  telegraphSec: number;
}

/** Spike lethality / spray / air-burst derived from ATK power. */
export function spikeBurstProfileForStage(stage: number): SpikeBurstProfile {
  const atk = nucleusAtkPowerMultiplier(stage);
  const extra = Math.min(20, Math.max(0, Math.floor((stage - 1) / 3)));
  const omni = Math.min(
    90,
    Math.round((NUCLEUS_SPIKE_OMNI_COUNT + extra) * (0.72 + 0.28 * Math.min(atk, 2.8)))
  );
  return {
    omniCount: omni,
    damage: NUCLEUS_SPIKE_DAMAGE * atk,
    speed: NUCLEUS_SPIKE_SPEED * (1 + (atk - 1) * 0.16),
    life: NUCLEUS_SPIKE_LIFETIME_SECONDS * (1 + (atk - 1) * 0.1),
    hitRadius: NUCLEUS_SPIKE_HIT_RADIUS,
    shockRadius: NUCLEUS_SPIKE_SHOCK_RADIUS * (1 + (atk - 1) * 0.08),
    shockDamage: NUCLEUS_SPIKE_SHOCK_DAMAGE * atk,
    shockDuration: NUCLEUS_SPIKE_SHOCK_DURATION,
    airBurstChance: Math.min(0.55, Math.max(0, (atk - 1.15) * 0.18)),
    airBurstRadius: 2.4 + Math.min(1.8, (atk - 1) * 0.35),
    airBurstDamage: NUCLEUS_SPIKE_DAMAGE * 0.45 * atk,
    sprayWaves: atk >= 1.8 ? 3 : atk >= 1.35 ? 2 : 1,
    telegraphSec: NUCLEUS_SPIKE_TELEGRAPH_SECONDS,
  };
}

export interface NucleusKitUnlocks {
  blob: boolean;
  kamikaze: boolean;
  mine: boolean;
  gravityWell: boolean;
  mirrorShard: boolean;
  phaseRift: boolean;
  staticBloom: boolean;
  latticeJavelin: boolean;
}

/**
 * Stage-gated kit. Each unlock is one readable threat — not a stack of
 * simultaneous specials. Overload only extra-fires the highest unlocked toy.
 */
export function nucleusKitUnlocks(stage: number): NucleusKitUnlocks {
  return {
    blob: stage >= NUCLEUS_BLOB_UNLOCK_STAGE,
    kamikaze: stage >= NUCLEUS_KAMIKAZE_UNLOCK_STAGE,
    mine: stage >= NUCLEUS_MINE_UNLOCK_STAGE,
    gravityWell: stage >= NUCLEUS_GRAVITY_WELL_UNLOCK_STAGE,
    mirrorShard: stage >= NUCLEUS_MIRROR_SHARD_UNLOCK_STAGE,
    phaseRift: stage >= NUCLEUS_PHASE_RIFT_UNLOCK_STAGE,
    staticBloom: stage >= NUCLEUS_STATIC_BLOOM_UNLOCK_STAGE,
    latticeJavelin: stage >= NUCLEUS_LATTICE_JAVELIN_UNLOCK_STAGE,
  };
}

/** Soft damage scale so late stages hurt more without one-shotting. */
export function nucleusKitDamageScale(stage: number): number {
  return Math.pow(nucleusAtkPowerMultiplier(stage), 0.65);
}

/** Cooldown shrinks slowly so late stages stay readable. */
export function nucleusKitCooldownScale(stage: number): number {
  const atk = nucleusAtkPowerMultiplier(stage);
  return 1 / (1 + (atk - 1) * 0.08);
}
