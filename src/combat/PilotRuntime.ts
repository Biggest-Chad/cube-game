/**
 * Timed Pilot flags combat systems read. Game ticks this; combat never writes it
 * except via PilotState.activate. Do not persist.
 */

import { getPilot, PILOT_HEAT_DUMP_FAMILIES } from '../data/pilots';

export const PILOT_HEAT_DUMP_FAMILY_SET = new Set<string>(PILOT_HEAT_DUMP_FAMILIES);

export class PilotRuntime {
  equippedId: string | null = null;
  cooldownT = 0;
  cooldownMax = 1;
  activeId: string | null = null;
  activeT = 0;

  aceMarkT = 0;
  wardenOvershieldT = 0;
  siegePeelT = 0;
  gunnerHeatDumpT = 0;
  ghostDashT = 0;

  /** Rising-edge latch Game consumes after activate. */
  pendingHeatDump = false;
  pendingWardenPulse = false;
  pendingGhostDash = false;
  pendingGhostDashDuration = 0;

  get aceEquipped(): boolean {
    return this.equippedId === 'ace';
  }
  get wardenEquipped(): boolean {
    return this.equippedId === 'warden';
  }
  get siegeEquipped(): boolean {
    return this.equippedId === 'siege';
  }
  get gunnerEquipped(): boolean {
    return this.equippedId === 'gunner';
  }
  get ghostEquipped(): boolean {
    return this.equippedId === 'ghost';
  }

  get fighterRetargetMul(): number {
    return this.aceEquipped ? 0.7 : 1;
  }
  get fighterVsDroneMul(): number {
    return this.aceEquipped ? 1.15 : 1;
  }
  get aceMark(): boolean {
    return this.aceMarkT > 0;
  }

  get interceptRadiusMul(): number {
    return this.wardenEquipped ? 1.25 : 1;
  }
  get pdMul(): number {
    return this.wardenEquipped ? 1.15 : 1;
  }
  get wardenPulse(): boolean {
    return this.wardenOvershieldT > 0;
  }

  get artillerySplashMul(): number {
    return this.siegeEquipped ? 1.18 : 1;
  }
  get bomberWarheadMul(): number {
    return this.siegeEquipped ? 1.18 : 1;
  }
  get siegePeel(): boolean {
    return this.siegePeelT > 0;
  }

  get heatCoolMul(): number {
    return this.gunnerEquipped ? 1.2 : 1;
  }
  get armorPierceAdd(): number {
    return this.gunnerEquipped ? 0.06 : 0;
  }
  get heatDumpFireRateMul(): number {
    return this.gunnerHeatDumpT > 0 ? 1.4 : 1;
  }

  get orbitAccelMul(): number {
    return this.ghostEquipped ? 1.18 : 1;
  }
  get ghostDash(): boolean {
    return this.ghostDashT > 0;
  }

  get ready(): boolean {
    if (!this.equippedId) return false;
    const def = getPilot(this.equippedId);
    if (!def?.active) return false;
    return this.cooldownT <= 0 && this.activeT <= 0;
  }

  get cooldown01(): number {
    if (this.cooldownMax <= 0) return 0;
    return Math.max(0, Math.min(1, this.cooldownT / this.cooldownMax));
  }

  tick(dt: number): void {
    if (dt <= 0) return;
    this.cooldownT = Math.max(0, this.cooldownT - dt);
    this.activeT = Math.max(0, this.activeT - dt);
    this.aceMarkT = Math.max(0, this.aceMarkT - dt);
    this.wardenOvershieldT = Math.max(0, this.wardenOvershieldT - dt);
    this.siegePeelT = Math.max(0, this.siegePeelT - dt);
    this.gunnerHeatDumpT = Math.max(0, this.gunnerHeatDumpT - dt);
    this.ghostDashT = Math.max(0, this.ghostDashT - dt);
    if (this.activeT <= 0) this.activeId = null;
  }

  /** Drop timed buffs only (sector load / death). Keep cooldown. */
  clearTimedBuffs(): void {
    this.activeId = null;
    this.activeT = 0;
    this.aceMarkT = 0;
    this.wardenOvershieldT = 0;
    this.siegePeelT = 0;
    this.gunnerHeatDumpT = 0;
    this.ghostDashT = 0;
    this.pendingHeatDump = false;
    this.pendingWardenPulse = false;
    this.pendingGhostDash = false;
    this.pendingGhostDashDuration = 0;
  }

  /** Evolve: cooldown + run buffs. Unlocks / equipped stay on PilotState. */
  resetRunState(): void {
    this.clearTimedBuffs();
    this.cooldownT = 0;
    this.cooldownMax = 1;
  }

  syncEquipped(id: string | null): void {
    this.equippedId = id;
  }
}
