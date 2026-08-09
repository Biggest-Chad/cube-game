import {
  STAT_CAPS,
  UPGRADES,
  type UpgradeEffect,
  type UpgradeNodeDef,
} from '../data/upgrades';
import {
  BASELINE_IDENTITY,
  type AscensionBaseline,
} from '../data/evolve';
import { bus } from '../core/EventBus';
import type { Currency } from './Currency';
import {
  defaultResearchBonuses,
  type ResearchBonuses,
} from './ResearchTree';

export interface PlayerStats {
  /** Final folded mult used by Weapon / systems. */
  damageMul: number;
  fireRateMul: number;
  multiShotAdd: number;
  splashAdd: number;
  orbitSpeedMul: number;
  /** Angular acceleration mult (P0/P3 ship handling). */
  accelMul: number;
  zoomRangeAdd: number;
  droneCount: number;
  droneDamageMul: number;
  droneFireRateMul: number;
  dronePriorityCore: boolean;
  dronePriorityData: boolean;
  fragmentMul: number;
  coreEnergyMul: number;
  idleRateMul: number;
  idleCapMul: number;
  critChance: number;
  beamWidth: number;
  /** Gentle main-gun cone spread */
  spreadAdd: number;
  /** Main gun block penetration count */
  penetrationAdd: number;
  /** Main gun armor pierce add */
  armorPierceAdd: number;
  dronesUnlocked: boolean;
  /** Vitals bonuses (consumed by ShipVitals.syncFromStats). */
  maxHullAdd: number;
  maxShieldAdd: number;
  armorRatingAdd: number;
  shieldRegenAdd: number;
  /** Unlocked hardpoints (1 base + adds). */
  hardpoints: number;
  /** Drone hull bonus as fraction of base HP (0.2 = +20%). */
  droneHpAdd: number;
  /** Reduces respawn time (0.3 = 30% faster). */
  droneRespawnReduce: number;
  /** Defender frontal shield bonus fraction. */
  droneShieldAdd: number;
  /** Shield regen rate bonus fraction. */
  droneShieldRegenAdd: number;
}

export function defaultStats(): PlayerStats {
  return {
    damageMul: 1,
    fireRateMul: 1,
    multiShotAdd: 0,
    splashAdd: 0,
    orbitSpeedMul: 1,
    accelMul: 1,
    zoomRangeAdd: 0,
    droneCount: 0,
    droneDamageMul: 1,
    droneFireRateMul: 1,
    dronePriorityCore: false,
    dronePriorityData: false,
    fragmentMul: 1,
    coreEnergyMul: 1,
    idleRateMul: 1,
    idleCapMul: 1,
    critChance: 0,
    beamWidth: 1,
    spreadAdd: 0,
    penetrationAdd: 0,
    armorPierceAdd: 0,
    dronesUnlocked: false,
    maxHullAdd: 0,
    maxShieldAdd: 0,
    armorRatingAdd: 0,
    shieldRegenAdd: 0,
    hardpoints: 1,
    droneHpAdd: 0,
    droneRespawnReduce: 0,
    droneShieldAdd: 0,
    droneShieldRegenAdd: 0,
  };
}

interface Accumulators {
  damageAdd: number;
  damageMulProd: number;
  fireRateAdd: number;
  fireRateMulProd: number;
  orbitSpeedAdd: number;
  orbitSpeedMulProd: number;
  accelAdd: number;
  droneDamageAdd: number;
  droneDamageMulProd: number;
  droneFireRateAdd: number;
  droneFireRateMulProd: number;
  fragmentAdd: number;
  fragmentMulProd: number;
  coreEnergyAdd: number;
  coreEnergyMulProd: number;
  idleRateAdd: number;
  idleRateMulProd: number;
  idleCapAdd: number;
  idleCapMulProd: number;
}

function emptyAcc(): Accumulators {
  return {
    damageAdd: 0,
    damageMulProd: 1,
    fireRateAdd: 0,
    fireRateMulProd: 1,
    orbitSpeedAdd: 0,
    orbitSpeedMulProd: 1,
    accelAdd: 0,
    droneDamageAdd: 0,
    droneDamageMulProd: 1,
    droneFireRateAdd: 0,
    droneFireRateMulProd: 1,
    fragmentAdd: 0,
    fragmentMulProd: 1,
    coreEnergyAdd: 0,
    coreEnergyMulProd: 1,
    idleRateAdd: 0,
    idleRateMulProd: 1,
    idleCapAdd: 0,
    idleCapMulProd: 1,
  };
}

function applyEffect(stats: PlayerStats, acc: Accumulators, e: UpgradeEffect): void {
  if (e.damageAdd) acc.damageAdd += e.damageAdd;
  if (e.damageMul) acc.damageMulProd *= e.damageMul;
  if (e.fireRateAdd) acc.fireRateAdd += e.fireRateAdd;
  if (e.fireRateMul) acc.fireRateMulProd *= e.fireRateMul;
  if (e.multiShotAdd) stats.multiShotAdd += e.multiShotAdd;
  if (e.splashAdd) stats.splashAdd += e.splashAdd;
  if (e.orbitSpeedAdd) acc.orbitSpeedAdd += e.orbitSpeedAdd;
  if (e.orbitSpeedMul) acc.orbitSpeedMulProd *= e.orbitSpeedMul;
  if (e.accelAdd) acc.accelAdd += e.accelAdd;
  if (e.zoomRangeAdd) stats.zoomRangeAdd += e.zoomRangeAdd;
  if (e.droneCountAdd) stats.droneCount += e.droneCountAdd;
  if (e.droneDamageAdd) acc.droneDamageAdd += e.droneDamageAdd;
  if (e.droneDamageMul) acc.droneDamageMulProd *= e.droneDamageMul;
  if (e.droneFireRateAdd) acc.droneFireRateAdd += e.droneFireRateAdd;
  if (e.droneFireRateMul) acc.droneFireRateMulProd *= e.droneFireRateMul;
  if (e.dronePriorityCore) stats.dronePriorityCore = true;
  if (e.dronePriorityData) stats.dronePriorityData = true;
  if (e.fragmentAdd) acc.fragmentAdd += e.fragmentAdd;
  if (e.fragmentMul) acc.fragmentMulProd *= e.fragmentMul;
  if (e.coreEnergyAdd) acc.coreEnergyAdd += e.coreEnergyAdd;
  if (e.coreEnergyMul) acc.coreEnergyMulProd *= e.coreEnergyMul;
  if (e.idleRateAdd) acc.idleRateAdd += e.idleRateAdd;
  if (e.idleRateMul) acc.idleRateMulProd *= e.idleRateMul;
  if (e.idleCapAdd) acc.idleCapAdd += e.idleCapAdd;
  if (e.idleCapMul) acc.idleCapMulProd *= e.idleCapMul;
  if (e.critChance) stats.critChance += e.critChance;
  if (e.beamWidth) stats.beamWidth *= e.beamWidth;
  if (e.spreadAdd) stats.spreadAdd += e.spreadAdd;
  if (e.penetrationAdd) stats.penetrationAdd += e.penetrationAdd;
  if (e.armorPierceAdd) stats.armorPierceAdd += e.armorPierceAdd;
  if (e.unlockDrones) stats.dronesUnlocked = true;
  if (e.maxHullAdd) stats.maxHullAdd += e.maxHullAdd;
  if (e.maxShieldAdd) stats.maxShieldAdd += e.maxShieldAdd;
  if (e.armorRatingAdd) stats.armorRatingAdd += e.armorRatingAdd;
  if (e.shieldRegenAdd) stats.shieldRegenAdd += e.shieldRegenAdd;
  if (e.hardpointAdd) stats.hardpoints += e.hardpointAdd;
  if (e.droneHpAdd) stats.droneHpAdd += e.droneHpAdd;
  if (e.droneRespawnReduce) stats.droneRespawnReduce += e.droneRespawnReduce;
  if (e.droneShieldAdd) stats.droneShieldAdd += e.droneShieldAdd;
  if (e.droneShieldRegenAdd) stats.droneShieldRegenAdd += e.droneShieldRegenAdd;
}

function fold(stats: PlayerStats, acc: Accumulators): void {
  stats.damageMul = Math.min(
    STAT_CAPS.damageMul,
    (1 + acc.damageAdd) * acc.damageMulProd
  );
  stats.fireRateMul = Math.min(
    STAT_CAPS.fireRateMul,
    (1 + acc.fireRateAdd) * acc.fireRateMulProd
  );
  stats.orbitSpeedMul = Math.min(
    STAT_CAPS.orbitSpeedMul,
    (1 + acc.orbitSpeedAdd) * acc.orbitSpeedMulProd
  );
  stats.accelMul = 1 + acc.accelAdd;
  stats.droneDamageMul = (1 + acc.droneDamageAdd) * acc.droneDamageMulProd;
  stats.droneFireRateMul = (1 + acc.droneFireRateAdd) * acc.droneFireRateMulProd;
  stats.fragmentMul = Math.min(
    STAT_CAPS.fragmentMul,
    (1 + acc.fragmentAdd) * acc.fragmentMulProd
  );
  stats.coreEnergyMul = Math.min(
    STAT_CAPS.coreEnergyMul,
    (1 + acc.coreEnergyAdd) * acc.coreEnergyMulProd
  );
  stats.idleRateMul = (1 + acc.idleRateAdd) * acc.idleRateMulProd;
  stats.idleCapMul = (1 + acc.idleCapAdd) * acc.idleCapMulProd;
  stats.critChance = Math.min(STAT_CAPS.critChance, stats.critChance);
  stats.droneCount = Math.min(STAT_CAPS.droneCount, stats.droneCount);
  stats.hardpoints = Math.min(3, Math.max(1, stats.hardpoints));
  stats.droneHpAdd = Math.min(2, Math.max(0, stats.droneHpAdd));
  stats.droneRespawnReduce = Math.min(0.7, Math.max(0, stats.droneRespawnReduce));
  stats.droneShieldAdd = Math.min(2, Math.max(0, stats.droneShieldAdd));
  stats.droneShieldRegenAdd = Math.min(1.5, Math.max(0, stats.droneShieldRegenAdd));
}

export class TechTree {
  owned = new Set<string>();
  stats: PlayerStats = defaultStats();
  /** Permanent Ascension baseline (does not reset on combat retrain). */
  baseline: AscensionBaseline = { ...BASELINE_IDENTITY };
  /** Research Lattice permanent bonuses. */
  research: ResearchBonuses = defaultResearchBonuses();

  load(ids: string[]): void {
    this.owned = new Set(ids);
    this.recompute();
  }

  setBaseline(b: AscensionBaseline): void {
    this.baseline = { ...b };
    this.recompute();
  }

  setResearch(r: ResearchBonuses): void {
    this.research = { ...r };
    this.recompute();
  }

  /** Clear combat shop ownership only (Evolve retrain). */
  resetCombatUpgrades(): void {
    this.owned.clear();
    this.recompute();
  }

  recompute(): void {
    this.stats = defaultStats();
    const acc = emptyAcc();
    for (const id of this.owned) {
      const node = UPGRADES.find((u) => u.id === id);
      if (node) applyEffect(this.stats, acc, node.effects);
    }
    fold(this.stats, acc);
    this.applyMetaMultipliers();
    bus.emit('stats-changed', this.stats);
  }

  /**
   * final = shop * ascension baseline * research (design §8).
   * Hull/shield adds from research applied as flat adds after mults.
   */
  private applyMetaMultipliers(): void {
    const bl = this.baseline;
    const rs = this.research;
    this.stats.damageMul = Math.min(
      STAT_CAPS.damageMul,
      this.stats.damageMul * bl.damageMul * rs.damageMul
    );
    this.stats.droneDamageMul *= bl.droneDamageMul * rs.droneDamageMul;
    this.stats.orbitSpeedMul = Math.min(
      STAT_CAPS.orbitSpeedMul,
      this.stats.orbitSpeedMul * bl.orbitSpeedMul * rs.orbitSpeedMul
    );
    this.stats.fragmentMul = Math.min(
      STAT_CAPS.fragmentMul,
      this.stats.fragmentMul * rs.fragmentMul
    );
    this.stats.idleRateMul *= bl.idleRateMul * rs.idleRateMul;
    this.stats.critChance = Math.min(
      STAT_CAPS.critChance,
      this.stats.critChance + rs.critChanceAdd
    );
    // Hull / shield: (BASE + shop adds) * baseline * research, then flat research adds.
    // ShipVitals uses BASE_HULL=100, BASE_SHIELD=40 + max*Add.
    const hullTotal = 100 + this.stats.maxHullAdd;
    const shieldTotal = 40 + this.stats.maxShieldAdd;
    this.stats.maxHullAdd =
      Math.round(hullTotal * bl.hullMul * rs.hullMul - 100) + rs.maxHullAdd;
    this.stats.maxShieldAdd =
      Math.round(shieldTotal * bl.shieldMul * rs.shieldMul - 40) + rs.maxShieldAdd;
    this.stats.armorRatingAdd += rs.armorRatingAdd;
  }

  isOwned(id: string): boolean {
    return this.owned.has(id);
  }

  canPurchase(node: UpgradeNodeDef): boolean {
    if (this.owned.has(node.id)) return false;
    // Placeholder teaser with absurd cost
    if (node.cost >= 99999) return false;
    return node.prerequisites.every((p) => this.owned.has(p));
  }

  canAfford(node: UpgradeNodeDef, currency: Currency): boolean {
    if (node.costCurrency === 'coreEnergy') {
      return currency.coreEnergy >= node.cost;
    }
    return currency.dataFragments >= node.cost;
  }

  purchase(node: UpgradeNodeDef, currency: Currency): boolean {
    if (!this.canPurchase(node)) return false;
    if (!this.canAfford(node, currency)) return false;

    const spent =
      node.costCurrency === 'coreEnergy'
        ? currency.spendCoreEnergy(node.cost)
        : currency.spendFragments(node.cost);
    if (!spent) return false;

    this.owned.add(node.id);
    this.recompute();
    bus.emit('upgrade-purchased', node);
    return true;
  }

  get nodes(): UpgradeNodeDef[] {
    return UPGRADES;
  }
}
