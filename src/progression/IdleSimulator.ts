import { IDLE } from '../data/constants';
import type { PlayerStats } from './TechTree';
import type { Currency } from './Currency';

export interface IdleResult {
  seconds: number;
  blocksDestroyed: number;
  fragments: number;
  coreEnergy: number;
}

/**
 * Offline rewards are pure currency — never mutate the live stage cube.
 */
export class IdleSimulator {
  computeOffline(lastSaveTime: number, stats: PlayerStats): number {
    const elapsed = Math.max(0, (Date.now() - lastSaveTime) / 1000);
    const cap = IDLE.maxOfflineSeconds * stats.idleCapMul;
    return Math.min(elapsed, cap);
  }

  /**
   * Numerical offline payout (fragments + tiny core drip).
   * Does not touch CubeManager / stage progress.
   */
  claimOffline(seconds: number, stats: PlayerStats, currency: Currency): IdleResult {
    if (seconds < 1) {
      return { seconds, blocksDestroyed: 0, fragments: 0, coreEnergy: 0 };
    }

    const dronePower = stats.dronesUnlocked
      ? stats.droneCount * stats.droneDamageMul * stats.droneFireRateMul
      : 0.25;
    const rate =
      IDLE.baseClearRate *
      stats.idleRateMul *
      (0.5 + dronePower * 0.35) *
      (0.5 + stats.damageMul * 0.15);

    // Fragments scale with time; soft-cap extreme AFK via sqrt-ish late growth
    const rawFrags = rate * seconds * 2.8;
    const soft =
      rawFrags > 800 ? 800 + Math.sqrt(rawFrags - 800) * 12 : rawFrags;
    const fragments = currency.addFragments(soft, stats.fragmentMul);

    // Tiny core drip — never the main offline sink
    const coreRaw = Math.floor(seconds / 900) * (1 + Math.floor(stats.coreEnergyMul));
    const coreEnergy =
      coreRaw > 0 ? currency.addCoreEnergy(coreRaw, stats.coreEnergyMul) : 0;

    return {
      seconds,
      blocksDestroyed: 0,
      fragments,
      coreEnergy,
    };
  }

  /**
   * @deprecated Prefer claimOffline — kept so accidental callers don't damage cube.
   */
  apply(
    seconds: number,
    _cube: unknown,
    stats: PlayerStats,
    currency: Currency,
    _now: number
  ): IdleResult {
    return this.claimOffline(seconds, stats, currency);
  }
}
