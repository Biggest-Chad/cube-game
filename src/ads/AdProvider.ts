/**
 * Ad provider seam — Dummy now, AdMob later. No mid-combat interstitials in v1.
 */

export type AdPlacement =
  | 'clear_double'
  | 'shop_pack'
  | 'death_repair'
  | 'idle_boost'
  | 'hardpoint_discount'
  | 'core_energy';

export type AdResultStatus = 'rewarded' | 'skipped' | 'failed' | 'not_ready';

export interface AdResult {
  status: AdResultStatus;
  placement: AdPlacement;
  /** Provider-specific diagnostic */
  reason?: string;
}

export interface AdProvider {
  readonly name: string;
  isReady(placement: AdPlacement): boolean;
  showRewarded(placement: AdPlacement): Promise<AdResult>;
}

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  clear_double: 'Double Clear Reward',
  shop_pack: 'Instant Data Packet',
  death_repair: 'Emergency Repair',
  idle_boost: 'Boost Offline',
  hardpoint_discount: 'Sponsorship Surge',
  core_energy: 'Core Energy Drip',
};
