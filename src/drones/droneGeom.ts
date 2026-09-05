/**
 * Shared procedural helpers for allied / enemy drone factories.
 * Lofts, planform wings, hull merge. Not a mesh library from a pack.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ALLIED_IFF = 0x44ccff;
export const ENEMY_IFF = 0xff2244;

const LIVE_NAMES = new Set([
  'rotor',
  'eye',
  'halo',
  'thruster',
  'flash',
  'shield-energy',
  'collar',
]);

export function countGroupTris(root: THREE.Object3D): { tris: number; meshes: number } {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh || !mesh.geometry) return;
    meshes += 1;
    const g = mesh.geometry;
    const idx = g.index;
    tris += idx ? idx.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });
  return { tris: Math.round(tris), meshes };
}

export function hullMat(
  color: number,
  metal = 0.84,
  rough = 0.3,
  emissive = 0x102028,
  emi = 0.22
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 0.85,
    emissive,
    emissiveIntensity: emi,
  });
  m.userData.shared = true;
  return m;
}

export function neonMat(color: number, intensity: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.3,
    roughness: 0.18,
  });
  m.userData.shared = true;
  return m;
}

export function additive(color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  m.userData.shared = true;
  return m;
}

export function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name: string,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

export function box(
  parent: THREE.Object3D,
  name: string,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), mat, name, x, y, z, rx, ry, rz);
}

export function cyl(
  parent: THREE.Object3D,
  name: string,
  rt: number,
  rb: number,
  h: number,
  segs: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  return addMesh(
    parent,
    new THREE.CylinderGeometry(rt, rb, h, segs),
    mat,
    name,
    x,
    y,
    z,
    rx,
    ry,
    rz
  );
}

/** Superellipse loft along local Z. n=1 diamond, n=2 circle, n>2 squarer. segs=6 stays faceted. */
export function loftZ(
  stations: Array<{ z: number; rx: number; ry: number; n?: number }>,
  segs = 6
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nSt = stations.length;

  const point = (s: (typeof stations)[0], i: number): [number, number, number] => {
    const a = (i / segs) * Math.PI * 2;
    const n = s.n ?? 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sx = Math.sign(ca) || 1;
    const sy = Math.sign(sa) || 1;
    const x = sx * Math.pow(Math.abs(ca), 2 / n) * s.rx;
    const y = sy * Math.pow(Math.abs(sa), 2 / n) * s.ry;
    return [x, y, s.z];
  };

  for (let si = 0; si < nSt; si++) {
    for (let i = 0; i <= segs; i++) {
      const p = point(stations[si], i);
      positions.push(p[0], p[1], p[2]);
      uvs.push(i / segs, nSt <= 1 ? 0 : si / (nSt - 1));
    }
  }
  const ring = segs + 1;
  for (let si = 0; si < nSt - 1; si++) {
    for (let i = 0; i < segs; i++) {
      const a = si * ring + i;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const nose = stations[0];
  const tail = stations[nSt - 1];
  const noseIdx = positions.length / 3;
  positions.push(0, 0, nose.z - Math.min(0.018, nose.rx * 0.45));
  uvs.push(0.5, 0);
  const tailIdx = positions.length / 3;
  positions.push(0, 0, tail.z + Math.min(0.018, tail.rx * 0.45));
  uvs.push(0.5, 1);
  for (let i = 0; i < segs; i++) {
    indices.push(noseIdx, i + 1, i);
    const base = (nSt - 1) * ring;
    indices.push(tailIdx, base + i, base + i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.shared = true;
  return geo;
}

/** Solid wing from four planform corners (root LE, tip LE, tip TE, root TE). */
export function wingFrom(
  rootLe: [number, number, number],
  tipLe: [number, number, number],
  tipTe: [number, number, number],
  rootTe: [number, number, number],
  t = 0.012
): THREE.BufferGeometry {
  const corners = [rootLe, tipLe, tipTe, rootTe].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const up = new THREE.Vector3(0, t, 0);
  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  for (const c of corners) push(c.clone().add(up));
  for (const c of corners) push(c.clone().sub(up));
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7,
    4, 3, 4, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.shared = true;
  return geo;
}

/** n-gon prism whose axis is local Z (faces ±Z). */
export function zPrism(radiusTop: number, radiusBot: number, length: number, sides: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBot, length, sides);
  g.rotateX(Math.PI / 2);
  g.userData.shared = true;
  return g;
}

function isLive(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (LIVE_NAMES.has(p.name)) return true;
    const n = p.name;
    if (n.startsWith('Nozzle_') || n.startsWith('EngineGlow_') || n.startsWith('Plume_')) return true;
    p = p.parent;
  }
  return false;
}

function prepareGeo(src: THREE.BufferGeometry, bake: THREE.Matrix4): THREE.BufferGeometry {
  let g = src.clone();
  g.applyMatrix4(bake);
  g.morphAttributes = {};
  g.clearGroups();
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const n = g.getAttribute('position')?.count ?? 0;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return g;
}

/** Merge static hull meshes that share a material. Live sockets stay unmerged. */
export function mergeStaticHull(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bake = new THREE.Matrix4();
  type Bucket = { material: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] };
  const buckets = new Map<string, Bucket>();

  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh || isLive(mesh)) return;
    if ((o as THREE.Sprite).isSprite) return;
    if (Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.Material;
    const src = mesh.geometry;
    if (!src) return;
    const key = mat.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mat, geos: [], meshes: [] };
      buckets.set(key, bucket);
    }
    bake.copy(inv).multiply(mesh.matrixWorld);
    bucket.geos.push(prepareGeo(src, bake));
    bucket.meshes.push(mesh);
  });

  const hull = new THREE.Group();
  hull.name = 'MergedHull';
  let mergedAny = false;
  for (const bucket of buckets.values()) {
    if (bucket.geos.length === 0) continue;
    let merged: THREE.BufferGeometry | null = null;
    try {
      merged = bucket.geos.length > 1 ? mergeGeometries(bucket.geos, false) : bucket.geos[0];
    } catch {
      merged = null;
    }
    for (const g of bucket.geos) {
      if (g !== merged) g.dispose();
    }
    if (!merged) continue;
    merged.userData.shared = true;
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.name = 'HullBatch';
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    hull.add(mesh);
    mergedAny = true;
    for (const srcMesh of bucket.meshes) {
      srcMesh.removeFromParent();
      // Source geos are module-cached / will be unused on the proto after merge.
    }
  }

  const prune = (o: THREE.Object3D): void => {
    const kids = o.children.slice();
    for (const c of kids) prune(c);
    const renderable =
      (o as THREE.Mesh).isMesh ||
      (o as THREE.Line).isLine ||
      (o as THREE.Sprite).isSprite ||
      (o as THREE.Points).isPoints;
    if (o !== root && o !== hull && o.children.length === 0 && !renderable) {
      o.removeFromParent();
    }
  };
  prune(root);
  if (mergedAny) root.add(hull);
}

export function markShared(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (mesh?.geometry) mesh.geometry.userData.shared = true;
    const spr = (o as THREE.Sprite).isSprite ? (o as THREE.Sprite) : null;
    const mat = mesh?.material ?? spr?.material;
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of list) {
      if (m) m.userData.shared = true;
    }
  });
}

export function disposeUnshared(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (m && !m.userData.shared) m.dispose();
      }
    } else if (o instanceof THREE.Sprite) {
      const m = o.material;
      if (m && !m.userData.shared) m.dispose();
    }
  });
}

let alliedHaloTex: THREE.CanvasTexture | THREE.Texture | null = null;
let enemyHaloTex: THREE.CanvasTexture | THREE.Texture | null = null;

function makeRadialTex(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.userData.shared = true;
  return tex;
}

export function iffHaloTex(faction: 'allied' | 'enemy'): THREE.Texture {
  if (faction === 'allied') {
    if (!alliedHaloTex) alliedHaloTex = makeRadialTex();
    return alliedHaloTex;
  }
  if (!enemyHaloTex) enemyHaloTex = makeRadialTex();
  return enemyHaloTex;
}

export function makeHaloSprite(color: number, size: number, opacity: number, faction: 'allied' | 'enemy'): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: iffHaloTex(faction),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  mat.userData.shared = true;
  const s = new THREE.Sprite(mat);
  s.name = 'halo';
  s.scale.setScalar(size);
  s.renderOrder = 2;
  return s;
}

/** Clone per-instance materials that pulse (halo / shield-energy / flash). */
export function uniquifyPulseMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o.name !== 'halo' && o.name !== 'shield-energy' && o.name !== 'flash') return;
    if ((o as THREE.Sprite).isSprite) {
      const s = o as THREE.Sprite;
      s.material = s.material.clone();
      s.material.userData.shared = false;
    } else if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material;
      if (Array.isArray(mesh.material)) return;
      mesh.material = mat.clone();
      (mesh.material as THREE.Material).userData.shared = false;
    }
  });
}
