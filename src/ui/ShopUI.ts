import { COMBAT } from '../data/constants';
import {
  SHOP_TABS,
  STAT_CAPS,
  UPGRADES,
  getSequentialVisibleNodes,
  type SequentialVisibleNode,
  type ShopTabId,
  type UpgradeNodeDef,
} from '../data/upgrades';
import { armorEffectiveFromRating } from '../player/ShipVitals';
import type { TechTree, PlayerStats } from '../progression/TechTree';
import type { Currency } from '../progression/Currency';

/** Live stat panel model for the shop (and future HUD hooks). */
export interface StatsSnapshot {
  dpsMain: number;
  dpsLoadout: number;
  rofMain: number;
  critChance: number;
  critMult: number;
  droneCount: number;
  droneDps: number;
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  armorEffective: number;
  armorRating: number;
  topSpeedMul: number;
  accelMul: number;
  hardpointsUsed: number;
  hardpointsMax: number;
  fragmentMul: number;
  damageMul: number;
  fireRateMul: number;
}

const BASE_HULL = 100;
const BASE_SHIELD = 40;

export function buildStatsSnapshot(
  stats: PlayerStats,
  vitals?: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  }
): StatsSnapshot {
  const maxHull = vitals?.maxHull ?? BASE_HULL + stats.maxHullAdd;
  const maxShield = vitals?.maxShield ?? BASE_SHIELD + stats.maxShieldAdd;
  const armorRating = vitals?.armorRating ?? stats.armorRatingAdd;
  const rof = COMBAT.baseFireRate * stats.fireRateMul;
  const shotDmg = COMBAT.baseDamage * stats.damageMul;
  const multi = Math.max(1, COMBAT.multiShotBase + stats.multiShotAdd);
  const crit = Math.min(STAT_CAPS.critChance, stats.critChance);
  const critMult = STAT_CAPS.critMult;
  const avgCrit = 1 + crit * (critMult - 1);
  const dpsMain = rof * shotDmg * multi * avgCrit;

  const droneCount = stats.dronesUnlocked ? stats.droneCount : 0;
  // Rough drone DPS estimate (base drone ~4 dmg @ 1.2 rps)
  const droneDps =
    droneCount * 4 * 1.2 * stats.droneDamageMul * stats.droneFireRateMul;

  return {
    dpsMain: Math.round(dpsMain * 10) / 10,
    dpsLoadout: 0,
    rofMain: Math.round(rof * 100) / 100,
    critChance: crit,
    critMult,
    droneCount,
    droneDps: Math.round(droneDps * 10) / 10,
    hull: vitals?.hull ?? maxHull,
    maxHull,
    shield: vitals?.shield ?? maxShield,
    maxShield,
    armorEffective: armorEffectiveFromRating(armorRating),
    armorRating,
    topSpeedMul: stats.orbitSpeedMul,
    accelMul: stats.accelMul,
    hardpointsUsed: 0,
    hardpointsMax: stats.hardpoints,
    fragmentMul: stats.fragmentMul,
    damageMul: stats.damageMul,
    fireRateMul: stats.fireRateMul,
  };
}

const TAB_ICONS: Record<ShopTabId, string> = {
  ship: '🚀',
  main_gun: '⚡',
  loadouts: '◎',
  drones: '⬡',
  economy: '◈',
  global: '✶',
};

/**
 * Tabbed sequential shop + live stat panel.
 * Drop-in replacement for TechTreeUI (same show/hide/render/callbacks).
 */
export class ShopUI {
  private root: HTMLElement;
  private activeTab: ShopTabId = 'ship';
  private vitalsSnapshot: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  } | null = null;

  onClose: (() => void) | null = null;
  onPurchase: ((node: UpgradeNodeDef) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Optional vitals override for live panel (Game wires ShipVitals later). */
  setVitals(v: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  } | null): void {
    this.vitalsSnapshot = v;
  }

  show(tree: TechTree, currency: Currency): void {
    this.root.classList.remove('panel-hidden');
    this.render(tree, currency);
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }

  render(tree: TechTree, currency: Currency): void {
    const snap = buildStatsSnapshot(tree.stats, this.vitalsSnapshot ?? undefined);
    const visible = getSequentialVisibleNodes(tree.owned, currency, this.activeTab);

    // Recommended: cheapest affordable unlockable across all tabs
    let recommended: UpgradeNodeDef | null = null;
    for (const n of UPGRADES) {
      if (!tree.canPurchase(n)) continue;
      if (!tree.canAfford(n, currency)) continue;
      if (!recommended || n.cost < recommended.cost) recommended = n;
    }

    const isCore = (n: UpgradeNodeDef) => n.costCurrency === 'coreEnergy';

    let html = `
      <div class="shop-panel interactive tech-panel">
        <div class="shop-header tech-header">
          <div>
            <h2>TECH SHOP</h2>
            <div class="tech-header-sub">Sequential upgrades · live ship stats</div>
          </div>
          <div class="shop-currency-row">
            <div class="tech-currency">◈ ${Math.floor(currency.dataFragments)} FRAG</div>
            <div class="tech-currency core">◆ ${Math.floor(currency.coreEnergy)} CORE</div>
          </div>
          <button class="icon-btn" id="shop-close" type="button" aria-label="Close shop">✕</button>
        </div>

        <div class="shop-body">
          <aside class="shop-stats" aria-label="Ship stats">
            ${this.renderStatPanel(snap)}
          </aside>

          <div class="shop-main">
            <div class="shop-tabs" role="tablist">
              ${SHOP_TABS.map(
                (t) => `
                <button type="button" class="shop-tab ${t.id === this.activeTab ? 'active' : ''}"
                  data-tab="${t.id}" role="tab" aria-selected="${t.id === this.activeTab}">
                  <span class="shop-tab-icon">${TAB_ICONS[t.id]}</span>
                  <span class="shop-tab-label">${t.label}</span>
                </button>`
              ).join('')}
            </div>

            ${
              recommended
                ? `<div class="shop-reco">
                    <span class="shop-reco-tag">RECOMMENDED</span>
                    <span class="shop-reco-name">${recommended.name}</span>
                    <span class="shop-reco-desc">${recommended.description}</span>
                    <button class="shop-reco-buy" data-id="${recommended.id}" type="button">
                      BUY · ${recommended.cost} ${isCore(recommended) ? 'CORE' : 'FRAG'}
                    </button>
                  </div>`
                : `<div class="shop-reco dim">Destroy blocks to earn Fragments, then unlock the next rank in each chain.</div>`
            }

            <div class="shop-scroll">
              <div class="shop-cards">
                ${
                  this.activeTab === 'loadouts' && visible.length === 0
                    ? `<div class="shop-empty">Hardpoint weapons unlock as you progress. Check back after Core Energy milestones.</div>`
                    : visible.map((v) => this.renderCard(v, tree, currency)).join('')
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.root.innerHTML = html;

    this.root.querySelector('#shop-close')!.addEventListener('click', () => this.onClose?.());

    this.root.querySelectorAll('.shop-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.tab as ShopTabId;
        if (id && id !== this.activeTab) {
          this.activeTab = id;
          this.render(tree, currency);
        }
      });
    });

    this.root.querySelectorAll('.shop-card-buy, .shop-reco-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const node = UPGRADES.find((u) => u.id === id);
        if (node) this.onPurchase?.(node);
      });
    });
  }

  private renderStatPanel(s: StatsSnapshot): string {
    const armorPct = Math.round(s.armorEffective * 100);
    return `
      <div class="stat-panel-title">SHIP STATS</div>
      <div class="stat-grid">
        <div class="stat-row"><span>Hull</span><span class="stat-val">${Math.floor(s.hull)}/${Math.floor(s.maxHull)}</span></div>
        <div class="stat-bar"><i style="width:${(s.hull / Math.max(1, s.maxHull)) * 100}%" class="hull"></i></div>
        <div class="stat-row"><span>Shield</span><span class="stat-val">${Math.floor(s.shield)}/${Math.floor(s.maxShield)}</span></div>
        <div class="stat-bar"><i style="width:${(s.shield / Math.max(1, s.maxShield)) * 100}%" class="shield"></i></div>
        <div class="stat-row"><span>Armor DR</span><span class="stat-val">${armorPct}% <small>(${Math.floor(s.armorRating)})</small></span></div>
        <div class="stat-row"><span>Speed</span><span class="stat-val">×${s.topSpeedMul.toFixed(2)}</span></div>
        <div class="stat-row"><span>Accel</span><span class="stat-val">×${s.accelMul.toFixed(2)}</span></div>
        <div class="stat-div"></div>
        <div class="stat-row"><span>Main DPS</span><span class="stat-val cyan">${s.dpsMain}</span></div>
        <div class="stat-row"><span>RoF</span><span class="stat-val">${s.rofMain}/s</span></div>
        <div class="stat-row"><span>Dmg mult</span><span class="stat-val">×${s.damageMul.toFixed(2)}</span></div>
        <div class="stat-row"><span>Crit</span><span class="stat-val">${Math.round(s.critChance * 100)}% · ×${s.critMult}</span></div>
        <div class="stat-row"><span>Loadout DPS</span><span class="stat-val dim">${s.dpsLoadout || '—'}</span></div>
        <div class="stat-div"></div>
        <div class="stat-row"><span>Drones</span><span class="stat-val">${s.droneCount}</span></div>
        <div class="stat-row"><span>Drone DPS</span><span class="stat-val">${s.droneDps}</span></div>
        <div class="stat-row"><span>Hardpoints</span><span class="stat-val">${s.hardpointsUsed}/${s.hardpointsMax}</span></div>
        <div class="stat-row"><span>Frag mult</span><span class="stat-val">×${s.fragmentMul.toFixed(2)}</span></div>
      </div>
    `;
  }

  private renderCard(
    v: SequentialVisibleNode,
    tree: TechTree,
    currency: Currency
  ): string {
    const n = v.node;
    const isCore = n.costCurrency === 'coreEnergy';
    const unit = isCore ? 'CORE' : 'FRAG';
    const rankLabel = v.maxRank > 1 ? ` (${v.ownedCount}/${v.maxRank})` : '';

    if (v.maxed) {
      return `
        <div class="shop-card maxed">
          <div class="shop-card-top">
            <span class="shop-card-name">${n.name}${rankLabel}</span>
            <span class="shop-card-badge max">MAXED</span>
          </div>
          <div class="shop-card-desc">Chain complete</div>
        </div>`;
    }

    if (v.teaser) {
      return `
        <div class="shop-card teaser locked">
          <div class="shop-card-top">
            <span class="shop-card-name">${n.name}${rankLabel}</span>
            <span class="shop-card-badge lock">LOCKED</span>
          </div>
          <div class="shop-card-desc">${v.teaserLabel ?? 'Locked'}</div>
          <div class="shop-card-hint">${n.description}</div>
        </div>`;
    }

    const can = tree.canPurchase(n);
    const affordable = can && tree.canAfford(n, currency);
    const status = affordable
      ? `BUY · ${n.cost} ${unit}`
      : can
        ? `${n.cost} ${unit}`
        : 'LOCKED';

    return `
      <div class="shop-card ${affordable ? 'affordable' : ''} ${can ? '' : 'locked'}">
        <div class="shop-card-top">
          <span class="shop-card-name">${n.name}${rankLabel}</span>
          <span class="shop-card-rank">Rank ${v.rank}/${v.maxRank}</span>
        </div>
        <div class="shop-card-desc">${n.description}</div>
        <button class="shop-card-buy ${affordable ? 'buyable' : ''}" data-id="${n.id}" type="button"
          ${!can || !affordable ? 'disabled' : ''}>
          ${status}
        </button>
      </div>`;
  }
}
