/**
 * Central combat math — all damage should route through these helpers.
 * Armor uses hyperbolic DR; crit chance/mult are hard-capped.
 */
import { BlockType, armorClassOf, type ArmorClass } from '../cube/BlockTypes';
import {
  ARMOR_HYPERBOLIC_K,
  ARMOR_MAX_EFFECTIVE_REDUCTION,
  ARMOR_RATING_HEAVY,
  ARMOR_RATING_LIGHT,
  ARMOR_RATING_SIEGE,
  CRIT_CHANCE_HARD_CAP,
  CRIT_MULT_HARD_CAP,
} from '../data/constraints';

export type { ArmorClass };

/** Hyperbolic armor constant: effective = rating / (rating + K) */
export const ARMOR_K = ARMOR_HYPERBOLIC_K;

/** Hard caps (plan §1) */
export const CAPS = {
  armorEffective: ARMOR_MAX_EFFECTIVE_REDUCTION,
  critChance: CRIT_CHANCE_HARD_CAP,
  critMult: CRIT_MULT_HARD_CAP,
  shieldAbsorb: 1.0,
} as const;

export interface DamagePacket {
  raw: number;
  /** 0–1 armor pierce (1 = full ignore of armor DR) */
  armorPierce?: number;
  /** Crit chance before cap (0–1) */
  critChance?: number;
  /** Crit multiplier before cap (e.g. 2.0) */
  critMult?: number;
  /** Force crit for VFX tests */
  forceCrit?: boolean;
  tags?: string[];
}

export interface OutgoingResult {
  damage: number;
  crit: boolean;
  critMult: number;
}

export interface IncomingTarget {
  shield: number;
  maxShield: number;
  armorRating: number;
  hull: number;
  maxHull: number;
}

export interface IncomingResult {
  shieldDamage: number;
  hullDamage: number;
  shield: number;
  hull: number;
  killed: boolean;
  absorbedByShield: boolean;
  effectiveArmor: number;
}

/** Map block types to armor class (P2 armor walls / drone AFK gates). */
export function armorClassForBlock(type: BlockType): ArmorClass {
  return armorClassOf(type);
}

/** Intrinsic armor rating contribution from block class (for pierce formulas). */
export function armorRatingForClass(ac: ArmorClass): number {
  switch (ac) {
    case 'siege':
      return ARMOR_RATING_SIEGE;
    case 'heavy':
      return ARMOR_RATING_HEAVY;
    case 'light':
      return ARMOR_RATING_LIGHT;
    default:
      return 0;
  }
}

/**
 * effectiveArmor = clamp(rating / (rating + ARMOR_K), 0, CAP)
 */
export function effectiveArmor(armorRating: number): number {
  const r = Math.max(0, armorRating);
  const e = r / (r + ARMOR_K);
  return Math.min(CAPS.armorEffective, Math.max(0, e));
}

export function clampCritChance(chance: number): number {
  return Math.min(CAPS.critChance, Math.max(0, chance));
}

export function clampCritMult(mult: number): number {
  return Math.min(CAPS.critMult, Math.max(1, mult));
}

/**
 * Player / drone outgoing damage: crit roll + optional tags.
 * Does NOT apply armor — use applyToBlock for cube blocks.
 */
export function rollOutgoing(packet: DamagePacket, rng: () => number = Math.random): OutgoingResult {
  const chance = clampCritChance(packet.critChance ?? 0);
  const mult = clampCritMult(packet.critMult ?? 2);
  const crit = packet.forceCrit === true || (chance > 0 && rng() < chance);
  const damage = packet.raw * (crit ? mult : 1);
  return { damage, crit, critMult: mult };
}

/**
 * Damage after hyperbolic armor, reduced by armorPierce (0–1).
 */
export function afterArmor(
  raw: number,
  armorRating: number,
  armorPierce = 0
): { damage: number; effectiveArmor: number } {
  const pierce = Math.min(1, Math.max(0, armorPierce));
  const ea = effectiveArmor(armorRating) * (1 - pierce);
  return { damage: raw * (1 - ea), effectiveArmor: ea };
}

/**
 * Apply damage to a cube block using its armor class.
 * Miners without pierce get crushed vs siege (×0.15).
 */
export function applyToBlock(
  packet: DamagePacket,
  blockType: BlockType,
  opts?: { roleMultiplier?: number; rng?: () => number }
): OutgoingResult & { finalDamage: number; armorClass: ArmorClass } {
  const rolled = rollOutgoing(packet, opts?.rng ?? Math.random);
  const ac = armorClassForBlock(blockType);
  const rating = armorRatingForClass(ac);
  let dmg = rolled.damage * (opts?.roleMultiplier ?? 1);

  // AFK wall: unpierced siege takes tiny damage
  if (ac === 'siege' && (packet.armorPierce ?? 0) < 0.25) {
    dmg *= 0.15;
  } else if (ac === 'heavy' && (packet.armorPierce ?? 0) < 0.1) {
    dmg *= 0.55;
  } else {
    dmg = afterArmor(dmg, rating, packet.armorPierce ?? 0).damage;
  }

  return {
    ...rolled,
    damage: rolled.damage,
    finalDamage: Math.max(0.01, dmg),
    armorClass: ac,
  };
}

/**
 * Shield → Armor DR → Hull intake order (P3/P8 player vitals).
 */
export function applyIncoming(target: IncomingTarget, rawDamage: number): IncomingResult {
  let remaining = Math.max(0, rawDamage);
  let shieldDamage = 0;
  let absorbedByShield = false;

  if (target.shield > 0 && remaining > 0) {
    const absorb = Math.min(target.shield, remaining);
    shieldDamage = absorb;
    remaining -= absorb;
    absorbedByShield = absorb > 0;
  }

  const ea = effectiveArmor(target.armorRating);
  const hullDamage = remaining * (1 - ea);
  const newShield = Math.max(0, target.shield - shieldDamage);
  const newHull = Math.max(0, target.hull - hullDamage);

  return {
    shieldDamage,
    hullDamage,
    shield: newShield,
    hull: newHull,
    killed: newHull <= 0,
    absorbedByShield,
    effectiveArmor: ea,
  };
}

/** Convenience for weapon DPS estimates in UI. */
export function estimateDps(
  damage: number,
  fireRate: number,
  critChance: number,
  critMult: number
): number {
  const cc = clampCritChance(critChance);
  const cm = clampCritMult(critMult);
  const avg = damage * (1 - cc + cc * cm);
  return avg * fireRate;
}
