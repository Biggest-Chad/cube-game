/**
 * Nyx Mako — commercially shippable original hero interceptor.
 *
 * Reconstruction-by-code. Look language rhymes with the NC Intergalactic
 * stills (bulky hull, twin nacelles, flank intakes, V-tail, rear glow) but
 * this factory does not copy 3DHaupt topology, UVs, textures, or verts.
 *
 * Local −Z is forward. Mounts honor src/player/ShipMounts.ts exactly.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import {
  SHIP_HARDPOINTS,
  SHIP_HEADLIGHTS,
  SHIP_MUZZLE,
  SHIP_THRUSTERS,
} from './ShipMounts';

export { countGroupTris } from './heroShipFactory';

export const HERO_SHIP_NAME = 'NyxMako';

const SEG = 28;
const SEG_HI = 32;
const SEG_LOFT = 18;

/** Reserved hull-map texels used by neon ribbons (const UV). */
const UV_CYAN: [number, number] = [4 / 1024, 4 / 1024];
const UV_MAG: [number, number] = [12 / 1024, 4 / 1024];

type Mats = {
  hull: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  glow: THREE.MeshStandardMaterial;
  plume: THREE.MeshBasicMaterial;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash(i: number): number {
  let x = i | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (ix: number, iy: number) => hash(ix * 374761393 + iy * 668265263 + seed);
  return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
}

function fbm(x: number, y: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 19);
    a *= 0.5;
    f *= 2.05;
  }
  return s;
}

function dataTex(
  data: Uint8Array,
  size: number,
  srgb: boolean
): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.anisotropy = 8;
  return t;
}

function makePanelSet(kind: 'hull' | 'paint', size = 1024): {
  map: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  metalnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  emissiveMap: THREE.DataTexture;
} {
  const n = size * size;
  const albedo = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const metal = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  const emis = new Uint8Array(n * 4);
  const paint = kind === 'paint';
  const seed = paint ? 90210 : 77017;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;

      // Reserved neon swatches (bottom-left, DataTexture origin).
      if (y < 8 && x < 16) {
        const cyan = x < 8;
        albedo[o] = cyan ? 0 : 255;
        albedo[o + 1] = cyan ? 240 : 0;
        albedo[o + 2] = cyan ? 255 : 170;
        albedo[o + 3] = 255;
        rough[o] = rough[o + 1] = rough[o + 2] = 40;
        rough[o + 3] = 255;
        metal[o] = metal[o + 1] = metal[o + 2] = 30;
        metal[o + 3] = 255;
        emis[o] = cyan ? 0 : 255;
        emis[o + 1] = cyan ? 240 : 0;
        emis[o + 2] = cyan ? 255 : 170;
        emis[o + 3] = 255;
        height[i] = 0.55;
        continue;
      }

      const fx = x / size;
      const fy = y / size;
      const panelX = 28 + 8 * vnoise(x * 0.02, 3.1, seed);
      const panelY = 36 + 10 * vnoise(7.2, y * 0.02, seed + 3);
      const gx = Math.abs((x % panelX) - panelX * 0.5) > panelX * 0.5 - 1.15;
      const gy = Math.abs((y % panelY) - panelY * 0.5) > panelY * 0.5 - 1.05;
      const groove = gx || gy ? 1 : 0;
      const rivet =
        gx && gy && hash(x * 13 + y * 47 + seed) > 0.35 ? 1 : 0;
      const wear = fbm(fx * 7, fy * 11, seed);
      const scratch = vnoise(fx * 80, fy * 9, seed + 9) > 0.78 ? 0.25 : 0;
      const hatch = vnoise(fx * 40, fy * 40, seed + 11);

      height[i] =
        0.52 +
        wear * 0.08 -
        groove * 0.38 -
        scratch * 0.12 +
        rivet * 0.22 +
        (hatch - 0.5) * 0.04;

      const dark = paint ? 0.22 : 0.07;
      const mid = paint ? 0.38 : 0.14;
      const lift = dark + (mid - dark) * (0.45 + wear * 0.55);
      const r = lift * (paint ? 0.78 : 0.55) + scratch * 0.08;
      const g = lift * (paint ? 0.88 : 0.72) + scratch * 0.1;
      const b = lift * (paint ? 1.02 : 0.92) + scratch * 0.14;
      const grooveMul = groove ? 0.45 : 1;
      albedo[o] = Math.min(255, Math.round(r * 255 * grooveMul));
      albedo[o + 1] = Math.min(255, Math.round(g * 255 * grooveMul));
      albedo[o + 2] = Math.min(255, Math.round(b * 255 * grooveMul));
      albedo[o + 3] = 255;

      const rv = groove ? 0.62 : 0.22 + wear * 0.28 + scratch * 0.2;
      const rm = Math.min(255, Math.round(rv * 255));
      rough[o] = rough[o + 1] = rough[o + 2] = rm;
      rough[o + 3] = 255;

      const mv = groove ? 0.35 : paint ? 0.55 : 0.82;
      const mm = Math.min(255, Math.round(mv * 255));
      metal[o] = metal[o + 1] = metal[o + 2] = mm;
      metal[o + 3] = 255;

      // Sparse cyan panel ticks + magenta dorsal-ish bands so neon reads on hull UVs.
      const cyanLine = gy && y % 144 < 2 && !gx;
      const magBand = y % 256 < 3 && x % 3 !== 0;
      if (cyanLine) {
        emis[o] = 0;
        emis[o + 1] = 200;
        emis[o + 2] = 255;
      } else if (magBand && !paint) {
        emis[o] = 180;
        emis[o + 1] = 0;
        emis[o + 2] = 120;
      } else {
        emis[o] = emis[o + 1] = emis[o + 2] = 0;
      }
      emis[o + 3] = 255;
    }
  }

  const normal = new Uint8Array(n * 4);
  const str = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xl = height[y * size + ((x + size - 1) % size)];
      const xr = height[y * size + ((x + 1) % size)];
      const yd = height[((y + size - 1) % size) * size + x];
      const yu = height[((y + 1) % size) * size + x];
      const dx = (xr - xl) * str;
      const dy = (yu - yd) * str;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * inv;
      const ny = -dy * inv;
      const nz = inv;
      const o = i * 4;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }

  return {
    map: dataTex(albedo, size, true),
    roughnessMap: dataTex(rough, size, false),
    metalnessMap: dataTex(metal, size, false),
    normalMap: dataTex(normal, size, false),
    emissiveMap: dataTex(emis, size, true),
  };
}

function createMaterials(): Mats {
  const hullMaps = makePanelSet('hull');
  const paintMaps = makePanelSet('paint');
  const hull = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 1,
    map: hullMaps.map,
    roughnessMap: hullMaps.roughnessMap,
    metalnessMap: hullMaps.metalnessMap,
    normalMap: hullMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    emissive: 0xffffff,
    emissiveMap: hullMaps.emissiveMap,
    emissiveIntensity: 1.15,
    envMapIntensity: 0.9,
  });
  const paint = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 1,
    map: paintMaps.map,
    roughnessMap: paintMaps.roughnessMap,
    metalnessMap: paintMaps.metalnessMap,
    normalMap: paintMaps.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    emissive: 0xffffff,
    emissiveMap: paintMaps.emissiveMap,
    emissiveIntensity: 0.55,
    envMapIntensity: 0.85,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x082028,
    metalness: 0.04,
    roughness: 0.05,
    transmission: 0.42,
    thickness: 0.07,
    ior: 1.45,
    transparent: true,
    opacity: 0.88,
    emissive: 0x041820,
    emissiveIntensity: 0.45,
    envMapIntensity: 1.15,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    attenuationColor: new THREE.Color(0x083040),
    attenuationDistance: 0.4,
  });
  const glowMap = dataTex(
    new Uint8Array([255, 0, 170, 255, 255, 40, 190, 255, 255, 0, 170, 255, 255, 80, 210, 255]),
    2,
    true
  );
  const glow = new THREE.MeshStandardMaterial({
    color: COLORS.magenta,
    emissive: COLORS.magenta,
    emissiveIntensity: 2.4,
    metalness: 0.15,
    roughness: 0.22,
    map: glowMap,
    emissiveMap: glowMap,
    toneMapped: false,
  });
  const plume = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  return { hull, paint, glass, glow, plume };
}

function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) return geo;
  const n = geo.getAttribute('position')?.count ?? 0;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function add(
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
  ensureIndexed(geo);
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function stampUv(geo: THREE.BufferGeometry, uv: [number, number]): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    arr[i * 2] = uv[0];
    arr[i * 2 + 1] = uv[1];
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(arr, 2));
  return geo;
}

function superellipse(rx: number, ry: number, t: number, n: number): [number, number] {
  const a = t * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = 2 / n;
  const x = rx * Math.sign(c) * Math.pow(Math.abs(c), p);
  const y = ry * Math.sign(s) * Math.pow(Math.abs(s), p);
  return [x, y];
}

function loftRings(
  rings: Array<{ pts: THREE.Vector3[]; v: number }>,
  capStart: boolean,
  capEnd: boolean
): THREE.BufferGeometry {
  const segs = rings[0].pts.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let si = 0; si < rings.length; si++) {
    const ring = rings[si];
    for (let i = 0; i <= segs; i++) {
      const p = ring.pts[i % segs];
      positions.push(p.x, p.y, p.z);
      uvs.push(i / segs, ring.v);
    }
  }
  const stride = segs + 1;
  for (let si = 0; si < rings.length - 1; si++) {
    for (let i = 0; i < segs; i++) {
      const a = si * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  if (capStart) {
    const cIdx = positions.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of rings[0].pts) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const k = rings[0].pts.length;
    positions.push(cx / k, cy / k, cz / k);
    uvs.push(0.5, 0);
    for (let i = 0; i < segs; i++) indices.push(cIdx, i + 1, i);
  }
  if (capEnd) {
    const last = rings.length - 1;
    const cIdx = positions.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of rings[last].pts) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const k = rings[last].pts.length;
    positions.push(cx / k, cy / k, cz / k);
    uvs.push(0.5, 1);
    const base = last * stride;
    for (let i = 0; i < segs; i++) indices.push(cIdx, base + i, base + i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function resampleKeys(
  keys: Array<{ z: number; rx: number; ry: number; n: number }>,
  count: number
): Array<{ z: number; rx: number; ry: number; n: number }> {
  const out: Array<{ z: number; rx: number; ry: number; n: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * (keys.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, keys.length - 1);
    const f = t - i0;
    const a = keys[i0];
    const b = keys[i1];
    out.push({
      z: lerp(a.z, b.z, f),
      rx: lerp(a.rx, b.rx, f),
      ry: lerp(a.ry, b.ry, f),
      n: lerp(a.n, b.n, f),
    });
  }
  return out;
}

function fuselageLoft(): THREE.BufferGeometry {
  const keys = [
    { z: -2.02, rx: 0.07, ry: 0.05, n: 2.15 },
    { z: -1.86, rx: 0.28, ry: 0.13, n: 2.4 },
    { z: -1.62, rx: 0.48, ry: 0.16, n: 2.55 },
    { z: -1.32, rx: 0.44, ry: 0.185, n: 2.45 },
    { z: -0.95, rx: 0.42, ry: 0.21, n: 2.35 },
    { z: -0.52, rx: 0.46, ry: 0.235, n: 2.3 },
    { z: -0.08, rx: 0.5, ry: 0.255, n: 2.25 },
    { z: 0.36, rx: 0.48, ry: 0.24, n: 2.28 },
    { z: 0.78, rx: 0.42, ry: 0.215, n: 2.35 },
    { z: 1.12, rx: 0.34, ry: 0.175, n: 2.45 },
    { z: 1.34, rx: 0.24, ry: 0.14, n: 2.55 },
    { z: 1.5, rx: 0.13, ry: 0.09, n: 2.65 },
  ];
  const st = resampleKeys(keys, SEG_LOFT);
  const rings = st.map((s, si) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < SEG; i++) {
      let [x, y] = superellipse(s.rx, s.ry, i / SEG, s.n);
      if (y < 0) y *= 0.88;
      else y *= 1.06;
      pts.push(new THREE.Vector3(x, y, s.z));
    }
    return { pts, v: si / (st.length - 1) };
  });
  return loftRings(rings, true, true);
}

function bulkyWing(side: number): THREE.BufferGeometry {
  const keys = [
    { x: 0.38, y: -0.02, z: -0.28, chord: 1.55, thick: 0.22 },
    { x: 0.6, y: -0.06, z: -0.08, chord: 1.28, thick: 0.26 },
    { x: 0.82, y: -0.11, z: 0.12, chord: 1.02, thick: 0.22 },
    { x: 1.0, y: -0.15, z: 0.28, chord: 0.72, thick: 0.16 },
    { x: 1.14, y: -0.17, z: 0.4, chord: 0.42, thick: 0.1 },
    { x: 1.24, y: -0.18, z: 0.5, chord: 0.18, thick: 0.05 },
  ];
  const nSt = 10;
  const rings: Array<{ pts: THREE.Vector3[]; v: number }> = [];
  for (let si = 0; si < nSt; si++) {
    const t = (si / (nSt - 1)) * (keys.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, keys.length - 1);
    const f = t - i0;
    const a = keys[i0];
    const b = keys[i1];
    const x = lerp(a.x, b.x, f) * side;
    const y = lerp(a.y, b.y, f);
    const z = lerp(a.z, b.z, f);
    const chord = lerp(a.chord, b.chord, f);
    const thick = lerp(a.thick, b.thick, f);
    const pts: THREE.Vector3[] = [];
    const radial = 22;
    for (let i = 0; i < radial; i++) {
      let [dy, dz] = superellipse(thick * 0.5, chord * 0.5, i / radial, 2.15);
      if (dy < 0) dy *= 1.4;
      dz = dz * 1.0 - chord * 0.08;
      pts.push(new THREE.Vector3(x, y + dy, z + dz));
    }
    rings.push({ pts, v: si / (nSt - 1) });
  }
  return loftRings(rings, true, true);
}

function roundedPlate(w: number, h: number, depth: number, r = 0.03, bevel = 0.008): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  const rr = Math.min(r, hw * 0.45, hh * 0.45);
  shape.moveTo(-hw + rr, -hh);
  shape.lineTo(hw - rr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  shape.lineTo(hw, hh - rr);
  shape.quadraticCurveTo(hw, hh, hw - rr, hh);
  shape.lineTo(-hw + rr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  shape.lineTo(-hw, -hh + rr);
  shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return geo;
}

function finShape(chord: number, height: number, sweep: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.02, 0);
  s.lineTo(chord, 0);
  s.lineTo(chord - sweep, height);
  s.lineTo(0.04, height * 0.92);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.042,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.translate(0, 0, -0.021);
  geo.computeVertexNormals();
  return geo;
}

function nacelleLathe(scale: number): THREE.BufferGeometry {
  const s = scale;
  const pts = [
    new THREE.Vector2(0.018 * s, -0.3 * s),
    new THREE.Vector2(0.1 * s, -0.3 * s),
    new THREE.Vector2(0.112 * s, -0.18 * s),
    new THREE.Vector2(0.118 * s, -0.02 * s),
    new THREE.Vector2(0.122 * s, 0.12 * s),
    new THREE.Vector2(0.132 * s, 0.2 * s),
    new THREE.Vector2(0.09 * s, 0.24 * s),
    new THREE.Vector2(0.072 * s, 0.16 * s),
    new THREE.Vector2(0.068 * s, 0.02 * s),
    new THREE.Vector2(0.07 * s, -0.12 * s),
    new THREE.Vector2(0.05 * s, -0.22 * s),
    new THREE.Vector2(0.018 * s, -0.24 * s),
  ];
  const geo = new THREE.LatheGeometry(pts, SEG_HI);
  geo.computeVertexNormals();
  return geo;
}

function tube(
  points: THREE.Vector3[],
  radius: number,
  tubular = 18,
  radial = 8
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, false);
}

function buildFuselage(root: THREE.Group, mats: Mats): void {
  add(root, fuselageLoft(), mats.hull, 'Hull');

  add(root, roundedPlate(0.42, 1.55, 0.028, 0.05, 0.01), mats.paint, 'DorsalArmor', 0, 0.19, -0.08, -Math.PI / 2);
  add(root, roundedPlate(0.22, 1.1, 0.02, 0.04, 0.006), mats.hull, 'SpineRail', 0, 0.215, 0.05, -Math.PI / 2);
  const bar = roundedPlate(0.07, 1.05, 0.016, 0.02, 0.004);
  stampUv(bar, UV_MAG);
  add(root, bar, mats.hull, 'DorsalMagBar', 0, 0.232, -0.12, -Math.PI / 2);

  add(root, roundedPlate(0.3, 0.85, 0.04, 0.04, 0.01), mats.hull, 'ChinPlow', 0, -0.16, -0.7, -Math.PI / 2 + 0.22);
  add(root, roundedPlate(0.16, 0.7, 0.03, 0.03, 0.008), mats.paint, 'BeakPlate', 0, -0.145, -1.15, -Math.PI / 2 + 0.14);

  for (let i = 0; i < 7; i++) {
    const z = -1.05 + i * 0.32;
    add(root, roundedPlate(0.46, 0.018, 0.01, 0.004, 0.002), mats.hull, `PanelGroove_${i}`, 0, 0.2, z, -Math.PI / 2);
  }

  for (const side of [-1, 1] as const) {
    add(root, roundedPlate(1.05, 0.16, 0.045, 0.04, 0.01), mats.paint, `Cheek_${side}`, side * 0.48, 0.05, -0.2, 0, Math.PI / 2, side * -0.1);
    add(root, roundedPlate(0.55, 0.11, 0.035, 0.03, 0.008), mats.hull, `CheekLow_${side}`, side * 0.5, -0.06, -0.55, 0.08, Math.PI / 2, side * -0.08);
    const ribbon = roundedPlate(1.4, 0.018, 0.01, 0.006, 0.003);
    stampUv(ribbon, UV_CYAN);
    add(root, ribbon, mats.hull, `FuseRibbon_${side}`, side * 0.42, 0.1, -0.15, 0, Math.PI / 2, 0);
  }
}

function buildHammerhead(root: THREE.Group, mats: Mats): void {
  const mz = SHIP_MUZZLE;
  for (const side of [-1, 1] as const) {
    const blister = new THREE.SphereGeometry(0.145, 24, 16);
    blister.scale(1.35, 0.72, 1.25);
    add(root, blister, mats.paint, `SensorBlister_${side}`, side * 0.46, 0.01, -1.84);
    const lens = new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    add(root, lens, mats.glass, `SensorLens_${side}`, side * 0.46, 0.015, -1.98, Math.PI / 2, 0, 0);
    add(root, new THREE.TorusGeometry(0.078, 0.01, 10, 24), mats.hull, `SensorRim_${side}`, side * 0.46, 0.015, -1.96);
    add(root, new THREE.CylinderGeometry(0.018, 0.022, 0.08, 16), mats.hull, `SensorPort_${side}`, side * 0.46, 0.08, -1.76);
  }

  add(root, new THREE.CylinderGeometry(0.042, 0.05, 0.78, SEG_HI), mats.paint, 'Barrel', mz.x, mz.y, mz.z + 0.4, Math.PI / 2);
  add(root, new THREE.CylinderGeometry(0.034, 0.034, 0.22, SEG), mats.hull, 'BarrelSleeve', mz.x, mz.y, mz.z + 0.12, Math.PI / 2);
  add(root, new THREE.CylinderGeometry(0.028, 0.038, 0.08, SEG), mats.hull, 'BarrelBrake', mz.x, mz.y, mz.z + 0.02, Math.PI / 2);
  const muzRing0 = new THREE.TorusGeometry(0.046, 0.008, 10, 28);
  stampUv(muzRing0, UV_CYAN);
  add(root, muzRing0, mats.hull, 'MuzRing_0', mz.x, mz.y, mz.z + 0.04, 0, Math.PI / 2, 0);
  const muzRing1 = new THREE.TorusGeometry(0.038, 0.006, 8, 24);
  stampUv(muzRing1, UV_CYAN);
  add(root, muzRing1, mats.hull, 'MuzRing_1', mz.x, mz.y, mz.z - 0.02, 0, Math.PI / 2, 0);

  add(root, roundedPlate(1.02, 0.38, 0.055, 0.08, 0.012), mats.paint, 'HammerShelf', 0, 0.03, -1.8, -Math.PI / 2);
  add(root, roundedPlate(0.36, 0.22, 0.05, 0.05, 0.01), mats.hull, 'HammerBridge', 0, 0.06, -1.72, -Math.PI / 2);
}

function buildCanopy(root: THREE.Group, mats: Mats): void {
  const keys = [
    { z: -0.78, rx: 0.03, ry: 0.02 },
    { z: -0.62, rx: 0.09, ry: 0.055 },
    { z: -0.42, rx: 0.13, ry: 0.1 },
    { z: -0.22, rx: 0.11, ry: 0.085 },
    { z: -0.06, rx: 0.05, ry: 0.04 },
  ];
  const rings = keys.map((s, si) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const [x, y] = superellipse(s.rx, s.ry, i / 24, 2.1);
      pts.push(new THREE.Vector3(x, 0.2 + Math.max(y, -s.ry * 0.15), s.z));
    }
    return { pts, v: si / (keys.length - 1) };
  });
  add(root, loftRings(rings, true, true), mats.glass, 'Canopy');

  const frameKeys = keys.map((s) => ({ z: s.z, rx: s.rx + 0.012, ry: s.ry + 0.01 }));
  const frameRings = frameKeys.map((s, si) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const [x, y] = superellipse(s.rx, s.ry, i / 16, 2.1);
      pts.push(new THREE.Vector3(x, 0.198 + Math.max(y, -s.ry * 0.15), s.z));
    }
    return { pts, v: si / (frameKeys.length - 1) };
  });
  add(root, loftRings(frameRings, false, false), mats.hull, 'CanopyFrameShell');

  add(root, roundedPlate(0.3, 0.72, 0.02, 0.06, 0.005), mats.hull, 'CanopySill', 0, 0.168, -0.4, -Math.PI / 2);

  const spine = tube(
    [new THREE.Vector3(0, 0.21, -0.74), new THREE.Vector3(0, 0.3, -0.42), new THREE.Vector3(0, 0.24, -0.08)],
    0.009,
    14,
    8
  );
  add(root, spine, mats.paint, 'CanopySpine');
  for (const side of [-1, 1] as const) {
    const rail = tube(
      [
        new THREE.Vector3(side * 0.03, 0.2, -0.7),
        new THREE.Vector3(side * 0.12, 0.28, -0.42),
        new THREE.Vector3(side * 0.04, 0.22, -0.1),
      ],
      0.007,
      12,
      8
    );
    add(root, rail, mats.hull, `CanopyRail_${side}`);
  }
}

function buildWings(root: THREE.Group, mats: Mats): void {
  for (const side of [-1, 1] as const) {
    add(root, bulkyWing(side), mats.hull, `Wing_${side}`);
    const le = roundedPlate(1.05, 0.05, 0.018, 0.02, 0.004);
    stampUv(le, UV_CYAN);
    add(root, le, mats.hull, `WingLE_${side}`, side * 0.78, -0.04, -0.42, 0.08, side * 0.32, side * 0.16);
    add(root, roundedPlate(0.2, 0.07, 0.028, 0.02, 0.006), mats.paint, `WingTip_${side}`, side * 1.18, -0.16, 0.48, 0, side * 0.18, side * 0.1);
    const tipLight = new THREE.SphereGeometry(0.026, 12, 10);
    stampUv(tipLight, UV_MAG);
    add(root, tipLight, mats.hull, `WingTipLight_${side}`, side * 1.24, -0.17, 0.52);

    const strake = roundedPlate(0.46, 0.14, 0.018, 0.03, 0.004);
    add(root, strake, mats.paint, `Strake_${side}`, side * 0.48, 0.02, -0.95, 0.1, side * -0.12, side * 0.28);
  }
}

function buildIntakes(root: THREE.Group, mats: Mats): void {
  for (const side of [-1, 1] as const) {
    const grp = new THREE.Group();
    grp.name = `Intake_${side}`;
    grp.position.set(side * 0.78, -0.07, -0.05);
    grp.rotation.y = side * 0.62;
    root.add(grp);

    add(grp, roundedPlate(0.22, 0.28, 0.05, 0.04, 0.012), mats.paint, `IntakeLip_${side}`, side * 0.02, 0, 0);
    const well = new THREE.BoxGeometry(0.16, 0.2, 0.22);
    add(grp, well, mats.hull, `IntakeWell_${side}`, -side * 0.06, 0, 0.02);
    const cavity = new THREE.BoxGeometry(0.12, 0.16, 0.18);
    add(grp, cavity, mats.hull, `IntakeCavity_${side}`, -side * 0.1, 0, 0.02);

    for (let i = 0; i < 5; i++) {
      const y = -0.08 + i * 0.04;
      const slat = roundedPlate(0.2, 0.012, 0.035, 0.004, 0.002);
      add(grp, slat, mats.paint, `IntakeLouver_${side}_${i}`, side * 0.03, y, -0.01, 0.18);
    }

  }
}

function buildKeelAndRails(root: THREE.Group, mats: Mats): void {
  add(root, roundedPlate(0.12, 1.55, 0.05, 0.03, 0.01), mats.hull, 'VentralKeel', 0, -0.2, 0.05, Math.PI / 2, 0, 0);
  add(root, roundedPlate(0.06, 0.9, 0.03, 0.02, 0.006), mats.paint, 'KeelBlade', 0, -0.24, 0.1, Math.PI / 2);

  SHIP_HARDPOINTS.forEach((p, i) => {
    add(root, roundedPlate(0.42, 0.045, 0.035, 0.02, 0.008), mats.hull, `WeaponRail_${i}`, p.x, p.y, p.z, -Math.PI / 2);
    add(root, new THREE.CylinderGeometry(0.016, 0.02, 0.18, 16), mats.paint, `RailPin_${i}`, p.x, p.y - 0.03, p.z, Math.PI / 2);
    add(root, new THREE.BoxGeometry(0.04, 0.02, 0.08), mats.hull, `RailClamp_${i}`, p.x, p.y - 0.05, p.z);
  });

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i++) {
      add(root, new THREE.BoxGeometry(0.04, 0.012, 0.055), mats.paint, `BellyVent_${side}_${i}`, side * 0.16, -0.195, 0.05 + i * 0.14);
    }
  }
}

function buildVTail(root: THREE.Group, mats: Mats): void {
  for (const side of [-1, 1] as const) {
    const fin = finShape(0.32, 0.36, 0.13);
    add(root, fin, mats.paint, `Stab_${side}`, side * 0.16, 0.14, 1.0, 0.08, Math.PI / 2, side * 0.48);
    const cap = roundedPlate(0.06, 0.14, 0.012, 0.02, 0.003);
    stampUv(cap, UV_MAG);
    add(root, cap, mats.hull, `StabCap_${side}`, side * 0.28, 0.46, 0.92, 0.15, 0, side * 0.48);
    const rudder = roundedPlate(0.028, 0.18, 0.01, 0.008, 0.002);
    stampUv(rudder, UV_CYAN);
    add(root, rudder, mats.hull, `Rudder_${side}`, side * 0.22, 0.3, 1.08, 0.08, 0, side * 0.48);
  }
  add(root, roundedPlate(0.16, 0.18, 0.04, 0.03, 0.008), mats.hull, 'StabFairing', 0, 0.22, 0.95, -Math.PI / 2);
}

function buildEngines(root: THREE.Group, mats: Mats): void {
  const tags: Array<'R' | 'L' | 'C'> = ['R', 'L', 'C'];
  SHIP_THRUSTERS.forEach((pos, i) => {
    const tag = tags[i];
    const scale = i === 2 ? 0.72 : 1;
    const pod = new THREE.Group();
    pod.name = `EnginePod_${tag}`;
    pod.position.copy(pos);
    pod.rotation.x = Math.PI / 2;
    root.add(pod);

    add(pod, nacelleLathe(scale), mats.hull, `Nacelle_${tag}`);
    add(pod, new THREE.CylinderGeometry(0.108 * scale, 0.118 * scale, 0.06 * scale, SEG_HI, 1, true), mats.paint, `CowlingBand_${tag}`, 0, 0.06 * scale, 0);

    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const fin = new THREE.BoxGeometry(0.008 * scale, 0.1 * scale, 0.028 * scale);
      add(pod, fin, mats.paint, `HeatFin_${tag}_${k}`, Math.cos(a) * 0.125 * scale, 0.02 * scale, Math.sin(a) * 0.125 * scale, 0, -a, 0);
    }

    const turbine = new THREE.TorusGeometry(0.045 * scale, 0.008 * scale, 8, 24);
    add(pod, turbine, mats.paint, `Turbine_${tag}`, 0, 0.04 * scale, 0, Math.PI / 2, 0, 0);
    add(pod, new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 0.02 * scale, 16), mats.hull, `Hub_${tag}`, 0, 0.03 * scale, 0);

    const nozzle = add(
      pod,
      new THREE.TorusGeometry(0.09 * scale, 0.012 * scale, 10, 28),
      mats.glow,
      `Nozzle_${tag}`,
      0,
      0.21 * scale,
      0
    );
    nozzle.name = `Nozzle_${tag}`;
    nozzle.rotation.x = Math.PI / 2;

    const glow = add(
      pod,
      new THREE.CylinderGeometry(0.055 * scale, 0.078 * scale, 0.1 * scale, SEG_HI),
      mats.glow,
      `EngineGlow_${tag}`,
      0,
      0.14 * scale,
      0
    );
    glow.name = `EngineGlow_${tag}`;

    const plume = add(
      pod,
      new THREE.ConeGeometry(0.075 * scale, 0.48 * scale, SEG, 1, true),
      mats.plume,
      `Plume_${tag}`,
      0,
      0.42 * scale,
      0
    );
    plume.name = `Plume_${tag}`;
    plume.renderOrder = 2;
    plume.frustumCulled = false;

    const pylon = tube(
      [
        new THREE.Vector3(0, -0.32 * scale, 0),
        new THREE.Vector3(i === 2 ? 0 : 0, -0.18 * scale, 0.02),
        new THREE.Vector3(0, -0.02 * scale, 0),
      ],
      0.035 * scale,
      10,
      12
    );
    add(pod, pylon, mats.paint, `Pylon_${tag}`);
  });
}

function buildGreeble(root: THREE.Group, mats: Mats): void {
  add(
    root,
    tube(
      [new THREE.Vector3(0.12, 0.12, 0.7), new THREE.Vector3(0.22, 0.08, 0.95), new THREE.Vector3(0.28, -0.02, 1.18)],
      0.012,
      16,
      8
    ),
    mats.paint,
    'Pipe_R'
  );
  add(
    root,
    tube(
      [new THREE.Vector3(-0.12, 0.12, 0.7), new THREE.Vector3(-0.22, 0.08, 0.95), new THREE.Vector3(-0.28, -0.02, 1.18)],
      0.012,
      16,
      8
    ),
    mats.paint,
    'Pipe_L'
  );
  add(
    root,
    tube(
      [new THREE.Vector3(0.08, -0.12, 0.4), new THREE.Vector3(0.18, -0.14, 0.75), new THREE.Vector3(0.22, -0.08, 1.05)],
      0.01,
      14,
      8
    ),
    mats.hull,
    'PipeBelly_R'
  );
  add(
    root,
    tube(
      [new THREE.Vector3(-0.08, -0.12, 0.4), new THREE.Vector3(-0.18, -0.14, 0.75), new THREE.Vector3(-0.22, -0.08, 1.05)],
      0.01,
      14,
      8
    ),
    mats.hull,
    'PipeBelly_L'
  );

  add(root, new THREE.CylinderGeometry(0.01, 0.014, 0.16, 12), mats.hull, 'Antenna_0', 0.06, 0.3, 0.55);
  add(root, new THREE.CylinderGeometry(0.006, 0.008, 0.1, 10), mats.paint, 'Antenna_1', 0.06, 0.38, 0.55);
  add(root, new THREE.SphereGeometry(0.012, 10, 8), mats.hull, 'AntennaBall', 0.06, 0.44, 0.55);
  const dish = new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
  add(root, dish, mats.paint, 'CommDish', -0.08, 0.3, 0.42, 0.6, 0.4, 0);

  for (let i = 0; i < 4; i++) {
    const z = -0.6 + i * 0.36;
    add(root, new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), mats.paint, `DorsalPort_${i}`, 0.11, 0.205, z);
    add(root, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), mats.hull, `DorsalPortWell_${i}`, 0.11, 0.198, z);
    add(root, new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), mats.paint, `DorsalPortL_${i}`, -0.11, 0.205, z);
    add(root, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), mats.hull, `DorsalPortWellL_${i}`, -0.11, 0.198, z);
  }

  for (let i = 0; i < 6; i++) {
    const z = -0.85 + i * 0.28;
    add(root, new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), mats.paint, `RivetR_${i}`, 0.18, 0.175, z);
    add(root, new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), mats.paint, `RivetL_${i}`, -0.18, 0.175, z);
  }

  for (const side of [-1, 1] as const) {
    add(root, new THREE.BoxGeometry(0.06, 0.035, 0.12), mats.hull, `HeatSinkBase_${side}`, side * 0.38, 0.08, 0.72);
    for (let k = 0; k < 4; k++) {
      add(root, new THREE.BoxGeometry(0.008, 0.055, 0.1), mats.paint, `HeatSink_${side}_${k}`, side * 0.38 + side * k * 0.012, 0.11, 0.72);
    }
  }

  add(root, new THREE.BoxGeometry(0.2, 0.03, 0.08), mats.paint, 'AftDeck', 0, 0.16, 0.82);
  add(root, new THREE.BoxGeometry(0.08, 0.05, 0.06), mats.hull, 'AftBox', 0, 0.2, 0.78);
}

function buildLights(root: THREE.Group, mats: Mats): void {
  SHIP_HEADLIGHTS.forEach((p, i) => {
    add(root, new THREE.BoxGeometry(0.07, 0.05, 0.08), mats.hull, `HeadHouse_${i}`, p.x, p.y, p.z + 0.04);
    const lens = new THREE.CircleGeometry(0.026, 20);
    stampUv(lens, UV_CYAN);
    const li = add(root, lens, mats.hull, `HeadLens_${i}`, p.x, p.y, p.z);
    li.rotation.x = Math.PI;
  });

  for (const side of [-1, 1] as const) {
    const uv = side > 0 ? UV_MAG : UV_CYAN;
    const nav = new THREE.SphereGeometry(0.03, 14, 12);
    stampUv(nav, uv);
    add(root, nav, mats.hull, `Nav_${side}`, side * 0.78, -0.04, 0.18);
  }
}

export function createNyxMako(): THREE.Group {
  const g = new THREE.Group();
  g.name = HERO_SHIP_NAME;
  const mats = createMaterials();
  buildFuselage(g, mats);
  buildHammerhead(g, mats);
  buildCanopy(g, mats);
  buildWings(g, mats);
  buildIntakes(g, mats);
  buildKeelAndRails(g, mats);
  buildVTail(g, mats);
  buildEngines(g, mats);
  buildGreeble(g, mats);
  buildLights(g, mats);
  g.userData.license = 'original';
  g.userData.hero = HERO_SHIP_NAME;
  return g;
}
