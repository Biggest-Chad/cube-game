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
import {
  HARDPOINT_UNLOCK,
  MAX_HARDPOINTS,
  WEAPONS,
  getWeaponDef,
  weaponUnlockCost,
  type WeaponDef,
} from '../data/weapons';
import { armorEffectiveFromRating } from '../player/ShipVitals';
import type { TechTree, PlayerStats } from '../progression/TechTree';
import type { Currency } from '../progression/Currency';
import type { LoadoutState } from '../loadout/LoadoutState';

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
  },
  loadoutDps = 0,
  hardpointsUsed = 0
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
  const droneDps =
    droneCount * 4 * 1.2 * stats.droneDamageMul * stats.droneFireRateMul;

  return {
    dpsMain: Math.round(dpsMain * 10) / 10,
    dpsLoadout: Math.round(loadoutDps * 10) / 10,
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
    hardpointsUsed,
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
 * Tabbed sequential shop + integrated loadout management on LOADOUTS tab.
 */
export class ShopUI {
  private root: HTMLElement;
  private activeTab: ShopTabId = 'ship';
  private selectedSlot = 0;
  private vitalsSnapshot: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  } | null = null;
  private loadout: LoadoutState | null = null;
  private highestLevel = 1;

  onClose: (() => void) | null = null;
  onPurchase: ((node: UpgradeNodeDef) => void) | null = null;
  onBuyWeapon: ((defId: string) => boolean) | null = null;
  onEquipWeapon: ((slot: number, defId: string | null) => void) | null = null;
  onUpgradeBranch: ((slot: number, branchId: string) => boolean) | null = null;
  onUnlockHardpoint: ((slot: number) => boolean) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  setVitals(v: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  } | null): void {
    this.vitalsSnapshot = v;
  }

  setLoadoutContext(loadout: LoadoutState, highestLevel: number): void {
    this.loadout = loadout;
    this.highestLevel = highestLevel;
  }

  show(tree: TechTree, currency: Currency, tab?: ShopTabId): void {
    if (tab) this.activeTab = tab;
    this.root.classList.remove('panel-hidden');
    this.render(tree, currency);
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }

  render(tree: TechTree, currency: Currency): void {
    // Preserve scroll so successive purchases don't kick the list to the top
    const prevScroll = this.root.querySelector('.shop-scroll') as HTMLElement | null;
    const scrollTop = prevScroll?.scrollTop ?? 0;
    const prevStats = this.root.querySelector('.shop-stats') as HTMLElement | null;
    const statsScroll = prevStats?.scrollTop ?? 0;

    const L = this.loadout;
    const loadoutDps = L?.estimateLoadoutDps() ?? 0;
    const hpUsed = L ? L.allDerived().length : 0;
    const snap = buildStatsSnapshot(
      tree.stats,
      this.vitalsSnapshot ?? undefined,
      loadoutDps,
      hpUsed
    );
    const visible = getSequentialVisibleNodes(tree.owned, currency, this.activeTab);

    // Prefer first drone (Ally Protocol) as recommended until owned — smoother ramp
    let recommended: UpgradeNodeDef | null = null;
    const droneUnlock = UPGRADES.find((u) => u.id === 'drone_unlock');
    if (
      droneUnlock &&
      tree.canPurchase(droneUnlock) &&
      tree.canAfford(droneUnlock, currency)
    ) {
      recommended = droneUnlock;
    } else {
      for (const n of UPGRADES) {
        if (!tree.canPurchase(n)) continue;
        if (!tree.canAfford(n, currency)) continue;
        if (!recommended || n.cost < recommended.cost) recommended = n;
      }
    }
    // Prefer weapon buy hint on loadouts tab (respect stage gates)
    let weaponReco: WeaponDef | null = null;
    if (L && this.activeTab === 'loadouts') {
      for (const w of WEAPONS) {
        if (L.isOwned(w.id)) continue;
        if (w.unlock.type !== 'shop') continue;
        const minLv = w.unlock.minLevel ?? 1;
        if (this.highestLevel < minLv) continue;
        const c = weaponUnlockCost(w);
        if (currency.dataFragments >= c.fragments) {
          if (!weaponReco || c.fragments < weaponUnlockCost(weaponReco).fragments) {
            weaponReco = w;
          }
        }
      }
    }

    const isCore = (n: UpgradeNodeDef) => n.costCurrency === 'coreEnergy';

    this.root.innerHTML = `
      <div class="shop-panel interactive tech-panel">
        <div class="shop-header tech-header">
          <div>
            <h2>TECH SHOP</h2>
            <div class="tech-header-sub">Upgrades · loadouts · live ship stats</div>
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
              this.activeTab === 'loadouts' && weaponReco
                ? `<div class="shop-reco">
                    <span class="shop-reco-tag">LOADOUT</span>
                    <span class="shop-reco-name">${weaponReco.name}</span>
                    <span class="shop-reco-desc">${weaponReco.description}</span>
                    <button class="shop-reco-buy" data-buy-weapon="${weaponReco.id}" type="button">
                      BUY · ${weaponUnlockCost(weaponReco).fragments} FRAG
                    </button>
                  </div>`
                : recommended
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
              ${
                this.activeTab === 'loadouts'
                  ? this.renderLoadoutPanel(currency, tree)
                  : `<div class="shop-cards">${visible
                      .map((v) => this.renderCard(v, tree, currency))
                      .join('')}</div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(tree, currency);

    // Restore scroll after DOM rebuild (rAF so layout is ready)
    requestAnimationFrame(() => {
      const sc = this.root.querySelector('.shop-scroll') as HTMLElement | null;
      if (sc) sc.scrollTop = scrollTop;
      const st = this.root.querySelector('.shop-stats') as HTMLElement | null;
      if (st) st.scrollTop = statsScroll;
    });
  }

  private bindEvents(tree: TechTree, currency: Currency): void {
    this.root.querySelector('#shop-close')?.addEventListener('click', () => this.onClose?.());

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
        const el = btn as HTMLElement;
        const weaponId = el.dataset.buyWeapon;
        if (weaponId) {
          if (this.onBuyWeapon?.(weaponId)) this.render(tree, currency);
          return;
        }
        const id = el.dataset.id;
        if (id) {
          const node = UPGRADES.find((u) => u.id === id);
          if (node) this.onPurchase?.(node);
        }
      });
    });

    this.root.querySelectorAll('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedSlot = Number((el as HTMLElement).dataset.slot);
        this.render(tree, currency);
      });
    });

    this.root.querySelectorAll('[data-equip]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.equip ?? '';
        this.onEquipWeapon?.(this.selectedSlot, id === '' ? null : id);
        this.render(tree, currency);
      });
    });

    this.root.querySelectorAll('[data-branch]').forEach((el) => {
      el.addEventListener('click', () => {
        const branchId = (el as HTMLElement).dataset.branch!;
        if (this.onUpgradeBranch?.(this.selectedSlot, branchId)) {
          this.render(tree, currency);
        }
      });
    });

    this.root.querySelector('#hp-unlock')?.addEventListener('click', () => {
      if (this.onUnlockHardpoint?.(this.selectedSlot)) this.render(tree, currency);
    });
  }

  private renderLoadoutPanel(currency: Currency, tree: TechTree): string {
    const L = this.loadout;
    if (!L) {
      return `<div class="shop-empty">Loadout systems offline.</div>`;
    }

    let slots = '';
    for (let i = 0; i < MAX_HARDPOINTS; i++) {
      const unlocked = i < L.hardpointUnlocks;
      const inst = L.slots[i];
      const def = inst ? getWeaponDef(inst.defId) : null;
      const rule = HARDPOINT_UNLOCK[i];
      slots += `
        <button type="button" class="loadout-slot ${this.selectedSlot === i ? 'active' : ''} ${
          unlocked ? '' : 'locked'
        }" data-slot="${i}">
          <div class="loadout-slot-idx">HP${i + 1}</div>
          <div class="loadout-slot-name">${
            !unlocked
              ? `LOCKED · ${rule.costCore} CORE`
              : def
                ? def.name
                : 'EMPTY'
          }</div>
          <div class="loadout-slot-sub">${
            unlocked ? (def ? def.family : 'Select module') : 'Hardpoint bay'
          }</div>
        </button>`;
    }

    // Hardpoint upgrade cards from tech tree
    const hpCards = getSequentialVisibleNodes(tree.owned, currency, 'loadouts')
      .map((v) => this.renderCard(v, tree, currency))
      .join('');

    const slot = this.selectedSlot;
    const unlocked = slot < L.hardpointUnlocks;
    let detail = '';

    if (!unlocked) {
      const rule = HARDPOINT_UNLOCK[slot];
      const can =
        slot === L.hardpointUnlocks &&
        currency.coreEnergy >= rule.costCore &&
        this.highestLevel >= rule.minLevel;
      detail = `
        <div class="loadout-detail shop-card">
          <div class="shop-card-top"><span class="shop-card-name">Hardpoint ${slot + 1}</span></div>
          <div class="shop-card-desc">Unlock for <strong>${rule.costCore} Core Energy</strong>.</div>
          <button type="button" class="shop-card-buy ${can ? 'buyable' : ''}" id="hp-unlock" ${
            can ? '' : 'disabled'
          }>
            Unlock · ${rule.costCore} CORE
          </button>
        </div>`;
    } else {
      const equipped = L.getDerived(slot);
      detail = `
        <div class="loadout-detail">
          <div class="shop-card-top">
            <span class="shop-card-name">Hardpoint ${slot + 1}</span>
            <span class="shop-card-rank">${
              equipped
                ? `<span style="color:${equipped.def.colorCss}">${equipped.def.name}</span>`
                : 'Empty'
            }</span>
          </div>
          <div class="loadout-catalog">
            <button type="button" class="loadout-weapon empty" data-equip="">Unequip</button>
            ${WEAPONS.map((w) => {
              const owned = L.isOwned(w.id);
              const cost = weaponUnlockCost(w);
              const minLv =
                w.unlock.type === 'shop' || w.unlock.type === 'core'
                  ? w.unlock.minLevel ?? 1
                  : 1;
              const levelOk = this.highestLevel >= minLv;
              if (!owned && w.unlock.type === 'shop') {
                if (!levelOk) {
                  return `
                  <button type="button" class="loadout-weapon locked" disabled
                    style="--wcolor:${w.colorCss}">
                    <span class="lw-name">${w.name}</span>
                    <span class="lw-fam">LOCKED · STAGE ${minLv}+</span>
                    <span class="lw-desc">Clear earlier sectors first. Main gun &amp; drones first.</span>
                  </button>`;
                }
                const can = currency.dataFragments >= cost.fragments;
                return `
                  <button type="button" class="loadout-weapon buy ${can ? 'affordable' : ''}"
                    data-buy-weapon="${w.id}" style="--wcolor:${w.colorCss}">
                    <span class="lw-name">${w.name}</span>
                    <span class="lw-fam">BUY · ${cost.fragments} FRAG</span>
                    <span class="lw-desc">${w.description}</span>
                  </button>`;
              }
              if (!owned) return '';
              return `
                <button type="button" class="loadout-weapon ${
                  equipped?.def.id === w.id ? 'selected' : ''
                }" data-equip="${w.id}" style="--wcolor:${w.colorCss}">
                  <span class="lw-name">${w.name}</span>
                  <span class="lw-fam">${w.family}</span>
                  <span class="lw-desc">${w.description}</span>
                </button>`;
            }).join('')}
          </div>
          ${equipped ? this.renderBranches(equipped.def, slot, L, currency) : ''}
        </div>`;
    }

    return `
      <div class="loadout-shop-wrap">
        <div class="loadout-slots">${slots}</div>
        ${detail}
        <div class="shop-cards loadout-hp-cards">
          <div class="branch-title" style="grid-column:1/-1;margin:8px 0 4px;opacity:0.7;font-size:11px;letter-spacing:0.15em">HARDPOINT BAYS</div>
          ${hpCards}
        </div>
        <div class="loadout-dps">Loadout DPS est. ~${Math.round(L.estimateLoadoutDps())}</div>
      </div>`;
  }

  private renderBranches(
    def: WeaponDef,
    slot: number,
    L: LoadoutState,
    C: Currency
  ): string {
    const inst = L.slots[slot];
    if (!inst) return '';
    return `
      <div class="loadout-branches">
        <div class="branch-title">Weapon Branches</div>
        ${def.branches
          .map((b) => {
            const rank = inst.branchRanks[b.id] ?? 0;
            const check = L.canUpgradeBranch(slot, b.id, C.dataFragments);
            const maxed = rank >= b.maxRank;
            return `
              <div class="loadout-branch shop-card">
                <div class="lb-head">
                  <strong>${b.name}</strong>
                  <span>${rank}/${b.maxRank}</span>
                </div>
                <p>${b.description}</p>
                <button type="button" class="shop-card-buy ${check.ok ? 'buyable' : ''}"
                  data-branch="${b.id}" ${maxed || !check.ok ? 'disabled' : ''}>
                  ${maxed ? 'MAXED' : `Upgrade · ${check.cost} FRAG`}
                </button>
              </div>`;
          })
          .join('')}
      </div>`;
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
        <div class="stat-row"><span>Armor DR</span><span class="stat-val">${armorPct}%</span></div>
        <div class="stat-row"><span>Speed</span><span class="stat-val">×${s.topSpeedMul.toFixed(2)}</span></div>
        <div class="stat-div"></div>
        <div class="stat-row"><span>Main DPS</span><span class="stat-val cyan">${s.dpsMain}</span></div>
        <div class="stat-row"><span>RoF</span><span class="stat-val">${s.rofMain}/s</span></div>
        <div class="stat-row"><span>Loadout DPS</span><span class="stat-val">${s.dpsLoadout || '—'}</span></div>
        <div class="stat-row"><span>Hardpoints</span><span class="stat-val">${s.hardpointsUsed}/${s.hardpointsMax}</span></div>
        <div class="stat-row"><span>Drones</span><span class="stat-val">${s.droneCount}</span></div>
        <div class="stat-row"><span>Frag mult</span><span class="stat-val">×${s.fragmentMul.toFixed(2)}</span></div>
      </div>`;
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
    return `
      <div class="shop-card ${affordable ? 'affordable' : ''} ${can ? '' : 'locked'}">
        <div class="shop-card-top">
          <span class="shop-card-name">${n.name}${rankLabel}</span>
          <span class="shop-card-rank">Rank ${v.rank}/${v.maxRank}</span>
        </div>
        <div class="shop-card-desc">${n.description}</div>
        <button class="shop-card-buy ${affordable ? 'buyable' : ''}" data-id="${n.id}" type="button"
          ${!can || !affordable ? 'disabled' : ''}>
          ${affordable ? `BUY · ${n.cost} ${unit}` : can ? `${n.cost} ${unit}` : 'LOCKED'}
        </button>
      </div>`;
  }
}
