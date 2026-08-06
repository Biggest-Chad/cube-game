import {
  RESEARCH_NODES,
  getResearchNode,
  type ResearchNodeDef,
} from '../data/research';
import { bus } from '../core/EventBus';
import type { Currency } from './Currency';

/** Aggregated permanent research bonuses (folded into TechTree stats). */
export interface ResearchBonuses {
  damageMul: number;
  hullMul: number;
  shieldMul: number;
  droneDamageMul: number;
  orbitSpeedMul: number;
  fragmentMul: number;
  idleRateMul: number;
  critChanceAdd: number;
  maxHullAdd: number;
  maxShieldAdd: number;
  armorRatingAdd: number;
  reviveImmunityBonus: number;
  unlockOvershield: boolean;
  unlockScanPulse: boolean;
  unlockAutoIdle: boolean;
  cosmeticTrail: boolean;
}

export function defaultResearchBonuses(): ResearchBonuses {
  return {
    damageMul: 1,
    hullMul: 1,
    shieldMul: 1,
    droneDamageMul: 1,
    orbitSpeedMul: 1,
    fragmentMul: 1,
    idleRateMul: 1,
    critChanceAdd: 0,
    maxHullAdd: 0,
    maxShieldAdd: 0,
    armorRatingAdd: 0,
    reviveImmunityBonus: 0,
    unlockOvershield: false,
    unlockScanPulse: false,
    unlockAutoIdle: false,
    cosmeticTrail: false,
  };
}

export class ResearchTree {
  owned = new Set<string>();
  bonuses: ResearchBonuses = defaultResearchBonuses();
  /** IAP / external cosmetics not stored as research node ids. */
  private externalCosmeticTrail = false;

  load(ids: string[], externalCosmeticTrail = false): void {
    this.owned = new Set(ids);
    this.externalCosmeticTrail = !!externalCosmeticTrail;
    this.recompute();
  }

  setExternalCosmeticTrail(on: boolean): void {
    this.externalCosmeticTrail = on;
    this.recompute();
  }

  recompute(): void {
    const b = defaultResearchBonuses();
    for (const id of this.owned) {
      const node = getResearchNode(id);
      if (!node) continue;
      const e = node.effects;
      if (typeof e.damageMul === 'number') b.damageMul *= e.damageMul;
      if (typeof e.hullMul === 'number') b.hullMul *= e.hullMul;
      if (typeof e.shieldMul === 'number') b.shieldMul *= e.shieldMul;
      if (typeof e.droneDamageMul === 'number') b.droneDamageMul *= e.droneDamageMul;
      if (typeof e.orbitSpeedMul === 'number') b.orbitSpeedMul *= e.orbitSpeedMul;
      if (typeof e.fragmentMul === 'number') b.fragmentMul *= e.fragmentMul;
      if (typeof e.idleRateMul === 'number') b.idleRateMul *= e.idleRateMul;
      if (typeof e.critChanceAdd === 'number') b.critChanceAdd += e.critChanceAdd;
      if (typeof e.maxHullAdd === 'number') b.maxHullAdd += e.maxHullAdd;
      if (typeof e.maxShieldAdd === 'number') b.maxShieldAdd += e.maxShieldAdd;
      if (typeof e.armorRatingAdd === 'number') b.armorRatingAdd += e.armorRatingAdd;
      if (typeof e.reviveImmunityBonus === 'number') {
        b.reviveImmunityBonus += e.reviveImmunityBonus;
      }
      if (e.unlockOvershield) b.unlockOvershield = true;
      if (e.unlockScanPulse) b.unlockScanPulse = true;
      if (e.unlockAutoIdle) b.unlockAutoIdle = true;
      if (e.cosmeticTrail) b.cosmeticTrail = true;
    }
    if (this.externalCosmeticTrail) b.cosmeticTrail = true;
    this.bonuses = b;
    bus.emit('research-changed', b);
  }

  isOwned(id: string): boolean {
    return this.owned.has(id);
  }

  rowUnlocked(row: number, ascensionTier: number): boolean {
    return ascensionTier >= row;
  }

  canPurchase(node: ResearchNodeDef, ascensionTier: number): boolean {
    if (this.owned.has(node.id)) return false;
    if (!this.rowUnlocked(node.row, ascensionTier)) return false;
    return node.prerequisites.every((p) => this.owned.has(p));
  }

  canAfford(node: ResearchNodeDef, currency: Currency): boolean {
    return currency.coreEnergy >= node.cost;
  }

  purchase(
    node: ResearchNodeDef,
    currency: Currency,
    ascensionTier: number
  ): boolean {
    if (!this.canPurchase(node, ascensionTier)) return false;
    if (!this.canAfford(node, currency)) return false;
    if (!currency.spendCoreEnergy(node.cost)) return false;
    this.owned.add(node.id);
    this.recompute();
    bus.emit('research-purchased', node);
    return true;
  }

  get nodes(): ResearchNodeDef[] {
    return RESEARCH_NODES;
  }
}
