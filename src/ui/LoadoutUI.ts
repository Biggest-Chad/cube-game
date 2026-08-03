/**
 * Equip weapons to hardpoints 0–2; unlock hardpoints; branch ranks.
 */
import {
  HARDPOINT_UNLOCK,
  MAX_HARDPOINTS,
  WEAPONS,
  getWeaponDef,
  type WeaponDef,
} from '../data/weapons';
import type { LoadoutState } from '../loadout/LoadoutState';
import type { Currency } from '../progression/Currency';

export class LoadoutUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onChanged: (() => void) | null = null;
  /** Called when player wants to unlock hardpoint; return true if paid. */
  onUnlockHardpoint: ((slot: number, costCore: number) => boolean) | null = null;
  /** Spend fragments for branch upgrade; return true if paid. */
  onSpendFragments: ((amount: number) => boolean) | null = null;

  private loadout: LoadoutState | null = null;
  private currency: Currency | null = null;
  private highestLevel = 1;
  private selectedSlot = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(
    loadout: LoadoutState,
    currency: Currency,
    highestLevel: number
  ): void {
    this.loadout = loadout;
    this.currency = currency;
    this.highestLevel = highestLevel;
    loadout.syncLevelUnlocks(highestLevel);
    this.root.classList.remove('panel-hidden');
    this.render();
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }

  render(): void {
    if (!this.loadout || !this.currency) return;
    const L = this.loadout;
    const C = this.currency;

    let slotsHtml = '';
    for (let i = 0; i < MAX_HARDPOINTS; i++) {
      const unlocked = i < L.hardpointUnlocks;
      const inst = L.slots[i];
      const def = inst ? getWeaponDef(inst.defId) : null;
      const active = this.selectedSlot === i ? 'active' : '';
      const locked = !unlocked ? 'locked' : '';
      const rule = HARDPOINT_UNLOCK[i];
      slotsHtml += `
        <button type="button" class="loadout-slot ${active} ${locked}" data-slot="${i}">
          <div class="loadout-slot-idx">HP${i + 1}</div>
          <div class="loadout-slot-name">${
            !unlocked
              ? `LOCKED · L${rule.minLevel} · ${rule.costCore} CORE`
              : def
                ? def.name
                : 'EMPTY'
          }</div>
          <div class="loadout-slot-sub">${unlocked ? (def ? def.family : 'Select weapon') : 'Milestone unlock'}</div>
        </button>
      `;
    }

    const slot = this.selectedSlot;
    const unlocked = slot < L.hardpointUnlocks;
    let detail = '';

    if (!unlocked) {
      const rule = HARDPOINT_UNLOCK[slot];
      const can =
        L.canUnlockHardpoint(slot, this.highestLevel, C.coreEnergy) ||
        (slot === L.hardpointUnlocks &&
          this.highestLevel >= rule.minLevel &&
          C.coreEnergy >= rule.costCore);
      detail = `
        <div class="loadout-detail">
          <h3>Hardpoint ${slot + 1}</h3>
          <p>Unlock at sector ${rule.minLevel}+ for <strong>${rule.costCore} Core Energy</strong>.</p>
          <p class="loadout-hint">You have ${Math.floor(C.coreEnergy)} CORE · highest sector ${this.highestLevel}</p>
          <button type="button" class="menu-btn primary" id="hp-unlock" ${can ? '' : 'disabled'}>
            Unlock Hardpoint · ${rule.costCore} CORE
          </button>
        </div>
      `;
    } else {
      const equipped = L.getDerived(slot);
      const catalog = WEAPONS.filter((w) => L.isOwned(w.id));
      detail = `
        <div class="loadout-detail">
          <h3>Hardpoint ${slot + 1}</h3>
          <p class="loadout-equipped">${
            equipped
              ? `Equipped: <span style="color:${equipped.def.colorCss}">${equipped.def.name}</span>`
              : 'Nothing equipped'
          }</p>
          <div class="loadout-catalog">
            <button type="button" class="loadout-weapon empty" data-equip="">Unequip</button>
            ${catalog
              .map(
                (w) => `
              <button type="button" class="loadout-weapon ${
                equipped?.def.id === w.id ? 'selected' : ''
              }" data-equip="${w.id}" style="--wcolor:${w.colorCss}">
                <span class="lw-name">${w.name}</span>
                <span class="lw-fam">${w.family}</span>
                <span class="lw-desc">${w.description}</span>
              </button>`
              )
              .join('')}
          </div>
          ${equipped ? this.renderBranches(equipped.def, slot, L, C) : ''}
        </div>
      `;
    }

    this.root.innerHTML = `
      <div class="loadout-panel interactive">
        <div class="loadout-header">
          <div>
            <h2>LOADOUT</h2>
            <div class="tech-header-sub">Hardpoints ${L.hardpointUnlocks}/${MAX_HARDPOINTS} · sandbox equip</div>
          </div>
          <div class="tech-currency">◈ ${Math.floor(C.dataFragments)} · ◆ ${Math.floor(C.coreEnergy)}</div>
          <button class="icon-btn" id="loadout-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="loadout-slots">${slotsHtml}</div>
        ${detail}
        <div class="loadout-dps">Loadout DPS est. ~${Math.round(L.estimateLoadoutDps())}</div>
      </div>
    `;

    this.root.querySelector('#loadout-close')?.addEventListener('click', () => {
      this.hide();
      this.onClose?.();
    });

    this.root.querySelectorAll('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedSlot = Number((el as HTMLElement).dataset.slot);
        this.render();
      });
    });

    this.root.querySelector('#hp-unlock')?.addEventListener('click', () => {
      if (!this.loadout || !this.currency) return;
      const cost = this.loadout.hardpointCost(slot);
      // Prefer Game-wired payment; fall back to mutating coreEnergy
      let paid = false;
      if (this.onUnlockHardpoint) {
        paid = this.onUnlockHardpoint(slot, cost);
      } else if (this.currency.coreEnergy >= cost) {
        this.currency.coreEnergy -= cost;
        paid = true;
      }
      if (!paid) return;
      if (this.loadout.unlockHardpoint(slot, this.highestLevel) < 0) return;
      this.onChanged?.();
      this.render();
    });

    this.root.querySelectorAll('[data-equip]').forEach((el) => {
      el.addEventListener('click', () => {
        if (!this.loadout) return;
        const id = (el as HTMLElement).dataset.equip ?? '';
        this.loadout.equip(slot, id === '' ? null : id);
        this.onChanged?.();
        this.render();
      });
    });

    this.root.querySelectorAll('[data-branch]').forEach((el) => {
      el.addEventListener('click', () => {
        if (!this.loadout || !this.currency) return;
        const branchId = (el as HTMLElement).dataset.branch!;
        const check = this.loadout.canUpgradeBranch(slot, branchId, this.currency.dataFragments);
        if (!check.ok) return;
        let paid = false;
        if (this.onSpendFragments) paid = this.onSpendFragments(check.cost);
        else paid = this.currency.spendFragments(check.cost);
        if (!paid) return;
        this.loadout.upgradeBranch(slot, branchId);
        this.onChanged?.();
        this.render();
      });
    });
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
        <div class="branch-title">Upgrade Branches</div>
        ${def.branches
          .map((b) => {
            const rank = inst.branchRanks[b.id] ?? 0;
            const check = L.canUpgradeBranch(slot, b.id, C.dataFragments);
            const maxed = rank >= b.maxRank;
            return `
              <div class="loadout-branch">
                <div class="lb-head">
                  <strong>${b.name}</strong>
                  <span>${rank}/${b.maxRank}</span>
                </div>
                <p>${b.description}</p>
                <button type="button" class="menu-btn ${check.ok ? 'primary' : ''}"
                  data-branch="${b.id}" ${maxed || !check.ok ? 'disabled' : ''}>
                  ${maxed ? 'MAXED' : `Upgrade · ${check.cost} FRAG`}
                </button>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  dispose(): void {
    this.hide();
  }
}
