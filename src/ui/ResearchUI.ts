/**
 * Research Lattice — main-menu Core Energy tech tree + Core shop (IAP / ads).
 */
import {
  AD_CORE_REWARD,
  CORE_PACKS,
  RESEARCH_NODES,
  researchRows,
  type ResearchNodeDef,
} from '../data/research';
import type { ResearchTree } from '../progression/ResearchTree';
import type { Currency } from '../progression/Currency';

export class ResearchUI {
  private root: HTMLElement;
  private view: 'lattice' | 'shop' = 'lattice';
  private ascensionTier = 0;
  private adRemaining = 0;

  onClose: (() => void) | null = null;
  onPurchase: ((nodeId: string) => boolean) | null = null;
  onBuyIap: ((packId: string) => Promise<boolean>) | null = null;
  onWatchAdCore: (() => Promise<boolean>) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(
    research: ResearchTree,
    currency: Currency,
    ascensionTier: number,
    adCoreRemaining = 0
  ): void {
    this.ascensionTier = ascensionTier;
    this.adRemaining = adCoreRemaining;
    this.root.classList.remove('panel-hidden');
    this.render(research, currency);
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }

  render(research: ResearchTree, currency: Currency): void {
    const rows = researchRows();
    this.root.innerHTML = `
      <div class="research-panel interactive tech-panel">
        <div class="shop-header tech-header research-header">
          <div>
            <h2>RESEARCH LATTICE</h2>
            <div class="tech-header-sub">
              Permanent Core unlocks · Ascension ${this.ascensionTier}
            </div>
          </div>
          <div class="shop-currency-row">
            <div class="tech-currency core">◆ ${Math.floor(currency.coreEnergy)} CORE</div>
          </div>
          <button class="icon-btn" id="research-close" type="button" aria-label="Close">✕</button>
        </div>

        <div class="research-tabs" role="tablist">
          <button type="button" class="shop-tab ${this.view === 'lattice' ? 'active' : ''}" data-rview="lattice">
            Lattice
          </button>
          <button type="button" class="shop-tab ${this.view === 'shop' ? 'active' : ''}" data-rview="shop">
            Core Shop
          </button>
        </div>

        <div class="research-body">
          ${
            this.view === 'lattice'
              ? this.renderLattice(research, currency, rows)
              : this.renderCoreShop(currency)
          }
        </div>
      </div>
    `;
    this.bind(research, currency);
  }

  private renderLattice(
    research: ResearchTree,
    currency: Currency,
    rows: number[]
  ): string {
    return `
      <div class="research-scroll">
        <p class="research-blurb">
          Spend <strong>Core Energy</strong> on permanent upgrades. Rows unlock with
          <strong>Evolve / Ascension</strong>. Combat shop upgrades reset on Evolve — Lattice does not.
        </p>
        ${rows
          .map((row) => {
            const locked = this.ascensionTier < row;
            const nodes = RESEARCH_NODES.filter((n) => n.row === row).sort(
              (a, b) => a.col - b.col
            );
            return `
              <section class="research-row ${locked ? 'row-locked' : ''}">
                <div class="research-row-label">
                  <span>ROW ${row}</span>
                  <span class="research-row-gate">${
                    locked ? `Requires Ascension ${row}` : 'OPEN'
                  }</span>
                </div>
                <div class="research-nodes">
                  ${nodes.map((n) => this.renderNode(n, research, currency, locked)).join('')}
                </div>
              </section>`;
          })
          .join('')}
      </div>`;
  }

  private renderNode(
    node: ResearchNodeDef,
    research: ResearchTree,
    currency: Currency,
    rowLocked: boolean
  ): string {
    const rank = research.getRank(node.id);
    const max = node.maxRank ?? 1;
    const maxed = rank >= max;
    const next = research.nextRank(node);
    const cost = next > 0 ? research.nextCost(node) : 0;
    const can = !rowLocked && research.canPurchase(node, this.ascensionTier);
    const afford = can && currency.coreEnergy >= cost;
    const prereqOk = node.prerequisites.every((p) => research.getRank(p) >= 1);
    let state = 'locked';
    if (maxed) state = 'owned';
    else if (rowLocked) state = 'row-gate';
    else if (!prereqOk) state = 'prereq';
    else if (can && afford) state = 'buyable';
    else if (can) state = 'cant-afford';

    const rankLabel =
      max > 1 ? ` · ${rank}/${max}` : rank > 0 && maxed ? ' · OWNED' : '';
    const costLabel = maxed
      ? 'MAXED'
      : rowLocked
        ? `ASC ${node.row}+`
        : `◆ ${cost} CORE`;

    return `
      <button type="button" class="research-node ${state}" data-rid="${node.id}"
        ${maxed || !can || !afford ? 'disabled' : ''}>
        <div class="rn-name">${node.name}${rankLabel}</div>
        <div class="rn-desc">${node.description}</div>
        <div class="rn-cost">${costLabel}</div>
      </button>`;
  }

  private renderCoreShop(currency: Currency): string {
    return `
      <div class="research-scroll core-shop">
        <p class="research-blurb">
          Core Energy is the premium currency for Research Lattice.
          Watch ads for a small drip, or purchase packs (sandbox IAP in this build).
        </p>
        <div class="core-ad-card">
          <div>
            <strong>Rewarded Core</strong>
            <div class="rn-desc">+${AD_CORE_REWARD} Core · ${this.adRemaining} left today</div>
          </div>
          <button type="button" class="menu-btn primary" id="core-ad-btn"
            ${this.adRemaining > 0 ? '' : 'disabled'}>
            WATCH AD · +${AD_CORE_REWARD} CORE
          </button>
        </div>
        <div class="core-packs">
          ${CORE_PACKS.map(
            (p) => `
            <div class="core-pack shop-card">
              <div class="shop-card-top">
                <span class="shop-card-name">${p.name}</span>
                <span class="shop-card-rank">${p.priceLabel}</span>
              </div>
              <div class="shop-card-desc">+${p.core} Core Energy${
                p.bonusTrail ? ' · trail cosmetic' : ''
              }</div>
              <button type="button" class="shop-card-buy buyable" data-iap="${p.id}">
                BUY · ${p.priceLabel}
              </button>
            </div>`
          ).join('')}
        </div>
        <div class="research-blurb dim">Balance: ${Math.floor(currency.coreEnergy)} CORE on hand</div>
      </div>`;
  }

  private bind(research: ResearchTree, currency: Currency): void {
    this.root.querySelector('#research-close')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onClose?.();
    });

    this.root.querySelectorAll('[data-rview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.view = (btn as HTMLElement).dataset.rview as 'lattice' | 'shop';
        this.render(research, currency);
      });
    });

    this.root.querySelectorAll('[data-rid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.rid!;
        if (this.onPurchase?.(id)) this.render(research, currency);
      });
    });

    this.root.querySelector('#core-ad-btn')?.addEventListener('click', () => {
      void (async () => {
        const ok = await this.onWatchAdCore?.();
        if (ok) this.render(research, currency);
      })();
    });

    this.root.querySelectorAll('[data-iap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.iap!;
        void (async () => {
          const ok = await this.onBuyIap?.(id);
          if (ok) this.render(research, currency);
        })();
      });
    });
  }

  setAdRemaining(n: number): void {
    this.adRemaining = n;
  }
}
