/**
 * Music library — files live in public/audio/music/*.ogg
 */

export interface MusicTrack {
  id: string;
  title: string;
  /** URL path relative to site root (Vite public/) */
  src: string;
}

const BASE = './audio/music';

function track(file: string, title?: string): MusicTrack {
  const id = file.replace(/\.ogg$/i, '');
  return {
    id,
    title: title ?? id,
    src: `${BASE}/${encodeURIComponent(file)}`,
  };
}

export const MUSIC_MENU = track('Boot Sequence.ogg', 'Boot Sequence');
export const MUSIC_INTRO = track('The Final Protocol.ogg', 'The Final Protocol');

/** Combat / general pool (shuffled). Excludes menu + intro specials. */
export const MUSIC_POOL: MusicTrack[] = [
  track('Arc Reactor.ogg'),
  track('Boss Battle.ogg'),
  track('Combo Booster.ogg'),
  track('Combo breaker.ogg', 'Combo Breaker'),
  track('Control Alternate Delete.ogg'),
  track('Cube Battle.ogg'),
  track('Duty and Honor.ogg'),
  track('Emergence.ogg'),
  track('Frontline.ogg'),
  track('Invasion.ogg'),
  track('Neon Horizon.ogg'),
  track('Neon Invasion.ogg'),
  track('Portal Breakdown.ogg'),
  track('Space Hulk.ogg'),
];

/** Full list for radio UI browsing. */
export const MUSIC_ALL: MusicTrack[] = [MUSIC_MENU, MUSIC_INTRO, ...MUSIC_POOL];

export function getTrackById(id: string): MusicTrack | undefined {
  return MUSIC_ALL.find((t) => t.id === id);
}
