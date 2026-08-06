/**
 * Placement orchestration, daily caps, reward application hooks.
 */
import { bus } from '../core/EventBus';
import { AD_CORE_REWARD } from '../data/research';
import type { AdPlacement, AdProvider, AdResult } from './AdProvider';
import { DummyAdProvider } from './DummyAdProvider';

export interface AdCapsSnapshot {
  /** YYYY-MM-DD local date key */
  day: string;
  counts: Partial<Record<AdPlacement, number>>;
}

/** Daily caps per placement */
export const DAILY_CAPS: Record<AdPlacement, number> = {
  clear_double: 8,
  shop_pack: 12,
  death_repair: 5,
  idle_boost: 4,
  hardpoint_discount: 3,
  core_energy: 6,
};

export interface AdRewardPayload {
  placement: AdPlacement;
  /** Multiplier for clear rewards */
  fragmentMul?: number;
  coreMul?: number;
  /** Flat fragment grant */
  fragments?: number;
  /** Flat Core Energy grant */
  coreEnergy?: number;
  /** Hull / shield restore fractions */
  hullRestore?: number;
  shieldFull?: boolean;
  /** Offline boost multiplier for next claim */
  offlineBoostMul?: number;
  /** Hardpoint cost discount 0–1 */
  hardpointDiscount?: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class AdService {
  private provider: AdProvider;
  private day: string;
  private counts: Partial<Record<AdPlacement, number>> = {};
  /** One-shot flags consumed by Game after reward */
  pendingOfflineBoostMul = 1;
  /** Public peek for UI affordability; consume only after successful unlock. */
  pendingHardpointDiscount = 0;

  constructor(provider: AdProvider = new DummyAdProvider()) {
    this.provider = provider;
    this.day = todayKey();
  }

  setProvider(provider: AdProvider): void {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  loadCaps(snap: AdCapsSnapshot | null | undefined): void {
    if (!snap) {
      this.day = todayKey();
      this.counts = {};
      return;
    }
    this.day = snap.day;
    this.counts = { ...(snap.counts ?? {}) };
    this.rolloverIfNeeded();
  }

  toJSON(): AdCapsSnapshot {
    this.rolloverIfNeeded();
    return { day: this.day, counts: { ...this.counts } };
  }

  private rolloverIfNeeded(): void {
    const t = todayKey();
    if (t !== this.day) {
      this.day = t;
      this.counts = {};
    }
  }

  remaining(placement: AdPlacement): number {
    this.rolloverIfNeeded();
    const used = this.counts[placement] ?? 0;
    return Math.max(0, DAILY_CAPS[placement] - used);
  }

  isAvailable(placement: AdPlacement): boolean {
    return this.remaining(placement) > 0 && this.provider.isReady(placement);
  }

  /**
   * Show rewarded ad if under cap. On success increments counter and returns reward payload.
   */
  async offer(placement: AdPlacement): Promise<{ result: AdResult; reward: AdRewardPayload | null }> {
    this.rolloverIfNeeded();
    if (!this.isAvailable(placement)) {
      return {
        result: {
          status: 'not_ready',
          placement,
          reason: this.remaining(placement) <= 0 ? 'daily_cap' : 'provider',
        },
        reward: null,
      };
    }

    const result = await this.provider.showRewarded(placement);
    if (result.status !== 'rewarded') {
      return { result, reward: null };
    }

    this.counts[placement] = (this.counts[placement] ?? 0) + 1;
    const reward = this.buildReward(placement);
    this.applySideEffects(reward);
    bus.emit('ad-rewarded', reward);
    return { result, reward };
  }

  private buildReward(placement: AdPlacement): AdRewardPayload {
    switch (placement) {
      case 'clear_double':
        return { placement, fragmentMul: 2, coreMul: 2 };
      case 'shop_pack': {
        // Diminishing: first packs richer
        const used = this.counts[placement] ?? 1;
        const fragments = Math.max(25, Math.round(120 / Math.sqrt(used)));
        return { placement, fragments };
      }
      case 'death_repair':
        return { placement, hullRestore: 0.3, shieldFull: true };
      case 'idle_boost':
        return { placement, offlineBoostMul: 1.5 };
      case 'hardpoint_discount':
        return { placement, hardpointDiscount: 0.2 };
      case 'core_energy':
        return { placement, coreEnergy: AD_CORE_REWARD };
      default:
        return { placement };
    }
  }

  private applySideEffects(reward: AdRewardPayload): void {
    if (reward.offlineBoostMul) {
      this.pendingOfflineBoostMul = Math.max(this.pendingOfflineBoostMul, reward.offlineBoostMul);
    }
    if (reward.hardpointDiscount) {
      this.pendingHardpointDiscount = Math.max(
        this.pendingHardpointDiscount,
        reward.hardpointDiscount
      );
    }
  }

  consumeOfflineBoost(): number {
    const m = this.pendingOfflineBoostMul;
    this.pendingOfflineBoostMul = 1;
    return m;
  }

  consumeHardpointDiscount(): number {
    const d = this.pendingHardpointDiscount;
    this.pendingHardpointDiscount = 0;
    return d;
  }
}
