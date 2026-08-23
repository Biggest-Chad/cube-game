/**
 * Cube Nucleus (Core) — central late-stage / milestone combat pillar.
 * Numeric sources live in `constraints.ts`.
 */

import {
  NUCLEUS_ARC_BEAM_DAMAGE,
  NUCLEUS_ARC_BEAM_SPEED,
  NUCLEUS_DAMAGE_TRANSFER_TO_SHELL_FRACTION,
  NUCLEUS_DECAY_MINIMUM_PER_SECOND,
  NUCLEUS_DECAY_PER_SECOND_OF_MAX,
  NUCLEUS_DESTABILIZE_SHELL_RATIO,
  NUCLEUS_EXPOSED_SHELL_RATIO,
  NUCLEUS_MAX_HP_AVG_HP_WEIGHT,
  NUCLEUS_MAX_HP_FLAT,
  NUCLEUS_MAX_HP_LEVEL_WEIGHT,
  NUCLEUS_MAX_HP_VOLUME_EXPONENT,
  NUCLEUS_MAX_HP_VOLUME_SIZE_OFFSET,
  NUCLEUS_MAX_HP_VOLUME_WEIGHT,
  NUCLEUS_MAX_SHELL_DAMAGE_REDUCTION,
  NUCLEUS_MIN_DAMAGE_THROUGHPUT,
  NUCLEUS_OVERLOAD_GROWTH_MULTIPLIER,
  NUCLEUS_OVERLOAD_THRESHOLDS,
  NUCLEUS_RAGE_ARC_COOLDOWN_SECONDS,
  NUCLEUS_RAGE_FIRE_RATE_MULTIPLIER,
  NUCLEUS_RAGE_LASER_CHARGE_SECONDS,
  NUCLEUS_RAGE_LASER_COOLDOWN_SECONDS,
  NUCLEUS_RAGE_LASER_DPS,
  NUCLEUS_RAGE_LASER_DURATION_SECONDS,
  NUCLEUS_RAGE_LASER_HIT_RADIUS,
  NUCLEUS_RAGE_LASER_OVERLOAD_DPS,
  NUCLEUS_RAGE_LASER_RANGE,
  NUCLEUS_RAGE_LASER_SLEW_WHILE_CHARGING,
  NUCLEUS_RAGE_LASER_SLEW_WHILE_FIRING,
  NUCLEUS_RAGE_LASER_SLEW_WHILE_OVERLOAD,
  NUCLEUS_RAGE_LASER_WARMUP_SECONDS,
  NUCLEUS_RAGE_OVERLOAD_BEAM_COUNT,
  NUCLEUS_RAGE_OVERLOAD_DURATION_SECONDS,
  NUCLEUS_REGEN_REPAIR_DRONE_COUNT,
  NUCLEUS_REGEN_RESURRECT_FRACTION_MAX,
  NUCLEUS_REGEN_RESURRECT_FRACTION_MIN,
  NUCLEUS_REGEN_REVIVE_PER_SECOND_OF_DEAD,
  NUCLEUS_REGEN_SHELL_HEAL_PER_SECOND,
  NUCLEUS_SPIKE_DAMAGE,
  NUCLEUS_SPIKE_HIT_RADIUS,
  NUCLEUS_SPIKE_LIFETIME_SECONDS,
  NUCLEUS_SPIKE_OMNI_COUNT,
  NUCLEUS_SPIKE_SHOCK_DAMAGE,
  NUCLEUS_SPIKE_SHOCK_DURATION,
  NUCLEUS_SPIKE_SHOCK_RADIUS,
  NUCLEUS_SPIKE_SPEED,
  NUCLEUS_SPIKE_TELEGRAPH_SECONDS,
  NUCLEUS_SWARM_ENRAGE_DURATION_SECONDS,
  NUCLEUS_SWARM_ENRAGE_FIRE_MULTIPLIER,
  NUCLEUS_SWARM_ENRAGE_SPEED_MULTIPLIER,
  NUCLEUS_SWARM_EXPOSED_BURST_COUNT,
  NUCLEUS_SWARM_SPAWN_INTERVAL_SECONDS,
} from './constraints';

export type CoreAttribute = 'none' | 'rage' | 'regeneration' | 'swarm';

export const CORE = {
  /**
   * Max shell damage reduction (1 = full immunity when shell intact).
   * Softened from 1.0 so direct nucleus shots always chip (min throughput below).
   */
  maxShellDr: NUCLEUS_MAX_SHELL_DAMAGE_REDUCTION,
  /** Minimum fraction of raw damage that always reaches the DR stage (then transfer). */
  minDamageThroughput: NUCLEUS_MIN_DAMAGE_THROUGHPUT,
  /** Fraction of post-DR damage redirected to a random shell block. */
  damageTransferPct: NUCLEUS_DAMAGE_TRANSFER_TO_SHELL_FRACTION,
  /** Shell remaining ratio below which core is EXPOSED. */
  exposedShellRatio: NUCLEUS_EXPOSED_SHELL_RATIO,
  /** Shell remaining ratio at or below which destablization (HP decay) starts. */
  destabilizeShellRatio: NUCLEUS_DESTABILIZE_SHELL_RATIO,
  /** HP/sec lost while destablizing (scales with max HP). */
  decayPerSecOfMax: NUCLEUS_DECAY_PER_SECOND_OF_MAX,
  /** Minimum absolute decay HP/sec when alone. */
  decayMinPerSec: NUCLEUS_DECAY_MINIMUM_PER_SECOND,
  /** Overload health thresholds (core HP ratio). */
  overloadThresholds: NUCLEUS_OVERLOAD_THRESHOLDS,
  /** Size + damage multiply per overload stack. */
  overloadGrowthMul: NUCLEUS_OVERLOAD_GROWTH_MULTIPLIER,

  /** Standard nucleus: telegraphed omni spike burst on overload (from stage 1). */
  spikeTelegraphSec: NUCLEUS_SPIKE_TELEGRAPH_SECONDS,
  /** Omni directions (plus one extra locked on the ship). */
  spikeOmniCount: NUCLEUS_SPIKE_OMNI_COUNT,
  spikeSpeed: NUCLEUS_SPIKE_SPEED,
  spikeDamage: NUCLEUS_SPIKE_DAMAGE,
  spikeHitRadius: NUCLEUS_SPIKE_HIT_RADIUS,
  spikeLife: NUCLEUS_SPIKE_LIFETIME_SECONDS,
  /** Close-range shockwave — default orbit (18) is outside this. */
  spikeShockRadius: NUCLEUS_SPIKE_SHOCK_RADIUS,
  spikeShockDamage: NUCLEUS_SPIKE_SHOCK_DAMAGE,
  spikeShockDuration: NUCLEUS_SPIKE_SHOCK_DURATION,
  /** Base transfer / DR are pure shell-ratio. */

  /** Rage: turret/drone fire rate mult while attribute active. */
  rageFireRateMul: NUCLEUS_RAGE_FIRE_RATE_MULTIPLIER,
  /** Rage exposed: leftover bolt cooldown (overload spray only). */
  rageArcCooldown: NUCLEUS_RAGE_ARC_COOLDOWN_SECONDS,
  /** Rage overload duration. */
  rageOverloadDuration: NUCLEUS_RAGE_OVERLOAD_DURATION_SECONDS,
  /** Rage arc bolts during overload (secondary to the sweep laser). */
  rageOverloadBeamCount: NUCLEUS_RAGE_OVERLOAD_BEAM_COUNT,
  /** Arc bolt world speed ≈ base orbital linear feel (pre-upgrade). */
  arcBeamSpeed: NUCLEUS_ARC_BEAM_SPEED,
  /** Arc bolt impact damage. */
  arcBeamDamage: NUCLEUS_ARC_BEAM_DAMAGE,

  /** Rage sweep laser — charge, then a slow-tracking continuous beam. */
  rageLaserChargeSec: NUCLEUS_RAGE_LASER_CHARGE_SECONDS,
  rageLaserDuration: NUCLEUS_RAGE_LASER_DURATION_SECONDS,
  rageLaserCooldown: NUCLEUS_RAGE_LASER_COOLDOWN_SECONDS,
  rageLaserWarmup: NUCLEUS_RAGE_LASER_WARMUP_SECONDS,
  /** Aim slew (rad/s). Slower than base orbit yaw so circling dodges it. */
  rageLaserSlewCharge: NUCLEUS_RAGE_LASER_SLEW_WHILE_CHARGING,
  rageLaserSlewFire: NUCLEUS_RAGE_LASER_SLEW_WHILE_FIRING,
  rageLaserSlewOverload: NUCLEUS_RAGE_LASER_SLEW_WHILE_OVERLOAD,
  rageLaserRange: NUCLEUS_RAGE_LASER_RANGE,
  rageLaserHitRadius: NUCLEUS_RAGE_LASER_HIT_RADIUS,
  rageLaserDps: NUCLEUS_RAGE_LASER_DPS,
  rageLaserOverloadDps: NUCLEUS_RAGE_LASER_OVERLOAD_DPS,

  /** Regen: shell heal rate as fraction of maxHP / sec while attribute. */
  regenShellPerSec: NUCLEUS_REGEN_SHELL_HEAL_PER_SECOND,
  /** Regen exposed: repair drone count. */
  regenRepairDroneCount: NUCLEUS_REGEN_REPAIR_DRONE_COUNT,
  /** Regen overload: instantly revive this fraction of *dead* blocks (inner first). */
  regenResurrectFracMin: NUCLEUS_REGEN_RESURRECT_FRACTION_MIN,
  regenResurrectFracMax: NUCLEUS_REGEN_RESURRECT_FRACTION_MAX,
  /**
   * Passive: also revive this fraction of current dead / sec (innermost first).
   * Heal-living still uses regenShellPerSec. Ignore the cube and it grows back.
   */
  regenRevivePerSecOfDead: NUCLEUS_REGEN_REVIVE_PER_SECOND_OF_DEAD,

  /** Swarm: production interval seconds. */
  swarmSpawnInterval: NUCLEUS_SWARM_SPAWN_INTERVAL_SECONDS,
  /** Swarm exposed: burst count. */
  swarmExposedBurst: NUCLEUS_SWARM_EXPOSED_BURST_COUNT,
  /** Swarm overload: enraged duration. */
  swarmEnrageDuration: NUCLEUS_SWARM_ENRAGE_DURATION_SECONDS,
  swarmEnrageSpeedMul: NUCLEUS_SWARM_ENRAGE_SPEED_MULTIPLIER,
  swarmEnrageFireMul: NUCLEUS_SWARM_ENRAGE_FIRE_MULTIPLIER,
} as const;

/** Milestone every 5 levels starting at 5 → cycling attributes. */
export function coreAttributeForLevel(levelId: number): CoreAttribute {
  const L = Math.max(1, Math.floor(levelId));
  if (L < 5 || L % 5 !== 0) return 'none';
  const cycle = ((L / 5 - 1) % 3 + 3) % 3;
  return (['rage', 'regeneration', 'swarm'] as const)[cycle];
}

export function coreAttributeLabel(attr: CoreAttribute): string {
  switch (attr) {
    case 'rage':
      return 'RAGE';
    case 'regeneration':
      return 'REGENERATION';
    case 'swarm':
      return 'SWARM';
    default:
      return 'STANDARD';
  }
}

/** Massive shared nucleus pool — scales harder than shell avgHP. */
export function computeCoreMaxHp(levelId: number, avgHP: number, size: number): number {
  const L = Math.max(1, levelId);
  // Volume-ish soft factor so big cubes stay tanky
  const volumeFactor =
    1 +
    Math.pow(Math.max(0, size - NUCLEUS_MAX_HP_VOLUME_SIZE_OFFSET), NUCLEUS_MAX_HP_VOLUME_EXPONENT) *
      NUCLEUS_MAX_HP_VOLUME_WEIGHT;
  return Math.round(
    (avgHP * NUCLEUS_MAX_HP_AVG_HP_WEIGHT + L * NUCLEUS_MAX_HP_LEVEL_WEIGHT + NUCLEUS_MAX_HP_FLAT) *
      volumeFactor
  );
}
