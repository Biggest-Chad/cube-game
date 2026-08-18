import {
  GROUND_STATION_COUNT,
  GROUND_WEAPON_UPGRADE_MAX_RANK,
} from '../data/constraints';
import { repeatableUpgradeCap } from '../data/evolve';
import {
  GROUND_WEAPONS,
  freeGroundInventory,
  groundUpgradeCost,
  normalizeGroundStationState,
  type GroundStationState,
  type GroundWeaponId,
} from '../data/groundStations';
import { bus } from '../core/EventBus';

export class GroundStationController {
  state: GroundStationState = normalizeGroundStationState(null);
  private rankCap = GROUND_WEAPON_UPGRADE_MAX_RANK;

  load(raw: Partial<GroundStationState> | null | undefined): void {
    this.state = normalizeGroundStationState(raw);
  }

  toJSON(): GroundStationState {
    return normalizeGroundStationState(this.state);
  }

  isTypeUnlocked(id: GroundWeaponId): boolean {
    return this.state.unlockedTypes.includes(id);
  }

  unlockType(id: GroundWeaponId): boolean {
    if (this.isTypeUnlocked(id)) return false;
    this.state.unlockedTypes.push(id);
    bus.emit('ground-type-unlocked', { id });
    return true;
  }

  buyUnit(id: GroundWeaponId): boolean {
    if (!this.isTypeUnlocked(id)) return false;
    this.state.owned[id] = (this.state.owned[id] ?? 0) + 1;
    bus.emit('ground-unit-bought', { id, owned: this.state.owned[id] });
    return true;
  }

  unitCost(id: GroundWeaponId): number {
    return GROUND_WEAPONS[id].unitCost;
  }

  unlockCost(id: GroundWeaponId): number {
    return GROUND_WEAPONS[id].unlockCost;
  }

  assignSlot(slotIndex: number, id: GroundWeaponId | null): boolean {
    if (slotIndex < 0 || slotIndex >= GROUND_STATION_COUNT) return false;
    while (this.state.slots.length < GROUND_STATION_COUNT) this.state.slots.push(null);
    const prev = this.state.slots[slotIndex];
    if (id === null) {
      this.state.slots[slotIndex] = null;
      return prev !== null;
    }
    if (!this.isTypeUnlocked(id)) return false;
    if (prev === id) return true;
    if (freeGroundInventory(this.state, id) <= 0) return false;
    this.state.slots[slotIndex] = id;
    return true;
  }

  moveSlot(from: number, to: number): boolean {
    if (from === to) return false;
    if (from < 0 || to < 0 || from >= GROUND_STATION_COUNT || to >= GROUND_STATION_COUNT) {
      return false;
    }
    const a = this.state.slots[from];
    const b = this.state.slots[to];
    this.state.slots[from] = b;
    this.state.slots[to] = a;
    return true;
  }

  setRankCap(ascensionTier: number): void {
    this.rankCap = Math.min(
      GROUND_WEAPON_UPGRADE_MAX_RANK,
      repeatableUpgradeCap(ascensionTier)
    );
  }

  getRankCap(): number {
    return this.rankCap;
  }

  resetRanks(): void {
    this.state.ranks = { sam: 0, artillery: 0, ciws: 0 };
    bus.emit('ground-ranks-reset', {});
  }

  canUpgrade(id: GroundWeaponId): boolean {
    return this.isTypeUnlocked(id) && this.state.ranks[id] < this.rankCap;
  }

  nextUpgradeCost(id: GroundWeaponId): number {
    return groundUpgradeCost(this.state.ranks[id] + 1);
  }

  upgrade(id: GroundWeaponId): boolean {
    if (!this.canUpgrade(id)) return false;
    this.state.ranks[id] += 1;
    bus.emit('ground-upgraded', { id, rank: this.state.ranks[id] });
    return true;
  }

  equippedCount(): number {
    return this.state.slots.filter((s) => s != null).length;
  }
}
