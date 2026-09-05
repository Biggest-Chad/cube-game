/**
 * Campaign Pilot unlocks, equip, cooldown, notify-once splash.
 * Combat timed flags live on PilotRuntime (not persisted).
 */

import {
  campaignPilotIds,
  getPilot,
  PILOTS,
  type PilotDef,
} from '../data/pilots';
import { PilotRuntime } from '../combat/PilotRuntime';

export interface PilotUnlockContext {
  ownedFighter: number;
  fighterSlotted: boolean;
  ownedDefender: number;
  defenderSlotted: boolean;
  ownedCiws: number;
  ciwsSlotted: boolean;
  unlockAmmoHe: boolean;
  ownedOffAmmoHe1: boolean;
  ownedArtillery: number;
  artillerySlotted: boolean;
  ownedBomber: number;
  bomberSlotted: boolean;
  anyHardpointEquipped: boolean;
  diedDuringRage: boolean;
  reachedRageSector: boolean;
  diedAtLevelGte5: boolean;
}

export interface PilotSaveSlice {
  unlocked: string[];
  equipped: string | null;
  notified: string[];
}

export interface PilotActivateResult {
  ok: boolean;
  reason?: string;
  id?: string;
  name?: string;
  duration?: number;
}

function predicateMet(id: string, ctx: PilotUnlockContext): boolean {
  switch (id) {
    case 'always':
      return true;
    case 'own_fighter':
      return ctx.ownedFighter >= 1 || ctx.fighterSlotted;
    case 'own_defender_or_ciws':
      return (
        ctx.ownedDefender >= 1 ||
        ctx.defenderSlotted ||
        ctx.ownedCiws >= 1 ||
        ctx.ciwsSlotted
      );
    case 'he_or_artillery_or_bomber':
      return (
        ctx.unlockAmmoHe ||
        ctx.ownedOffAmmoHe1 ||
        ctx.ownedArtillery >= 1 ||
        ctx.artillerySlotted ||
        ctx.ownedBomber >= 1 ||
        ctx.bomberSlotted
      );
    case 'any_hardpoint':
      return ctx.anyHardpointEquipped;
    case 'rage_death_or_sector':
      return ctx.diedDuringRage || ctx.reachedRageSector || ctx.diedAtLevelGte5;
    default:
      return false;
  }
}

export class PilotState {
  unlockedIds = new Set<string>();
  equippedId: string | null = null;
  notifiedIds = new Set<string>();
  readonly runtime: PilotRuntime;

  constructor(runtime = new PilotRuntime()) {
    this.runtime = runtime;
  }

  load(slice: Partial<PilotSaveSlice> | null | undefined): void {
    this.unlockedIds = new Set(
      (slice?.unlocked ?? []).filter((id) => {
        const def = getPilot(id);
        return !!def && def.persistCampaign;
      })
    );
    const eq = slice?.equipped ?? null;
    if (eq && this.canEquip(eq)) this.equippedId = eq;
    else this.equippedId = eq === 'rookie' ? 'rookie' : null;
    this.notifiedIds = new Set(
      (slice?.notified ?? []).filter((id) => typeof id === 'string')
    );
    this.runtime.syncEquipped(this.equippedId);
    this.runtime.resetRunState();
    this.runtime.syncEquipped(this.equippedId);
  }

  toSave(): PilotSaveSlice {
    const unlocked = [...this.unlockedIds].filter((id) => getPilot(id)?.persistCampaign);
    return {
      unlocked,
      equipped: this.equippedId,
      notified: [...this.notifiedIds],
    };
  }

  isUnlocked(id: string): boolean {
    const def = getPilot(id);
    if (!def) return false;
    if (!def.persistCampaign) return true;
    return this.unlockedIds.has(id);
  }

  canEquip(id: string | null): boolean {
    if (!id) return true;
    return this.isUnlocked(id);
  }

  equip(id: string | null): boolean {
    if (id && !this.canEquip(id)) return false;
    if (id === this.equippedId) return true;
    this.equippedId = id;
    this.runtime.syncEquipped(id);
    this.runtime.clearTimedBuffs();
    return true;
  }

  equippedDef(): PilotDef | undefined {
    return getPilot(this.equippedId);
  }

  /**
   * Grant newly earned campaign pilots. Returns ids unlocked this call
   * that still need a splash (not yet in notifiedIds).
   */
  evaluate(ctx: PilotUnlockContext): string[] {
    const fresh: string[] = [];
    for (const def of PILOTS) {
      if (!def.persistCampaign) continue;
      if (this.unlockedIds.has(def.id)) continue;
      if (!predicateMet(def.unlockPredicateId, ctx)) continue;
      this.unlockedIds.add(def.id);
      if (!this.notifiedIds.has(def.id)) fresh.push(def.id);
    }
    return fresh;
  }

  markNotified(id: string): void {
    this.notifiedIds.add(id);
  }

  needsNotify(id: string): boolean {
    return this.unlockedIds.has(id) && !this.notifiedIds.has(id);
  }

  pendingSplashes(): string[] {
    return campaignPilotIds().filter((id) => this.needsNotify(id));
  }

  tryActivate(): PilotActivateResult {
    const def = this.equippedDef();
    if (!def) return { ok: false, reason: 'NO PILOT' };
    if (!def.active) return { ok: false, reason: 'NO ACTIVE' };
    if (this.runtime.cooldownT > 0) return { ok: false, reason: 'COOLING' };
    if (this.runtime.activeT > 0) return { ok: false, reason: 'ACTIVE' };

    const act = def.active;
    this.runtime.activeId = act.id;
    this.runtime.activeT = act.duration;
    this.runtime.cooldownT = act.cooldown;
    this.runtime.cooldownMax = act.cooldown;

    this.runtime.aceMarkT = 0;
    this.runtime.wardenOvershieldT = 0;
    this.runtime.siegePeelT = 0;
    this.runtime.gunnerHeatDumpT = 0;
    this.runtime.ghostDashT = 0;
    this.runtime.pendingHeatDump = false;
    this.runtime.pendingWardenPulse = false;
    this.runtime.pendingGhostDash = false;

    switch (act.id) {
      case 'mark':
        this.runtime.aceMarkT = act.duration;
        break;
      case 'overshield':
        this.runtime.wardenOvershieldT = act.duration;
        this.runtime.pendingWardenPulse = true;
        break;
      case 'peel':
        this.runtime.siegePeelT = act.duration;
        break;
      case 'heat_dump':
        this.runtime.gunnerHeatDumpT = act.duration;
        this.runtime.pendingHeatDump = true;
        break;
      case 'orbit_dash':
        this.runtime.ghostDashT = act.duration;
        this.runtime.pendingGhostDash = true;
        this.runtime.pendingGhostDashDuration = act.duration;
        break;
      default:
        break;
    }

    return { ok: true, id: act.id, name: act.name, duration: act.duration };
  }

  tick(dt: number): void {
    this.runtime.tick(dt);
  }

  resetRunState(): void {
    this.runtime.resetRunState();
  }

  clearTimedBuffs(): void {
    this.runtime.clearTimedBuffs();
  }
}
