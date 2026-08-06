/**
 * Persistent loadout: hardpoint unlocks + equipped weapon instances.
 */
import {
  HARDPOINT_UNLOCK,
  MAX_HARDPOINTS,
  WEAPONS,
  WEAPON_BY_ID,
  branchRankCost,
  computeWeaponStats,
  getWeaponDef,
  isWeaponPurchasable,
  isWeaponUnlocked,
  weaponUnlockCost,
  type WeaponDef,
  type WeaponStats,
} from '../data/weapons';
import { bus } from '../core/EventBus';

export interface WeaponInstance {
  defId: string;
  /** branchId -> rank (0 = none) */
  branchRanks: Record<string, number>;
}

export interface LoadoutSnapshot {
  hardpointUnlocks: number;
  slots: Array<WeaponInstance | null>;
  ownedWeapons: string[];
}

export interface DerivedWeapon {
  instance: WeaponInstance;
  def: WeaponDef;
  stats: WeaponStats & { flags: Set<string> };
}

export class LoadoutState {
  /** Number of unlocked hardpoints (1..3). Slot 0 always free. */
  hardpointUnlocks = 1;
  /** Equipped weapons, length MAX_HARDPOINTS */
  slots: Array<WeaponInstance | null> = [null, null, null];
  /** Unlocked weapon def ids (owned catalog) — shop-purchased, not free */
  ownedWeapons = new Set<string>();

  constructor() {
    // Empty catalog until player buys Rocket Pod / other modules in the shop
  }

  static default(): LoadoutState {
    return new LoadoutState();
  }

  load(snap: Partial<LoadoutSnapshot> | null | undefined): void {
    if (!snap) return;
    this.hardpointUnlocks = Math.min(
      MAX_HARDPOINTS,
      Math.max(1, snap.hardpointUnlocks ?? 1)
    );
    this.slots = [null, null, null];
    if (snap.slots) {
      for (let i = 0; i < MAX_HARDPOINTS; i++) {
        const s = snap.slots[i];
        if (s && WEAPON_BY_ID[s.defId]) {
          this.slots[i] = {
            defId: s.defId,
            branchRanks: { ...(s.branchRanks ?? {}) },
          };
        }
      }
    }
    this.ownedWeapons = new Set(snap.ownedWeapons ?? []);
  }

  toJSON(): LoadoutSnapshot {
    return {
      hardpointUnlocks: this.hardpointUnlocks,
      slots: this.slots.map((s) =>
        s ? { defId: s.defId, branchRanks: { ...s.branchRanks } } : null
      ),
      ownedWeapons: Array.from(this.ownedWeapons),
    };
  }

  /** Sync catalog unlocks from campaign progress (level gates only — shop weapons stay locked). */
  syncLevelUnlocks(highestLevel: number): string[] {
    const newly: string[] = [];
    for (const w of WEAPONS) {
      if (this.ownedWeapons.has(w.id)) continue;
      if (w.unlock.type === 'start' || (w.unlock.type === 'level' && highestLevel >= w.unlock.minLevel)) {
        this.ownedWeapons.add(w.id);
        newly.push(w.id);
      }
    }
    if (newly.length) bus.emit('weapons-unlocked', newly);
    return newly;
  }

  unlockWeapon(id: string): boolean {
    if (!WEAPON_BY_ID[id]) return false;
    if (this.ownedWeapons.has(id)) return false;
    this.ownedWeapons.add(id);
    bus.emit('weapons-unlocked', [id]);
    return true;
  }

  /** Cost to unlock a shop weapon, or null if not purchasable at this campaign stage. */
  weaponBuyCost(
    id: string,
    highestLevel = 99
  ): { fragments: number; core: number } | null {
    const def = getWeaponDef(id);
    if (!def || !isWeaponPurchasable(def, this.ownedWeapons, highestLevel)) return null;
    return weaponUnlockCost(def);
  }

  /** All weapons visible in shop catalog (owned + locked-by-level + purchasable). */
  shopCatalog(): WeaponDef[] {
    return WEAPONS.slice();
  }

  /** Whether a shop weapon is available to buy at this stage (level gate). */
  canBuyWeapon(id: string, highestLevel: number): boolean {
    const def = getWeaponDef(id);
    return !!def && isWeaponPurchasable(def, this.ownedWeapons, highestLevel);
  }

  /** First empty unlocked hardpoint, or -1. */
  firstEmptySlot(): number {
    for (let i = 0; i < this.hardpointUnlocks; i++) {
      if (!this.slots[i]) return i;
    }
    return -1;
  }

  isOwned(id: string): boolean {
    return this.ownedWeapons.has(id);
  }

  canUnlockHardpoint(
    slot: number,
    highestLevel: number,
    coreEnergy: number,
    ascensionTier = 0
  ): boolean {
    if (slot < 0 || slot >= MAX_HARDPOINTS) return false;
    if (slot < this.hardpointUnlocks) return false;
    // Must unlock in order
    if (slot !== this.hardpointUnlocks) return false;
    const rule = HARDPOINT_UNLOCK[slot];
    if (!rule) return false;
    if (highestLevel < rule.minLevel) return false;
    if (ascensionTier < rule.minAscension) return false;
    if (coreEnergy < rule.costCore) return false;
    return true;
  }

  hardpointCost(slot: number): number {
    return HARDPOINT_UNLOCK[slot]?.costCore ?? Infinity;
  }

  hardpointMinLevel(slot: number): number {
    return HARDPOINT_UNLOCK[slot]?.minLevel ?? 99;
  }

  hardpointMinAscension(slot: number): number {
    return HARDPOINT_UNLOCK[slot]?.minAscension ?? 99;
  }

  /**
   * Unlock next hardpoint. Caller must have already spent Core Energy.
   * Returns new unlock count or -1 on failure.
   */
  unlockHardpoint(slot: number, highestLevel: number, ascensionTier = 0): number {
    if (slot !== this.hardpointUnlocks || slot >= MAX_HARDPOINTS) return -1;
    const rule = HARDPOINT_UNLOCK[slot];
    if (!rule || highestLevel < rule.minLevel) return -1;
    if (ascensionTier < rule.minAscension) return -1;
    this.hardpointUnlocks = slot + 1;
    bus.emit('hardpoint-unlocked', { slot, hardpointUnlocks: this.hardpointUnlocks });
    return this.hardpointUnlocks;
  }

  equip(slot: number, defId: string | null): boolean {
    if (slot < 0 || slot >= this.hardpointUnlocks) return false;
    if (defId === null) {
      this.slots[slot] = null;
      bus.emit('loadout-changed', this.toJSON());
      return true;
    }
    if (!this.ownedWeapons.has(defId) || !WEAPON_BY_ID[defId]) return false;
    // Allow same weapon in multiple slots
    const existing = this.slots[slot];
    const ranks = existing?.defId === defId ? existing.branchRanks : {};
    this.slots[slot] = { defId, branchRanks: { ...ranks } };
    bus.emit('loadout-changed', this.toJSON());
    return true;
  }

  unequip(slot: number): boolean {
    return this.equip(slot, null);
  }

  getInstance(slot: number): WeaponInstance | null {
    if (slot < 0 || slot >= MAX_HARDPOINTS) return null;
    return this.slots[slot];
  }

  getDerived(slot: number): DerivedWeapon | null {
    const inst = this.getInstance(slot);
    if (!inst) return null;
    const def = getWeaponDef(inst.defId);
    if (!def) return null;
    return {
      instance: inst,
      def,
      stats: computeWeaponStats(def, inst.branchRanks),
    };
  }

  allDerived(): DerivedWeapon[] {
    const out: DerivedWeapon[] = [];
    for (let i = 0; i < this.hardpointUnlocks; i++) {
      const d = this.getDerived(i);
      if (d) out.push(d);
    }
    return out;
  }

  /** Branch upgrade for an equipped (or owned) weapon instance in a slot. */
  canUpgradeBranch(
    slot: number,
    branchId: string,
    fragments: number
  ): { ok: boolean; cost: number; nextRank: number } {
    const inst = this.slots[slot];
    if (!inst || slot >= this.hardpointUnlocks) return { ok: false, cost: 0, nextRank: 0 };
    const def = getWeaponDef(inst.defId);
    if (!def) return { ok: false, cost: 0, nextRank: 0 };
    const branch = def.branches.find((b) => b.id === branchId);
    if (!branch) return { ok: false, cost: 0, nextRank: 0 };
    const cur = inst.branchRanks[branchId] ?? 0;
    if (cur >= branch.maxRank) return { ok: false, cost: 0, nextRank: cur };
    const nextRank = cur + 1;
    const cost = branchRankCost(branch, nextRank);
    return { ok: fragments >= cost, cost, nextRank };
  }

  /**
   * Apply branch rank. Caller spends fragments first.
   */
  upgradeBranch(slot: number, branchId: string): boolean {
    const check = this.canUpgradeBranch(slot, branchId, Infinity);
    if (!check.nextRank) return false;
    const inst = this.slots[slot];
    if (!inst) return false;
    const def = getWeaponDef(inst.defId);
    const branch = def?.branches.find((b) => b.id === branchId);
    if (!branch || check.nextRank > branch.maxRank) return false;
    inst.branchRanks[branchId] = check.nextRank;
    bus.emit('weapon-upgraded', { slot, branchId, rank: check.nextRank, defId: inst.defId });
    bus.emit('loadout-changed', this.toJSON());
    return true;
  }

  /** Free swap between levels — clear cooldowns handled by HardpointSystem.reset. */
  listCatalog(highestLevel: number): WeaponDef[] {
    return WEAPONS.filter(
      (w) =>
        this.ownedWeapons.has(w.id) ||
        isWeaponUnlocked(w, highestLevel, this.ownedWeapons)
    );
  }

  estimateLoadoutDps(): number {
    let dps = 0;
    for (const d of this.allDerived()) {
      const s = d.stats;
      const cc = Math.min(0.4, s.critChance);
      const cm = Math.min(2.25, s.critMult);
      const avg = s.damage * s.projectileCount * (1 - cc + cc * cm);
      // Charge weapons fire slower effectively
      const rate = s.chargeTime > 0 ? 1 / (s.chargeTime + 1 / Math.max(0.05, s.fireRate)) : s.fireRate;
      dps += avg * rate;
    }
    return dps;
  }
}
