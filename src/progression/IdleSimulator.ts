import { IDLE } from '../data/constants';
import {
  armorClassOf,
  IDLE_ARMOR_DAMAGE_MUL,
  type ArmorClass,
} from '../cube/BlockTypes';
import type { CubeManager } from '../cube/CubeManager';
import type { PlayerStats } from './TechTree';
import type { Currency } from './Currency';

export interface IdleResult {
  seconds: number;
  blocksDestroyed: number;
  fragments: number;
}

/**
 * Offline progress with armor walls:
 * - light: 0.45× idle damage
 * - heavy: 0.10× idle damage
 * - siege: 0.05× idle damage (almost immune)
 * Cannot fully clear high-armor levels via AFK alone.
 */
export class IdleSimulator {
  computeOffline(lastSaveTime: number, stats: PlayerStats): number {
    const elapsed = Math.max(0, (Date.now() - lastSaveTime) / 1000);
    const cap = IDLE.maxOfflineSeconds * stats.idleCapMul;
    return Math.min(elapsed, cap);
  }

  /**
   * Apply idle progress against current cube.
   * Uses partial HP damage so siege/heavy blocks rarely die.
   */
  apply(
    seconds: number,
    cube: CubeManager,
    stats: PlayerStats,
    currency: Currency,
    now: number
  ): IdleResult {
    if (seconds < 1 || cube.aliveBlocks <= 0) {
      return { seconds, blocksDestroyed: 0, fragments: 0 };
    }

    const dronePower = stats.dronesUnlocked
      ? stats.droneCount * stats.droneDamageMul * stats.droneFireRateMul
      : 0.25;
    const rate =
      IDLE.baseClearRate *
      stats.idleRateMul *
      (0.5 + dronePower) *
      (0.5 + stats.damageMul * 0.2);

    // Damage budget: approximate HP equivalent of "rate" block-clears of avg soft blocks
    const avgSoftHp = 40;
    const damageBudget = rate * seconds * avgSoftHp;
    // Tick size per hit attempt
    const baseHit = Math.max(8, avgSoftHp * 0.35);

    let remaining = damageBudget;
    let fragments = 0;
    let destroyed = 0;
    let safety = 0;
    const maxHits = Math.min(50000, Math.ceil(damageBudget / 2) + cube.aliveBlocks * 4);

    while (remaining > 0 && cube.aliveBlocks > 0 && safety < maxHits) {
      safety++;
      const count = cube.aliveBlocks;
      // Prefer softer blocks from the end of the dense instance list
      let hitId = -1;
      let hitClass: ArmorClass = 'none';
      let bestScore = -Infinity;

      const sample = Math.min(count, 24);
      for (let s = 0; s < sample; s++) {
        const id = count - 1 - s;
        if (id < 0) break;
        const t = cube.getBlockType(id);
        const ac = armorClassOf(t);
        // Prefer none/light; deprioritize siege so walls remain
        const prefer =
          ac === 'none' ? 4 : ac === 'light' ? 3 : ac === 'heavy' ? 1 : 0.2;
        const score = prefer + Math.random() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          hitId = id;
          hitClass = ac;
        }
      }

      if (hitId < 0) break;

      const mul = IDLE_ARMOR_DAMAGE_MUL[hitClass];
      // Siege/heavy: tiny chips only — even huge offline time cannot mass-delete walls
      const dmg = baseHit * mul * (0.85 + Math.random() * 0.3);
      const spend = hitClass === 'siege' || hitClass === 'heavy' ? dmg / Math.max(0.05, mul) : dmg;
      remaining -= spend;

      const r = cube.applyDamage(hitId, dmg, now);
      if (r?.destroyed) {
        fragments += r.fragments;
        destroyed++;
      }

      // Soft stop: if only heavy/siege remain, idle stalls after modest chip attempts
      if (this.onlyArmoredRemain(cube) && destroyed > 0 && safety > 40) {
        break;
      }
    }

    const gained = currency.addFragments(fragments, stats.fragmentMul);

    return {
      seconds,
      blocksDestroyed: destroyed,
      fragments: gained,
    };
  }

  private onlyArmoredRemain(cube: CubeManager): boolean {
    const n = Math.min(cube.aliveBlocks, 16);
    if (n <= 0) return true;
    let armored = 0;
    for (let s = 0; s < n; s++) {
      const id = cube.aliveBlocks - 1 - s;
      const ac = armorClassOf(cube.getBlockType(id));
      if (ac === 'heavy' || ac === 'siege') armored++;
    }
    return armored >= n * 0.85;
  }
}
