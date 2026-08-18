/**
 * Main-gun ammunition profiles. Standard is always available.
 * AP / HE unlock through the GUN shop and are swapped from the HUD (or R).
 *
 * Personality (shop Needle Core / Shock Halo still apply on Standard):
 *   AP  — extra block pierce, no splash
 *   HE  — extra splash, no pierce
 */
import { COLORS } from './constants';
import { MAIN_GUN_AMMO_AP_EXTRA_PIERCE, MAIN_GUN_AMMO_HE_EXTRA_SPLASH } from './constraints';

export type MainGunAmmoId = 'standard' | 'ap' | 'he';

export interface MainGunAmmoProfile {
  id: MainGunAmmoId;
  short: string;
  name: string;
  hint: string;
  /** Extra blocks pierced on top of shop Needle Core (AP only). */
  extraPen: number;
  /** Extra splash radius on top of shop Shock Halo (HE only). */
  extraSplash: number;
  /** 0 = force no splash (AP). 1 = keep shop splash. */
  splashScale: number;
  /** 0 = force no pierce (HE). 1 = keep shop pierce. */
  penScale: number;
  armorPierceAdd: number;
  damageMul: number;
  /** HE applies splash even if the primary block survives. */
  splashOnChip: boolean;
  coreColor: number;
  sheathColor: number;
}

export const MAIN_GUN_AMMO_ORDER: MainGunAmmoId[] = ['standard', 'ap', 'he'];

export const MAIN_GUN_AMMO: Record<MainGunAmmoId, MainGunAmmoProfile> = {
  standard: {
    id: 'standard',
    short: 'STD',
    name: 'Standard',
    hint: 'Balanced pierce / splash',
    extraPen: 0,
    extraSplash: 0,
    splashScale: 1,
    penScale: 1,
    armorPierceAdd: 0,
    damageMul: 1,
    splashOnChip: false,
    coreColor: 0xffffff,
    sheathColor: COLORS.cyan,
  },
  ap: {
    id: 'ap',
    short: 'AP',
    name: 'Armor Piercing',
    hint: 'Extra pierce · no splash',
    extraPen: MAIN_GUN_AMMO_AP_EXTRA_PIERCE,
    extraSplash: 0,
    splashScale: 0,
    penScale: 1,
    armorPierceAdd: 0.15,
    damageMul: 1.06,
    splashOnChip: false,
    coreColor: 0xfff2c4,
    sheathColor: 0xffb020,
  },
  he: {
    id: 'he',
    short: 'HE',
    name: 'Explosive',
    hint: 'Extra splash · no pierce',
    extraPen: 0,
    extraSplash: MAIN_GUN_AMMO_HE_EXTRA_SPLASH,
    splashScale: 1,
    penScale: 0,
    armorPierceAdd: 0,
    damageMul: 0.94,
    splashOnChip: true,
    coreColor: 0xffe8d4,
    sheathColor: 0xff5522,
  },
};

export function isMainGunAmmoId(v: unknown): v is MainGunAmmoId {
  return v === 'standard' || v === 'ap' || v === 'he';
}

export function ammoUnlocked(id: MainGunAmmoId, flags: { ammoAp: boolean; ammoHe: boolean }): boolean {
  if (id === 'standard') return true;
  if (id === 'ap') return flags.ammoAp;
  return flags.ammoHe;
}

export function normalizeMainGunAmmo(
  raw: unknown,
  flags: { ammoAp: boolean; ammoHe: boolean }
): MainGunAmmoId {
  if (!isMainGunAmmoId(raw) || !ammoUnlocked(raw, flags)) return 'standard';
  return raw;
}

export function nextMainGunAmmo(
  current: MainGunAmmoId,
  flags: { ammoAp: boolean; ammoHe: boolean }
): MainGunAmmoId {
  const start = Math.max(0, MAIN_GUN_AMMO_ORDER.indexOf(current));
  for (let i = 1; i <= MAIN_GUN_AMMO_ORDER.length; i++) {
    const id = MAIN_GUN_AMMO_ORDER[(start + i) % MAIN_GUN_AMMO_ORDER.length];
    if (ammoUnlocked(id, flags)) return id;
  }
  return 'standard';
}

export function resolveMainGunAmmo(
  id: MainGunAmmoId,
  shop: { splashAdd: number; penetrationAdd: number; armorPierceAdd: number; ammoApPenAdd: number; ammoHeSplashAdd: number }
): { splash: number; pen: number; armorPierceAdd: number; damageMul: number; profile: MainGunAmmoProfile } {
  const profile = MAIN_GUN_AMMO[id];
  const extraPen = id === 'ap' ? shop.ammoApPenAdd : 0;
  const extraSplash = id === 'he' ? shop.ammoHeSplashAdd : 0;
  return {
    splash: (shop.splashAdd * profile.splashScale + profile.extraSplash + extraSplash) || 0,
    pen: Math.floor(shop.penetrationAdd * profile.penScale + profile.extraPen + extraPen),
    armorPierceAdd: shop.armorPierceAdd + profile.armorPierceAdd,
    damageMul: profile.damageMul,
    profile,
  };
}
