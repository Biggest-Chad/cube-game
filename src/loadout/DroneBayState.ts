/**
 * Persistent drone bay loadout: unlock bays, buy types, assign to slots.
 */
import {
  DRONE_BAY_MAX,
  DRONE_ROLES,
  droneBayUnlockCost,
  freeInventory,
  normalizeDroneBayState,
  type DroneBayState,
  type DroneRole,
} from '../data/drones';
import { bus } from '../core/EventBus';

export class DroneBayController {
  state: DroneBayState = normalizeDroneBayState(null);

  load(raw: Partial<DroneBayState> | null | undefined): void {
    this.state = normalizeDroneBayState(raw);
  }

  resetToDefault(): void {
    this.load(null);
  }

  toJSON(): DroneBayState {
    return normalizeDroneBayState(this.state);
  }

  /** Unlock next bay slot. Caller spends currency first. */
  unlockBay(): boolean {
    if (this.state.bays >= DRONE_BAY_MAX) return false;
    this.state.bays += 1;
    this.state.slots.push(null);
    bus.emit('drone-bay-unlocked', { bays: this.state.bays });
    return true;
  }

  nextBayCost(): number {
    return droneBayUnlockCost(this.state.bays);
  }

  canUnlockBay(): boolean {
    return this.state.bays < DRONE_BAY_MAX;
  }

  unlockType(role: DroneRole): boolean {
    if (this.state.unlockedTypes.includes(role)) return false;
    this.state.unlockedTypes.push(role);
    bus.emit('drone-type-unlocked', { role });
    return true;
  }

  isTypeUnlocked(role: DroneRole): boolean {
    return this.state.unlockedTypes.includes(role);
  }

  unitCost(role: DroneRole): number {
    return DRONE_ROLES[role].unitCost;
  }

  unlockCost(role: DroneRole): number {
    return DRONE_ROLES[role].unlockCost;
  }

  /** Buy one unit into inventory. Caller spends first. */
  buyUnit(role: DroneRole): boolean {
    if (!this.isTypeUnlocked(role)) return false;
    this.state.owned[role] = (this.state.owned[role] ?? 0) + 1;
    bus.emit('drone-unit-bought', { role, owned: this.state.owned[role] });
    return true;
  }

  /**
   * Assign role into bay slot from inventory, or clear if role null.
   * Swaps if dragging equipped unit between slots.
   */
  assignSlot(slotIndex: number, role: DroneRole | null): boolean {
    if (slotIndex < 0 || slotIndex >= this.state.bays) return false;
    // Ensure slots array length
    while (this.state.slots.length < this.state.bays) this.state.slots.push(null);

    const prev = this.state.slots[slotIndex];
    if (role === null) {
      this.state.slots[slotIndex] = null;
      bus.emit('drone-loadout-changed', this.toJSON());
      return true;
    }
    if (!this.isTypeUnlocked(role)) return false;

    // If already this role, no-op
    if (prev === role) return true;

    // Free inventory of target role (not counting this slot if it already has it)
    const free = freeInventory(this.state, role) + (prev === role ? 1 : 0);
    // When replacing, prev returns to free pool automatically
    if (free <= 0 && prev !== role) return false;

    this.state.slots[slotIndex] = role;
    bus.emit('drone-loadout-changed', this.toJSON());
    return true;
  }

  /** Move assignment from one slot to another (swap). */
  moveSlot(from: number, to: number): boolean {
    if (from === to) return true;
    if (from < 0 || to < 0 || from >= this.state.bays || to >= this.state.bays) return false;
    while (this.state.slots.length < this.state.bays) this.state.slots.push(null);
    const a = this.state.slots[from];
    const b = this.state.slots[to];
    this.state.slots[from] = b;
    this.state.slots[to] = a;
    bus.emit('drone-loadout-changed', this.toJSON());
    return true;
  }

  equippedRoles(): DroneRole[] {
    return this.state.slots.filter((s): s is DroneRole => s != null);
  }

  equippedCount(): number {
    return this.equippedRoles().length;
  }
}
