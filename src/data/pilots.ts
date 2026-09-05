/**
 * Campaign Pilot catalog — named doctrines on the current hull.
 * Data-driven: add a row here, then an unlock predicate in PilotState.
 * Not gacha. Not a second ship. Not a 3D cockpit.
 */

export type PilotUnlockPredicateId =
  | 'always'
  | 'own_fighter'
  | 'own_defender_or_ciws'
  | 'he_or_artillery_or_bomber'
  | 'any_hardpoint'
  | 'rage_death_or_sector';

export interface PilotActiveDef {
  id: string;
  name: string;
  duration: number;
  cooldown: number;
}

export interface PilotPassiveDef {
  id: string;
  name: string;
  blurb: string;
}

export interface PilotDef {
  id: string;
  name: string;
  callsign: string;
  blurb: string;
  unlockPredicateId: PilotUnlockPredicateId;
  /** One-line gate copy. No spoiler wall. */
  unlockHint: string;
  passive: PilotPassiveDef;
  active: PilotActiveDef | null;
  colors: { primary: string; secondary: string };
  portrait: string;
  /** Hex trail tint; Core/IAP cosmetics later. */
  trailTint: number | null;
  splashChrome: string;
  /** Persist as campaign identity (KEEP on Evolve). */
  persistCampaign: boolean;
}

export const PILOT_HEAT_DUMP_FAMILIES = ['pulse', 'beam', 'rail'] as const;

export const PILOTS: PilotDef[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    callsign: 'ROOK',
    blurb: 'No doctrine. Hull flies as-built.',
    unlockPredicateId: 'always',
    unlockHint: 'Always available.',
    passive: { id: 'none', name: 'None', blurb: 'Zero bonuses.' },
    active: null,
    colors: { primary: '#7aa0aa', secondary: '#2a3a44' },
    portrait: './pilots/rookie.svg',
    trailTint: null,
    splashChrome: 'dim',
    persistCampaign: false,
  },
  {
    id: 'ace',
    name: 'Ace',
    callsign: 'ACE',
    blurb: 'Fighter doctrine. Hunt drones, then turrets. Leave the hull to the guns.',
    unlockPredicateId: 'own_fighter',
    unlockHint: 'Own a fighter.',
    passive: {
      id: 'ace_net',
      name: 'Net Discipline',
      blurb: 'Fighters retarget faster and hit enemy drones harder.',
    },
    active: { id: 'mark', name: 'MARK', duration: 6, cooldown: 30 },
    colors: { primary: '#00f0ff', secondary: '#ff00aa' },
    portrait: './pilots/ace.svg',
    trailTint: 0x00f0ff,
    splashChrome: 'cyan',
    persistCampaign: true,
  },
  {
    id: 'warden',
    name: 'Warden',
    callsign: 'WARDEN',
    blurb: 'Point-defense doctrine. Defenders and CIWS own the inner sphere.',
    unlockPredicateId: 'own_defender_or_ciws',
    unlockHint: 'Field a defender or Phalanx CIWS.',
    passive: {
      id: 'warden_aegis',
      name: 'Aegis Net',
      blurb: 'Wider intercept radius. Stronger point defense.',
    },
    active: { id: 'overshield', name: 'OVERSHIELD', duration: 4, cooldown: 35 },
    colors: { primary: '#66ffe0', secondary: '#00f0ff' },
    portrait: './pilots/warden.svg',
    trailTint: 0x66ffe0,
    splashChrome: 'cyan',
    persistCampaign: true,
  },
  {
    id: 'siege',
    name: 'Siege',
    callsign: 'SIEGE',
    blurb: 'Surface-break doctrine. Bombers and howitzers crack the lattice.',
    unlockPredicateId: 'he_or_artillery_or_bomber',
    unlockHint: 'Field HE ammo, artillery, or a bomber.',
    passive: {
      id: 'siege_warhead',
      name: 'Warhead Protocol',
      blurb: 'Artillery splash and bomber warheads hit harder.',
    },
    active: { id: 'peel', name: 'PEEL', duration: 4, cooldown: 30 },
    colors: { primary: '#ff00aa', secondary: '#ffb020' },
    portrait: './pilots/siege.svg',
    trailTint: 0xff00aa,
    splashChrome: 'magenta',
    persistCampaign: true,
  },
  {
    id: 'gunner',
    name: 'Gunner',
    callsign: 'GUNNER',
    blurb: 'Main-battery doctrine. Heat is a resource. Hardpoints earn the seat.',
    unlockPredicateId: 'any_hardpoint',
    unlockHint: 'Mount a hardpoint weapon.',
    passive: {
      id: 'gunner_vents',
      name: 'Vent Discipline',
      blurb: 'Main gun cools faster and bites armor slightly harder.',
    },
    active: { id: 'heat_dump', name: 'HEAT DUMP', duration: 1.5, cooldown: 28 },
    colors: { primary: '#ffb020', secondary: '#00f0ff' },
    portrait: './pilots/gunner.svg',
    trailTint: 0xffc040,
    splashChrome: 'amber',
    persistCampaign: true,
  },
  {
    id: 'ghost',
    name: 'Ghost',
    callsign: 'GHOST',
    blurb: 'Orbit doctrine. Rage beacons teach you to slip the line.',
    unlockPredicateId: 'rage_death_or_sector',
    unlockHint: 'Reach a Rage chronobeacon.',
    passive: {
      id: 'ghost_line',
      name: 'Line Cut',
      blurb: 'Orbit accelerates harder.',
    },
    active: { id: 'orbit_dash', name: 'DASH', duration: 0.45, cooldown: 22 },
    colors: { primary: '#c8a0ff', secondary: '#00f0ff' },
    portrait: './pilots/ghost.svg',
    trailTint: 0xc8a0ff,
    splashChrome: 'violet',
    persistCampaign: true,
  },
];

export const PILOT_BY_ID: Record<string, PilotDef> = Object.fromEntries(
  PILOTS.map((p) => [p.id, p])
);

export function getPilot(id: string | null | undefined): PilotDef | undefined {
  if (!id) return undefined;
  return PILOT_BY_ID[id];
}

export function campaignPilotIds(): string[] {
  return PILOTS.filter((p) => p.persistCampaign).map((p) => p.id);
}
