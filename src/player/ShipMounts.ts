import { Vector3 } from 'three';

/**
 * Canonical ship-local mounts. Visual (GLB or procedural) must honor these.
 * Local -Z is forward (toward the cube). Values are on `ship.group` (not a child scale).
 *
 * Fitted to 3DHaupt Intergalactic (CC-BY-NC) after game-scale export.
 */
export const SHIP_MUZZLE = new Vector3(0.0, -0.1926, -1.1953);

export const SHIP_HARDPOINTS: readonly Vector3[] = [
  new Vector3(1.0504, -0.2726, 0.0), // 0 right wing
  new Vector3(-1.0504, -0.2726, 0.0), // 1 left wing
  new Vector3(0.0, -0.5796, 0.0), // 2 center belly
];

export const SHIP_THRUSTERS: readonly Vector3[] = [
  new Vector3(0.4202, 0.04, 1.0953),
  new Vector3(-0.4202, 0.04, 1.0953),
  new Vector3(0.0, 0.02, 1.1353),
];

export const SHIP_HEADLIGHTS: readonly Vector3[] = [
  new Vector3(-0.12, 0.02, -0.9753),
  new Vector3(0.12, 0.02, -0.9753),
];
