/**
 * Main-gun extra bolts fill the gaps inside one un-upgraded shot interval.
 * Slot 0 stays on the aim ray. Later slots walk across a cone that opens
 * as more bolts are added.
 */
import {
  MAIN_GUN_MULTI_CONE_ABS_MAX,
  MAIN_GUN_MULTI_CONE_MAX,
  MAIN_GUN_MULTI_CONE_STEP,
} from '../data/constraints';

export interface MainGunStreamSlot {
  /** 0..1 inside the base firing interval. 0 is the original bolt. */
  phase: number;
  /** Radians off the aim ray. */
  angle: number;
}

/** Half-angle of the fan for this many extra bolts and shop spread. */
export function mainGunConeHalf(extraBolts: number, spreadAdd = 0): number {
  const extras = Math.max(0, Math.floor(extraBolts));
  if (extras <= 0) return 0;
  const base = Math.min(MAIN_GUN_MULTI_CONE_MAX, MAIN_GUN_MULTI_CONE_STEP * extras);
  const widened = base * (1 + Math.max(0, spreadAdd));
  return Math.min(MAIN_GUN_MULTI_CONE_ABS_MAX, widened);
}

/**
 * `totalBolts` includes the original shot. Phases are evenly spaced, so each
 * new bolt sits between shots that were already there.
 */
export function mainGunStream(totalBolts: number, spreadAdd = 0): MainGunStreamSlot[] {
  const n = Math.max(1, Math.floor(totalBolts));
  const half = mainGunConeHalf(n - 1, spreadAdd);
  const slots: MainGunStreamSlot[] = [];
  for (let i = 0; i < n; i++) {
    slots.push({ phase: i / n, angle: streamAngle(i, n, half) });
  }
  return slots;
}

function streamAngle(index: number, total: number, half: number): number {
  if (index <= 0 || total <= 1 || half <= 0) return 0;
  if (total === 2) return half * 0.55;
  const t = (index - 1) / (total - 2);
  return (t - 0.5) * 2 * half;
}
