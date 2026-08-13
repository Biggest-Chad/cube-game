/**
 * Cube Nucleus (Core) — central late-stage / milestone combat pillar.
 */

export type CoreAttribute = 'none' | 'rage' | 'regeneration' | 'swarm';

export const CORE = {
  /**
   * Max shell damage reduction (1 = full immunity when shell intact).
   * Softened from 1.0 so direct nucleus shots always chip (min throughput below).
   */
  maxShellDr: 0.88,
  /** Minimum fraction of raw damage that always reaches the DR stage (then transfer). */
  minDamageThroughput: 0.12,
  /** Fraction of post-DR damage redirected to a random shell block. */
  damageTransferPct: 0.1,
  /** Shell remaining ratio below which core is EXPOSED. */
  exposedShellRatio: 0.1,
  /** HP/sec lost when no shell remains (scales with max HP). */
  decayPerSecOfMax: 0.018,
  /** Minimum absolute decay HP/sec when alone. */
  decayMinPerSec: 6,
  /** Overload health thresholds (core HP ratio). */
  overloadThresholds: [0.75, 0.5, 0.25] as const,
  /** Base transfer / DR are pure shell-ratio. */

  /** Rage: turret/drone fire rate mult while attribute active. */
  rageFireRateMul: 1.35,
  /** Rage exposed: leftover bolt cooldown (overload spray only). */
  rageArcCooldown: 4.2,
  /** Rage overload duration. */
  rageOverloadDuration: 3.2,
  /** Rage arc bolts during overload (secondary to the sweep laser). */
  rageOverloadBeamCount: 8,
  /** Arc bolt world speed ≈ base orbital linear feel (pre-upgrade). */
  arcBeamSpeed: 12,
  /** Arc bolt impact damage. */
  arcBeamDamage: 22,

  /** Rage sweep laser — charge, then a slow-tracking continuous beam. */
  rageLaserChargeSec: 2.4,
  rageLaserDuration: 5.0,
  rageLaserCooldown: 3.8,
  rageLaserWarmup: 0.7,
  /** Aim slew (rad/s). Slower than base orbit yaw (0.55) so circling dodges it. */
  rageLaserSlewCharge: 0.2,
  rageLaserSlewFire: 0.3,
  rageLaserSlewOverload: 0.42,
  rageLaserRange: 78,
  rageLaserHitRadius: 1.18,
  rageLaserDps: 16,
  rageLaserOverloadDps: 20,

  /** Regen: shell heal rate as fraction of maxHP / sec while attribute. */
  regenShellPerSec: 0.008,
  /** Regen exposed: repair drone count. */
  regenRepairDroneCount: 4,
  /** Regen overload: instantly revive this fraction of *dead* blocks (inner first). */
  regenResurrectFracMin: 0.05,
  regenResurrectFracMax: 0.1,
  /**
   * Passive: also revive this fraction of current dead / sec (innermost first).
   * Heal-living still uses regenShellPerSec. Ignore the cube and it grows back.
   */
  regenRevivePerSecOfDead: 0.012,

  /** Swarm: production interval seconds. */
  swarmSpawnInterval: 5.5,
  /** Swarm exposed: burst count. */
  swarmExposedBurst: 6,
  /** Swarm overload: enraged duration. */
  swarmEnrageDuration: 5,
  swarmEnrageSpeedMul: 1.55,
  swarmEnrageFireMul: 1.7,
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
  const volumeFactor = 1 + Math.pow(Math.max(0, size - 6), 1.1) * 0.08;
  return Math.round((avgHP * 55 + L * 180 + 400) * volumeFactor);
}
