/**
 * Simple DOM offer card for rewarded ads — "Watch Ad" labeled clearly.
 */
import type { AdPlacement } from '../ads/AdProvider';
import { AD_PLACEMENT_LABELS } from '../ads/AdProvider';
import type { AdService } from '../ads/AdService';

export interface AdsOfferShowOptions {
  placement: AdPlacement;
  title?: string;
  body?: string;
  /** Pre-computed reward blurb */
  rewardText?: string;
}

export class AdsOfferUI {
  private root: HTMLElement;
  private card: HTMLElement | null = null;
  onAccepted: ((placement: AdPlacement) => void) | null = null;
  onDeclined: ((placement: AdPlacement) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /**
   * Show offer if placement still has daily capacity.
   * Returns false if not available (caller can skip UI).
   */
  show(ads: AdService, opts: AdsOfferShowOptions): boolean {
    if (!ads.isAvailable(opts.placement)) return false;

    const label = AD_PLACEMENT_LABELS[opts.placement];
    const remaining = ads.remaining(opts.placement);
    const title = opts.title ?? label;
    const body =
      opts.body ??
      'Optional rewarded ad. Core loop is never blocked.';
    const reward =
      opts.rewardText ??
      defaultRewardText(opts.placement);

    this.root.classList.remove('panel-hidden');
    this.root.innerHTML = `
      <div class="ads-offer interactive" role="dialog" aria-label="Watch ad offer">
        <div class="ads-offer-tag">WATCH AD</div>
        <h3 class="ads-offer-title">${escapeHtml(title)}</h3>
        <p class="ads-offer-body">${escapeHtml(body)}</p>
        <div class="ads-offer-reward">${escapeHtml(reward)}</div>
        <div class="ads-offer-meta">${remaining} left today · ${ads.getProviderName()}</div>
        <div class="ads-offer-actions">
          <button type="button" class="menu-btn primary" id="ads-watch">Watch Ad</button>
          <button type="button" class="menu-btn" id="ads-skip">No Thanks</button>
        </div>
      </div>
    `;
    this.card = this.root.querySelector('.ads-offer');

    this.root.querySelector('#ads-watch')!.addEventListener('click', () => {
      this.hide();
      this.onAccepted?.(opts.placement);
    });
    this.root.querySelector('#ads-skip')!.addEventListener('click', () => {
      this.hide();
      this.onDeclined?.(opts.placement);
    });
    return true;
  }

  /**
   * Compact inline button strip (e.g. on clear / shop panels).
   */
  renderInlineButton(
    container: HTMLElement,
    ads: AdService,
    placement: AdPlacement,
    onClick: () => void
  ): void {
    container.querySelectorAll('[data-ads-inline]').forEach((e) => e.remove());
    if (!ads.isAvailable(placement)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn ads-inline-btn';
    btn.dataset.adsInline = placement;
    btn.textContent = `Watch Ad · ${AD_PLACEMENT_LABELS[placement]}`;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
  }

  hide(): void {
    this.root.innerHTML = '';
    this.card = null;
    // Critical: re-hide the host so the dim backdrop + pointer-events don't
    // permanently block the game after an ad offer is dismissed/accepted.
    this.root.classList.add('panel-hidden');
    this.root.style.pointerEvents = 'none';
    this.root.style.background = '';
  }

  dispose(): void {
    this.hide();
  }
}

function defaultRewardText(p: AdPlacement): string {
  switch (p) {
    case 'clear_double':
      return 'Reward: ×2 fragments & core energy for this clear';
    case 'shop_pack':
      return 'Reward: instant Data Fragments';
    case 'death_repair':
      return 'Reward: full shield + 30% hull';
    case 'idle_boost':
      return 'Reward: +50% next offline claim';
    case 'hardpoint_discount':
      return 'Reward: 20% off next hardpoint unlock';
    default:
      return 'Reward available';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
