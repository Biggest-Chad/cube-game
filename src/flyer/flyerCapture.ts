/**
 * Feature-targeted still poses. Picks s from the live spline, not a wall-clock t.
 */
import * as THREE from 'three';
import { FLYER_STICK_Y_SIGN, type FlyerSceneId } from '../data/flyer';
import { flyerTrackPoints } from '../data/flyerTracks';
import { PathFrame, SplinePath } from './SplinePath';

export type FlyerCaptureShot = {
  id: string;
  scene: FlyerSceneId;
  file: string;
  label: string;
  s: number;
  x: number;
  y: number;
  axisX: number;
  axisY: number;
  rollDeg: number;
};

const F = new PathFrame();
const F2 = new PathFrame();

function yawOf(t: THREE.Vector3): number {
  return Math.atan2(t.x, t.z);
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function pickMax(
  path: SplinePath,
  s0: number,
  s1: number,
  score: (s: number, f: PathFrame, f2: PathFrame) => number
): number {
  let bestS = (s0 + s1) * 0.5;
  let best = -Infinity;
  const ds = 3;
  const last = Math.max(0, path.length - 0.05);
  for (let s = s0; s <= s1; s += ds) {
    path.sample(s, F);
    path.sample(Math.min(last, s + ds), F2);
    const v = score(s, F, F2);
    if (v > best) {
      best = v;
      bestS = s;
    }
  }
  return bestS;
}

function mk(
  id: string,
  scene: FlyerSceneId,
  file: string,
  label: string,
  path: SplinePath,
  s: number,
  axisX: number,
  axisY: number
): FlyerCaptureShot {
  path.sample(s, F);
  const x = THREE.MathUtils.clamp(axisX * 2.5, -5.4, 5.4);
  const y = THREE.MathUtils.clamp(FLYER_STICK_Y_SIGN * axisY * 2.5, -3.2, 4.0);
  return {
    id,
    scene,
    file,
    label,
    s,
    x,
    y,
    axisX,
    axisY,
    rollDeg: (F.roll * 180) / Math.PI,
  };
}

export function flyerCaptureShots(): FlyerCaptureShot[] {
  const canyon = new SplinePath(flyerTrackPoints('canyon'));
  const worm = new SplinePath(flyerTrackPoints('wormhole'));
  const rift = new SplinePath(flyerTrackPoints('rift'));

  const bankS = pickMax(canyon, canyon.length * 0.08, canyon.length * 0.26, (_s, f, f2) => {
    const yawRate = Math.abs(wrapPi(yawOf(f2.t) - yawOf(f.t)));
    return Math.abs(f.roll) - yawRate * 2.2;
  });
  const hairS = pickMax(canyon, canyon.length * 0.24, canyon.length * 0.52, (_s, f, f2) => {
    return Math.abs(wrapPi(yawOf(f2.t) - yawOf(f.t))) + Math.abs(f.roll) * 0.12;
  });
  const helixS = pickMax(worm, worm.length * 0.16, worm.length * 0.5, (_s, f) => {
    return Math.abs(f.roll) + Math.hypot(f.p.x, f.p.y) * 0.02 + Math.abs(f.t.y) * 0.9;
  });
  const loopS = pickMax(rift, rift.length * 0.3, rift.length * 0.68, (_s, f) => {
    return f.p.y + (f.u.y < 0 ? 48 : 0) + Math.abs(f.t.y) * 10;
  });

  return [
    mk('canyon-bank', 'canyon', 'canyon-bank.png', 'canyon straight-ish bank', canyon, bankS, 0.62, -0.22),
    mk('canyon-hairpin', 'canyon', 'canyon-hairpin.png', 'canyon hairpin', canyon, hairS, -0.74, 0.16),
    mk('wormhole-helix', 'wormhole', 'wormhole-helix.png', 'wormhole helix', worm, helixS, 0.48, -0.4),
    mk('rift-loop', 'rift', 'rift-loop.png', 'rift loop/sweep', rift, loopS, 0.3, -0.36),
  ];
}
