import {
  RESEARCH_NODES,
  getResearchNode,
  researchRankCost,
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

/**
 * Research ownership:
 * - ranks[id] = purchased ranks (1..maxRank)
 * - legacy owned id list migrates to rank 1
 */
export class ResearchTree {
  ranks = new Map<string, number>();
  bonuses: ResearchBonuses = defaultResearchBonuses();
  private externalCosmeticTrail = false;

  /** Legacy + new: ids with rank≥1 */
  get owned(): Set<string> {
    return new Set(this.ranks.keys());
  }

  load(ids: string[], externalCosmeticTrail = false, ranks?: Record<string, number>): void {
    this.ranks = new Map();
    if (ranks && typeof ranks === 'object') {
      for (const [id, r] of Object.entries(ranks)) {
        const node = getResearchNode(id);
        if (!node) continue;
        const max = node.maxRank ?? 1;
        const n = Math.max(0, Math.min(max, Math.floor(r)));
        if (n > 0) this.ranks.set(id, n);
      }
    }
    // Migrate legacy owned ids → rank 1 (or keep if ranks already higher)
    for (const id of ids ?? []) {
      // Legacy multi-step ids map onto new stackable roots
      const mapped = migrateLegacyResearchId(id);
      if (!mapped) continue;
      const node = getResearchNode(mapped);
      if (!node) continue;
      const cur = this.ranks.get(mapped) ?? 0;
      this.ranks.set(mapped, Math.max(cur, 1));
    }
    this.externalCosmeticTrail = !!externalCosmeticTrail;
    this.recompute();
  }

  toJSON(): { owned: string[]; ranks: Record<string, number> } {
    const ranks: Record<string, number> = {};
    for (const [id, r] of this.ranks) ranks[id] = r;
    return { owned: Array.from(this.ranks.keys()), ranks };
  }

  getRank(id: string): number {
    return this.ranks.get(id) ?? 0;
  }

  setExternalCosmeticTrail(on: boolean): void {
    this.externalCosmeticTrail = on;
    this.recompute();
  }

  recompute(): void {
    const b = defaultResearchBonuses();
    for (const [id, rank] of this.ranks) {
      const node = getResearchNode(id);
      if (!node || rank <= 0) continue;
      for (let i = 0; i < rank; i++) {
        this.applyEffects(b, node.effects);
      }
    }
    if (this.externalCosmeticTrail) b.cosmeticTrail = true;
    this.bonuses = b;
    bus.emit('research-changed', b);
  }

  private applyEffects(
    b: ResearchBonuses,
    e: ResearchNodeDef['effects']
  ): void {
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

  isOwned(id: string): boolean {
    return (this.ranks.get(id) ?? 0) > 0;
  }

  rowUnlocked(row: number, ascensionTier: number): boolean {
    return ascensionTier >= row;
  }

  /** Next rank to buy, or 0 if maxed / unavailable. */
  nextRank(node: ResearchNodeDef): number {
    const cur = this.getRank(node.id);
    const max = node.maxRank ?? 1;
    if (cur >= max) return 0;
    return cur + 1;
  }

  canPurchase(node: ResearchNodeDef, ascensionTier: number): boolean {
    if (!this.rowUnlocked(node.row, ascensionTier)) return false;
    if (this.nextRank(node) <= 0) return false;
    // Prereqs: need at least rank 1 of each prereq
    return node.prerequisites.every((p) => this.getRank(p) >= 1);
  }

  nextCost(node: ResearchNodeDef): number {
    const nr = this.nextRank(node);
    if (nr <= 0) return Infinity;
    return researchRankCost(node, nr);
  }

  canAfford(node: ResearchNodeDef, currency: Currency): boolean {
    return currency.coreEnergy >= this.nextCost(node);
  }

  purchase(
    node: ResearchNodeDef,
    currency: Currency,
    ascensionTier: number
  ): boolean {
    if (!this.canPurchase(node, ascensionTier)) return false;
    const cost = this.nextCost(node);
    if (currency.coreEnergy < cost) return false;
    if (!currency.spendCoreEnergy(cost)) return false;
    const nr = this.nextRank(node);
    this.ranks.set(node.id, nr);
    this.recompute();
    bus.emit('research-purchased', { node, rank: nr });
    return true;
  }

  get nodes(): ResearchNodeDef[] {
    return RESEARCH_NODES;
  }
}

/** Map old lattice ids onto new stackable roots. */
function migrateLegacyResearchId(id: string): string | null {
  const map: Record<string, string> = {
    lat_focus_1: 'lat_focus',
    lat_focus_2: 'lat_focus',
    lat_focus_3: 'lat_focus',
    lat_plate_1: 'lat_plate',
    lat_frag_1: 'lat_frag',
    lat_frag_2: 'lat_frag',
    lat_idle_1: 'lat_idle',
    lat_drone_1: 'lat_drone',
    lat_shield_1: 'lat_shield',
    lat_orbit_1: 'lat_orbit',
    lat_crit_1: 'lat_crit',
    lat_trail_cyan: 'lat_trail_cyan',
    lat_overshield: 'lat_overshield',
    lat_grace: 'lat_grace',
    lat_scan: 'lat_scan',
    lat_auto_idle: 'lat_auto_idle',
    lat_armor_1: 'lat_armor_1',
    lat_hull_deep: 'lat_hull_deep',
    lat_flagship: 'lat_flagship',
  };
  if (map[id]) return map[id];
  if (getResearchNode(id)) return id;
  return null;
}
