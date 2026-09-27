/**
 * WAVE23 — Unique city GLB kit + per-instance window/ad overlays for flyer wipeout skyline.
 * 11 silhouettes under public/flyer/city/*.glb. Preload once; clone+scale+yaw per slot.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GraphicsQuality } from '../data/graphics';
import { billboardFaceMap, livedInFacadeMap } from './flyerCityVariation';

const loader = new GLTFLoader();

export const CITY_GLB_IDS = [
  'setback_tower',
  'warehouse',
  'billboard_slab',
  'needle',
  'broken_roof',
  'skybridge_stub',
  'antenna_farm',
  'dock_office',
  'mega_block',
  'arcology_chunk',
  'vent_stack',
] as const;

export type CityGlbId = (typeof CITY_GLB_IDS)[number];

export interface CityGlbProto {
  id: CityGlbId;
  /** Root template (do not add to scene; clone it). */
  root: THREE.Group;
  /** World-space height of unscaled template (Y extent). */
  height: number;
  /** Max lateral extent for fit scaling. */
  maxDim: number;
  /** Unscaled X/Z extents (for corridor clamp). */
  width: number;
  depth: number;
}

export type FlyerCityLib = Record<CityGlbId, CityGlbProto | null>;

const URLS: Record<CityGlbId, string> = {
  setback_tower: './flyer/city/setback_tower.glb',
  warehouse: './flyer/city/warehouse.glb',
  billboard_slab: './flyer/city/billboard_slab.glb',
  needle: './flyer/city/needle.glb',
  broken_roof: './flyer/city/broken_roof.glb',
  skybridge_stub: './flyer/city/skybridge_stub.glb',
  antenna_farm: './flyer/city/antenna_farm.glb',
  dock_office: './flyer/city/dock_office.glb',
  mega_block: './flyer/city/mega_block.glb',
  arcology_chunk: './flyer/city/arcology_chunk.glb',
  vent_stack: './flyer/city/vent_stack.glb',
};

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

let cache: Promise<FlyerCityLib> | null = null;
let resolved: FlyerCityLib | null = null;

export function getFlyerCityLib(): FlyerCityLib | null {
  return resolved;
}

export function preloadFlyerCityGlb(): Promise<FlyerCityLib> {
  if (!cache) cache = loadCityLib();
  return cache;
}

async function loadCityLib(): Promise<FlyerCityLib> {
  const out = {} as FlyerCityLib;
  await Promise.all(
    CITY_GLB_IDS.map(async (id) => {
      out[id] = await loadOne(id, URLS[id]);
    })
  );
  resolved = out;
  try {
    (globalThis as any).__WIPEOUT_CITY_GLB = {
      loaded: CITY_GLB_IDS.filter((id) => !!out[id]).length,
      ids: CITY_GLB_IDS.filter((id) => !!out[id]),
    };
  } catch {}
  return out;
}

async function loadOne(id: CityGlbId, url: string): Promise<CityGlbProto | null> {
  try {
    const gltf = await loader.loadAsync(url);
    const src = gltf.scene;
    src.updateMatrixWorld(true);
    _box.setFromObject(src);
    _box.getSize(_size);
    const height = Math.max(0.01, _size.y);
    const maxDim = Math.max(_size.x, _size.y, _size.z, 0.01);

    // Normalize so bottom sits at y=0 and centroid XZ ~0
    const center = new THREE.Vector3();
    _box.getCenter(center);
    const root = new THREE.Group();
    root.name = 'CityGlbProto_' + id;
    const clone = src.clone(true);
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= _box.min.y;
    clone.updateMatrixWorld(true);
    // Soften materials for chase readability; keep emissives
    clone.traverse((o) => {
      const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
      if (!mesh) return;
      mesh.frustumCulled = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        m.userData = m.userData || {};
        m.userData.shared = true;
        const anyM = m as THREE.MeshStandardMaterial;
        if ('toneMapped' in anyM) (anyM as any).toneMapped = false;
        if ('fog' in anyM) (anyM as any).fog = false;
        if ('emissiveIntensity' in anyM && typeof anyM.emissiveIntensity === 'number') {
          anyM.emissiveIntensity = Math.min(1.2, Math.max(0.2, anyM.emissiveIntensity || 0.6));
        }
        // WAVE21b: do NOT force cyan emissive — brand-plane flood
        if (anyM.color && anyM.color.r + anyM.color.g + anyM.color.b < 0.15) {
          anyM.color.offsetHSL(0, 0, 0.08);
        }
      }
    });
    root.add(clone);
    return { id, root, height, maxDim, width: Math.max(0.01, _size.x), depth: Math.max(0.01, _size.z) };
  } catch (err) {
    console.warn('[flyer-city-glb] miss', id, url, err);
    return null;
  }
}

/** Clone a proto, fit to targetHeight, apply unique seed tint/yaw. */
export function instantiateCityGlb(
  proto: CityGlbProto,
  targetHeight: number,
  seed: number,
  yaw = 0
): THREE.Group {
  const g = proto.root.clone(true);
  g.name = 'FlyerWipeoutCityGlb_' + proto.id;
  g.userData.cityGlbId = proto.id;
  g.userData.wearSeed = seed >>> 0;
  // WAVE21b HOTFIX: clamp height + lateral so GLBs never span into lane corridor
  const hTarget = Math.min(42, Math.max(8, targetHeight));
  const scaleH = hTarget / Math.max(0.01, proto.height);
  const maxLat = 9.5; // world meters across track-facing width/depth
  const latX = Math.max(0.01, proto.width || proto.maxDim);
  const latZ = Math.max(0.01, proto.depth || proto.maxDim);
  const scaleLatCap = Math.min(scaleH, maxLat / latX, maxLat / latZ);
  const sx = scaleLatCap * (0.9 + ((seed >>> 3) % 7) * 0.02);
  const sy = scaleH * (0.95 + ((seed >>> 7) % 7) * 0.02);
  const sz = scaleLatCap * (0.9 + ((seed >>> 11) % 7) * 0.02);
  g.scale.set(sx, sy, sz);
  g.userData.cityScaleClamp = { hTarget, sx, sy, sz, maxLat };
  g.rotation.y = yaw;
  // Per-instance material clones with subtle hue/emissive variance (neighbors never share mats)
  const hueShift = ((seed % 17) - 8) * 0.012;
  const emitMul = 1.15 + ((seed >>> 5) % 8) * 0.12;
  // WAVE21c: keep Standard mats; temper emissives so neon is accent not cyan flood
  g.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh || !mesh.material) return;
    const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out: THREE.Material[] = [];
    for (let i = 0; i < srcMats.length; i++) {
      const m = srcMats[i] as THREE.MeshStandardMaterial;
      if (!m) continue;
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.toneMapped = false;
      (c as any).fog = false;
      if (c.color) {
        const hsl = { h: 0, s: 0, l: 0 };
        c.color.getHSL(hsl);
        const isNeon = hsl.s > 0.35 || (c.emissive && c.emissive.r + c.emissive.g + c.emissive.b > 0.4);
        if (isNeon) {
          // keep neon hue; don't lift lightness into slab flood
          c.color.setHSL((hsl.h + hueShift * 0.5 + 1) % 1, Math.min(1, hsl.s), Math.min(0.55, Math.max(0.25, hsl.l)));
        } else {
          c.color.setHSL(
            (hsl.h + hueShift + i * 0.015 + 1) % 1,
            Math.min(0.35, Math.max(0.05, hsl.s * 1.1)),
            Math.min(0.48, Math.max(0.18, hsl.l * 1.15 + 0.04))
          );
        }
      }
      if (c.emissive) {
        const eSum = c.emissive.r + c.emissive.g + c.emissive.b;
        if (eSum > 0.05) {
          c.emissive.multiplyScalar(0.55 * emitMul);
          c.emissiveIntensity = Math.min(1.1, Math.max(0.25, (c.emissiveIntensity || 1) * 0.35));
        } else {
          c.emissive.setHex(0x101820);
          c.emissiveIntensity = 0.25;
        }
      }
      out.push(c);
    }
    mesh.material = out.length === 1 ? out[0] : out;
  });

  // WAVE26 Adorn: denser lived-in massing / material breaks / large graphic ads (T-W25-02)
  {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const plane = new THREE.PlaneGeometry(1, 1);
    const neonHexes = [0xff4499, 0xffaa22, 0x44ffcc, 0xaa66ff, 0xff6622, 0x22ddff];
    const neon = neonHexes[seed % neonHexes.length];
    const steel = new THREE.MeshPhongMaterial({
      color: new THREE.Color().setHSL(0.58, 0.08, 0.28 + (seed % 5) * 0.03),
      emissive: new THREE.Color(0x101418),
      shininess: 40,
      toneMapped: false,
      fog: false,
    });
    const concrete = new THREE.MeshPhongMaterial({
      color: new THREE.Color().setHSL(0.08, 0.05, 0.32 + (seed % 4) * 0.04),
      emissive: new THREE.Color(0x121014),
      shininess: 18,
      toneMapped: false,
      fog: false,
    });
    const winMap = livedInFacadeMap(neon, seed % 8, seed >>> 0);
    const winMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: winMap,
      emissive: new THREE.Color(neon).multiplyScalar(0.22),
      emissiveMap: winMap,
      shininess: 18,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const faceW = Math.min(0.98, Math.max(0.55, proto.width * (0.75 + (seed % 4) * 0.05)));
    const faceH = Math.min(proto.height * 0.82, Math.max(3.2, proto.height * (0.55 + (seed % 5) * 0.05)));
    // Massing setback slab (varied silhouette — not same extruded box)
    // Always add setback OR overhang for silhouette variation
    if (true) {
      const setback = new THREE.Mesh(box, concrete.clone());
      setback.name = 'CityGlbAdornSetback';
      setback.position.set(((seed % 3) - 1) * 0.15, proto.height * 0.72, 0);
      setback.scale.set(proto.width * (0.55 + (seed % 4) * 0.08), proto.height * (0.22 + (seed % 3) * 0.06), proto.depth * (0.55 + (seed % 3) * 0.08));
      g.add(setback);
    }
    // Material break band mid-height
    const band = new THREE.Mesh(box, steel.clone());
    band.name = 'CityGlbAdornMatBreak';
    band.position.set(0, proto.height * (0.35 + (seed % 4) * 0.08), 0);
    band.scale.set(proto.width * 1.05, proto.height * 0.06, proto.depth * 1.05);
    g.add(band);
    // Front/back façade overlays (unique map per seed)
    for (const sideZ of [1, -1] as const) {
      const win = new THREE.Mesh(plane, winMat.clone());
      win.name = 'CityGlbAdornWindows';
      win.position.set(0, faceH * 0.48, sideZ * (proto.depth * 0.52 + 0.02));
      if (sideZ < 0) win.rotation.y = Math.PI;
      win.scale.set(faceW * (sideZ > 0 ? 1 : 0.85), faceH * (0.85 + (seed % 3) * 0.05), 1);
      win.renderOrder = 2;
      g.add(win);
    }
    for (const sideX of [1, -1] as const) {
      const winX = new THREE.Mesh(plane, winMat.clone());
      winX.name = 'CityGlbAdornWindowsSide';
      winX.position.set(sideX * (proto.width * 0.52 + 0.02), faceH * 0.48, 0);
      winX.rotation.y = sideX > 0 ? Math.PI / 2 : -Math.PI / 2;
      winX.scale.set(Math.min(0.95, proto.depth * 0.8), faceH * 0.9, 1);
      winX.renderOrder = 2;
      g.add(winX);
    }
    const adMap = billboardFaceMap((seed * 2654435761) >>> 0);
    const adMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: adMap,
      emissive: new THREE.Color(neon).multiplyScalar(0.45),
      emissiveMap: adMap,
      shininess: 25,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    // LARGE primary ad board
    const bb = new THREE.Mesh(plane, adMat);
    bb.name = 'CityGlbAdornBillboard';
    bb.position.set(0.02, Math.min(proto.height * 0.82, proto.height * 0.55 + 1.4), proto.depth * 0.52 + 0.05);
    bb.scale.set(Math.min(2.2, proto.width * 1.15), Math.min(1.35, proto.height * 0.22), 1);
    bb.renderOrder = 3;
    g.add(bb);
    const bb2 = new THREE.Mesh(plane, adMat.clone());
    bb2.name = 'CityGlbAdornBillboardSide';
    bb2.position.set(proto.width * 0.52 + 0.04, proto.height * (0.28 + (seed % 4) * 0.1), 0);
    bb2.rotation.y = Math.PI / 2;
    bb2.scale.set(Math.min(1.6, proto.depth * 0.9), Math.min(1.1, proto.height * 0.18), 1);
    bb2.renderOrder = 3;
    g.add(bb2);
    const bb3 = new THREE.Mesh(plane, adMat.clone());
    bb3.name = 'CityGlbAdornBillboardHi';
    bb3.position.set(-0.02, proto.height * (0.18 + (seed % 5) * 0.06), -proto.depth * 0.52 - 0.04);
    bb3.rotation.y = Math.PI;
    bb3.scale.set(Math.min(1.5, proto.width * 0.85), Math.min(0.85, proto.height * 0.12), 1);
    bb3.renderOrder = 3;
    g.add(bb3);
    // Mechanical add-ons denser / varied
    for (let k = 0; k < 4 + (seed % 4); k++) {
      const ac = new THREE.Mesh(box, steel.clone());
      ac.name = 'CityGlbAdornAC';
      ac.position.set(((k % 4) - 1.5) * 0.28, proto.height * (0.88 + (k % 2) * 0.04), ((k * 5) % 3) * 0.18 - 0.18);
      ac.scale.set(0.32 + (k % 3) * 0.08, 0.1 + (k % 2) * 0.1, 0.26);
      g.add(ac);
    }
    // Pipe / duct run
    const duct = new THREE.Mesh(box, steel.clone());
    duct.name = 'CityGlbAdornDuct';
    duct.position.set(-0.4, proto.height * 0.95, 0);
    duct.scale.set(0.15, 0.12, proto.depth * 0.7);
    g.add(duct);
    const bal = new THREE.Mesh(box, steel.clone());
    bal.name = 'CityGlbAdornBalcony';
    bal.position.set(0.52, proto.height * (0.28 + (seed % 5) * 0.08), 0);
    bal.scale.set(0.14, 0.07, proto.height * 0.2);
    g.add(bal);
    // Antenna / mast for silhouette variation
    if (seed % 2 === 0) {
      const mast = new THREE.Mesh(box, steel.clone());
      mast.name = 'CityGlbAdornMast';
      mast.position.set((seed % 5) * 0.08 - 0.16, proto.height * 1.08, 0);
      mast.scale.set(0.08, proto.height * 0.18, 0.08);
      g.add(mast);
    }
    // WAVE28: corner fin / crowning / billboard / antenna clusters (anti box-copy)
    const fin = new THREE.Mesh(box, concrete.clone());
    fin.name = 'CityGlbAdornFin';
    fin.position.set(proto.width * (0.35 + (seed % 3) * 0.05), proto.height * 0.55, -proto.depth * 0.2);
    fin.scale.set(proto.width * 0.22, proto.height * (0.35 + (seed % 4) * 0.05), proto.depth * 0.25);
    g.add(fin);
    const crown = new THREE.Mesh(box, steel.clone());
    crown.name = 'CityGlbAdornCrown';
    crown.position.set(0, proto.height * 1.02, 0);
    crown.scale.set(proto.width * 0.55, proto.height * 0.06, proto.depth * 0.55);
    g.add(crown);
    const duct2 = new THREE.Mesh(box, steel.clone());
    duct2.name = 'CityGlbAdornDuct2';
    duct2.position.set(0.35, proto.height * (0.62 + (seed % 3) * 0.05), proto.depth * 0.4);
    duct2.scale.set(proto.width * 0.55, 0.1, 0.12);
    g.add(duct2);
    const boardMat = new THREE.MeshPhongMaterial({
      color: 0x101418,
      emissive: new THREE.Color(neon).multiplyScalar(0.45),
      shininess: 30,
      toneMapped: false,
      fog: false,
    });
    const ad = new THREE.Mesh(box, boardMat);
    ad.name = 'CityGlbAdornBillboard';
    ad.position.set(proto.width * 0.52, proto.height * (0.45 + (seed % 4) * 0.05), 0);
    ad.scale.set(0.08, proto.height * 0.28, proto.depth * 0.55);
    g.add(ad);
    const antenna = new THREE.Mesh(box, steel.clone());
    antenna.name = 'CityGlbAdornAntenna';
    antenna.position.set(-proto.width * 0.2, proto.height * 1.18, proto.depth * 0.1);
    antenna.scale.set(0.06, proto.height * (0.18 + (seed % 5) * 0.04), 0.06);
    g.add(antenna);
    // WAVE28 antenna cluster / dish (GLB adornment language)
    for (let ai = 0; ai < 2 + (seed % 3); ai++) {
      const a2 = new THREE.Mesh(box, steel.clone());
      a2.name = 'CityGlbAdornAntennaCluster';
      a2.position.set(((ai % 3) - 1) * 0.22, proto.height * (1.05 + ai * 0.06), ((ai * 3) % 2) * 0.15);
      a2.scale.set(0.05, proto.height * (0.1 + (ai % 2) * 0.08), 0.05);
      g.add(a2);
    }
    if (seed % 2 === 0) {
      const over = new THREE.Mesh(box, concrete.clone());
      over.name = 'CityGlbAdornOverhang';
      over.position.set(0, proto.height * 0.38, proto.depth * 0.35);
      over.scale.set(proto.width * 0.7, proto.height * 0.04, proto.depth * 0.35);
      g.add(over);
    }
    // Billboard slab adorn (prefer graphic board over neon word labels)
    const board2 = new THREE.Mesh(box, boardMat.clone());
    board2.name = 'CityGlbAdornBillboardCluster';
    board2.position.set(-proto.width * 0.48, proto.height * (0.55 + (seed % 3) * 0.06), proto.depth * 0.1);
    board2.scale.set(0.07, proto.height * 0.22, proto.depth * 0.4);
    g.add(board2);
  }
  return g;
}

export function cityKitCap(quality: GraphicsQuality, high: number, floor = 10): number {
  const s = quality === 'low' ? 0.55 : quality === 'medium' ? 0.85 : 1;
  return Math.max(floor, Math.round(high * s));
}

/** Pick next city id different from prev and optional opposite neighbor. */
export function pickCityGlbId(
  slot: number,
  layer: number,
  side: number,
  prev: CityGlbId | null,
  opposite: CityGlbId | null
): CityGlbId {
  const start = (slot * 3 + layer * 5 + (side < 0 ? 7 : 0)) % CITY_GLB_IDS.length;
  for (let k = 0; k < CITY_GLB_IDS.length; k++) {
    const id = CITY_GLB_IDS[(start + k) % CITY_GLB_IDS.length];
    if (prev && id === prev) continue;
    if (opposite && id === opposite) continue;
    return id;
  }
  return CITY_GLB_IDS[(start + 1) % CITY_GLB_IDS.length];
}

export function availableCityProtos(lib: FlyerCityLib): CityGlbProto[] {
  const out: CityGlbProto[] = [];
  for (const id of CITY_GLB_IDS) {
    const p = lib[id];
    if (p) out.push(p);
  }
  return out;
}
