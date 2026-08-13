import { Vector3 } from 'three';

/**
 * Canonical ship-local mounts. Visual (GLB or procedural) must honor these.
 * Local -Z is forward (toward the cube). Values are on `ship.group` (not a child scale).
 */
export const SHIP_MUZZLE = new Vector3(0, -0.0224, -2.1056);

export const SHIP_HARDPOINTS: readonly Vector3[] = [
  new Vector3(0.62, -0.16, 0.08), // 0 right wing
  new Vector3(-0.62, -0.16, 0.08), // 1 left wing
  new Vector3(0, -0.2, -0.28), // 2 center belly
];

export const SHIP_THRUSTERS: readonly Vector3[] = [
  new Vector3(0.36, -0.04, 1.27),
  new Vector3(-0.36, -0.04, 1.27),
  new Vector3(0, 0, 1.45),
];

export const SHIP_HEADLIGHTS: readonly Vector3[] = [
  new Vector3(-0.18, -0.02, -1.2),
  new Vector3(0.18, -0.02, -1.2),
];
