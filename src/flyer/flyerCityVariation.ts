/**
 * WAVE21 — curb wear polish + highway wear overlays; city variation helpers.
 * Highway asphalt UV owned by deck ribbon (do not revert).
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';

export function sceneSalt(sceneId: FlyerSceneId): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < sceneId.length; i++) {
    h ^= sceneId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..1 from mixed ints (scene + path + slot). */
export function hash01(a: number, b = 0, c = 0): number {
  let x = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35) ^ (c * 0x27d4eb2d)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedAt(sceneId: FlyerSceneId, sPos: number, slot = 0): number {
  return (sceneSalt(sceneId) ^ Math.floor(sPos * 1000) ^ (slot * 0x9e3779b9)) >>> 0;
}

/** Local part of a building preset (unit box centered; y=0 is building base). */
export type BuildingPart = {
  /** center x,y,z in local building space (y from base) */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** optional Euler rot (rad) */
  rx?: number;
  ry?: number;
  rz?: number;
  /** use rooftop kit material instead of façade */
  kit?: 'tank' | 'antenna' | 'billboard' | 'frame';
};

export type BuildingPresetId =
  | 'l_setback'
  | 'ziggurat'
  | 'needle'
  | 'warehouse'
  | 'broken_roof'
  | 'skybridge'
  | 'billboard_tower'
  | 'water_tank'
  | 'antenna_farm'
  | 'slanted_slab'
  | 'hollow_frame'
  | 'shanty_stack'
  | 'crane_tower'
  | 'pipe_stack';

export const BUILDING_PRESET_IDS: BuildingPresetId[] = [
  'l_setback',
  'ziggurat',
  'needle',
  'warehouse',
  'broken_roof',
  'skybridge',
  'billboard_tower',
  'water_tank',
  'antenna_farm',
  'slanted_slab',
  'hollow_frame',
  'shanty_stack',
  'crane_tower',
  'pipe_stack',
];

/** Topology definitions — different massing, not scaled clones of one box. */
export function presetParts(id: BuildingPresetId): BuildingPart[] {
  switch (id) {
    case 'l_setback':
      return [
        { x: -0.15, y: 0.7, z: 0, sx: 0.7, sy: 1.4, sz: 0.75 },
        { x: 0.55, y: 0.28, z: 0.05, sx: 0.95, sy: 0.56, sz: 0.85 },
        { x: -0.2, y: 1.35, z: 0, sx: 0.45, sy: 0.28, sz: 0.55 },
        { x: -0.35, y: 1.55, z: 0.1, sx: 0.08, sy: 0.4, sz: 0.08, kit: 'antenna' },
        { x: 0.6, y: 0.7, z: 0.45, sx: 0.7, sy: 0.35, sz: 0.08, kit: 'billboard' },
        { x: 0.1, y: 1.55, z: -0.05, sx: 0.35, sy: 0.12, sz: 0.35, kit: 'tank' },
      ];
    case 'ziggurat':
      return [
        { x: 0, y: 0.2, z: 0, sx: 1.5, sy: 0.4, sz: 1.2 },
        { x: 0, y: 0.55, z: 0, sx: 1.05, sy: 0.4, sz: 0.9 },
        { x: 0, y: 0.9, z: 0, sx: 0.7, sy: 0.4, sz: 0.6 },
        { x: 0, y: 1.2, z: 0, sx: 0.4, sy: 0.3, sz: 0.35 },
      ];
    case 'needle':
      return [
        { x: 0, y: 0.12, z: 0, sx: 0.7, sy: 0.24, sz: 0.7 },
        { x: 0, y: 0.85, z: 0, sx: 0.22, sy: 1.5, sz: 0.22 },
        { x: 0, y: 1.75, z: 0, sx: 0.1, sy: 0.5, sz: 0.1, kit: 'antenna' },
        { x: 0.18, y: 1.35, z: 0.12, sx: 0.06, sy: 0.7, sz: 0.06, kit: 'antenna' },
        { x: -0.15, y: 0.45, z: 0.35, sx: 0.45, sy: 0.28, sz: 0.08, kit: 'billboard' },
        { x: 0, y: 1.55, z: 0, sx: 0.35, sy: 0.1, sz: 0.35, kit: 'frame' },
      ];
    case 'warehouse':
      return [
        { x: 0, y: 0.25, z: 0, sx: 2.1, sy: 0.5, sz: 1.0 },
        { x: 0, y: 0.55, z: 0, sx: 2.0, sy: 0.14, sz: 1.1 },
        { x: -0.7, y: 0.12, z: 0.5, sx: 0.35, sy: 0.24, sz: 0.1 },
        { x: 0.7, y: 0.12, z: 0.5, sx: 0.35, sy: 0.24, sz: 0.1 },
        { x: -0.9, y: 0.7, z: -0.2, sx: 0.12, sy: 0.55, sz: 0.12, kit: 'frame' },
        { x: 0.9, y: 0.7, z: -0.2, sx: 0.12, sy: 0.55, sz: 0.12, kit: 'frame' },
        { x: 0, y: 0.85, z: 0, sx: 1.8, sy: 0.08, sz: 0.2, kit: 'frame' },
        { x: 0.2, y: 0.4, z: 0.55, sx: 0.8, sy: 0.3, sz: 0.06, kit: 'billboard' },
      ];
    case 'broken_roof':
      return [
        { x: 0, y: 0.55, z: 0, sx: 1.05, sy: 1.1, sz: 0.85 },
        { x: -0.35, y: 1.2, z: 0.05, sx: 0.55, sy: 0.28, sz: 0.55, rz: -0.45 },
        { x: 0.4, y: 1.05, z: -0.08, sx: 0.5, sy: 0.2, sz: 0.5, rz: 0.55 },
        { x: 0.05, y: 1.4, z: 0.12, sx: 0.25, sy: 0.35, sz: 0.25 },
      ];
    case 'skybridge':
      return [
        { x: -0.7, y: 0.7, z: 0, sx: 0.55, sy: 1.4, sz: 0.55 },
        { x: 0.7, y: 0.55, z: 0.05, sx: 0.5, sy: 1.1, sz: 0.5 },
        { x: 0, y: 1.05, z: 0, sx: 1.6, sy: 0.18, sz: 0.32 },
        { x: 0, y: 0.9, z: 0, sx: 1.5, sy: 0.08, sz: 0.14, kit: 'frame' },
      ];
    case 'billboard_tower':
      return [
        { x: 0, y: 0.7, z: 0, sx: 0.4, sy: 1.4, sz: 0.4 },
        { x: 0.05, y: 1.35, z: 0.45, sx: 1.5, sy: 0.75, sz: 0.1, kit: 'billboard' },
        { x: 0, y: 0.12, z: 0, sx: 0.65, sy: 0.24, sz: 0.6 },
      ];
    case 'water_tank':
      return [
        { x: 0, y: 0.55, z: 0, sx: 1.0, sy: 1.1, sz: 0.9 },
        { x: 0.15, y: 1.3, z: 0, sx: 0.7, sy: 0.5, sz: 0.7, kit: 'tank' },
        { x: -0.3, y: 1.2, z: 0.2, sx: 0.28, sy: 0.22, sz: 0.28, kit: 'tank' },
      ];
    case 'antenna_farm':
      return [
        { x: 0, y: 0.4, z: 0, sx: 0.95, sy: 0.8, sz: 0.85 },
        { x: -0.3, y: 1.2, z: -0.1, sx: 0.08, sy: 0.85, sz: 0.08, kit: 'antenna' },
        { x: 0.05, y: 1.4, z: 0.1, sx: 0.06, sy: 1.1, sz: 0.06, kit: 'antenna' },
        { x: 0.32, y: 1.15, z: 0.05, sx: 0.07, sy: 0.7, sz: 0.07, kit: 'antenna' },
        { x: -0.05, y: 0.95, z: 0.28, sx: 0.3, sy: 0.14, sz: 0.3, kit: 'frame' },
      ];
    case 'slanted_slab':
      return [
        { x: 0, y: 0.35, z: 0, sx: 0.75, sy: 0.7, sz: 0.55 },
        { x: 0.2, y: 0.95, z: 0, sx: 1.0, sy: 0.65, sz: 0.45, rz: -0.55 },
        { x: 0.35, y: 1.45, z: 0.02, sx: 0.65, sy: 0.45, sz: 0.35, rz: -0.7 },
        { x: 0.5, y: 1.7, z: 0, sx: 0.08, sy: 0.4, sz: 0.08, kit: 'antenna' },
        { x: -0.2, y: 0.7, z: 0.3, sx: 0.5, sy: 0.28, sz: 0.08, kit: 'billboard' },
        { x: 0.1, y: 1.55, z: -0.1, sx: 0.3, sy: 0.12, sz: 0.3, kit: 'tank' },
      ];
    case 'hollow_frame':
      return [
        { x: -0.5, y: 0.7, z: -0.35, sx: 0.16, sy: 1.4, sz: 0.16, kit: 'frame' },
        { x: 0.5, y: 0.7, z: -0.35, sx: 0.16, sy: 1.4, sz: 0.16, kit: 'frame' },
        { x: -0.5, y: 0.7, z: 0.35, sx: 0.16, sy: 1.4, sz: 0.16, kit: 'frame' },
        { x: 0.5, y: 0.7, z: 0.35, sx: 0.16, sy: 1.4, sz: 0.16, kit: 'frame' },
        { x: 0, y: 1.4, z: 0, sx: 1.2, sy: 0.14, sz: 0.9, kit: 'frame' },
        { x: 0, y: 0.35, z: 0, sx: 0.75, sy: 0.55, sz: 0.6 },
      ];
    case 'shanty_stack':
      return [
        { x: -0.3, y: 0.22, z: 0.08, sx: 0.85, sy: 0.44, sz: 0.7 },
        { x: 0.45, y: 0.18, z: -0.12, sx: 0.6, sy: 0.36, sz: 0.55 },
        { x: 0.05, y: 0.6, z: 0.12, sx: 0.65, sy: 0.45, sz: 0.5 },
        { x: -0.2, y: 0.95, z: -0.05, sx: 0.5, sy: 0.4, sz: 0.45 },
        { x: 0.3, y: 0.85, z: 0.18, sx: 0.35, sy: 0.28, sz: 0.32 },
        { x: 0.1, y: 1.25, z: 0.05, sx: 0.3, sy: 0.25, sz: 0.28 },
      ];
    case 'crane_tower':
      return [
        { x: 0, y: 0.35, z: 0, sx: 0.55, sy: 0.7, sz: 0.55 },
        { x: 0, y: 1.0, z: 0, sx: 0.22, sy: 1.2, sz: 0.22, kit: 'frame' },
        { x: 0.55, y: 1.35, z: 0, sx: 1.4, sy: 0.12, sz: 0.16, kit: 'frame' },
        { x: 1.15, y: 1.1, z: 0, sx: 0.14, sy: 0.55, sz: 0.14, kit: 'frame' },
        { x: 1.15, y: 0.75, z: 0, sx: 0.35, sy: 0.18, sz: 0.35, kit: 'tank' },
        { x: -0.2, y: 1.7, z: 0, sx: 0.08, sy: 0.45, sz: 0.08, kit: 'antenna' },
        { x: 0.25, y: 0.12, z: 0.35, sx: 0.4, sy: 0.2, sz: 0.12, kit: 'billboard' },
      ];
    case 'pipe_stack':
      return [
        { x: 0, y: 0.3, z: 0, sx: 1.2, sy: 0.6, sz: 0.9 },
        { x: -0.35, y: 0.85, z: 0.1, sx: 0.18, sy: 0.9, sz: 0.18, kit: 'tank' },
        { x: 0.05, y: 0.95, z: -0.05, sx: 0.16, sy: 1.1, sz: 0.16, kit: 'tank' },
        { x: 0.4, y: 0.8, z: 0.15, sx: 0.2, sy: 0.75, sz: 0.2, kit: 'tank' },
        { x: 0, y: 1.45, z: 0, sx: 0.9, sy: 0.14, sz: 0.7, kit: 'frame' },
        { x: 0.2, y: 1.7, z: 0, sx: 0.07, sy: 0.55, sz: 0.07, kit: 'antenna' },
        { x: -0.4, y: 0.55, z: 0.5, sx: 0.55, sy: 0.35, sz: 0.08, kit: 'billboard' },
      ];
    default:
      return [{ x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 0.8 }];
  }
}

export type BuildingInstance = {
  preset: BuildingPresetId;
  w: number;
  d: number;
  h: number;
  setback: number;
  hue: number;
  wearSeed: number;
  texVariant: number;
  layer: 0 | 1 | 2;
  neonHex: number;
};

/** Pick preset + unique massing; NEVER same preset as previous neighbor. */
export function pickBuildingInstance(
  sceneId: FlyerSceneId,
  sPos: number,
  side: number,
  layer: 0 | 1 | 2,
  prevPreset: BuildingPresetId | null,
  neonHex: number
): BuildingInstance {
  let attempt = 0;
  let out: BuildingInstance | null = null;
  while (attempt < 12) {
    const rnd = mulberry32(seedAt(sceneId, sPos + attempt * 0.41, side * 19 + layer * 97 + attempt * 3));
    const idx = Math.floor(rnd() * BUILDING_PRESET_IDS.length);
    let preset = BUILDING_PRESET_IDS[(idx + attempt) % BUILDING_PRESET_IDS.length];
    if (prevPreset && preset === prevPreset) {
      preset = BUILDING_PRESET_IDS[(idx + 1 + attempt * 2) % BUILDING_PRESET_IDS.length];
      if (preset === prevPreset) {
        preset = BUILDING_PRESET_IDS[(idx + 5) % BUILDING_PRESET_IDS.length];
      }
    }
    const baseH = layer === 0 ? 20 : layer === 1 ? 32 : 46;
    const h = baseH + rnd() * (layer === 0 ? 22 : layer === 1 ? 30 : 44);
    const wScale = layer === 0 ? 8 : layer === 1 ? 11 : 15;
    const w = wScale + rnd() * (layer === 0 ? 7 : 11);
    const d = 1.2 + rnd() * (layer === 0 ? 2.4 : 4.0);
    // Prefer squat presets shorter / needles taller
    let hMul = 1;
    if (preset === 'warehouse' || preset === 'shanty_stack') hMul = 0.55 + rnd() * 0.25;
    if (preset === 'needle') hMul = 1.15 + rnd() * 0.35;
    if (preset === 'ziggurat') hMul = 0.85 + rnd() * 0.2;
    if (preset === 'hollow_frame') hMul = 0.9 + rnd() * 0.25;
    out = {
      preset,
      w: preset === 'warehouse' ? w * 1.35 : preset === 'needle' ? w * 0.45 : w,
      d,
      h: h * hMul,
      setback: rnd() * (layer === 0 ? 3.5 : layer === 1 ? 7 : 12) + (layer === 2 ? rnd() * 8 : 0),
      hue: rnd() * 0.45 - 0.12,
      wearSeed: seedAt(sceneId, sPos, side * 31 + layer * 17 + attempt) ^ Math.floor(rnd() * 0xffffff),
      texVariant: Math.floor(rnd() * 24),
      layer,
      neonHex,
    };
    if (!prevPreset || out.preset !== prevPreset) break;
    attempt++;
  }
  return out!;
}

/** @deprecated WAVE17 silhouette — kept for any external callers */
export type BuildingSilhouette = {
  w: number;
  d: number;
  h: number;
  setback: number;
  hue: number;
  litFrac: number;
  windowCols: number;
  windowRows: number;
  hasTank: boolean;
  hasAntenna: boolean;
  hasBillboard: boolean;
  missingPanel: boolean;
  brokenNeon: boolean;
  layer: 0 | 1 | 2;
};

export function buildingSilhouette(
  sceneId: FlyerSceneId,
  sPos: number,
  side: number,
  layer: 0 | 1 | 2,
  _prev?: BuildingSilhouette | null
): BuildingSilhouette {
  const inst = pickBuildingInstance(sceneId, sPos, side, layer, null, 0x44f0ff);
  return {
    w: inst.w,
    d: inst.d,
    h: inst.h,
    setback: inst.setback,
    hue: inst.hue,
    litFrac: 0.5,
    windowCols: 4 + (inst.texVariant % 8),
    windowRows: 6 + (inst.texVariant % 10),
    hasTank: inst.preset === 'water_tank',
    hasAntenna: inst.preset === 'antenna_farm' || inst.preset === 'needle',
    hasBillboard: inst.preset === 'billboard_tower',
    missingPanel: (inst.wearSeed & 1) === 1,
    brokenNeon: (inst.wearSeed & 2) === 2,
    layer,
  };
}

export type DeckSeg = {
  len: number;
  widthMul: number;
  yOff: number;
  variant: number;
  stain: number;
  worn: boolean;
};

export function deckSegment(sceneId: FlyerSceneId, sPos: number, baseLen: number, i: number): DeckSeg {
  const rnd = mulberry32(seedAt(sceneId, sPos, 700 + i));
  return {
    len: baseLen * (0.72 + rnd() * 0.55),
    widthMul: 0.88 + rnd() * 0.22,
    yOff: (rnd() - 0.5) * 0.06,
    variant: Math.floor(rnd() * 12),
    stain: rnd(),
    worn: rnd() > 0.4,
  };
}

export type BarrierSeg = {
  h: number;
  depth: number;
  thick: number;
  variant: number;
  scuff: number;
  repair: boolean;
  signage: boolean;
};

export function barrierSegment(sceneId: FlyerSceneId, sPos: number, side: number, baseH: number, i: number): BarrierSeg {
  const rnd = mulberry32(seedAt(sceneId, sPos, 900 + side * 50 + i));
  const curb = baseH < 2.2;
  return {
    h: curb
      ? baseH * (0.88 + rnd() * 0.28) // ~highway curb height, slight wear jitter
      : baseH * (0.78 + rnd() * 0.48),
    depth: curb ? 2.6 + rnd() * 0.8 : 2.2 + rnd() * 1.1,
    thick: curb ? 1.15 + rnd() * 0.35 : 2.0 + rnd() * 0.85,
    variant: Math.floor(rnd() * 8),
    scuff: rnd(),
    repair: rnd() > 0.55,
    signage: rnd() > 0.82,
  };
}

const _texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(
  key: string,
  size: number,
  paint: (ctx: CanvasRenderingContext2D, n: number) => void,
  repeatX: number,
  repeatY: number
): THREE.CanvasTexture {
  const hit = _texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  _texCache.set(key, tex);
  return tex;
}

const NEON_LABELS = [
  'NEON',
  'BOOST',
  'YARD',
  'DOCK',
  'RIFT',
  'CITY',
  'GRID',
  'FLUX',
  'PORT',
  'HIVE',
  'AXIS',
  'NOVA',
  'ZONE',
  'SPIN',
  'CORE',
  'EDGE',
];

/** Multi-material deck strips — stains, cracks, oil, mismatched plates (NOT stud grid). */
export function livedInDeckMap(variant: number): THREE.CanvasTexture {
  return canvasTex(
    'w18-deck-v1-' + variant,
    256,
    (ctx, n) => {
      const rnd = mulberry32(0xa11ce ^ (variant * 0x45f) ^ 0x18);
      ctx.fillStyle = '#040506';
      ctx.fillRect(0, 0, n, n);
      // mismatched plate tiles of uneven sizes
      let y = 8;
      let row = 0;
      while (y < n - 8) {
        const rowH = 28 + Math.floor(rnd() * 48) + (variant % 3) * 4;
        let x = 8;
        while (x < n - 8) {
          const cellW = 36 + Math.floor(rnd() * 70);
          const base = 100 + (variant % 5) * 10 + Math.floor(rnd() * 30) + ((x + y) % 17);
          const g = base - 8 + (row % 3) * 5;
          const b = base + 10;
          ctx.fillStyle = `rgb(${base},${g},${b})`;
          ctx.fillRect(x, y, Math.min(cellW, n - 12 - x), Math.min(rowH, n - 12 - y));
          // plate bevel
          ctx.strokeStyle = `rgba(${Math.min(255, base + 55)},${Math.min(255, g + 55)},${Math.min(255, b + 45)},0.55)`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, Math.min(cellW, n - 12 - x) - 4, Math.min(rowH, n - 12 - y) - 4);
          // dark seam
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, Math.min(cellW, n - 12 - x), Math.min(rowH, n - 12 - y));
          x += cellW + 2 + Math.floor(rnd() * 6);
        }
        y += rowH + 2 + Math.floor(rnd() * 5);
        row++;
      }
      // oil patches
      for (let s = 0; s < 3 + (variant % 4); s++) {
        const sx = Math.floor(rnd() * n);
        const sy = Math.floor(rnd() * n);
        const sr = 18 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgba(10,8,4,${0.35 + rnd() * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr, sr * (0.45 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(40,70,50,${0.08 + rnd() * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(sx + 4, sy - 2, sr * 0.5, sr * 0.25, rnd(), 0, Math.PI * 2);
        ctx.fill();
      }
      // vents / drains irregular
      ctx.fillStyle = '#010203';
      const vents = 2 + (variant % 5);
      for (let k = 0; k < vents; k++) {
        const vx = 30 + Math.floor(rnd() * (n - 60));
        const vy = 40 + Math.floor(rnd() * (n - 80));
        ctx.fillRect(vx, vy, 10 + (k % 3) * 4, 18 + (variant % 4) * 6);
      }
      // crack
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20 + rnd() * 40, 30);
      ctx.lineTo(n * (0.3 + rnd() * 0.3), n * (0.4 + rnd() * 0.3));
      ctx.lineTo(n - 30, n * (0.55 + rnd() * 0.3));
      ctx.stroke();
      // painted lane wear
      if (variant % 3 !== 1) {
        ctx.fillStyle = 'rgba(160,175,190,0.18)';
        ctx.fillRect(n * (0.28 + (variant % 4) * 0.04), 16, n * (0.2 + rnd() * 0.15), n - 32);
      }
      // cyan outdoor inlay
      if (variant % 5 === 2 || variant % 5 === 4) {
        ctx.fillStyle = 'rgba(0,210,255,0.4)';
        ctx.fillRect(n * 0.15, n * 0.78, n * 0.7, 8 + (variant % 3) * 3);
      }
      // corner bolts only (no stud grid)
      ctx.fillStyle = '#d8dee4';
      for (let i = 0; i < 6; i++) {
        if (rnd() < 0.25) continue;
        ctx.beginPath();
        ctx.arc(20 + rnd() * (n - 40), 20 + rnd() * (n - 40), 2 + rnd() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 18;
      ctx.strokeRect(6, 6, n - 12, n - 12);
    },
    1,
    1
  );
}

/** WAVE20 curb barrier — continuous worn concrete/metal (not crate stacks). 8 variants. */
/** WAVE26 dressed containment — industrial banded steel (kill candy neon stripe walls). */
export function livedInBarrierMap(variant: number): THREE.CanvasTexture {
  return canvasTex(
    'w28-containment-metal-v1-' + variant,
    256,
    (ctx, n) => {
      const rnd = mulberry32(0xb25c01 ^ (variant * 0x91) ^ 0x25);
      const steel = variant % 2 === 0;
      ctx.fillStyle = steel ? '#2a3038' : '#303438';
      ctx.fillRect(0, 0, n, n);
      // vertical ribs (Wipeout containment read)
      const ribs = 8 + (variant % 5);
      const rw = n / ribs;
      for (let i = 0; i < ribs; i++) {
        const shade = steel ? 38 + (i % 2) * 18 + (variant % 3) * 4 : 52 + (i % 2) * 14;
        ctx.fillStyle = steel
          ? `rgb(${shade},${shade + 4},${shade + 8})`
          : `rgb(${shade + 4},${shade + 4},${shade + 2})`;
        ctx.fillRect(i * rw + 1, 0, rw - 2, n);
        // bevel highlight on rib edge
        ctx.fillStyle = 'rgba(180,200,220,0.22)';
        ctx.fillRect(i * rw + 1, 0, 2, n);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(i * rw + rw - 3, 0, 2, n);
        // bolts down rib
        ctx.fillStyle = '#c8d0d8';
        for (let b = 0; b < 6; b++) {
          ctx.beginPath();
          ctx.arc(i * rw + rw * 0.5, 18 + b * ((n - 36) / 5), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // WAVE27: denser horizontal industrial bands + wear rails (not candy)
      for (let hy = 0; hy < 7; hy++) {
        const y = n * (0.1 + hy * 0.12);
        ctx.fillStyle = hy % 2 === 0 ? 'rgba(8,10,14,0.55)' : 'rgba(70,78,88,0.22)';
        ctx.fillRect(0, y, n, n * 0.035);
        ctx.fillStyle = 'rgba(140,150,160,0.12)';
        ctx.fillRect(0, y + 1, n, 1);
      }
      // WAVE28: industrial metal — muted hazard only, strong bevelled curb lip language
      ctx.fillStyle = 'rgba(120,90,40,0.38)';
      ctx.fillRect(0, n * 0.38, n, n * 0.022);
      ctx.fillStyle = 'rgba(8,8,10,0.5)';
      for (let c = 0; c < 12; c++) {
        ctx.fillRect(c * (n / 12) + 2, n * 0.38, n * 0.028, n * 0.022);
      }
      // bevelled curb lip (bottom) — plate edge
      ctx.fillStyle = 'rgba(160,170,180,0.55)';
      ctx.fillRect(0, n * 0.88, n, n * 0.045);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, n * 0.925, n, n * 0.04);
      ctx.fillStyle = 'rgba(200,210,220,0.25)';
      ctx.fillRect(0, n * 0.88, n, 2);
      // riveted mid rail
      ctx.fillStyle = 'rgba(100,108,118,0.7)';
      ctx.fillRect(0, n * 0.5 - 4, n, 8);
      for (let rv = 0; rv < 14; rv++) {
        ctx.fillStyle = '#c0c8d0';
        ctx.beginPath();
        ctx.arc(10 + rv * (n / 14), n * 0.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // trim light strip (top) — subtle cyan industrial only
      ctx.fillStyle = 'rgba(0,180,220,0.55)';
      ctx.fillRect(0, 3, n, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, 4, n, 1);
      // wear / scuffs
      for (let s = 0; s < 28; s++) {
        ctx.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.4})`;
        ctx.fillRect(rnd() * n, rnd() * n, 8 + rnd() * 40, 2 + rnd() * 6);
      }
      // rust blooms
      for (let r = 0; r < 10; r++) {
        ctx.fillStyle = `rgba(${130 + rnd() * 50},${60 + rnd() * 40},${20},${0.2 + rnd() * 0.35})`;
        ctx.fillRect(rnd() * n, n * 0.6 + rnd() * n * 0.35, 10 + rnd() * 30, 4 + rnd() * 12);
      }
      // panel seam
      ctx.strokeStyle = '#0a0c10';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(n * (0.33 + (variant % 3) * 0.08), 0);
      ctx.lineTo(n * (0.33 + (variant % 3) * 0.08) + 6, n);
      ctx.stroke();
    },
    0.55,
    1.15
  );
}

/**
 * Per-building unique façade — different window rhythms, neon text/colors, dirt, patch panels.
 * Keyed by wearSeed so neighbors with different seeds never share identical maps.
 */
/** WAVE26 façade kit — denser lived-in massing / material breaks / graphic ads (NO neon word labels). */
export function livedInFacadeMap(neonHex: number, variant: number, wearSeed = 0): THREE.CanvasTexture {
  const nr = (neonHex >> 16) & 0xff;
  const ng = (neonHex >> 8) & 0xff;
  const nb = neonHex & 0xff;
  const key = 'w28-facade-kit-v1-' + neonHex + '-' + variant + '-' + (wearSeed >>> 0);
  return canvasTex(
    key,
    256,
    (ctx, n) => {
      const rnd = mulberry32(0xf25ade ^ neonHex ^ (variant * 97) ^ wearSeed);
      const hueShift = ((variant + (wearSeed % 7)) % 7) * 10;
      const bodyRoll = (variant + wearSeed) % 5;
      // material body: concrete / metal / dark glass / rust panel / teal industrial
      const bodies = [
        `rgb(${28 + hueShift},${30},${34 + hueShift})`,
        `rgb(${42},${38 + hueShift},${48})`,
        `rgb(${12},${18 + hueShift},${22})`,
        `rgb(${48 + hueShift},${32},${24})`,
        `rgb(${18},${32 + hueShift},${36})`,
      ];
      ctx.fillStyle = bodies[bodyRoll];
      ctx.fillRect(0, 0, n, n);
      // material break bands (setbacks / cladding changes — not copy-paste windows)
      const breaks = 2 + (wearSeed % 3);
      for (let b = 0; b < breaks; b++) {
        const by = n * (0.15 + b * (0.28 + (wearSeed % 3) * 0.04));
        const bh = n * (0.08 + (b % 2) * 0.06);
        ctx.fillStyle = b % 2 === 0 ? `rgb(${60 + hueShift},${64},${70})` : `rgb(${20},${24 + hueShift},${30})`;
        ctx.fillRect(0, by, n, bh);
        ctx.fillStyle = `rgba(${nr},${ng},${nb},0.35)`;
        ctx.fillRect(0, by + bh - 3, n, 3);
      }
      // dirt streaks
      for (let d = 0; d < 6 + (wearSeed % 5); d++) {
        const dx = Math.floor(rnd() * n);
        ctx.fillStyle = `rgba(8,6,4,${0.12 + rnd() * 0.25})`;
        ctx.fillRect(dx, 0, 3 + rnd() * 8, n * (0.4 + rnd() * 0.6));
      }
      // irregular window clusters (varied rhythm — not uniform extruded grid)
      const cols = 3 + ((variant + (wearSeed % 4)) % 5);
      const rows = 4 + ((variant * 2 + wearSeed) % 6);
      const cw = n / cols;
      const rh = n / rows;
      const gapStyle = (wearSeed + variant) % 4;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const litRoll = hash01(variant, x * 17 + y * 11, wearSeed ^ neonHex);
          if ((x + y + wearSeed) % 5 === 0) continue; // missing mass / setback void
          const pad = gapStyle === 0 ? 3 : gapStyle === 1 ? 5 : gapStyle === 2 ? 2 : 1;
          if (litRoll < 0.15) {
            ctx.fillStyle = rnd() > 0.5 ? '#4a5560' : '#080a10';
            ctx.fillRect(x * cw + pad, y * rh + pad, cw - pad * 2, rh - pad * 2);
            continue;
          }
          if (litRoll < 0.32) {
            ctx.fillStyle = `rgb(${8},${10},${14})`;
            ctx.fillRect(x * cw + pad, y * rh + pad, cw - pad * 2, rh - pad * 2);
            continue;
          }
          const a = 0.75 + rnd() * 0.2;
          ctx.fillStyle = `rgba(${nr},${ng},${nb},${a})`;
          if (gapStyle === 1) {
            ctx.fillRect(x * cw + 2, y * rh + rh * 0.4, cw - 4, rh * 0.22);
          } else if (gapStyle === 3) {
            // tall slit windows
            ctx.fillRect(x * cw + cw * 0.35, y * rh + pad, cw * 0.3, rh - pad * 2);
          } else {
            ctx.fillRect(x * cw + pad + 1, y * rh + pad + 1, cw - pad * 2 - 2, rh - pad * 2 - 2);
          }
        }
      }
      // LARGE graphic ad board (shapes/chevrons — NO word labels)
      const adColors = ['#ff4499', '#ffaa22', '#44ffcc', '#ff6622', '#aa66ff', '#22ddff'];
      const adC = adColors[(variant + wearSeed) % adColors.length];
      const adY = n * (0.08 + ((wearSeed % 4) * 0.12));
      const adH = n * (0.16 + (variant % 3) * 0.04);
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(n * 0.04, adY, n * 0.92, adH);
      ctx.fillStyle = adC;
      ctx.fillRect(n * 0.06, adY + 4, n * 0.88, adH - 8);
      // abstract logo geometry (no text)
      ctx.fillStyle = '#0a0c12';
      ctx.beginPath();
      ctx.moveTo(n * 0.18, adY + adH * 0.7);
      ctx.lineTo(n * 0.32, adY + adH * 0.25);
      ctx.lineTo(n * 0.46, adY + adH * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(n * 0.52, adY + adH * 0.3, n * 0.34, adH * 0.18);
      ctx.fillRect(n * 0.52, adY + adH * 0.55, n * 0.22, adH * 0.12);
      // mechanical / AC panel strip
      ctx.fillStyle = '#5a6570';
      ctx.fillRect(n * 0.62, n * 0.72, n * 0.32, n * 0.14);
      ctx.strokeStyle = '#12161c';
      ctx.lineWidth = 3;
      ctx.strokeRect(n * 0.62, n * 0.72, n * 0.32, n * 0.14);
      for (let v = 0; v < 4; v++) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(n * 0.65 + v * n * 0.07, n * 0.74, n * 0.04, n * 0.1);
      }
      // ledge / cornice
      ctx.fillStyle = 'rgba(180,190,200,0.28)';
      ctx.fillRect(0, n * 0.02, n, 5);
      ctx.fillRect(0, n * 0.96, n, 6);
      // WAVE27: second + tertiary graphic strips, antenna, balcony ledge (anti box-copy)
      ctx.fillStyle = adColors[(variant + wearSeed + 3) % adColors.length];
      ctx.fillRect(n * 0.08, n * 0.42, n * 0.84, n * 0.07);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(n * 0.1, n * 0.44, n * 0.3, n * 0.03);
      ctx.fillStyle = adColors[(variant + wearSeed + 5) % adColors.length];
      ctx.fillRect(n * 0.55, n * 0.28, n * 0.38, n * 0.09);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(n * 0.58, n * 0.31, n * 0.2, n * 0.03);
      ctx.fillStyle = '#6a7480';
      ctx.fillRect(n * 0.05, n * 0.58, n * 0.9, 4);
      for (let p = 0; p < 8; p++) {
        ctx.fillRect(n * (0.08 + p * 0.11), n * 0.55, 3, n * 0.1);
      }
      ctx.fillStyle = 'rgba(40,48,56,0.85)';
      ctx.fillRect(0, n * 0.68, n, n * 0.04);
      ctx.fillStyle = 'rgba(' + nr + ',' + ng + ',' + nb + ',0.4)';
      ctx.fillRect(0, n * 0.7, n, 2);
      ctx.fillStyle = '#8a94a0';
      ctx.fillRect(n * 0.78, n * 0.02, 3, n * 0.12);
      ctx.fillRect(n * 0.72, n * 0.02, n * 0.14, 3);
    },
    1,
    1
  );
}

/** Night facade with a few lit windows. Shared by the flight skyline boxes. */
export function flyerSkylineWindowMap(sceneId: FlyerSceneId): THREE.CanvasTexture {
  return canvasTex(
    `life-windows-${sceneId}`,
    64,
    (ctx, n) => {
      ctx.fillStyle = sceneId === 'yard' ? '#101820' : sceneId === 'rift' ? '#0e1820' : '#120e16';
      ctx.fillRect(0, 0, n, n);
      const cols = 4;
      const rows = 8;
      const cw = n / cols;
      const ch = n / rows;
      const rnd = mulberry32(sceneSalt(sceneId) ^ 0x51fe);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const h = rnd();
          if (h < 0.3) continue;
          const warm = sceneId === 'canyon' ? h > 0.6 : h > 0.84;
          ctx.globalAlpha = 0.45 + h * 0.5;
          ctx.fillStyle =
            sceneId === 'rift'
              ? '#9ee8ff'
              : sceneId === 'yard'
                ? warm
                  ? '#ffe0a0'
                  : '#7ad8ff'
                : warm
                  ? '#ffc878'
                  : '#6ec8ea';
          ctx.fillRect(x * cw + n * 0.012, y * ch + n * 0.02, cw * 0.72, ch * 0.48);
        }
      }
      ctx.globalAlpha = 1;
    },
    1,
    1
  );
}

/** Highway asphalt for continuous ribbon UVs.
 * UV.u = lateral lane (0 left .. 1 right); UV.v = distance_along_path / world_meters.
 * Seams are painted as horizontal bands so they stay perpendicular to travel when V tiles.
 * Lane dashes/edges are vertical so they flow with the spline — no plate stretch on bends.
 */
export function highwayAsphaltMap(): THREE.CanvasTexture {
  return canvasTex(
    'w41-graphite-deck-v1',
    512,
    (ctx, n) => {
      const rnd = mulberry32(0x19a524ce);
      // asphalt-dark graphite
      // WAVE26 plated industrial deck — deeper bevels / drains / wear
      ctx.fillStyle = '#030406'; // WAVE41 darker graphite asphalt base
      ctx.fillRect(0, 0, n, n);
      // WAVE28 plate atlas — plate tiles (bevelled metal panels) — UV.u lateral / UV.v travel preserved
      const plateCols = 6;
      const plateRows = 8;
      const pw = n / plateCols;
      const ph = n / plateRows;
      for (let py = 0; py < plateRows; py++) {
        for (let px = 0; px < plateCols; px++) {
          const g = 10 + ((px + py * 3) % 5) * 3 + Math.floor(rnd() * 4);
          ctx.fillStyle = `rgb(${g},${g + 1},${g + 4})`;
          ctx.fillRect(px * pw + 2, py * ph + 2, pw - 4, ph - 4);
          // bevel highlight / shadow
          ctx.fillStyle = 'rgba(120,140,160,0.058)';
          ctx.fillRect(px * pw + 2, py * ph + 2, pw - 4, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px * pw + 2, py * ph + ph - 4, pw - 4, 2);
          ctx.fillRect(px * pw + pw - 4, py * ph + 2, 2, ph - 4);
        }
      }
      for (let i = 0; i < 9000; i++) {
        const x = Math.floor(rnd() * n);
        const y = Math.floor(rnd() * n);
        const g = 20 + Math.floor(rnd() * 36);
        ctx.fillStyle = 'rgba(' + g + ',' + (g + 2) + ',' + (g + 5) + ',' + (0.1 + rnd() * 0.35) + ')';
        ctx.fillRect(x, y, 1, 1);
      }
      // tire-path wear bands
      for (const u of [0.27, 0.73]) {
        const x = u * n - n * 0.07;
        ctx.fillStyle = 'rgba(6,7,9,0.55)';
        ctx.fillRect(x, 0, n * 0.14, n);
        ctx.fillStyle = 'rgba(70,78,88,0.16)';
        ctx.fillRect(x + n * 0.03, 0, n * 0.08, n);
      }
      // plated seams / expansion joints — horizontal = perp to travel
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      for (let row = 0; row <= plateRows; row++) {
        const y = row * ph;
        ctx.beginPath();
        ctx.moveTo(n * 0.03, y);
        ctx.lineTo(n * 0.97, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,110,130,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(n * 0.03, y + 2);
        ctx.lineTo(n * 0.97, y + 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3;
      }
      // vents / drains denser
      for (let i = 0; i < 16; i++) {
        const vx = n * (0.12 + (i % 4) * 0.2);
        const vy = n * (0.06 + Math.floor(i / 4) * 0.24);
        ctx.fillStyle = 'rgba(8,10,14,0.92)';
        ctx.fillRect(vx, vy, n * 0.07, n * 0.035);
        ctx.strokeStyle = 'rgba(50,120,140,0.55)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, n * 0.07, n * 0.035);
        ctx.strokeStyle = 'rgba(90,110,120,0.5)';
        for (let g = 1; g < 5; g++) {
          ctx.beginPath();
          ctx.moveTo(vx + (n * 0.07 * g) / 5, vy);
          ctx.lineTo(vx + (n * 0.07 * g) / 5, vy + n * 0.035);
          ctx.stroke();
        }
      }
      // cyan boost-lane inlays (grammar pads also present)
      ctx.fillStyle = 'rgba(0,220,255,0.28)';
      ctx.fillRect(n * 0.18, 0, 3, n);
      ctx.fillRect(n * 0.82, 0, 3, n);
      ctx.fillStyle = 'rgba(0,180,220,0.18)';
      ctx.fillRect(n * 0.11, 0, 2, n);
      ctx.fillRect(n * 0.885, 0, 2, n);
      // white edge lines (travel direction)
      ctx.fillStyle = 'rgba(235,240,245,0.98)';
      ctx.fillRect(n * 0.028, 0, n * 0.032, n);
      ctx.fillRect(n * 0.94, 0, n * 0.032, n);
      // curb shadow
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, n * 0.022, n);
      ctx.fillRect(n * 0.978, 0, n * 0.022, n);
      // WAVE39: center dashed CYAN (F-Zero Mute City) — readable at speed
      const dashW = n * 0.028;
      const dashH = n * 0.15;
      const gap = n * 0.09;
      const cx = n * 0.5 - dashW * 0.5;
      ctx.fillStyle = 'rgba(40,245,255,1)';
      for (let y = 8; y < n - 8; y += dashH + gap) {
        ctx.fillRect(cx, y, dashW, dashH);
      }
      ctx.fillStyle = 'rgba(180,255,255,0.55)';
      for (let y = 8; y < n - 8; y += dashH + gap) {
        ctx.fillRect(cx + 1, y + 2, dashW - 2, 3);
      }
      // pink/red edge glow rails (Mute City stills)
      ctx.fillStyle = 'rgba(255,40,90,0.85)';
      ctx.fillRect(n * 0.018, 0, n * 0.018, n);
      ctx.fillRect(n * 0.964, 0, n * 0.018, n);
      ctx.fillStyle = 'rgba(255,120,160,0.35)';
      ctx.fillRect(n * 0.036, 0, 2, n);
      ctx.fillRect(n * 0.958, 0, 2, n);
      // polish streaks along travel
      for (let i = 0; i < 14; i++) {
        const x = n * (0.12 + rnd() * 0.76);
        ctx.fillStyle = 'rgba(40,46,54,' + (0.07 + rnd() * 0.1) + ')';
        ctx.fillRect(x, 0, 2 + rnd() * 5, n);
      }
      // WAVE27: deeper plate bevel + oil grime + blue illuminated inlays + grate drains
      for (let py = 0; py < plateRows; py++) {
        for (let px = 0; px < plateCols; px++) {
          if ((px + py) % 2 !== 0) continue;
          const x0 = px * pw + 5;
          const y0 = py * ph + 5;
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x0, y0, pw - 10, ph - 10);
          ctx.strokeStyle = 'rgba(150,170,190,0.28)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x0 + 2, y0 + 2, pw - 14, ph - 14);
          ctx.fillStyle = 'rgba(180,200,220,0.08)';
          ctx.fillRect(x0 + 3, y0 + 3, (pw - 16) * 0.35, 2);
        }
      }
      for (let g = 0; g < 28; g++) {
        ctx.fillStyle = `rgba(8,6,4,${0.2 + rnd() * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 32, 2 + rnd() * 12, rnd() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let bi = 0; bi < 6; bi++) {
        const bx = n * (0.2 + (bi % 3) * 0.25);
        const by = n * (0.12 + Math.floor(bi / 3) * 0.45);
        ctx.fillStyle = 'rgba(0,160,220,0.22)';
        ctx.fillRect(bx, by, n * 0.1, n * 0.018);
        ctx.fillStyle = 'rgba(80,220,255,0.35)';
        ctx.fillRect(bx + 2, by + 2, n * 0.1 - 4, 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(n * 0.08, 0, 5, n);
      ctx.fillRect(n * 0.91, 0, 5, n);
      ctx.fillStyle = 'rgba(40,130,150,0.32)';
      ctx.fillRect(n * 0.082, 0, 1.5, n);
      ctx.fillRect(n * 0.912, 0, 1.5, n);
      for (let gy = 0; gy < 12; gy++) {
        ctx.fillStyle = 'rgba(30,40,50,0.7)';
        ctx.fillRect(n * 0.08, gy * (n / 12) + 4, 5, 2);
        ctx.fillRect(n * 0.91, gy * (n / 12) + 4, 5, 2);
      }
    },
    1,
    1
  );
}

export function livedInBoostMap(): THREE.CanvasTexture {
  return canvasTex(
    'w20-boost-checker-v1',
    128,
    (ctx, n) => {
      const cell = 32;
      for (let y = 0; y < n; y += cell) {
        for (let x = 0; x < n; x += cell) {
          const on = (x / cell + y / cell) % 2 === 0;
          ctx.fillStyle = on ? '#00ffff' : '#002830';
          ctx.fillRect(x, y, cell, cell);
        }
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.strokeRect(3, 3, n - 6, n - 6);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, n - 20, n - 20);
    },
    2,
    1
  );
}

/** WAVE25 graphic ad board — chevrons/panels only (no neon word labels). */
export function billboardFaceMap(seed: number): THREE.CanvasTexture {
  return canvasTex(
    'w28-adboard-v1-' + (seed >>> 0),
    128,
    (ctx, n) => {
      const rnd = mulberry32(seed ^ 0xbb25);
      const colors = ['#ff2288', '#ffcc00', '#00ffcc', '#ff6600', '#8866ff', '#22aaff'];
      const c0 = colors[seed % colors.length];
      const c1 = colors[(seed + 2) % colors.length];
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, n, n);
      ctx.fillStyle = c0;
      ctx.fillRect(4, 4, n - 8, n - 8);
      ctx.fillStyle = '#111118';
      ctx.fillRect(10, 10, n - 20, n - 20);
      // chevron / logo geometry
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(n * 0.2, n * 0.75);
      ctx.lineTo(n * 0.5, n * 0.22);
      ctx.lineTo(n * 0.8, n * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.4})`;
      ctx.fillRect(14, n * 0.14, n - 28, 7);
      ctx.fillRect(14, n * 0.82, n * 0.45, 6);
      // scan lines
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(12, n * 0.3 + i * 8, n - 24, 2);
      }
    },
    1,
    1
  );
}
