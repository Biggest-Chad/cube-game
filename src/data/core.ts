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
  decayPerSecOfMax: 0.012,
  /** Minimum absolute decay HP/sec when alone. */
  decayMinPerSec: 4,
  /** Overload health thresholds (core HP ratio). */
  overloadThresholds: [0.75, 0.5, 0.25] as const,
  /** Base transfer / DR are pure shell-ratio. */

  /** Rage: turret/drone fire rate mult while attribute active. */
  rageFireRateMul: 1.35,
  /** Rage exposed: arc beam cooldown seconds. */
  rageArcCooldown: 4.2,
  /** Rage overload duration. */
  rageOverloadDuration: 3.2,
  /** Rage arc beams during overload. */
  rageOverloadBeamCount: 8,
  /** Arc beam world speed ≈ base orbital linear feel (pre-upgrade). */
  arcBeamSpeed: 12,
  /** Arc beam damage. */
  arcBeamDamage: 22,

  /** Regen: shell heal rate as fraction of maxHP / sec while attribute. */
  regenShellPerSec: 0.008,
  /** Regen exposed: repair drone count. */
  regenRepairDroneCount: 4,
  /** Regen overload: fraction of total shell blocks to resurrect. */
  regenResurrectFrac: 0.12,

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
