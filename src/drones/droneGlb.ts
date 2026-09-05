/**
 * Role-distinct drone GLBs. Allied cyan IFF / enemy red IFF.
 * Factories remain last-resort if a GLB is missing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DroneRole } from '../data/drones';
import { asGroup } from '../player/heroGlb';

export type EnemyDroneGlbRole = 'attack' | 'repair' | 'kamikaze' | 'cube-fighter';

export const ALLIED_DRONE_GLB: Record<DroneRole, string> = {
  fighter: './drones/allied-fighter.glb',
  bomber: './drones/allied-bomber.glb',
  defender: './drones/allied-defender.glb',
};

export const ENEMY_DRONE_GLB: Record<EnemyDroneGlbRole, string> = {
  attack: './drones/enemy-attack.glb',
  repair: './drones/enemy-repair.glb',
  kamikaze: './drones/enemy-kamikaze.glb',
  'cube-fighter': './drones/enemy-cube-fighter.glb',
};

const loader = new GLTFLoader();
const proto = new Map<string, Promise<THREE.Group>>();

function loadProto(url: string): Promise<THREE.Group> {
  let p = proto.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => asGroup(gltf.scene));
    proto.set(url, p);
  }
  return p;
}

/** Deep clone so IFF pulse / flash opacity stay per-instance. */
export async function loadDroneGlb(url: string): Promise<THREE.Group> {
  const src = await loadProto(url);
  const clone = src.clone(true);
  clone.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });
  clone.updateMatrixWorld(true);
  return clone;
}

export async function loadAlliedDroneGlb(role: DroneRole): Promise<THREE.Group> {
  return loadDroneGlb(ALLIED_DRONE_GLB[role]);
}

export async function loadEnemyDroneGlb(role: EnemyDroneGlbRole): Promise<THREE.Group> {
  return loadDroneGlb(ENEMY_DRONE_GLB[role]);
}
