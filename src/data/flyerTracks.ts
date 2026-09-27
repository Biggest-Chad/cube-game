/**
 * Per-scene flyer spline layouts (Wipeout / wormhole rollercoaster).
 * Roll is authored in degrees here and stored as radians.
 */
import * as THREE from 'three';
import { FLYER_USE_SPLINE, type FlyerSceneId } from './flyer';
import type { FlyerControlPoint } from '../flyer/SplinePath';

type Row = [x: number, y: number, z: number, rollDeg: number];

function pts(rows: Row[]): FlyerControlPoint[] {
  return rows.map(([x, y, z, rollDeg]) => ({
    pos: new THREE.Vector3(x, y, z),
    roll: (rollDeg * Math.PI) / 180,
  }));
}

/** Near-linear +Z polyline that mimics the old corridor (rollback). */
function linearTrack(): FlyerControlPoint[] {
  return pts([
    [0, 0, 0, 0],
    [0, 0, 250, 0],
    [0, 0, 500, 0],
    [0, 0, 750, 0],
    [0, 0, 988, 0],
  ]);
}

/** CITY TRANSFER — S-curves + banked canyon sweep. */
function canyonTrack(): FlyerControlPoint[] {
  return pts([
    [0, 0, 0, 0],
    [0, 0, 80, 0],
    [40, 5, 160, -25],
    [70, 8, 240, -35],
    [20, 6, 320, 15],
    [-50, 4, 400, 30],
    [-30, 0, 500, 10],
    [10, -8, 600, -20],
    [60, -6, 720, -40],
    [40, 0, 820, 0],
    [0, 2, 920, 0],
    [-24, 8, 1060, 16],
    [-64, 14, 1220, 30],
    [-16, 6, 1380, -6],
    [52, -4, 1560, -26],
    [18, 6, 1720, 8],
    [0, 2, 1880, 0],
  ]);
}

/** WORMHOLE CORRIDOR — helix + soft corkscrew. */
function wormholeTrack(): FlyerControlPoint[] {
  return pts([
    [0, 0, 0, 0],
    [0, 0, 60, 0],
    [25, 15, 120, 45],
    [0, 35, 180, 90],
    [-25, 50, 240, 135],
    [0, 55, 300, 180],
    [30, 40, 380, 220],
    [10, 20, 480, 270],
    [-10, 10, 600, 320],
    [0, 5, 720, 350],
    [0, 0, 880, 360],
    [22, 14, 1000, 400],
    [0, 30, 1140, 450],
    [-22, 16, 1280, 500],
    [8, 6, 1440, 540],
    [0, 0, 1620, 570],
  ]);
}

/** ORBITAL YARD — dock turns + vertical climb; extra midpoints on 90° corners. */
function yardTrack(): FlyerControlPoint[] {
  return pts([
    [0, 0, 0, 0],
    [0, 0, 100, 0],
    [25, 0, 100, -2],
    [55, 0, 100, -4],
    [80, 0, 100, -5],
    [80, 0, 140, -2],
    [80, 0, 180, 0],
    [80, 0, 220, 0],
    [80, 40, 280, 0],
    [80, 55, 360, 15],
    [20, 40, 420, 25],
    [-40, 10, 520, 10],
    [-40, 0, 680, 0],
    [-20, 0, 730, -8],
    [0, 0, 780, -15],
    [0, 0, 900, 0],
    [36, 6, 1040, -12],
    [72, 16, 1200, -20],
    [28, 22, 1360, 12],
    [-24, 8, 1520, 16],
    [0, 2, 1680, 0],
  ]);
}

/** ICE RIFT — descending ribbon + one vertical loop (densified 4–8). */
function riftTrack(): FlyerControlPoint[] {
  return pts([
    [0, 20, 0, 0],
    [0, 10, 80, 0],
    [30, 0, 160, -20],
    [40, -10, 260, -30],
    [0, -10, 360, 0],
    [0, 8, 390, 0],
    [0, 30, 420, 0],
    [0, 55, 450, 0],
    [0, 70, 480, 0],
    [0, 55, 510, 0],
    [0, 30, 540, 0],
    [0, 8, 570, 0],
    [0, -10, 600, 0],
    [-40, 0, 720, 20],
    [0, 5, 880, 0],
    [34, 0, 1020, -14],
    [16, -14, 1180, -22],
    [-36, -4, 1360, 18],
    [0, 10, 1540, 6],
    [0, 4, 1700, 0],
  ]);
}

export function flyerTrackPoints(id: FlyerSceneId): FlyerControlPoint[] {
  if (!FLYER_USE_SPLINE) return linearTrack();
  switch (id) {
    case 'canyon':
      return canyonTrack();
    case 'wormhole':
      return wormholeTrack();
    case 'yard':
      return yardTrack();
    case 'rift':
      return riftTrack();
  }
}
