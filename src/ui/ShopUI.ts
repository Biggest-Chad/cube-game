import { COMBAT } from '../data/constants';
import {
  EVOLVE_UI_PREVIEW_RATIO,
  canEvolve,
  evolveCoreGrant,
  evolveCost,
} from '../data/evolve';
import {
  SHOP_TABS,
  STAT_CAPS,
  UPGRADES,
  getSequentialVisibleNodes,
  normalizeShopTabId,
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
import type { DroneBayController } from '../loadout/DroneBayState';
import {
  DRONE_BAY_MAX,
  DRONE_ROLES,
  freeInventory,
  type DroneRole,
} from '../data/drones';

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
  hardpointsUsed = 0,
  hardpointsMax = 1
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
    hardpointsMax: Math.max(1, Math.min(3, hardpointsMax)),
    fragmentMul: stats.fragmentMul,
    damageMul: stats.damageMul,
    fireRateMul: stats.fireRateMul,
  };
}

const TAB_ICONS: Record<ShopTabId, string> = {
  ship: '🚀',
  main_gun: '⚡',
  loadouts: '◎',
  drone_bays: '⬡',
  other: '✶',
};

/**
 * Tabbed sequential shop + integrated loadout / drone bay management.
 */
type LoadoutSubTab = 'weapons' | 'upgrades';
type DroneSubTab = 'stock' | 'upgrades';

export class ShopUI {
  private root: HTMLElement;
  private activeTab: ShopTabId = 'ship';
  private selectedSlot = 0;
  /** Loadouts panel: arsenal list vs branch upgrades for the selected hardpoint. */
  private loadoutSubTab: LoadoutSubTab = 'weapons';
  /** Drone bay panel: fleet stock vs drone tech upgrades. */
  private droneSubTab: DroneSubTab = 'stock';
  private vitalsSnapshot: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    armorRating: number;
  } | null = null;
  private loadout: LoadoutState | null = null;
  private droneBay: DroneBayController | null = null;
  private highestLevel = 1;
  private ascensionTier = 0;
  private confirmEvolve = false;
  private evolveExpanded = false;
  private dragPayload: { kind: 'drone' | 'weapon'; role?: DroneRole; weaponId?: string; fromSlot?: number } | null =
    null;
  private dragEndBound = false;

  onClose: (() => void) | null = null;
  onPurchase: ((node: UpgradeNodeDef) => void) | null = null;
  onBuyWeapon: ((defId: string) => boolean) | null = null;
  onEquipWeapon: ((slot: number, defId: string | null) => void) | null = null;
  onUpgradeBranch: ((slot: number, branchId: string) => boolean) | null = null;
  onUnlockHardpoint: ((slot: number) => boolean) | null = null;
  /** Returns true if evolve succeeded. */
  onEvolve: (() => boolean) | null = null;
  onUnlockDroneBay: (() => boolean) | null = null;
  onUnlockDroneType: ((role: DroneRole) => boolean) | null = null;
  onBuyDroneUnit: ((role: DroneRole) => boolean) | null = null;
  onAssignDroneSlot: ((slot: number, role: DroneRole | null) => boolean) | null = null;
  onMoveDroneSlot: ((from: number, to: number) => boolean) | null = null;

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

  setLoadoutContext(
    loadout: LoadoutState,
    highestLevel: number,
    ascensionTier = 0
  ): void {
    this.loadout = loadout;
    this.highestLevel = highestLevel;
    this.ascensionTier = ascensionTier;
  }

  setDroneBay(ctrl: DroneBayController | null): void {
    this.droneBay = ctrl;
  }

  show(tree: TechTree, currency: Currency, tab?: ShopTabId | string): void {
    const normalized = normalizeShopTabId(tab ?? null);
    if (normalized) {
      this.activeTab = normalized;
      // Deep-link legacy "drone tech" → DRONES upgrades sub-tab
      if (tab === 'drones') this.droneSubTab = 'upgrades';
    }
    // Unknown ids: keep previous activeTab (never assign garbage)
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
    const hpMax = L?.hardpointUnlocks ?? 1;
    const snap = buildStatsSnapshot(
      tree.stats,
      this.vitalsSnapshot ?? undefined,
      loadoutDps,
      hpUsed,
      hpMax
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
    /** Equipped weapon branch upgrade recommendation */
    let branchReco: {
      slot: number;
      branchId: string;
      name: string;
      cost: number;
      weaponName: string;
    } | null = null;
    if (L) {
      for (let s = 0; s < L.hardpointUnlocks; s++) {
        const der = L.getDerived(s);
        if (!der) continue;
        for (const b of der.def.branches) {
          const check = L.canUpgradeBranch(s, b.id, currency.dataFragments);
          if (!check.ok || check.nextRank <= 0) continue;
          if (check.nextRank > b.maxRank) continue;
          if (currency.dataFragments < check.cost) continue;
          if (!branchReco || check.cost < branchReco.cost) {
            branchReco = {
              slot: s,
              branchId: b.id,
              name: b.name,
              cost: check.cost,
              weaponName: der.def.name,
            };
          }
        }
      }
    }
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

    // Weapon branch recos only on LOAD tab — elsewhere prefer sequential shop chains
    const showBranchReco = this.activeTab === 'loadouts' && branchReco;
    const recoHtml =
      this.activeTab === 'loadouts' && weaponReco
        ? `<div class="shop-reco compact">
            <span class="shop-reco-tag">LOADOUT</span>
            <span class="shop-reco-name">${weaponReco.name}</span>
            <button class="shop-reco-buy" data-buy-weapon="${weaponReco.id}" type="button">
              BUY · ${weaponUnlockCost(weaponReco).fragments} FRAG
            </button>
          </div>`
        : showBranchReco
          ? `<div class="shop-reco compact">
              <span class="shop-reco-tag">WEAPON</span>
              <span class="shop-reco-name">${branchReco!.weaponName} · ${branchReco!.name}</span>
              <button class="shop-reco-buy" type="button"
                data-reco-branch="${branchReco!.branchId}" data-reco-slot="${branchReco!.slot}">
                UPGRADE · ${branchReco!.cost} FRAG
              </button>
            </div>`
          : recommended
            ? `<div class="shop-reco compact">
                <span class="shop-reco-tag">REC</span>
                <span class="shop-reco-name">${recommended.name}</span>
                <button class="shop-reco-buy" data-id="${recommended.id}" type="button">
                  BUY · ${recommended.cost} ${isCore(recommended) ? 'CORE' : 'FRAG'}
                </button>
              </div>`
            : '';

    this.root.innerHTML = `
      <div class="shop-panel interactive tech-panel shop-dense">
        <div class="shop-header tech-header shop-header-dense">
          <div class="shop-header-brand">
            <h2>SHOP</h2>
          </div>
          <div class="shop-tabs shop-tabs-header" role="tablist">
            ${SHOP_TABS.map(
              (t) => `
              <button type="button" class="shop-tab ${t.id === this.activeTab ? 'active' : ''}"
                data-tab="${t.id}" role="tab" aria-selected="${t.id === this.activeTab}">
                <span class="shop-tab-icon">${TAB_ICONS[t.id]}</span>
                <span class="shop-tab-label">${t.label}</span>
              </button>`
            ).join('')}
          </div>
          <div class="shop-currency-row">
            <div class="tech-currency">◈ ${Math.floor(currency.dataFragments)}</div>
            <div class="tech-currency core">◆ ${Math.floor(currency.coreEnergy)}</div>
          </div>
          <button class="icon-btn" id="shop-close" type="button" aria-label="Close shop">✕</button>
        </div>

        <div class="shop-body">
          <aside class="shop-stats" aria-label="Ship stats">
            ${this.renderStatPanel(snap)}
            <div class="shop-evolve-dock">
              ${this.renderEvolveBanner(currency)}
            </div>
          </aside>

          <div class="shop-main">
            ${recoHtml}
            <div class="shop-scroll">
              ${
                this.activeTab === 'loadouts'
                  ? this.renderLoadoutPanel(currency, tree)
                  : this.activeTab === 'drone_bays'
                    ? this.renderDroneBayPanel(currency, tree)
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
    this.root.querySelector('#shop-close')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onClose?.();
    });

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
      el.addEventListener('click', (ev) => {
        // Outer pad + inner hit both carry data-slot; stop double full re-render
        ev.stopPropagation();
        this.selectedSlot = Number((el as HTMLElement).dataset.slot);
        this.render(tree, currency);
      });
    });
    // Clear stale HTML5 drag payload once (not every re-render)
    if (!this.dragEndBound) {
      this.dragEndBound = true;
      this.root.addEventListener('dragend', () => {
        this.dragPayload = null;
        this.clearPickVisual();
      });
    }

    this.root.querySelectorAll('[data-loadout-sub]').forEach((el) => {
      el.addEventListener('click', () => {
        const sub = (el as HTMLElement).dataset.loadoutSub as LoadoutSubTab;
        if (sub === 'weapons' || sub === 'upgrades') {
          this.loadoutSubTab = sub;
          this.render(tree, currency);
        }
      });
    });

    this.root.querySelectorAll('[data-drone-sub]').forEach((el) => {
      el.addEventListener('click', () => {
        if ((el as HTMLButtonElement).disabled) return;
        const sub = (el as HTMLElement).dataset.droneSub as DroneSubTab;
        if (sub === 'stock' || sub === 'upgrades') {
          this.droneSubTab = sub;
          this.render(tree, currency);
        }
      });
    });

    this.root.querySelectorAll('[data-loadout-upgrade]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const slot = Number((el as HTMLElement).dataset.loadoutUpgrade);
        if (!Number.isFinite(slot)) return;
        this.selectedSlot = slot;
        this.loadoutSubTab = 'upgrades';
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
    this.root.querySelectorAll('[data-equip-btn]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = (el as HTMLElement).dataset.equipBtn ?? '';
        if (!id) return;
        this.onEquipWeapon?.(this.selectedSlot, id);
        this.render(tree, currency);
      });
    });

    this.root.querySelectorAll('[data-branch]').forEach((el) => {
      el.addEventListener('click', () => {
        const branchId = (el as HTMLElement).dataset.branch!;
        const slotAttr = (el as HTMLElement).dataset.branchSlot;
        const slot =
          slotAttr != null && slotAttr !== ''
            ? Number(slotAttr)
            : this.selectedSlot;
        if (this.onUpgradeBranch?.(slot, branchId)) {
          this.render(tree, currency);
        }
      });
    });

    this.root.querySelector('#hp-unlock')?.addEventListener('click', () => {
      if (this.onUnlockHardpoint?.(this.selectedSlot)) this.render(tree, currency);
    });

    this.root.querySelector('#evolve-toggle')?.addEventListener('click', () => {
      this.evolveExpanded = !this.evolveExpanded;
      this.confirmEvolve = false;
      this.render(tree, currency);
    });
    this.root.querySelector('#evolve-open')?.addEventListener('click', () => {
      this.confirmEvolve = true;
      this.evolveExpanded = true;
      this.render(tree, currency);
    });
    this.root.querySelector('#evolve-cancel')?.addEventListener('click', () => {
      this.confirmEvolve = false;
      this.render(tree, currency);
    });
    this.root.querySelector('#evolve-confirm')?.addEventListener('click', () => {
      if (this.onEvolve?.()) {
        this.confirmEvolve = false;
        this.evolveExpanded = false;
        this.render(tree, currency);
      }
    });
    this.root.querySelectorAll('[data-reco-branch]').forEach((el) => {
      el.addEventListener('click', () => {
        const branchId = (el as HTMLElement).dataset.recoBranch!;
        const slot = Number((el as HTMLElement).dataset.recoSlot ?? 0);
        if (this.onUpgradeBranch?.(slot, branchId)) this.render(tree, currency);
      });
    });

    this.bindDroneBayDnD(tree, currency);
    this.bindWeaponDnD(tree, currency);
    // Re-apply pick highlight after DOM rebuild (touch equip flow)
    if (this.dragPayload) this.markPickArmed();
  }

  private clearPickVisual(): void {
    this.root.querySelectorAll('.pick-armed').forEach((el) => el.classList.remove('pick-armed'));
    this.root.querySelectorAll('.drop-ready').forEach((el) => el.classList.remove('drop-ready'));
  }

  private markPickArmed(): void {
    this.clearPickVisual();
    const p = this.dragPayload;
    if (!p) return;
    if (p.kind === 'weapon' && p.weaponId) {
      this.root
        .querySelectorAll(`[data-drag-weapon="${p.weaponId}"]`)
        .forEach((el) => el.classList.add('pick-armed'));
      this.root.querySelectorAll('[data-hp-drop]').forEach((el) => {
        if (!(el as HTMLElement).classList.contains('locked')) {
          el.classList.add('drop-ready');
        }
      });
    }
    if (p.kind === 'drone' && p.role) {
      this.root
        .querySelectorAll(`[data-drag-drone="${p.role}"]`)
        .forEach((el) => el.classList.add('pick-armed'));
      this.root.querySelectorAll('[data-bay-slot]').forEach((el) => el.classList.add('drop-ready'));
    }
  }

  private bindDroneBayDnD(tree: TechTree, currency: Currency): void {
    this.root.querySelector('#drone-bay-unlock')?.addEventListener('click', () => {
      if (this.onUnlockDroneBay?.()) this.render(tree, currency);
    });
    this.root.querySelectorAll('[data-unlock-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).dataset.unlockType as DroneRole;
        if (this.onUnlockDroneType?.(role)) this.render(tree, currency);
      });
    });
    this.root.querySelectorAll('[data-buy-unit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).dataset.buyUnit as DroneRole;
        if (this.onBuyDroneUnit?.(role)) this.render(tree, currency);
      });
    });
    // Touch-friendly assign: put free unit into first empty bay
    this.root.querySelectorAll('[data-assign-drone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).dataset.assignDrone as DroneRole;
        const B = this.droneBay;
        if (!B || !role) return;
        const empty = B.state.slots.findIndex((s) => s == null);
        if (empty < 0) return;
        this.dragPayload = null;
        this.clearPickVisual();
        if (this.onAssignDroneSlot?.(empty, role)) this.render(tree, currency);
      });
    });
    this.root.querySelectorAll('[data-clear-bay]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const slot = Number((btn as HTMLElement).dataset.clearBay);
        if (this.onAssignDroneSlot?.(slot, null)) this.render(tree, currency);
      });
      btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
      btn.addEventListener('dragstart', (ev) => ev.preventDefault());
    });

    // Inventory chips — drag + tap-to-pick (Android WebView DnD is unreliable)
    this.root.querySelectorAll('[data-drag-drone]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const role = (el as HTMLElement).dataset.dragDrone as DroneRole;
        this.dragPayload = { kind: 'drone', role };
        (e as DragEvent).dataTransfer?.setData('text/plain', `drone:${role}`);
        (e as DragEvent).dataTransfer!.effectAllowed = 'copyMove';
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if ((el as HTMLElement).getAttribute('draggable') === 'false') return;
        const role = (el as HTMLElement).dataset.dragDrone as DroneRole;
        if (
          this.dragPayload?.kind === 'drone' &&
          this.dragPayload.role === role &&
          this.dragPayload.fromSlot == null
        ) {
          this.dragPayload = null;
          this.clearPickVisual();
          return;
        }
        this.dragPayload = { kind: 'drone', role };
        this.markPickArmed();
      });
    });
    // Bay slots as sources (move) and targets
    this.root.querySelectorAll('[data-bay-slot]').forEach((el) => {
      const slot = Number((el as HTMLElement).dataset.baySlot);
      el.addEventListener('dragstart', (e) => {
        const role = (el as HTMLElement).dataset.bayRole as DroneRole | undefined;
        if (!role) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { kind: 'drone', role, fromSlot: slot };
        (e as DragEvent).dataTransfer?.setData('text/plain', `drone-slot:${slot}`);
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        (el as HTMLElement).classList.add('drop-hover');
      });
      el.addEventListener('dragleave', () => {
        (el as HTMLElement).classList.remove('drop-hover');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        (el as HTMLElement).classList.remove('drop-hover');
        const p = this.dragPayload;
        this.dragPayload = null;
        this.clearPickVisual();
        if (!p || p.kind !== 'drone') return;
        if (p.fromSlot != null) {
          if (this.onMoveDroneSlot?.(p.fromSlot, slot)) this.render(tree, currency);
        } else if (p.role) {
          if (this.onAssignDroneSlot?.(slot, p.role)) this.render(tree, currency);
        }
      });
      // Tap target when a drone is picked (touch path)
      el.addEventListener('click', (e) => {
        const p = this.dragPayload;
        if (!p || p.kind !== 'drone') return;
        e.preventDefault();
        e.stopPropagation();
        this.dragPayload = null;
        this.clearPickVisual();
        if (p.fromSlot != null) {
          if (this.onMoveDroneSlot?.(p.fromSlot, slot)) this.render(tree, currency);
        } else if (p.role) {
          if (this.onAssignDroneSlot?.(slot, p.role)) this.render(tree, currency);
        }
      });
    });
  }

  private bindWeaponDnD(tree: TechTree, currency: Currency): void {
    this.root.querySelectorAll('[data-drag-weapon]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const id = (el as HTMLElement).dataset.dragWeapon!;
        this.dragPayload = { kind: 'weapon', weaponId: id };
        (e as DragEvent).dataTransfer?.setData('text/plain', `weapon:${id}`);
      });
      // Tap-to-pick for touch / WebView (no HTML5 DnD)
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = (el as HTMLElement).dataset.dragWeapon!;
        if (this.dragPayload?.kind === 'weapon' && this.dragPayload.weaponId === id) {
          this.dragPayload = null;
          this.clearPickVisual();
          return;
        }
        this.dragPayload = { kind: 'weapon', weaponId: id };
        this.markPickArmed();
      });
    });
    this.root.querySelectorAll('[data-hp-drop]').forEach((el) => {
      const slot = Number((el as HTMLElement).dataset.hpDrop);
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        (el as HTMLElement).classList.add('drop-hover');
      });
      el.addEventListener('dragleave', () => (el as HTMLElement).classList.remove('drop-hover'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        (el as HTMLElement).classList.remove('drop-hover');
        const p = this.dragPayload;
        this.dragPayload = null;
        this.clearPickVisual();
        if (!p || p.kind !== 'weapon' || !p.weaponId) return;
        this.onEquipWeapon?.(slot, p.weaponId);
        this.selectedSlot = slot;
        this.render(tree, currency);
      });
      // Tap hardpoint while a weapon is picked → equip
      el.addEventListener('click', (e) => {
        const p = this.dragPayload;
        if (!p || p.kind !== 'weapon' || !p.weaponId) return;
        if ((el as HTMLElement).classList.contains('locked')) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragPayload = null;
        this.clearPickVisual();
        this.onEquipWeapon?.(slot, p.weaponId);
        this.selectedSlot = slot;
        this.render(tree, currency);
      });
    });
  }

  /** Relative % positions for drone bay drop pads on the blueprint (ring layout). */
  private baySlotStyle(index: number, total: number): string {
    const n = Math.max(total, 1);
    // Even ring around the hull; tighten radius as bay count grows
    const angle = -Math.PI / 2 + (index / n) * Math.PI * 2;
    const r = n <= 4 ? 36 : n <= 8 ? 38 : 40;
    const x = 50 + Math.cos(angle) * r;
    const y = 50 + Math.sin(angle) * r;
    return `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%`;
  }

  private renderDroneBayPanel(currency: Currency, tree: TechTree): string {
    const B = this.droneBay;
    if (!B) {
      return `<div class="shop-empty">Drone bay systems offline.</div>`;
    }
    const st = B.state;
    const dronesOn = tree.stats.dronesUnlocked || tree.owned.has('drone_unlock');
    // Without Ally Protocol, always show UPGRADES (where the unlock lives)
    const sub: DroneSubTab = !dronesOn ? 'upgrades' : this.droneSubTab;
    const stockActive = sub === 'stock';
    const upgradesActive = sub === 'upgrades';

    const techCards = getSequentialVisibleNodes(tree.owned, currency, 'drone_bays')
      .map((v) => this.renderCard(v, tree, currency))
      .join('');

    const bayCost = B.nextBayCost();
    const canBay = dronesOn && B.canUnlockBay() && currency.dataFragments >= bayCost;
    const bayCount = Math.max(st.bays, 0);

    // Compact horizontal bay chips (not a full-screen blueprint)
    const baySlots =
      !dronesOn
        ? `<div class="lo-slot lo-slot-msg">Unlock Ally Protocol in UPGRADES</div>`
        : bayCount === 0
          ? `<div class="lo-slot lo-slot-msg">No bays — unlock below</div>`
          : Array.from({ length: bayCount }, (_, i) => {
              const role = st.slots[i] ?? null;
              const def = role ? DRONE_ROLES[role] : null;
              return `
                <div class="lo-slot bay-slot ${role ? 'filled' : 'empty'}"
                  style="${def ? `--accent:${def.colorCss}` : ''}"
                  data-bay-slot="${i}" data-bay-role="${role ?? ''}"
                  draggable="${role ? 'true' : 'false'}"
                  title="${def ? def.name : `Bay ${i + 1} empty`}">
                  <span class="lo-slot-idx">B${i + 1}</span>
                  <span class="lo-slot-name">${def ? def.name : 'Empty'}</span>
                  ${
                    def
                      ? `<button type="button" class="lo-slot-x" data-clear-bay="${i}" title="Clear">×</button>`
                      : ''
                  }
                </div>`;
            }).join('');

    const stockBody = !dronesOn
      ? `<div class="lo-empty">
          <strong>Fleet offline</strong>
          <p class="dim">Buy <strong>Ally Protocol</strong> under UPGRADES to authorize bays and field drones.</p>
          <button type="button" class="menu-btn primary" data-drone-sub="upgrades">GO TO UPGRADES</button>
        </div>`
      : `
        <div class="lo-toolbar">
          <button type="button" class="menu-btn primary bp-unlock-btn" id="drone-bay-unlock"
            ${canBay ? '' : 'disabled'}>
            ${B.canUnlockBay() ? `+ BAY · ${bayCost} FRAG` : `MAX ${DRONE_BAY_MAX} BAYS`}
          </button>
          <span class="dim">${st.bays}/${DRONE_BAY_MAX} bays · ${B.equippedCount()} active · tap type then bay</span>
        </div>
        <div class="lo-card-grid">
          ${(['fighter', 'bomber', 'defender'] as DroneRole[])
            .map((role) => {
              const def = DRONE_ROLES[role];
              const unlocked = B.isTypeUnlocked(role);
              const free = freeInventory(st, role);
              const owned = st.owned[role] ?? 0;
              const levelOk = this.highestLevel >= def.unlockLevel;
              if (!unlocked) {
                const can = levelOk && currency.dataFragments >= def.unlockCost;
                return `
                  <div class="lo-card locked" style="--accent:${def.colorCss}">
                    <div class="lo-card-title">${def.name}</div>
                    <div class="lo-card-sub">${levelOk ? `${def.unlockCost} FRAG` : `STAGE ${def.unlockLevel}+`}</div>
                    <p class="lo-card-desc">${def.description}</p>
                    <button type="button" class="shop-card-buy ${can ? 'buyable' : ''}"
                      data-unlock-type="${role}" ${can ? '' : 'disabled'}>
                      ${levelOk ? 'UNLOCK TYPE' : 'LOCKED'}
                    </button>
                  </div>`;
              }
              const canBuy = currency.dataFragments >= def.unitCost;
              const emptyBay = st.slots.findIndex((s) => s == null);
              const canAssign = free > 0 && emptyBay >= 0;
              return `
                <div class="lo-card" style="--accent:${def.colorCss}">
                  <div class="lo-card-title">${def.name}</div>
                  <div class="lo-card-sub">Free ${free} · Own ${owned}</div>
                  <p class="lo-card-desc">${def.description}</p>
                  <button type="button" class="lo-pick"
                    draggable="${free > 0 ? 'true' : 'false'}"
                    data-drag-drone="${role}"
                    ${free > 0 ? '' : 'disabled'}>
                    ${free > 0 ? '☰ TAP / DRAG TO BAY' : 'NONE FREE'}
                  </button>
                  <div class="lo-card-actions">
                    <button type="button" class="loadout-equip-btn ${canAssign ? '' : 'equipped'}"
                      data-assign-drone="${role}" ${canAssign ? '' : 'disabled'}>
                      ${canAssign ? 'ASSIGN' : free <= 0 ? 'NONE' : 'FULL'}
                    </button>
                    <button type="button" class="shop-card-buy ${canBuy ? 'buyable' : ''}"
                      data-buy-unit="${role}" ${canBuy ? '' : 'disabled'}>
                      +1 · ${def.unitCost}
                    </button>
                  </div>
                </div>`;
            })
            .join('')}
        </div>`;

    const upgradesBody = `
      <div class="lo-upgrades-banner">
        <div>
          <strong>Drone Tech</strong>
          <span class="dim"> · ${dronesOn ? 'fleet online' : 'buy Ally Protocol first'}</span>
        </div>
        ${
          dronesOn
            ? `<button type="button" class="loadout-equip-btn" data-drone-sub="stock">FLEET</button>`
            : ''
        }
      </div>
      <div class="shop-cards lo-tech-cards">
        ${
          techCards ||
          `<div class="dim" style="padding:10px">All drone tech chains complete.</div>`
        }
      </div>`;

    return `
      <div class="lo-panel drone-lo">
        <div class="lo-slot-row" aria-label="Drone bays">
          ${baySlots}
        </div>
        <div class="lo-subtabs" role="tablist">
          <button type="button" role="tab" class="lo-subtab ${stockActive ? 'active' : ''}"
            data-drone-sub="stock" aria-selected="${stockActive}"
            ${dronesOn ? '' : 'disabled'}>
            FLEET
          </button>
          <button type="button" role="tab" class="lo-subtab ${upgradesActive ? 'active' : ''}"
            data-drone-sub="upgrades" aria-selected="${upgradesActive}">
            UPGRADES
          </button>
        </div>
        <div class="lo-body">
          ${upgradesActive ? upgradesBody : stockBody}
        </div>
      </div>`;
  }

  /** Shared top-down ship hull used by loadout + drone blueprints. */
  private renderShipBlueprintSvg(): string {
    return `
      <svg class="bp-hull" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="bpHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,240,255,0.35)"/>
            <stop offset="50%" stop-color="rgba(0,80,120,0.25)"/>
            <stop offset="100%" stop-color="rgba(255,0,170,0.2)"/>
          </linearGradient>
          <filter id="bpGlow">
            <feGaussianBlur stdDeviation="1.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <!-- Outer glow silhouette -->
        <path d="M100 18 L128 72 L148 88 L155 130 L148 175 L128 200 L100 222 L72 200 L52 175 L45 130 L52 88 L72 72 Z"
          fill="none" stroke="rgba(0,240,255,0.15)" stroke-width="6" filter="url(#bpGlow)"/>
        <!-- Main hull -->
        <path d="M100 22 L124 70 L142 86 L148 128 L142 172 L124 196 L100 216 L76 196 L58 172 L52 128 L58 86 L76 70 Z"
          fill="url(#bpHullGrad)" stroke="rgba(0,240,255,0.55)" stroke-width="1.5"/>
        <!-- Cockpit -->
        <ellipse cx="100" cy="78" rx="14" ry="22" fill="rgba(0,240,255,0.18)" stroke="rgba(0,240,255,0.5)" stroke-width="1"/>
        <!-- Core reactor -->
        <circle cx="100" cy="130" r="16" fill="rgba(255,0,170,0.12)" stroke="rgba(255,0,170,0.45)" stroke-width="1"/>
        <circle cx="100" cy="130" r="6" fill="rgba(0,240,255,0.35)"/>
        <!-- Wing hardpoint guides -->
        <line x1="58" y1="110" x2="42" y2="118" stroke="rgba(0,240,255,0.25)" stroke-width="1" stroke-dasharray="3 2"/>
        <line x1="142" y1="110" x2="158" y2="118" stroke="rgba(0,240,255,0.25)" stroke-width="1" stroke-dasharray="3 2"/>
        <line x1="100" y1="22" x2="100" y2="8" stroke="rgba(0,240,255,0.25)" stroke-width="1" stroke-dasharray="3 2"/>
        <!-- Grid ticks -->
        <g opacity="0.2" stroke="rgba(0,240,255,0.5)" stroke-width="0.5">
          <line x1="20" y1="120" x2="180" y2="120"/>
          <line x1="100" y1="10" x2="100" y2="230"/>
        </g>
        <text x="100" y="236" text-anchor="middle" fill="rgba(0,240,255,0.35)" font-size="8" letter-spacing="2">HULL BLUEPRINT</text>
      </svg>`;
  }

  private renderEvolveBanner(currency: Currency): string {
    const cost = evolveCost(this.ascensionTier);
    const check = canEvolve(
      currency.dataFragments,
      this.highestLevel,
      this.ascensionTier
    );
    const ratio = currency.dataFragments / Math.max(1, cost);
    const grant = evolveCoreGrant(this.ascensionTier + 1);
    const leftover = Math.max(0, currency.dataFragments - cost);
    const convertCores = Math.floor(leftover / 1000);

    // Compact chip always — expand on demand
    if (!this.evolveExpanded && !this.confirmEvolve) {
      return `
        <button type="button" class="evolve-chip collapsible ${check.ok ? 'ready' : ''}" id="evolve-toggle">
          <span>ASC ${this.ascensionTier} · Evolve ${cost.toLocaleString()} FRAG · +${grant} CORE</span>
          <span class="evolve-chip-caret">${ratio >= EVOLVE_UI_PREVIEW_RATIO ? '▸ expand' : `${Math.floor(ratio * 100)}%`}</span>
        </button>`;
    }

    if (this.confirmEvolve) {
      return `
        <div class="evolve-panel confirm">
          <div class="evolve-title">EVOLVE HULL?</div>
          <p class="evolve-desc">
            Spend <strong>${cost.toLocaleString()} FRAG</strong>. Retrain combat shop.
            Ascension <strong>${this.ascensionTier + 1}</strong> · grant <strong>${grant} CORE</strong>.
            ${
              convertCores > 0
                ? `Leftover converts ≈ <strong>${convertCores} CORE</strong> (1000 FRAG → 1).`
                : 'Leftover FRAG convert at 1000 → 1 CORE.'
            }
            Weapons &amp; Research kept.
          </p>
          <div class="evolve-actions">
            <button type="button" class="menu-btn" id="evolve-cancel">Cancel</button>
            <button type="button" class="menu-btn primary" id="evolve-confirm"
              ${check.ok ? '' : 'disabled'}>
              CONFIRM EVOLVE
            </button>
          </div>
          ${check.reason ? `<div class="evolve-warn">${check.reason}</div>` : ''}
        </div>`;
    }

    return `
      <div class="evolve-panel ${check.ok ? 'ready' : ''}">
        <div class="evolve-title-row">
          <div class="evolve-title">EVOLVE · ASCENSION ${this.ascensionTier}</div>
          <button type="button" class="evolve-collapse" id="evolve-toggle">Collapse</button>
        </div>
        <p class="evolve-desc">
          Permanent baselines + Core for Research. Cost
          <strong>${cost.toLocaleString()} FRAG</strong>
          ${check.minLevel ? ` · Sector ${check.minLevel}+` : ''}.
          Surplus FRAG → CORE at 1000:1 after evolve.
        </p>
        <button type="button" class="menu-btn primary evolve-btn" id="evolve-open"
          ${ratio >= EVOLVE_UI_PREVIEW_RATIO ? '' : 'disabled'}>
          ${check.ok ? 'EVOLVE HULL' : `EVOLVE · ${Math.floor(ratio * 100)}%`}
        </button>
      </div>`;
  }

  /** Hardpoint pad positions on the loadout blueprint (nose / port / starboard). */
  private static readonly HP_PAD_POS: Array<{ left: string; top: string; label: string }> = [
    { left: '50%', top: '12%', label: 'NOSE' },
    { left: '14%', top: '48%', label: 'PORT' },
    { left: '86%', top: '48%', label: 'STBD' },
  ];

  private renderLoadoutPanel(currency: Currency, tree: TechTree): string {
    const L = this.loadout;
    if (!L) {
      return `<div class="shop-empty">Loadout systems offline.</div>`;
    }

    const slot = this.selectedSlot;
    const unlocked = slot < L.hardpointUnlocks;
    const selectedDerived = unlocked ? L.getDerived(slot) : null;
    const sub = this.loadoutSubTab;
    const weaponsActive = sub === 'weapons';
    const upgradesActive = sub === 'upgrades';
    const labels = ['NOSE', 'PORT', 'STBD'];

    const slotsHtml = Array.from({ length: MAX_HARDPOINTS }, (_, i) => {
      const padUnlocked = i < L.hardpointUnlocks;
      const inst = L.slots[i];
      const def = inst ? getWeaponDef(inst.defId) : null;
      const rule = HARDPOINT_UNLOCK[i];
      const lockedHint = !padUnlocked
        ? `ASC ${rule.minAscension}+ · ${rule.costCore} CORE`
        : def
          ? def.name
          : 'EMPTY';
      return `
        <div class="lo-slot hp-slot loadout-slot ${this.selectedSlot === i ? 'active' : ''} ${
          padUnlocked ? (def ? 'filled' : 'empty') : 'locked'
        }"
          style="${def ? `--accent:${def.colorCss}` : ''}"
          data-slot="${i}" data-hp-drop="${i}"
          title="${lockedHint}">
          <span class="lo-slot-idx">HP${i + 1}</span>
          <span class="lo-slot-label">${labels[i] ?? ''}</span>
          <span class="lo-slot-name">${
            !padUnlocked ? 'Locked' : def ? def.name : 'Empty'
          }</span>
          ${
            padUnlocked && def
              ? `<button type="button" class="lo-slot-upg" data-loadout-upgrade="${i}">UPG</button>`
              : ''
          }
        </div>`;
    }).join('');

    const weaponCards = WEAPONS.map((w) => {
      const owned = L.isOwned(w.id);
      const cost = weaponUnlockCost(w);
      const minLv =
        w.unlock.type === 'shop' || w.unlock.type === 'core' ? w.unlock.minLevel ?? 1 : 1;
      const levelOk = this.highestLevel >= minLv;
      const equippedOnSelected = unlocked && selectedDerived?.def.id === w.id;
      if (!owned && w.unlock.type === 'shop') {
        if (!levelOk) {
          return `
            <div class="lo-card locked" style="--accent:${w.colorCss}">
              <div class="lo-card-title">${w.name}</div>
              <div class="lo-card-sub">STAGE ${minLv}+</div>
            </div>`;
        }
        const can = currency.dataFragments >= cost.fragments;
        return `
          <div class="lo-card buy" style="--accent:${w.colorCss}">
            <div class="lo-card-title">${w.name}</div>
            <div class="lo-card-sub">${w.family}</div>
            <p class="lo-card-desc">${w.description}</p>
            <button type="button" class="shop-card-buy ${can ? 'buyable' : ''}"
              data-buy-weapon="${w.id}" ${can ? '' : 'disabled'}>
              BUY · ${cost.fragments} FRAG
            </button>
          </div>`;
      }
      if (!owned) return '';
      return `
        <div class="lo-card ${equippedOnSelected ? 'selected' : ''}" style="--accent:${w.colorCss}">
          <div class="lo-card-title">${w.name}</div>
          <div class="lo-card-sub">${w.family}${equippedOnSelected ? ' · ON HP' : ''}</div>
          <p class="lo-card-desc">${w.description}</p>
          <button type="button" class="lo-pick" draggable="true" data-drag-weapon="${w.id}">
            ☰ TAP / DRAG TO SLOT
          </button>
          <div class="lo-card-actions">
            <button type="button" class="loadout-equip-btn ${equippedOnSelected ? 'equipped' : ''}"
              data-equip-btn="${w.id}" ${equippedOnSelected ? 'disabled' : ''}>
              ${equippedOnSelected ? 'EQUIPPED' : 'EQUIP'}
            </button>
            ${
              equippedOnSelected
                ? `<button type="button" class="loadout-equip-btn upgrade-jump"
                     data-loadout-upgrade="${slot}">UPGRADE</button>`
                : ''
            }
          </div>
        </div>`;
    }).join('');

    let upgradesBody = '';
    if (!unlocked) {
      const rule = HARDPOINT_UNLOCK[slot];
      const ascOk = this.ascensionTier >= rule.minAscension;
      const can =
        slot === L.hardpointUnlocks &&
        currency.coreEnergy >= rule.costCore &&
        this.highestLevel >= rule.minLevel &&
        ascOk;
      upgradesBody = `
        <div class="lo-empty">
          <strong>Hardpoint ${slot + 1} locked</strong>
          <p class="dim">
            Requires Ascension ${rule.minAscension}+ and ${rule.costCore} CORE.
            ${!ascOk ? `<br/>You are Ascension ${this.ascensionTier}.` : ''}
          </p>
          <button type="button" class="shop-card-buy ${can ? 'buyable' : ''}" id="hp-unlock"
            ${can ? '' : 'disabled'}>
            Unlock · ${rule.costCore} CORE
          </button>
        </div>`;
    } else if (!selectedDerived) {
      upgradesBody = `
        <div class="lo-empty">
          <strong>HP${slot + 1} is empty</strong>
          <p class="dim">Equip a weapon first, then upgrade its branches here.</p>
          <button type="button" class="menu-btn primary" data-loadout-sub="weapons">
            BROWSE WEAPONS
          </button>
        </div>`;
    } else {
      upgradesBody = `
        <div class="lo-upgrades-banner" style="--accent:${selectedDerived.def.colorCss}">
          <div>
            <strong style="color:${selectedDerived.def.colorCss}">${selectedDerived.def.name}</strong>
            <span class="dim"> · HP${slot + 1}</span>
            <p class="lo-card-desc" style="margin:4px 0 0">${selectedDerived.def.description}</p>
          </div>
          <div class="lo-card-actions">
            <button type="button" class="loadout-weapon empty" data-equip="">Unequip</button>
            <button type="button" class="loadout-equip-btn" data-loadout-sub="weapons">Arsenal</button>
          </div>
        </div>
        ${this.renderBranches(selectedDerived.def, slot, L, currency)}`;
    }

    const weaponsBody = `
      <div class="lo-toolbar">
        <span class="dim">Tap weapon then a hardpoint · DPS ~${Math.round(L.estimateLoadoutDps())}</span>
        ${
          unlocked
            ? `<button type="button" class="loadout-weapon empty" data-equip="">Unequip HP${slot + 1}</button>`
            : ''
        }
      </div>
      <div class="lo-card-grid">${weaponCards}</div>`;

    return `
      <div class="lo-panel loadout-lo">
        <div class="lo-slot-row" aria-label="Hardpoints">
          ${slotsHtml}
        </div>
        <div class="lo-subtabs" role="tablist">
          <button type="button" role="tab" class="lo-subtab ${weaponsActive ? 'active' : ''}"
            data-loadout-sub="weapons" aria-selected="${weaponsActive}">
            WEAPONS
          </button>
          <button type="button" role="tab" class="lo-subtab ${upgradesActive ? 'active' : ''}"
            data-loadout-sub="upgrades" aria-selected="${upgradesActive}">
            UPGRADES
          </button>
        </div>
        <div class="lo-body">
          ${upgradesActive ? upgradesBody : weaponsBody}
        </div>
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
    if (!def.branches.length) {
      return `<div class="dim" style="padding:8px">No upgrade branches on this weapon.</div>`;
    }
    return `
      <div class="loadout-branches">
        <div class="branch-title">Weapon Branches · HP${slot + 1}</div>
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
                  data-branch="${b.id}" data-branch-slot="${slot}"
                  ${maxed || !check.ok ? 'disabled' : ''}>
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
        <div class="stat-div"></div>
        <div class="stat-row"><span>Ascension</span><span class="stat-val magenta">T${this.ascensionTier}</span></div>
        <div class="stat-row"><span>Dmg mult</span><span class="stat-val">×${s.damageMul.toFixed(2)}</span></div>
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
