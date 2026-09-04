/**
 * Transit flyer — interstitial after cube clears at 2, 7, 12… (between Chronobeacons).
 * Lattice (Core Energy) bonus from star rating. No throttle; auto-forward.
 */

export type FlyerSceneId = 'canyon' | 'wormhole' | 'yard' | 'rift';

export const FLYER_SCENES: FlyerSceneId[] = ['canyon', 'wormhole', 'yard', 'rift'];

export const FLYER_BASE_SPEED = 26;
export const FLYER_DURATION_SECONDS = 38;
export const FLYER_LANE_HALF = 6.2;
export const FLYER_STRAFE = 14;
export const FLYER_SPEED_PICKUP_MUL = 1.12;
export const FLYER_SPEED_MUL_CAP = 1.52;
export const FLYER_LOCK_AHEAD = 16;
export const FLYER_LOCK_XY = 2.35;
export const FLYER_HIT_COOLDOWN = 0.55;

/** After clearing this sector, run transit before the next cube. 2, 7, 12, 17… */
export function shouldRunTransit(clearedLevelId: number): boolean {
  return clearedLevelId >= 2 && clearedLevelId % 5 === 2;
}

export function pickFlyerScene(clearedLevelId: number): FlyerSceneId {
  const i = Math.floor(Math.max(0, clearedLevelId - 2) / 5) % FLYER_SCENES.length;
  return FLYER_SCENES[i];
}

export function flyerSceneTitle(id: FlyerSceneId): string {
  switch (id) {
    case 'canyon':
      return 'CITY TRANSFER';
    case 'wormhole':
      return 'WORMHOLE CORRIDOR';
    case 'yard':
      return 'ORBITAL YARD';
    case 'rift':
      return 'ICE RIFT';
  }
}

export type FlyerHitKind = 'emp' | 'mine' | 'solid' | 'gate';

export function flyerHitProfile(kind: FlyerHitKind): { shield: number; hull: number } {
  switch (kind) {
    case 'emp':
      return { shield: 42, hull: 4 };
    case 'mine':
      return { shield: 10, hull: 18 };
    case 'solid':
      return { shield: 16, hull: 14 };
    case 'gate':
      return { shield: 8, hull: 20 };
  }
}

export function flyerStars(hullRatio: number, timeSec: number, parSec: number): 1 | 2 | 3 {
  const timeScore = Math.min(1.35, parSec / Math.max(8, timeSec));
  const score = hullRatio * 0.62 + timeScore * 0.38;
  if (score >= 0.95 && hullRatio >= 0.42) return 3;
  if (score >= 0.62) return 2;
  return 1;
}

export function flyerLatticeReward(stars: 1 | 2 | 3, levelId: number): number {
  const base = stars === 3 ? 24 : stars === 2 ? 14 : 7;
  return Math.round(base * (1 + Math.max(0, levelId) * 0.04));
}
