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
  drones: '◈',
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
  private droneBay: DroneBayController | null = null;
  private highestLevel = 1;
  private ascensionTier = 0;
  private confirmEvolve = false;
  private evolveExpanded = false;
  private dragPayload: { kind: 'drone' | 'weapon'; role?: DroneRole; weaponId?: string; fromSlot?: number } | null =
    null;

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

            ${this.renderEvolveBanner(currency)}

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
                : branchReco
                  ? `<div class="shop-reco">
                      <span class="shop-reco-tag">WEAPON</span>
                      <span class="shop-reco-name">${branchReco.weaponName} · ${branchReco.name}</span>
                      <span class="shop-reco-desc">Upgrade equipped hardpoint HP${branchReco.slot + 1}</span>
                      <button class="shop-reco-buy" type="button"
                        data-reco-branch="${branchReco.branchId}" data-reco-slot="${branchReco.slot}">
                        UPGRADE · ${branchReco.cost} FRAG
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
        if (this.onUpgradeBranch?.(this.selectedSlot, branchId)) {
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
        if (this.onAssignDroneSlot?.(empty, role)) this.render(tree, currency);
      });
    });
    // Tap empty bay then tap inventory chip also works via assign buttons above
    this.root.querySelectorAll('[data-clear-bay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = Number((btn as HTMLElement).dataset.clearBay);
        if (this.onAssignDroneSlot?.(slot, null)) this.render(tree, currency);
      });
    });

    // Inventory chips — drag source
    this.root.querySelectorAll('[data-drag-drone]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const role = (el as HTMLElement).dataset.dragDrone as DroneRole;
        this.dragPayload = { kind: 'drone', role };
        (e as DragEvent).dataTransfer?.setData('text/plain', `drone:${role}`);
        (e as DragEvent).dataTransfer!.effectAllowed = 'copyMove';
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
        if (!p || p.kind !== 'drone') return;
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
        if (!p || p.kind !== 'weapon' || !p.weaponId) return;
        this.onEquipWeapon?.(slot, p.weaponId);
        this.selectedSlot = slot;
        this.render(tree, currency);
      });
    });
  }

  private renderDroneBayPanel(currency: Currency, tree: TechTree): string {
    const B = this.droneBay;
    if (!B) {
      return `<div class="shop-empty">Drone bay systems offline.</div>`;
    }
    const st = B.state;
    const dronesOn = tree.stats.dronesUnlocked || tree.owned.has('drone_unlock');
    if (!dronesOn) {
      return `<div class="dnd-panel">
        <p class="research-blurb">Purchase <strong>Ally Protocol</strong> in DRONE TECH to authorize bays.</p>
      </div>`;
    }

    const bayCost = B.nextBayCost();
    const canBay =
      B.canUnlockBay() && currency.dataFragments >= bayCost;

    const baysHtml = Array.from({ length: Math.max(st.bays, 0) }, (_, i) => {
      const role = st.slots[i] ?? null;
      const def = role ? DRONE_ROLES[role] : null;
      return `
        <div class="dnd-slot bay-slot ${role ? 'filled' : 'empty'}"
          data-bay-slot="${i}" data-bay-role="${role ?? ''}"
          draggable="${role ? 'true' : 'false'}">
          <div class="dnd-slot-idx">BAY ${i + 1}</div>
          <div class="dnd-slot-body" style="${def ? `--accent:${def.colorCss}` : ''}">
            ${
              def
                ? `<strong>${def.name}</strong><span class="dim">Drag to reorder</span>
                   <button type="button" class="dnd-clear" data-clear-bay="${i}">Clear</button>`
                : `<span class="dim">Empty — drop a drone</span>`
            }
          </div>
        </div>`;
    }).join('');

    const types = (['fighter', 'bomber', 'defender'] as DroneRole[])
      .map((role) => {
        const def = DRONE_ROLES[role];
        const unlocked = B.isTypeUnlocked(role);
        const free = freeInventory(st, role);
        const owned = st.owned[role] ?? 0;
        const levelOk = this.highestLevel >= def.unlockLevel;
        if (!unlocked) {
          const can =
            levelOk && currency.dataFragments >= def.unlockCost;
          return `
            <div class="dnd-inv-card locked" style="--accent:${def.colorCss}">
              <strong>${def.name}</strong>
              <p>${def.description}</p>
              <button type="button" class="shop-card-buy ${can ? 'buyable' : ''}"
                data-unlock-type="${role}" ${can ? '' : 'disabled'}>
                ${levelOk ? `UNLOCK · ${def.unlockCost} FRAG` : `LOCKED · STAGE ${def.unlockLevel}+`}
              </button>
            </div>`;
        }
        const canBuy = currency.dataFragments >= def.unitCost;
        const emptyBay = st.slots.findIndex((s) => s == null);
        const canAssign = free > 0 && emptyBay >= 0;
        return `
          <div class="dnd-inv-card" style="--accent:${def.colorCss}">
            <strong>${def.name}</strong>
            <p>${def.description}</p>
            <div class="dnd-inv-meta">Owned ${owned} · Free ${free}</div>
            <div class="dnd-inv-actions">
              <div class="dnd-chip" draggable="${free > 0 ? 'true' : 'false'}"
                data-drag-drone="${role}" title="Drag into a bay">
                ☰ ${def.name}
              </div>
              <button type="button" class="loadout-equip-btn ${canAssign ? '' : 'equipped'}"
                data-assign-drone="${role}" ${canAssign ? '' : 'disabled'}>
                ${canAssign ? 'ASSIGN TO BAY' : free <= 0 ? 'NONE FREE' : 'BAYS FULL'}
              </button>
              <button type="button" class="shop-card-buy ${canBuy ? 'buyable' : ''}"
                data-buy-unit="${role}" ${canBuy ? '' : 'disabled'}>
                BUY · ${def.unitCost} FRAG
              </button>
            </div>
          </div>`;
      })
      .join('');

    return `
      <div class="dnd-panel">
        <p class="research-blurb">
          Unlock <strong>bays</strong>, buy <strong>Fighter / Bomber / Defender</strong> units,
          then <strong>drag</strong> them into bay slots. Mix freely (e.g. 6 fighters or 2/2/2).
        </p>
        <div class="dnd-toolbar">
          <button type="button" class="menu-btn primary" id="drone-bay-unlock"
            ${canBay ? '' : 'disabled'}>
            ${B.canUnlockBay() ? `UNLOCK BAY · ${bayCost} FRAG` : 'MAX BAYS'}
          </button>
          <span class="dnd-toolbar-meta">${st.bays} bays · ${B.equippedCount()} active</span>
        </div>
        <div class="dnd-columns">
          <section class="dnd-col">
            <h3 class="dnd-col-title">BAY SLOTS</h3>
            <div class="dnd-slots">${baysHtml || '<div class="dim">No bays yet — unlock one above.</div>'}</div>
          </section>
          <section class="dnd-col">
            <h3 class="dnd-col-title">INVENTORY</h3>
            <div class="dnd-inventory">${types}</div>
          </section>
        </div>
        <div class="shop-cards" style="margin-top:12px">
          ${getSequentialVisibleNodes(tree.owned, currency, 'drones')
            .map((v) => this.renderCard(v, tree, currency))
            .join('')}
        </div>
      </div>`;
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
        <div class="loadout-slot dnd-slot ${this.selectedSlot === i ? 'active' : ''} ${
          unlocked ? '' : 'locked'
        }" data-slot="${i}" data-hp-drop="${i}"
          style="${def ? `--accent:${def.colorCss}` : ''}">
          <button type="button" class="loadout-slot-hit" data-slot="${i}">
            <div class="loadout-slot-idx">HP${i + 1}</div>
            <div class="loadout-slot-name">${
              !unlocked
                ? `LOCKED · ASC ${rule.minAscension}+ · ${rule.costCore} CORE`
                : def
                  ? def.name
                  : 'EMPTY · drop weapon'
            }</div>
            <div class="loadout-slot-sub">${
              unlocked ? (def ? def.family + ' · drag weapon here' : 'Drop from inventory') : 'Evolve to unlock'
            }</div>
          </button>
        </div>`;
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
      const ascOk = this.ascensionTier >= rule.minAscension;
      const can =
        slot === L.hardpointUnlocks &&
        currency.coreEnergy >= rule.costCore &&
        this.highestLevel >= rule.minLevel &&
        ascOk;
      detail = `
        <div class="loadout-detail shop-card">
          <div class="shop-card-top"><span class="shop-card-name">Hardpoint ${slot + 1}</span></div>
          <div class="shop-card-desc">
            Requires <strong>Ascension ${rule.minAscension}+</strong>
            and <strong>${rule.costCore} Core Energy</strong>.
            ${
              !ascOk
                ? `<br/><span class="evolve-warn">Evolve the hull first (you are Ascension ${this.ascensionTier}).</span>`
                : ''
            }
          </div>
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
          <div class="loadout-catalog dnd-inventory">
            <p class="research-blurb" style="grid-column:1/-1">
              Drag weapons onto hardpoint bays, or use EQUIP. Unequip clears the selected bay.
            </p>
            <button type="button" class="loadout-weapon empty" data-equip="">Unequip selected bay</button>
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
                    <span class="lw-desc">Clear earlier sectors first.</span>
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
              const selected = equipped?.def.id === w.id;
              return `
                <div class="loadout-weapon-wrap ${selected ? 'selected' : ''}" style="--wcolor:${w.colorCss}">
                  <div class="loadout-weapon ${selected ? 'selected' : ''}"
                    draggable="true" data-drag-weapon="${w.id}" style="--wcolor:${w.colorCss}">
                    <span class="lw-name">${w.name}</span>
                    <span class="lw-fam">${w.family}${selected ? ' · ON BAY' : ''} · drag</span>
                    <span class="lw-desc">${w.description}</span>
                  </div>
                  <button type="button" class="loadout-equip-btn ${selected ? 'equipped' : ''}"
                    data-equip-btn="${w.id}" ${selected ? 'disabled' : ''}>
                    ${selected ? 'EQUIPPED' : 'EQUIP'}
                  </button>
                </div>`;
            }).join('')}
          </div>
          ${equipped ? this.renderBranches(equipped.def, slot, L, currency) : ''}
        </div>`;
    }

    return `
      <div class="loadout-shop-wrap">
        <div class="loadout-slots">${slots}</div>
        ${detail}
        ${
          hpCards
            ? `<div class="shop-cards loadout-hp-cards">${hpCards}</div>`
            : `<div class="shop-reco dim" style="margin-top:8px">
                Extra hardpoints unlock via <strong>Evolve</strong> (Ascension)
                then Core Energy in the slots above.
              </div>`
        }
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
