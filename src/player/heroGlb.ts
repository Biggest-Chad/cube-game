/**
 * Hero visual loader. Original nyx-mako.glb is the shipped default once present.
 * interceptor-v2.glb is the in-house interim until the original exists.
 * public/ships/intergalactic.glb is 3DHaupt CC-BY-NC and is never loaded here.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const HERO_GLB_ORIGINAL = './ships/nyx-mako.glb';
export const HERO_GLB_INTERIM = './ships/interceptor-v2.glb';

const loader = new GLTFLoader();

export function asGroup(root: THREE.Object3D): THREE.Group {
  if ((root as THREE.Group).isGroup) return root as THREE.Group;
  const g = new THREE.Group();
  g.add(root);
  return g;
}

export async function loadGlbGroup(url: string): Promise<THREE.Group> {
  const gltf = await loader.loadAsync(url);
  const group = asGroup(gltf.scene);
  group.updateMatrixWorld(true);
  return group;
}

export async function loadHeroVisual(): Promise<{ group: THREE.Group; name: string; url: string }> {
  const candidates: Array<{ url: string; name: string }> = [
    { url: HERO_GLB_ORIGINAL, name: 'NyxMako' },
    { url: HERO_GLB_INTERIM, name: 'InterceptorV2' },
  ];
  let lastErr: unknown;
  for (const c of candidates) {
    try {
      const group = await loadGlbGroup(c.url);
      return { group, name: c.name, url: c.url };
    } catch (err) {
      lastErr = err;
      console.warn(`[ship] GLB miss ${c.url}`, err);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('no hero GLB');
}
