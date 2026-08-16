import { STAT_CAPS } from '../data/upgrades';
import {
  SHIP_BASE_ARMOR_RATING,
  SHIP_BASE_HULL_HIT_POINTS,
  SHIP_BASE_MAX_SHIELD,
  SHIP_SHIELD_RECHARGE_DELAY_SECONDS,
  SHIP_SHIELD_RECHARGE_PER_SECOND,
} from '../data/constraints';
import type { PlayerStats } from '../progression/TechTree';

export interface DamageIntakeResult {
  hullDamage: number;
  shieldDamage: number;
  died: boolean;
  raw: number;
  afterArmor: number;
}

export interface ShipVitalsSnapshot {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  armorRating: number;
  armorEffective: number;
  shieldRegen: number;
  timeSinceDamage: number;
}

const BASE_HULL = SHIP_BASE_HULL_HIT_POINTS;
const BASE_SHIELD = SHIP_BASE_MAX_SHIELD;
const BASE_ARMOR = SHIP_BASE_ARMOR_RATING;
const BASE_SHIELD_REGEN = SHIP_SHIELD_RECHARGE_PER_SECOND;
const SHIELD_REGEN_DELAY = SHIP_SHIELD_RECHARGE_DELAY_SECONDS;

/**
 * Layered survivability: Shield → Armor DR → Hull.
 * DR uses hyperbolic formula rating/(rating+K), hard-capped at 55%.
 */
export class ShipVitals {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  armorRating: number;
  shieldRegen: number;
  private timeSinceDamage = 999;

  constructor() {
    this.maxHull = BASE_HULL;
    this.hull = BASE_HULL;
    this.maxShield = BASE_SHIELD;
    this.shield = BASE_SHIELD;
    this.armorRating = BASE_ARMOR;
    this.shieldRegen = BASE_SHIELD_REGEN;
  }

  /** Recompute caps from tech tree; preserve current fill ratios when max rises. */
  syncFromStats(stats: PlayerStats): void {
    const hullRatio = this.maxHull > 0 ? this.hull / this.maxHull : 1;
    const shieldRatio = this.maxShield > 0 ? this.shield / this.maxShield : 1;

    this.maxHull = BASE_HULL + (stats.maxHullAdd ?? 0);
    this.maxShield = BASE_SHIELD + (stats.maxShieldAdd ?? 0);
    this.armorRating = BASE_ARMOR + (stats.armorRatingAdd ?? 0);
    this.shieldRegen = BASE_SHIELD_REGEN + (stats.shieldRegenAdd ?? 0);

    this.hull = Math.min(this.maxHull, Math.max(0, hullRatio * this.maxHull));
    this.shield = Math.min(this.maxShield, Math.max(0, shieldRatio * this.maxShield));
  }

  get effectiveArmor(): number {
    const k = STAT_CAPS.armorK;
    const raw = this.armorRating / (this.armorRating + k);
    return Math.min(STAT_CAPS.armorEffective, raw);
  }

  /**
   * Damage order: shield absorbs first (no DR), remainder is armor-reduced, then hull.
   */
  takeDamage(raw: number): DamageIntakeResult {
    const amount = Math.max(0, raw);
    this.timeSinceDamage = 0;

    let remaining = amount;
    let shieldDamage = 0;
    let hullDamage = 0;

    if (this.shield > 0 && remaining > 0) {
      shieldDamage = Math.min(this.shield, remaining);
      this.shield -= shieldDamage;
      remaining -= shieldDamage;
    }

    let afterArmor = remaining;
    if (remaining > 0) {
      const dr = this.effectiveArmor;
      afterArmor = remaining * (1 - dr);
      hullDamage = afterArmor;
      this.hull = Math.max(0, this.hull - hullDamage);
    }

    const died = this.hull <= 0;
    return {
      hullDamage,
      shieldDamage,
      died,
      raw: amount,
      afterArmor,
    };
  }

  /** Shield regen after 3s without taking damage. */
  update(dt: number): void {
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage < SHIELD_REGEN_DELAY) return;
    if (this.shield >= this.maxShield) return;
    this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
  }

  heal(amount: number): void {
    this.hull = Math.min(this.maxHull, this.hull + Math.max(0, amount));
  }

  restoreShield(amount?: number): void {
    if (amount === undefined) {
      this.shield = this.maxShield;
    } else {
      this.shield = Math.min(this.maxShield, this.shield + Math.max(0, amount));
    }
  }

  /** Full restore (level start / extract repair). */
  fullRestore(): void {
    this.hull = this.maxHull;
    this.shield = this.maxShield;
    this.timeSinceDamage = 999;
  }

  get isAlive(): boolean {
    return this.hull > 0;
  }

  snapshot(): ShipVitalsSnapshot {
    return {
      hull: this.hull,
      maxHull: this.maxHull,
      shield: this.shield,
      maxShield: this.maxShield,
      armorRating: this.armorRating,
      armorEffective: this.effectiveArmor,
      shieldRegen: this.shieldRegen,
      timeSinceDamage: this.timeSinceDamage,
    };
  }
}

/** Effective armor % from a raw rating (for UI without a vitals instance). */
export function armorEffectiveFromRating(rating: number): number {
  const k = STAT_CAPS.armorK;
  return Math.min(STAT_CAPS.armorEffective, rating / (rating + k));
}
