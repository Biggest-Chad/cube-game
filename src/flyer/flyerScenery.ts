/**
 * Dense flyer corridor scenery. WAVE29: authored corridor/* kit is PRIMARY mid look
 * (wired in flyerWipeoutGrammar). Legacy packs + Tripo singles remain as
 * on disk under public/flyer/. Instanced along the spline with path-local
 * (right, up, tangent) orientation. Caps keep mobile draw cost reasonable.
 */
import * as THREE from 'three';
import { pathDeckClearY } from './flyerWipeoutGrammar';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FlyerSceneId } from '../data/flyer';
import type { SplinePath } from './SplinePath';
import { PathFrame } from './SplinePath';
import type { GraphicsQuality } from '../data/graphics';
import { texturedPhong, metalPanelMap, emissiveStripMap } from './flyerSurfaceTex';

const loader = new GLTFLoader();

const URLS = {
  rings: './flyer/flyer_rings.glb',
  rails: './flyer/flyer_rails.glb',
  buoys: './flyer/flyer_buoys.glb',
  gates: './flyer/flyer_gates.glb',
  pads: './flyer/flyer_pads.glb',
  corridor: './flyer/flyer_corridor_dense.glb',
  ringTripo: './flyer/tunnel-ring.glb',
  railTripo: './flyer/banked-rail-segment.glb',
  gateTripo: './flyer/gate-arch.glb',
  buoyTripo: './flyer/hazard-buoy.glb',
  padTripo: './flyer/speed-pad.glb',
} as const;

type Kind = 'rings' | 'rails' | 'buoys' | 'gates' | 'pads' | 'corridor';

interface ProtoPart {
  geo: THREE.BufferGeometry;
  local: THREE.Matrix4;
  srcMat?: THREE.Material;
}

interface Proto {
  meshes: ProtoPart[];
  fit: number;
}

export interface FlyerSceneryLib {
  rings: Proto | null;
  rails: Proto | null;
  buoys: Proto | null;
  gates: Proto | null;
  pads: Proto | null;
  corridor: Proto | null;
  /** Always gate-arch.glb (industrial arch silhouette). */
  gateArch: Proto | null;
  /** Always banked-rail-segment.glb. */
  railSeg: Proto | null;
}

const TARGET: Record<Kind, number> = {
  rings: 17,
  rails: 9,
  buoys: 2.2,
  gates: 7,
  pads: 3.2,
  corridor: 22,
};

/** High-tier instance ceilings. Low uses ~40%. Rings are gates only â€” keep this low. */
const CAP_HIGH: Record<Kind, number> = {
  rings: 12,
  rails: 72,
  buoys: 36,
  gates: 18,
  pads: 12,
  corridor: 18, // WAVE29: kit primary; legacy pack sparse
};

export function sceneryCaps(quality: GraphicsQuality): Record<Kind, number> {
  const s = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
  return {
    rings: Math.max(4, Math.round(CAP_HIGH.rings * s)),
    rails: Math.max(10, Math.round(CAP_HIGH.rails * s)),
    buoys: Math.max(6, Math.round(CAP_HIGH.buoys * s)),
    gates: Math.max(4, Math.round(CAP_HIGH.gates * s)),
    pads: Math.max(3, Math.round(CAP_HIGH.pads * s)),
    corridor: Math.max(14, Math.round(CAP_HIGH.corridor * s)),
  };
}

function kitCap(quality: GraphicsQuality, high: number, floor = 4): number {
  const s = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
  return Math.max(floor, Math.round(high * s));
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _F = new PathFrame();
const _mat = new THREE.Matrix4();
const _pathZ = new THREE.Vector3();
const _tint = new THREE.Color();
const _emit = new THREE.Color();

let cache: Promise<FlyerSceneryLib> | null = null;
let resolved: FlyerSceneryLib | null = null;

export function getFlyerSceneryLib(): FlyerSceneryLib | null {
  return resolved;
}

export function preloadFlyerScenery(): Promise<FlyerSceneryLib> {
  if (!cache) cache = loadLib();
  return cache;
}

async function loadLib(): Promise<FlyerSceneryLib> {
  const rings = (await loadProto(URLS.rings, 'rings')) ?? (await loadProto(URLS.ringTripo, 'rings'));
  const rails = (await loadProto(URLS.rails, 'rails')) ?? (await loadProto(URLS.railTripo, 'rails'));
  const buoys = (await loadProto(URLS.buoys, 'buoys')) ?? (await loadProto(URLS.buoyTripo, 'buoys'));
  const gates = (await loadProto(URLS.gates, 'gates')) ?? (await loadProto(URLS.gateTripo, 'gates'));
  const pads = (await loadProto(URLS.pads, 'pads')) ?? (await loadProto(URLS.padTripo, 'pads'));
  const corridor = await loadProto(URLS.corridor, 'corridor');
  // WAVE6: always keep Tripo singles available for near-band densification (even when pack GLBs load).
  const gateArch = await loadProto(URLS.gateTripo, 'gates');
  const railSeg = await loadProto(URLS.railTripo, 'rails');
  resolved = { rings, rails, buoys, gates, pads, corridor, gateArch, railSeg };
  return resolved;
}

async function loadProto(url: string, kind: Kind): Promise<Proto | null> {
  try {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
    _box.getSize(_size);
    const maxDim = Math.max(_size.x, _size.y, _size.z);
    const fit = maxDim > 1e-4 ? TARGET[kind] / maxDim : 1;
    const meshes: Proto['meshes'] = [];
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((o) => {
      const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
      if (!mesh || !mesh.geometry) return;
      const local = new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld);
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (src) src.userData.shared = true;
      // WAVE8: strip baked vertex colors (terracotta lock in chase pixels).
      const geo = mesh.geometry;
      if (geo.getAttribute && geo.getAttribute('color')) {
        geo.deleteAttribute('color');
      }
      meshes.push({ geo, local, srcMat: src });
    });
    if (meshes.length === 0) return null;
    if (meshes.length > 12) {
      meshes.sort((a, b) => {
        a.geo.computeBoundingSphere();
        b.geo.computeBoundingSphere();
        return (b.geo.boundingSphere?.radius ?? 0) - (a.geo.boundingSphere?.radius ?? 0);
      });
      meshes.length = 12;
    }
    for (const m of meshes) m.geo.userData.shared = true;
    return { meshes, fit };
  } catch (err) {
    console.warn('[flyer-scenery] miss', url, err);
    return null;
  }
}

type SceneryMat = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | THREE.MeshPhongMaterial;

/** WAVE8 scrap-metal palette (yard FORCE) — steel greys, sparse rust, neon emissive. */
const SCRAP_STEELS = [0x4a5560, 0x5a6570, 0x6a7580, 0x7a8590, 0x8a949e];
const SCRAP_RUST = 0x6b3a2a;
const SCRAP_CYAN = 0x33ccee;
const SCRAP_MAGENTA = 0xff44aa;

function scrapSteelHex(salt: number): number {
  return SCRAP_STEELS[Math.abs(salt) % SCRAP_STEELS.length];
}

/**
 * WAVE8 T-R8-01: FORCE MeshPhong scrap kit for yard.
 * No GLB albedo maps. Specular+shininess metalness look. Cyan/magenta emissive strips sparingly.
 */
function yardScrapPhong(tint: number, opacity: number, quality: GraphicsQuality, partSalt = 0): THREE.MeshPhongMaterial {
  // WAVE12 R2: clamp to OPAQUE steel/neon — translucent slab mush failed Blind LIVE R2.
  opacity = opacity >= 0.85 ? 1 : opacity;
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  // Detect neon-ish tint -> keep as emissive strip; otherwise force steel grey.
  // Neon strip only when tint itself is neon; NEVER paint primary slabs rust/brown.
  const neonish = (b > r + 40 && b > 0xa0 && g > 0x60) || (r > 0xe0 && b > 0x90 && g < 0x80);
  // Rust sparingly as emissive accent only (not dominant albedo) — skip salt 0 (largest mesh).
  const rustAccent = partSalt > 0 && partSalt % 11 === 3;
  const color = neonish ? tint : scrapSteelHex(partSalt + r + g + b);
  const emissive = neonish
    ? new THREE.Color(tint).multiplyScalar(0.55)
    : rustAccent
      ? new THREE.Color(SCRAP_RUST).multiplyScalar(0.22)
      : partSalt % 5 === 0
        ? new THREE.Color(SCRAP_CYAN).multiplyScalar(0.4)
        : partSalt % 7 === 0
          ? new THREE.Color(SCRAP_MAGENTA).multiplyScalar(0.32)
          : new THREE.Color(0x2a8899).multiplyScalar(0.14);
  const map = metalPanelMap((partSalt % 5) + 1, neonish ? tint : SCRAP_CYAN);
  const emisMap = neonish || partSalt % 5 === 0 || partSalt % 7 === 0 ? emissiveStripMap(neonish ? tint : partSalt % 7 === 0 ? SCRAP_MAGENTA : SCRAP_CYAN) : null;
  return new THREE.MeshPhongMaterial({
    color,
    transparent: false,
    opacity: 1,
    toneMapped: false,
    fog: true,
    depthWrite: true,
    shininess: quality === 'high' ? 72 : 48,
    specular: new THREE.Color(0xa8b8c8),
    emissive,
    emissiveMap: emisMap ?? undefined,
    flatShading: false,
    map,
  });
}

function sceneryMaterial(
  src: THREE.Material | undefined,
  tint: number,
  opacity: number,
  quality: GraphicsQuality,
  sceneId?: FlyerSceneId,
  partSalt = 0
): SceneryMat {
  // WAVE12 R2: ALL scenes FORCE opaque MeshPhong scrap for corridor dress (no translucent cyan mush).
  if (sceneId === 'yard' || sceneId === 'canyon' || sceneId === 'rift' || sceneId === 'wormhole') {
    return yardScrapPhong(tint, Math.max(opacity, 1), quality, partSalt);
  }
  const common = {
    color: tint,
    transparent: false,
    opacity: 1,
    toneMapped: false,
    fog: true,
    depthWrite: true,
  };
  const mat: SceneryMat =
    quality === 'high'
      ? new THREE.MeshBasicMaterial(common)
      : new THREE.MeshLambertMaterial(common);
  if (mat instanceof THREE.MeshLambertMaterial) {
    const cool = ((tint >> 16) & 0xff) < 0xb0 && ((tint >> 8) & 0xff) > 0x70;
    if (cool) mat.emissive.setHex(tint).multiplyScalar(0.18);
  }
  if (quality === 'low' || !src) return mat;
  const std = src as THREE.MeshStandardMaterial;
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  const coolMetal = g >= r - 8 && b >= r - 4 && r < 0xc0;
  // WAVE8: never apply warm GLB albedo maps (terracotta lock) for canyon either when cool tint.
  if (std.map && !coolMetal) {
    // Reject warm-brown dominant maps even for non-cool tints on canyon/rift.
    const warmMap = true; // maps historically lock terracotta — skip for all chase stills safety
    if (!warmMap) {
      mat.map = std.map;
      mat.color.setHex(0xffffff);
      _tint.setHex(tint);
      mat.color.lerp(_tint, quality === 'high' ? 0.28 : 0.55);
    } else {
      mat.color.setHex(tint);
      if (mat instanceof THREE.MeshLambertMaterial) {
        mat.emissive.setHex(0x2a8899).multiplyScalar(0.22);
      }
    }
  } else if (coolMetal) {
    mat.color.setHex(tint);
    if (mat instanceof THREE.MeshLambertMaterial) {
      mat.emissive.setHex(0x33aacc).multiplyScalar(0.55);
    }
  }
  if (std.emissive && std.emissive.getHex() !== 0) {
    _emit.copy(std.emissive);
    const k = Math.min(1, (std.emissiveIntensity ?? 1) * 0.5);
    mat.color.lerp(_emit, k);
    if (mat instanceof THREE.MeshLambertMaterial) {
      mat.emissive.copy(_emit).multiplyScalar(0.45);
    }
  }
  if (quality === 'high' && std.emissiveMap && !mat.map) {
    mat.map = std.emissiveMap;
  }
  return mat;
}

function instanceKind(
  proto: Proto,
  count: number,
  color: number,
  opacity: number,
  quality: GraphicsQuality,
  place: (i: number) => void,
  root: THREE.Group,
  sceneId?: FlyerSceneId
): void {
  if (count <= 0) return;
  let partIdx = 0;
  for (const part of proto.meshes) {
    const mat = sceneryMaterial(part.srcMat, color, opacity, quality, sceneId, partIdx++);
    const inst = new THREE.InstancedMesh(part.geo, mat, count);
    inst.frustumCulled = true;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      place(i);
      _dummy.updateMatrix();
      _mat.copy(_dummy.matrix).multiply(part.local);
      inst.setMatrixAt(i, _mat);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.name = 'FlyerSceneryInst';
    root.add(inst);
  }
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function libHasCorridorPack(lib: FlyerSceneryLib): boolean {
  return !!(lib.rails || lib.corridor || lib.rings);
}

/** Single (non-instanced) hazard prop for collision nodes. Geometry is shared. */
export function makeHazardProp(
  lib: FlyerSceneryLib,
  kind: 'gates' | 'buoys' | 'pads',
  tint: number,
  quality: GraphicsQuality,
  worldSize: number
): THREE.Group | null {
  const proto = lib[kind];
  if (!proto) return null;
  const g = new THREE.Group();
  g.name = `FlyerHazard_${kind}`;
  const scale = proto.fit * (worldSize / TARGET[kind]);
  for (const part of proto.meshes) {
    // WAVE8: hazard props in yard also FORCE scrap Phong (no terracotta map).
    const mat = sceneryMaterial(part.srcMat, tint, 0.92, quality, undefined, 3);
    const mesh = new THREE.Mesh(part.geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(part.local);
    mesh.frustumCulled = true;
    g.add(mesh);
  }
  g.scale.setScalar(scale);
  return g;
}

/**
 * Instance modular GLBs along arc-length. Safe to call once lib resolves.
 * Parent group is named so dispose can skip double-adding.
 * Rings are sparse gates; WAVE6 packs corridor_dense + gate-arch + railSeg for ALL scenes.
 */
export function placeFlyerGlbScenery(
  root: THREE.Group,
  path: SplinePath,
  accent: number,
  glow: number,
  fill: number,
  quality: GraphicsQuality = 'medium',
  sceneId: FlyerSceneId = 'canyon'
): Promise<void> {
  const existing = root.getObjectByName('FlyerGlbScenery');
  if (existing) return preloadFlyerScenery().then(() => undefined);
  const pack = new THREE.Group();
  pack.name = 'FlyerGlbScenery';
  root.add(pack);

  const Sfull = path.length;
  // WAVE54: near-ahead scenery window only (rest never preloaded at t=0).
  const W54_SCENERY_AHEAD = 96;
  const S = Math.min(Sfull, W54_SCENERY_AHEAD);
  const cap = sceneryCaps(quality);
  const libP = preloadFlyerScenery();
  return libP.then((lib) => {
    if (!pack.parent) return;
    const pose = (s: number, x: number, y: number, sx: number, sy: number, sz: number) => {
      path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
      _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
      _pathZ.copy(_F.t).negate();
      _mat.makeBasis(_F.r, _F.u, _pathZ);
      _dummy.quaternion.setFromRotationMatrix(_mat);
      _dummy.scale.set(sx, sy, sz);
    };

    // Gates only â€” do not tile the corridor with torus rings.
    if (lib.rings) {
      const n = Math.min(cap.rings, Math.max(4, Math.floor(S / 90)));
      const fit = lib.rings.fit * (sceneId === 'wormhole' ? 0.85 : 1);
      instanceKind(
        lib.rings,
        n,
        sceneId === 'wormhole' ? 0xff44dd : accent,
        sceneId === 'wormhole' ? 0.7 : 0.5,
        quality,
        (i) => {
          const s = ((i + 0.5) / n) * (S - 8) + 4;
          pose(s, 0, 0, fit, fit, fit);
        },
        pack,
        sceneId
      );
    }

    // Rocky / industrial rails â€” skip wormhole (energy kit replaces them).
    if (lib.rails && sceneId !== 'wormhole') {
      const n = Math.min(cap.rails, Math.max(16, Math.floor(S / 14)));
      const fit = lib.rails.fit;
      const y = sceneId === 'yard' ? 6.8 : sceneId === 'rift' ? 1.2 : 0.4;
      const xOff = sceneId === 'yard' ? 11.2 : 8.4;
      instanceKind(
        lib.rails,
        n,
        sceneId === 'yard' ? 0x8a969e : sceneId === 'rift' ? 0xb8e8ff : fill,
        0.95,
        quality,
        (i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const s = ((Math.floor(i / 2) + 0.35) / Math.max(1, n / 2)) * (S - 10) + 5;
          pose(s, side * (xOff + (i % 3) * 0.35), y, fit, fit, fit);
        },
        pack,
        sceneId
      );
    }

    if (lib.buoys) {
      const n = Math.min(cap.buoys, Math.max(10, Math.floor(S / 26)));
      const fit = lib.buoys.fit;
      instanceKind(
        lib.buoys,
        n,
        sceneId === 'rift' ? 0xd8f8ff : glow,
        0.85,
        quality,
        (i) => {
          const s = ((i + 0.2) / n) * (S - 16) + 8;
          const side = hash(i, 5) > 0.5 ? 1 : -1;
          pose(
            s,
            side * (5.2 + hash(i, 9) * 3.4),
            Math.max(pathDeckClearY(fit * 0.35, 0.08), (hash(i, 11) - 0.4) * 3.2),
            fit,
            fit,
            fit
          );
        },
        pack,
        sceneId
      );
    }

    if (lib.gates) {
      const n = Math.min(
        cap.gates,
        Math.max(4, Math.floor(S / (sceneId === 'wormhole' ? 42 : 70)))
      );
      const fit = lib.gates.fit;
      instanceKind(
        lib.gates,
        n,
        sceneId === 'wormhole' ? 0xff44dd : glow,
        sceneId === 'wormhole' ? 0.78 : 0.62,
        quality,
        (i) => {
          const s = ((i + 0.5) / n) * (S - 24) + 12;
          pose(s, 0, pathDeckClearY(fit * 0.15, 0.1), fit, fit, fit);
        },
        pack,
        sceneId
      );
    }

    // WAVE21b HOTFIX: skip scenery pad dumps — grammar BoostTiles own cyan checkers on deck
    // (was: instanceKind(lib.pads, ...) at y=-2.6 — giant floating checkers)

    // WAVE12 LIVE: even denser continuous corridor shell — dual-bank walls, tighter spacing.
    // Raise wormhole/yard/rift toward canyon motion density; tighter path spacing fills >0.5s voids.
    if (lib.corridor && cap.corridor > 0) {
      // WAVE11: densMul floor ~canyon for every scene; smaller S-spacing so chase never opens empty.
      // T-LIVE-R1-01/02: push canyon+yard live corridor denser than W11 baseline.
      // WAVE12: yard densMul == canyon; wormhole/rift raised; spacing reduced further.
      const densMul =
        sceneId === 'canyon' || sceneId === 'yard' ? 7.4 : sceneId === 'rift' ? 5.8 : 5.5;
      const spacing = sceneId === 'canyon' || sceneId === 'yard' ? 1.55 : 2.15;
      const n = Math.min(
        Math.round(cap.corridor * densMul),
        Math.max(128, Math.floor(S / spacing))
      );
      const fit =
        lib.corridor.fit *
        (sceneId === 'wormhole' ? 0.48 : sceneId === 'rift' ? 0.55 : sceneId === 'yard' ? 0.52 : 0.55);
      // Yard: cold scrap metal (not terracotta). Canyon: steel-waste.
      const tint =
        sceneId === 'yard'
          ? 0x6a7580
          : sceneId === 'rift'
            ? 0xa8d8e8
            : sceneId === 'wormhole'
              ? 0xc080e0
              : 0x7a8898;
      instanceKind(
        lib.corridor,
        n,
        tint,
        1,
        quality,
        (i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = ((i + 0.28) / n) * (S - 14) + 6;
          // WAVE12 R2: continuous dual-side WALLS (opaque dress) — not sparse elevated pillar mush.
          const band = i % 6;
          const x =
            band === 1
              ? side * (1.55 + hash(i, 4) * 0.45) // near wall skin
              : band === 3
                ? side * (2.35 + hash(i, 4) * 0.7)
                : side * (3.1 + hash(i, 4) * 1.1);
          const y =
            band === 2 || band === 5
              ? 1.8 + hash(i, 6) * 2.4 // mid wall mass (not floating high mush)
              : band === 3
                ? 0.6 + hash(i, 6) * 1.8
                : 0.15 + hash(i, 6) * 3.2;
          const sc = fit * (0.85 + hash(i, 8) * 0.4);
          // Stretch into wall panels along path (solid silhouette)
          pose(sPos, x, y, sc * 0.7, sc * (1.4 + (band % 2) * 0.6), sc * 1.35);
        },
        pack,
        sceneId
      );
    }

    // WAVE7: gate-arch.glb denser + elevated into sky-establish frustum; yard = metal+neon.
    if (lib.gateArch) {
      // WAVE11: gate-arch continuous along spline for ALL scenes (fill between clusters).
      const nArch = Math.min(
        kitCap(quality, sceneId === 'canyon' || sceneId === 'yard' ? 112 : sceneId === 'rift' ? 88 : 84, 32),
        Math.max(80, Math.floor(S / (sceneId === 'canyon' || sceneId === 'yard' ? 2.8 : 3.2)))
      );
      const fit = lib.gateArch.fit * (sceneId === 'wormhole' ? 0.72 : sceneId === 'yard' ? 0.9 : 0.85);
      // Yard scrap steel + cyan neon accent (NOT terracotta).
      const tint =
        sceneId === 'yard'
          ? 0x8a949e
          : sceneId === 'rift'
            ? 0x9ef2ff
            : sceneId === 'wormhole'
              ? 0xff55dd
              : 0x66e8ff;
      instanceKind(lib.gateArch,
        nArch,
        tint,
        1,
        quality,
        (i) => {
          const sPos = ((i + 0.35) / nArch) * (S - 16) + 8;
          const side = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : -1;
          const x = side === 0 ? 0 : side * (3.2 + hash(i, 2) * 1.8);
          // WAVE8: more elevated arches in canyon/yard sky-establish frustum (= hairpin density).
          const y =
            sceneId === 'canyon' || sceneId === 'yard'
              ? i % 2 === 0
                ? 4.2 + hash(i, 5) * 5.5
                : i % 3 === 0
                  ? 3.0 + hash(i, 5) * 3.8
                  : 1.2 + hash(i, 5) * 2.4
              : i % 3 === 0
                ? 3.8 + hash(i, 5) * 4.2
                : i % 5 === 0
                  ? 2.4 + hash(i, 5) * 2.2
                  : 0.15 + hash(i, 5) * 1.0;
          pose(sPos, x, y, fit, fit, fit);
        }, pack, sceneId);
    }

    // WAVE7: denser banked-rail into elevated sky frustum; yard = brushed metal.
    if (lib.railSeg) {
      // WAVE11: railSeg path-side ribbons, tight spacing ALL scenes.
      const nRail = Math.min(
        kitCap(quality, sceneId === 'canyon' || sceneId === 'yard' ? 210 : sceneId === 'rift' ? 170 : 165, 56),
        Math.max(128, Math.floor(S / (sceneId === 'canyon' || sceneId === 'yard' ? 1.85 : 2.2)))
      );
      const fit = lib.railSeg.fit * 0.68;
      const tint =
        sceneId === 'yard'
          ? 0x5a6570
          : sceneId === 'rift'
            ? 0xb0e8f8
            : sceneId === 'wormhole'
              ? 0xd070e8
              : 0x8a9aa8;
      instanceKind(
        lib.railSeg,
        nRail,
        tint,
        1,
        quality,
        (i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = ((Math.floor(i / 2) + 0.25) / Math.max(1, nRail / 2)) * (S - 10) + 5;
          const x = side * (3.0 + (i % 4) * 0.55 + hash(i, 3) * 1.2);
          const y =
            i % 4 === 0
              ? 5.0 + hash(i, 7) * 5.5
              : sceneId === 'yard' || sceneId === 'canyon'
                ? 1.5 + hash(i, 7) * 4.8
                : 0.4 + hash(i, 7) * 2.8;
          pose(sPos, x, y, fit, fit, fit);
        },
        pack,
        sceneId
      );
    }

    // WAVE11 LIVE: continuous path-side wall ribbons + establish fillers for ALL scenes.
    // Goal: chase never opens into empty look-up for >~0.5s of path.
    if (lib.corridor || lib.gateArch || lib.railSeg) {
      const est0 = S * 0.02;
      const est1 = S * 0.98;
      const estSpan = Math.max(12, est1 - est0);
      if (lib.corridor) {
        const nFill = kitCap(quality, sceneId === 'canyon' || sceneId === 'yard' ? 110 : sceneId === 'rift' ? 92 : 90, 40);
        const fit = lib.corridor.fit * (sceneId === 'yard' ? 0.5 : sceneId === 'wormhole' ? 0.46 : 0.56);
        const tint =
          sceneId === 'yard' ? 0x6a7580 : sceneId === 'rift' ? 0xa8d8e8 : sceneId === 'wormhole' ? 0xc080e0 : 0x7a8898;
        instanceKind(
          lib.corridor,
          nFill,
          tint,
          1,
          quality,
          (i) => {
            const side = i % 2 === 0 ? 1 : -1;
            const sPos = est0 + ((i + 0.2) / nFill) * estSpan;
            const band = i % 5;
            const x =
              band === 0
                ? side * (1.6 + hash(i, 4) * 1.1)
                : band === 1
                  ? 0
                  : side * (3.4 + hash(i, 4) * 2.6);
            const y =
              band === 2 || band === 4
                ? 6.5 + hash(i, 6) * 8.5
                : band === 3
                  ? 4.2 + hash(i, 6) * 5.0
                  : band === 1
                    ? 0.4 + hash(i, 6) * 2.2
                    : 1.2 + hash(i, 6) * 3.2;
            const sc = fit * (0.75 + hash(i, 8) * 0.5);
            pose(sPos, x, y, sc, sc, sc);
          },
          pack,
          sceneId
        );
      }
      if (lib.gateArch) {
        const nFill = kitCap(quality, sceneId === 'canyon' || sceneId === 'yard' ? 72 : sceneId === 'rift' ? 60 : 58, 28);
        const fit = lib.gateArch.fit * (sceneId === 'yard' ? 0.88 : sceneId === 'wormhole' ? 0.7 : 0.9);
        const tint =
          sceneId === 'yard' ? 0x8a949e : sceneId === 'rift' ? 0x9ef2ff : sceneId === 'wormhole' ? 0xff55dd : 0x66e8ff;
        instanceKind(
          lib.gateArch,
          nFill,
          tint,
          1,
          quality,
          (i) => {
            const sPos = est0 + ((i + 0.4) / nFill) * estSpan;
            const side = i % 3 === 0 ? 0 : i % 2 === 0 ? 1 : -1;
            const x = side === 0 ? 0 : side * (2.8 + hash(i, 2) * 2.0);
            const y = i % 3 === 0 ? 1.8 + hash(i, 5) * 3.5 : 5.0 + hash(i, 5) * 8.0;
            pose(sPos, x, y, fit, fit, fit);
          },
          pack,
          sceneId
        );
      }
      if (lib.railSeg) {
        const nFill = kitCap(quality, sceneId === 'canyon' || sceneId === 'yard' ? 130 : sceneId === 'rift' ? 105 : 100, 44);
        const fit = lib.railSeg.fit * 0.72;
        const tint =
          sceneId === 'yard' ? 0x5a6570 : sceneId === 'rift' ? 0xb0e8f8 : sceneId === 'wormhole' ? 0xd070e8 : 0x8a9aa8;
        instanceKind(
          lib.railSeg,
          nFill,
          tint,
          1,
          quality,
          (i) => {
            const side = i % 2 === 0 ? 1 : -1;
            const sPos = est0 + ((Math.floor(i / 2) + 0.15) / Math.max(1, nFill / 2)) * estSpan;
            const x = side * (2.6 + (i % 5) * 0.5 + hash(i, 3) * 1.4);
            const y = i % 4 === 0 ? 0.6 + hash(i, 7) * 2.8 : 4.2 + hash(i, 7) * 7.5;
            pose(sPos, x, y, fit, fit, fit);
          },
          pack,
          sceneId
        );
      }
      // WAVE11: skip pale floor-band decks (they flash as grey cards in chase). Prefer dark fog only.
      // Continuous path-side WALL RIBBONS — repeating corridor shell every ~2.2 path units, both banks.
      if (lib.corridor) {
        // T-LIVE-R1-01/02: tighter wall ribbons on canyon/yard live chase.
        // WAVE12: denser dual-bank ribbons (canyon/yard ~1.15; wormhole/rift ~1.5 helix gaps).
        const step = sceneId === 'canyon' || sceneId === 'yard' ? 1.15 : 1.5;
        const nRibbon = Math.min(kitCap(quality, 280, 100), Math.max(120, Math.floor(S / step) * 2));
        const fit = lib.corridor.fit * (sceneId === 'wormhole' ? 0.44 : sceneId === 'rift' ? 0.5 : 0.54);
        const tint =
          sceneId === 'yard'
            ? 0x5a6570
            : sceneId === 'rift'
              ? 0x90c0d0
              : sceneId === 'wormhole'
                ? 0xa060c0
                : 0x6a7888;
        instanceKind(
          lib.corridor,
          nRibbon,
          tint,
          1,
          quality,
          (i) => {
            const side = i % 2 === 0 ? 1 : -1;
            const pair = Math.floor(i / 2);
            const sPos = Math.min(S - 4, 3 + pair * step + (hash(pair, 1) - 0.5) * 0.35);
            const x = side * (2.0 + (pair % 3) * 0.4 + hash(i, 4) * 0.55);
            // Continuous mid-height wall mass — avoid empty mid-path look-up collapse
            const y = (pair % 4 === 0 ? 2.4 : pair % 4 === 1 ? 1.0 : pair % 4 === 2 ? 3.6 : 0.45) + hash(i, 6) * 0.9;
            const sc = fit * (0.95 + hash(i, 8) * 0.25);
            pose(sPos, x, y, sc * 0.75, sc * (1.55 + (pair % 2) * 0.45), sc * 1.5);
          },
          pack,
          sceneId
        );
        // WAVE12 dual-bank phase-offset: second wall shell half-step ahead so look-up never empties.
        const step2 = step * 0.5;
        const nRibbon2 = Math.min(kitCap(quality, 200, 80), Math.max(80, Math.floor(S / step) * 2));
        instanceKind(
          lib.corridor,
          nRibbon2,
          tint,
          1,
          quality,
          (i) => {
            const side = i % 2 === 0 ? -1 : 1;
            const pair = Math.floor(i / 2);
            const sPos = Math.min(S - 4, 3 + step2 + pair * step + (hash(pair, 2) - 0.5) * 0.25);
            const x = side * (2.6 + (pair % 3) * 0.65 + hash(i, 5) * 1.1);
            const y =
              (pair % 5 === 0
                ? 6.2
                : pair % 5 === 1
                  ? 2.4
                  : pair % 5 === 2
                    ? 4.6
                    : pair % 5 === 3
                      ? 0.55
                      : 7.5) + hash(i, 6) * 1.2;
            const sc = fit * (0.78 + hash(i, 8) * 0.4);
            pose(sPos, x, y, sc * 1.05, sc * (1.0 + (pair % 2) * 0.3), sc);
          },
          pack,
          sceneId
        );
      }
      if (lib.gateArch) {
        const stepA = sceneId === 'canyon' || sceneId === 'yard' ? 2.9 : 3.6;
        const nArchRibbon = Math.min(kitCap(quality, 120, 48), Math.max(56, Math.floor(S / stepA)));
        const fit = lib.gateArch.fit * (sceneId === 'wormhole' ? 0.68 : 0.86);
        const tint =
          sceneId === 'yard'
            ? 0x8a949e
            : sceneId === 'rift'
              ? 0x9ef2ff
              : sceneId === 'wormhole'
                ? 0xff55dd
                : 0x66e8ff;
        instanceKind(
          lib.gateArch,
          nArchRibbon,
          tint,
          1,
          quality,
          (i) => {
            const sPos = Math.min(S - 6, 6 + i * stepA + hash(i, 2) * 0.8);
            const side = i % 5 === 0 ? 0 : i % 2 === 0 ? 1 : -1;
            const x = side === 0 ? 0 : side * (2.6 + hash(i, 3) * 1.4);
            const y = side === 0 ? 0.4 + hash(i, 5) * 1.2 : 2.2 + hash(i, 5) * 4.5;
            pose(sPos, x, y, fit, fit, fit);
          },
          pack,
          sceneId
        );
      }
      if (lib.railSeg) {
        const stepR = sceneId === 'canyon' || sceneId === 'yard' ? 0.95 : 1.25;
        const nRailRibbon = Math.min(kitCap(quality, 300, 110), Math.max(140, Math.floor(S / stepR) * 2));
        const fit = lib.railSeg.fit * 0.7;
        const tint =
          sceneId === 'yard'
            ? 0x5a6570
            : sceneId === 'rift'
              ? 0xb0e8f8
              : sceneId === 'wormhole'
                ? 0xd070e8
                : 0x8a9aa8;
        instanceKind(
          lib.railSeg,
          nRailRibbon,
          tint,
          1,
          quality,
          (i) => {
            const side = i % 2 === 0 ? 1 : -1;
            const pair = Math.floor(i / 2);
            const sPos = Math.min(S - 3, 2.5 + pair * stepR);
            const x = side * (2.8 + (pair % 4) * 0.4 + hash(i, 3) * 0.8);
            const y = pair % 3 === 0 ? 4.8 + hash(i, 7) * 3.5 : 0.8 + hash(i, 7) * 2.6;
            pose(sPos, x, y, fit, fit, fit);
          },
          pack,
          sceneId
        );
      }
    }

        // WAVE8 T-R8-01 CRITICAL: after all yard GLB instances, strip any residual map/albedo.
    if (sceneId === 'yard') {
      pack.traverse((o) => {
        const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
        if (!mesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (let mi = 0; mi < mats.length; mi++) {
          const m = mats[mi] as THREE.MeshPhongMaterial | THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
          if (!m) continue;
          if ('map' in m && m.map) {
            m.map = null;
            m.needsUpdate = true;
          }
          // Crush any warm brown/pink residual color into steel grey.
          if ('color' in m && m.color) {
            const c = m.color;
            if (c.r > c.g + 0.05 && c.r > c.b + 0.05) {
              c.setHex(scrapSteelHex(mi + 2));
            }
            if (c.r > 0.45 && c.g > 0.28 && c.g < 0.5 && c.b < 0.4) {
              c.setHex(0x6a7580);
            }
            // Crush pink/lilac/terracotta leftovers into steel.
            if (c.r > 0.35 && c.b > 0.35 && c.g < c.r - 0.05) {
              c.setHex(0x7a8590);
            }
            if (c.r > c.b + 0.08 && c.r > c.g + 0.05) {
              c.setHex(scrapSteelHex(mi + 5));
            }
          }
          if (m instanceof THREE.MeshPhongMaterial) {
            m.shininess = Math.max(m.shininess, 48);
            m.specular.setHex(0xa8b8c8);
          }
        }
      });
    }

  });
}

function instanceGeo(
  geo: THREE.BufferGeometry,
  count: number,
  color: number,
  opacity: number,
  quality: GraphicsQuality,
  additive: boolean,
  place: (i: number) => void,
  root: THREE.Group,
  name: string
): void {
  if (count <= 0) return;
  // WAVE5: lit Phong kits (industrial silhouette under hemi/key/fill). Additive neon stays Basic.
  const mat: THREE.Material = additive
    ? new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: true,
      })
    : (() => {
        // WAVE14: Wipeout-grade panel/deck textures on ALL procedural kit instances.
        const kind =
          /Deck|Floor|Curb|Plate|Stub/i.test(name) ? 'deck' :
          /Ice|Rift/i.test(name) ? 'ice' :
          /Wall|Pillar|Mast|Leg|Truss|Gantry|Span|Arch/i.test(name) ? 'wall' :
          'prop';
        const neon = (color & 0xff) > 0xb0 && ((color >> 16) & 0xff) < 0x80 ? color : 0x44f0ff;
        return texturedPhong(color, quality, kind as 'wall' | 'deck' | 'ice' | 'prop', neon);
      })();
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.frustumCulled = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.name = name;
  for (let i = 0; i < count; i++) {
    place(i);
    _dummy.updateMatrix();
    inst.setMatrixAt(i, _dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  root.add(inst);
}

/**
 * WAVE5 per-scene lit kitbashed INDUSTRIAL midground.
 * Kill MeshBasic box/cone dumps â€” pipes, trusses, wreckage plates, dock legs,
 * denser wormhole ribs/arches + rift industrial ice.
 */
export function placeFlyerMidgroundKits(
  root: THREE.Group,
  path: SplinePath,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality = 'medium'
): void {
  if (root.getObjectByName('FlyerMidground')) return;
  const pack = new THREE.Group();
  pack.name = 'FlyerMidground';
  root.add(pack);
  const S = path.length;
  // WAVE12 R2: yard/canyon dens match wormhole/rift-class continuous dress.
  const dens = sceneId === 'wormhole' || sceneId === 'rift' ? 1.85 : sceneId === 'yard' || sceneId === 'canyon' ? 1.85 : 1.5;
  const pose = (s: number, x: number, y: number, sx: number, sy: number, sz: number, yaw = 0) => {
    path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
    _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
    _pathZ.copy(_F.t).negate();
    _mat.makeBasis(_F.r, _F.u, _pathZ);
    _dummy.quaternion.setFromRotationMatrix(_mat);
    if (yaw !== 0) _dummy.rotateY(yaw);
    _dummy.scale.set(sx, sy, sz);
  };
  const cap = (high: number, floor = 6) =>
    Math.max(floor, Math.round(kitCap(quality, high, floor) * dens));

  // WAVE13 COHERENCE LOCK (owner visual lock):
  // Continuous structural ground/deck/shell that props attach to — worlds feel HELD UP.
  // No orphan floating trash in black void. Midground = architecture of a place.
  {
    // WAVE14 WIPEOUT DENSITY: continuous overlapping deck + tall dual wall ribbons (textured via instanceGeo).
    const nDeck = Math.max(110, Math.round(cap(sceneId === 'wormhole' ? 90 : 160, 80)));
    const deckCol =
      sceneId === 'wormhole' ? 0x2a1840 :
      0xffffff; // WAVE15: white multiply so graphite CanvasTexture reads
    const deckW = sceneId === 'wormhole' ? 11 : sceneId === 'rift' ? 18 : sceneId === 'yard' ? 24 : 20;
    const deck = new THREE.BoxGeometry(1, 1, 1);
    instanceGeo(deck, nDeck, deckCol, 1, quality, false, (i) => {
      const sPos = ((i + 0.01) / nDeck) * (S - 1) + 0.5;
      pose(sPos, 0, -0.85, deckW, 0.9, sceneId === 'wormhole' ? 3.6 : 6.2);
    }, pack, 'FlyerCoherenceDeck');
    const nDeck2 = Math.max(90, Math.round(cap(120, 60)));
    instanceGeo(deck, nDeck2, deckCol, 1, quality, false, (i) => {
      const sPos = ((i + 0.5) / nDeck2) * (S - 1) + 0.5;
      pose(sPos, (i % 2 === 0 ? 1 : -1) * 2.4, -1.2, deckW * 0.6, 0.55, 4.2);
    }, pack, 'FlyerCoherenceDeckB');

    const nWall = Math.max(160, Math.round(cap(220, 110)));
    const wallCol =
      sceneId === 'yard' ? 0x5a6570 :
      sceneId === 'rift' ? 0x4a7088 :
      sceneId === 'wormhole' ? 0x2a1840 :
      0x5a6a78;
    const wall = new THREE.BoxGeometry(0.9, 1, 1);
    instanceGeo(wall, nWall, wallCol, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.02) / nWall) * (S - 1) + 0.5;
      const h = sceneId === 'wormhole' ? 7 + hash(i, 2) * 3 : 14 + hash(i, 2) * 8;
      const x = side * (sceneId === 'wormhole' ? 3.5 : sceneId === 'rift' ? 4.1 : 4.4);
      pose(sPos, x, h * 0.5 - 1.35, 1.7, h, sceneId === 'wormhole' ? 3.0 : 5.0);
    }, pack, 'FlyerCoherenceWall');

    const nWall2 = Math.max(140, Math.round(cap(190, 90)));
    instanceGeo(wall, nWall2, wallCol, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const sPos = ((i + 0.5) / nWall2) * (S - 1) + 0.5;
      const h = sceneId === 'wormhole' ? 6 + hash(i, 3) * 2.8 : 11 + hash(i, 3) * 7;
      const x = side * (sceneId === 'wormhole' ? 3.8 : sceneId === 'rift' ? 4.6 : 5.2);
      pose(sPos, x, h * 0.5 - 1.35, 1.6, h, sceneId === 'wormhole' ? 2.8 : 4.6);
    }, pack, 'FlyerCoherenceWallB');

    // Overhead cross-beams spanning walls — architecture of a place, props hang from structure.
    const nSpan = Math.max(28, Math.round(cap(44, 20)));
    const span = new THREE.BoxGeometry(1, 0.35, 0.35);
    instanceGeo(span, nSpan, sceneId === 'wormhole' ? 0x503070 : 0x6a7888, 1, quality, false, (i) => {
      const sPos = ((i + 0.2) / nSpan) * (S - 6) + 3;
      const y = sceneId === 'wormhole' ? 3.8 : 5.2 + hash(i, 2) * 2.5;
      const w = sceneId === 'wormhole' ? 7.4 : 9.6;
      pose(sPos, 0, y, w, 1, 1);
    }, pack, 'FlyerCoherenceSpan');

    const nCurb = Math.max(56, Math.round(cap(84, 40)));
    const curb = new THREE.BoxGeometry(1, 1, 1);
    instanceGeo(curb, nCurb, sceneId === 'yard' ? 0x5a6870 : 0x556070, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.08) / nCurb) * (S - 2) + 1;
      const x = side * (sceneId === 'wormhole' ? 3.2 : 4.0);
      pose(sPos, x, -1.05, 1.6, 0.65, 3.2);
    }, pack, 'FlyerCoherenceCurb');
  }

  // WAVE13 scene shells: wormhole = tube ribs on shell; rift = ice canyon plates; yard = dock plate rooted cranes.

  if (sceneId === 'canyon') {
    // Industrial scrap: dock legs, pipe runs, truss towers, wreckage plates, neon spars.
    const nLeg = cap(30, 14);
    const leg = new THREE.CylinderGeometry(0.35, 0.55, 1, 6);
    // WAVE13: dock legs stand on coherence deck / wall feet — not hanging in void.
    instanceGeo(leg, nLeg, 0x6a7a88, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.3) / nLeg) * (S - 16) + 8;
      const h = 6 + hash(i, 2) * 8;
      pose(s, side * (6.2 + hash(i, 4) * 2.2), h * 0.5 - 1.45, 1, h, 1);
    }, pack, 'FlyerDockLeg');

    const nPipe = cap(34, 16);
    const pipe = new THREE.CylinderGeometry(0.22, 0.22, 1, 6);
    instanceGeo(pipe, nPipe, 0x7a8894, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.18) / nPipe) * (S - 14) + 7;
      const vert = i % 3 !== 0;
      if (vert) {
        const h = 5 + hash(i, 5) * 8;
        pose(s, side * (8.4 + hash(i, 3) * 3.5), h * 0.5 - 0.4, 1, h, 1);
      } else {
        const len = 6 + hash(i, 7) * 5;
        pose(s, side * (7.5 + hash(i, 3) * 2), 2.2 + hash(i, 9) * 3, len, 1, 1, Math.PI / 2);
      }
    }, pack, 'FlyerPipeRun');

    const nTruss = cap(22, 10);
    const mast = new THREE.BoxGeometry(0.45, 1, 0.45);
    // WAVE13: truss masts rooted to deck beside megacity walls.
    instanceGeo(mast, nTruss, 0x5a6a78, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.4) / nTruss) * (S - 18) + 9;
      const h = 8 + hash(i, 2) * 8;
      pose(s, side * (6.8 + hash(i, 4) * 1.5), h * 0.5 - 1.45, 1.1, h, 1.1);
    }, pack, 'FlyerTrussMast');
    const cross = new THREE.BoxGeometry(1, 0.22, 0.22);
    instanceGeo(cross, nTruss * 2, 0x8a9aa8, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = g % 2 === 0 ? 1 : -1;
      const tier = i % 2;
      const s = ((g + 0.4) / nTruss) * (S - 18) + 9;
      const h = 11 + hash(g, 2) * 12;
      const len = 4.5 + hash(g, 6) * 2;
      pose(s, side * (11.5 + hash(g, 4) * 3), h * (0.35 + tier * 0.35), len, 1, 1);
    }, pack, 'FlyerTrussCross');

    // WAVE9 T-R9-05: kitbashed scrap decks (plate + L-beam rim) instead of flat slabs.
    const nPlate = cap(30, 14);
    const plate = new THREE.BoxGeometry(2.8, 0.18, 1.6);
    instanceGeo(plate, nPlate, 0x5a6878, 1, quality, false, (i) => {
      const side = hash(i, 1) > 0.5 ? 1 : -1;
      const s = ((i + 0.22) / nPlate) * (S - 20) + 10;
      pose(s, side * (7.8 + hash(i, 3) * 4), -0.5 + hash(i, 5) * 2.4, 1.4 + hash(i, 7), 1, 1.2 + hash(i, 9), hash(i, 11) * 0.9);
    }, pack, 'FlyerWreckPlate');
    const nDeckL = cap(22, 10);
    const deckL = new THREE.BoxGeometry(3.1, 0.12, 0.22);
    instanceGeo(deckL, nDeckL, 0x7a8898, 1, quality, false, (i) => {
      const side = hash(i, 2) > 0.5 ? 1 : -1;
      const s = ((i + 0.4) / nDeckL) * (S - 20) + 10;
      pose(s, side * (7.5 + hash(i, 4) * 3.5), 0.2 + hash(i, 6) * 3.2, 1.2 + hash(i, 8), 1, 1, hash(i, 10) * 1.2);
    }, pack, 'FlyerScrapDeckRim');
    const nDeckStub = cap(18, 8);
    const deckStub = new THREE.BoxGeometry(0.22, 0.12, 1.8);
    instanceGeo(deckStub, nDeckStub, 0x4a5868, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.55) / nDeckStub) * (S - 18) + 9;
      pose(s, side * (8.2 + hash(i, 3) * 3), 0.4 + hash(i, 5) * 2.8, 1, 1, 1.1 + hash(i, 7));
    }, pack, 'FlyerScrapDeckStub');

    const nNeon = cap(18, 8);
    const neon = new THREE.BoxGeometry(0.16, 1, 0.16);
    instanceGeo(neon, nNeon, pal.glow, 0.85, quality, true, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.45) / nNeon) * (S - 18) + 9;
      const h = 6 + hash(i, 2) * 10;
      pose(s, side * (9.8 + hash(i, 4) * 3), h * 0.5, 1, h, 1);
    }, pack, 'FlyerNeonSpar');

    const nAntenna = cap(12, 6);
    const ant = new THREE.CylinderGeometry(0.1, 0.28, 1, 5);
    instanceGeo(ant, nAntenna, 0x44f0ff, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.55) / nAntenna) * (S - 22) + 12;
      const h = 14 + hash(i, 2) * 10;
      pose(s, side * (12.5 + hash(i, 4) * 2), h * 0.5 - 0.8, 1, h, 1);
    }, pack, 'FlyerScrapAntenna');
  } else if (sceneId === 'wormhole') {
    // Dense authored data corridor: ribs, arches, pipe rails, lattice spires, holo panels.
    const nRib = cap(42, 22);
    const rib = new THREE.TorusGeometry(7.0, 0.32, 6, 24, Math.PI * 1.2);
    instanceGeo(rib, nRib, 0xff33cc, 0.78, quality, true, (i) => {
      const s = ((i + 0.28) / nRib) * (S - 12) + 5;
      const sc = 0.92 + (i % 4) * 0.05;
      pose(s, 0, 0.15 + (i % 3) * 0.2, sc, sc, sc, (i % 5) * 0.08);
    }, pack, 'FlyerDataRib');

    const nArch = cap(28, 14);
    const arch = new THREE.TorusGeometry(5.4, 0.22, 5, 18, Math.PI);
    instanceGeo(arch, nArch, 0x66e8ff, 0.7, quality, true, (i) => {
      const s = ((i + 0.42) / nArch) * (S - 14) + 6;
      pose(s, 0, -0.4, 1.05, 1.05, 1.05, Math.PI * 0.5 + (i % 2) * 0.12);
    }, pack, 'FlyerDataArch');

    const nPillar = cap(32, 16);
    const pillar = new THREE.BoxGeometry(0.42, 1, 0.42);
    instanceGeo(pillar, nPillar * 2, 0xc888e8, 1, quality, false, (i) => {
      const k = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((k + 0.35) / nPillar) * (S - 14) + 6;
      pose(s, side * (5.8 + (k % 4) * 0.4), 4.6, 1, 10.2, 1);
    }, pack, 'FlyerDataPillar');

    const nPipe = cap(36, 18);
    const pipe = new THREE.CylinderGeometry(0.18, 0.18, 1, 6);
    instanceGeo(pipe, nPipe, 0xa070c0, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.2) / nPipe) * (S - 12) + 5;
      const along = i % 3 === 0;
      if (along) {
        const len = 8 + hash(i, 4) * 4;
        pose(s, side * 6.6, 1.5 + (i % 4) * 1.4, 1, 1, len, 0);
        _dummy.rotateX(Math.PI / 2);
      } else {
        const h = 6 + hash(i, 6) * 6;
        pose(s, side * (6.0 + hash(i, 3) * 1.5), h * 0.45, 1, h, 1);
      }
    }, pack, 'FlyerVoidPipe');

    const nSpire = cap(24, 12);
    const spire = new THREE.CylinderGeometry(0.08, 0.55, 1, 5);
    instanceGeo(spire, nSpire, 0xe866ff, 1, quality, false, (i) => {
      const side = hash(i, 2) > 0.5 ? 1 : -1;
      const s = ((i + 0.33) / nSpire) * (S - 16) + 8;
      const h = 8 + hash(i, 5) * 12;
      pose(s, side * (8.8 + hash(i, 7) * 2.5), h * 0.48, 1, h, 1);
    }, pack, 'FlyerDataSpire');

    const nBeam = cap(22, 10);
    const beam = new THREE.BoxGeometry(13.8, 0.26, 0.26);
    instanceGeo(beam, nBeam, 0xc0f4ff, 0.92, quality, false, (i) => {
      const s = ((i + 0.4) / nBeam) * (S - 14) + 6;
      pose(s, 0, 7.8 + (i % 3) * 0.7, 1, 1, 1);
    }, pack, 'FlyerDataBeam');

    const nPanel = cap(20, 10);
    const panel = new THREE.PlaneGeometry(5.2, 2.8);
    instanceGeo(panel, nPanel, 0x66e8ff, 0.38, quality, true, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.25) / nPanel) * (S - 18) + 9;
      pose(s, side * 8.4, 2.2 + hash(i, 3) * 3.2, 1, 1, 1, side * -0.42);
    }, pack, 'FlyerHoloPanel');

    const nCrystal = cap(20, 10);
    const crystal = new THREE.OctahedronGeometry(0.95, 0);
    instanceGeo(crystal, nCrystal, pal.glow, 0.72, quality, true, (i) => {
      const side = hash(i, 3) > 0.5 ? 1 : -1;
      const s = ((i + 0.2) / nCrystal) * (S - 20) + 10;
      const sc = 0.9 + hash(i, 7) * 1.4;
      pose(s, side * (9.0 + hash(i, 9) * 2.6), 1.0 + hash(i, 5) * 4, sc, sc * 1.6, sc);
    }, pack, 'FlyerVoidCrystal');
  } else if (sceneId === 'yard') {
    // Lit industrial dock: portal gantries, pipe racks, truss docks, cranes, crates.
    // WAVE8: all yard kit colors stay in scrap steel range (no terracotta slabs).
    const nPortal = cap(22, 12);
    const leg = new THREE.CylinderGeometry(0.38, 0.5, 1, 6);
    instanceGeo(leg, nPortal * 2, 0x7a8890, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((g + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(g, 2) * 4;
      pose(sPos, side * 5.6, h * 0.5 - 0.4, 1, h, 1);
    }, pack, 'FlyerGantryLeg');
    const span = new THREE.BoxGeometry(12.2, 0.55, 0.7);
    instanceGeo(span, nPortal, 0xb0bcc8, 1, quality, false, (i) => {
      const sPos = ((i + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(i, 2) * 4;
      pose(sPos, 0, h - 0.15, 1, 1, 1);
    }, pack, 'FlyerGantrySpan');
    const rail = new THREE.BoxGeometry(12.2, 0.2, 0.2);
    instanceGeo(rail, nPortal * 2, 0x44f0ff, 0.95, quality, true, (i) => {
      const g = Math.floor(i / 2);
      const which = i % 2;
      const sPos = ((g + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(g, 2) * 4;
      pose(sPos, 0, h - 0.9 - which * 0.4, 1, 1, 1);
    }, pack, 'FlyerGantryRail');
    const brace = new THREE.BoxGeometry(0.26, 0.26, 5.5);
    instanceGeo(brace, nPortal * 2, 0x6a7884, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((g + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(g, 2) * 4;
      pose(sPos, side * 2.6, h * 0.55, 1, 1, 1);
    }, pack, 'FlyerGantryCross');
    const diagonal = new THREE.BoxGeometry(0.18, 1, 0.18);
    instanceGeo(diagonal, nPortal * 2, 0x5a6870, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((g + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(g, 2) * 4;
      pose(sPos, side * 3.8, h * 0.5, 1, h * 0.85, 1, side * 0.35);
    }, pack, 'FlyerGantryTruss');
    const neon = new THREE.BoxGeometry(12.4, 0.12, 0.12);
    instanceGeo(neon, nPortal, 0x44f0ff, 0.9, quality, true, (i) => {
      const sPos = ((i + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(i, 2) * 4;
      pose(sPos, 0, h + 0.25, 1, 1, 1);
    }, pack, 'FlyerGantryNeon');
    // WAVE7: extra vertical neon scrap accents (metal/neon finish, not terracotta).
    const neonV = new THREE.BoxGeometry(0.1, 1, 0.1);
    instanceGeo(neonV, nPortal * 2, 0xff44aa, 0.88, quality, true, (i) => {
      const g = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((g + 0.35) / nPortal) * (S - 20) + 10;
      const h = 9 + hash(g, 2) * 4;
      pose(sPos, side * 5.5, h * 0.55, 1, h * 0.9, 1);
    }, pack, 'FlyerYardNeonAccent');

    const nPipeRack = cap(24, 12);
    const pipe = new THREE.CylinderGeometry(0.2, 0.2, 1, 6);
    instanceGeo(pipe, nPipeRack, 0x708090, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.2) / nPipeRack) * (S - 16) + 8;
      const len = 5 + hash(i, 4) * 4;
      pose(sPos, side * (7.2 + hash(i, 3) * 2), 1.2 + (i % 3) * 0.9, 1, 1, len);
      _dummy.rotateX(Math.PI / 2);
    }, pack, 'FlyerDockPipe');

    const nCrane = cap(14, 8);
    const mast = new THREE.BoxGeometry(0.65, 1, 0.65);
    instanceGeo(mast, nCrane, 0x8898a4, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.28) / nCrane) * (S - 18) + 9;
      const h = 12 + hash(i, 2) * 7;
      pose(sPos, side * (9.5 + hash(i, 4) * 2), h * 0.5 - 0.4, 1, h, 1);
    }, pack, 'FlyerCraneMast');
    const jib = new THREE.BoxGeometry(1, 0.4, 0.4);
    instanceGeo(jib, nCrane, 0xa8b8c4, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.28) / nCrane) * (S - 18) + 9;
      const h = 12 + hash(i, 2) * 7;
      const len = 8 + hash(i, 6) * 5;
      pose(sPos, side * (9.5 + hash(i, 4) * 2 - len * 0.28), h - 0.5, len, 1, 1);
    }, pack, 'FlyerCraneJib');

    // WAVE6: no brown cuboid crate/stack dumps — GLB corridor/gate/rail carry midground language.
    const nGantryBoost = cap(10, 6);
    const boom = new THREE.CylinderGeometry(0.18, 0.22, 1, 6);
    instanceGeo(boom, nGantryBoost, 0x6a7884, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.5) / nGantryBoost) * (S - 22) + 12;
      const len = 7 + hash(i, 4) * 4;
      pose(sPos, side * (6.5 + hash(i, 2) * 1.5), 4.5 + hash(i, 6) * 2, 1, 1, len);
      _dummy.rotateX(Math.PI / 2);
    }, pack, 'FlyerDockBoom');
  } else {
    // Rift: denser industrial-ice â€” lattice spires, pipe seams, fracture plates, truss shards.
    const nSpire = cap(40, 20);
    const spire = new THREE.CylinderGeometry(0.15, 0.85, 1, 5);
    instanceGeo(spire, nSpire, 0xd8f8ff, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.22) / nSpire) * (S - 14) + 6;
      const h = 9 + hash(i, 2) * 15;
      pose(s, side * (8.8 + hash(i, 4) * 5.5), h * 0.48 - 1.0, 1 + hash(i, 6) * 0.4, h, 1 + hash(i, 8) * 0.35);
    }, pack, 'FlyerIceSpire');

    const nLattice = cap(26, 12);
    const latMast = new THREE.BoxGeometry(0.35, 1, 0.35);
    instanceGeo(latMast, nLattice, 0xa8e0f0, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.38) / nLattice) * (S - 16) + 8;
      const h = 8 + hash(i, 3) * 10;
      pose(s, side * (10.5 + hash(i, 5) * 3), h * 0.48, 1, h, 1);
    }, pack, 'FlyerIceLattice');
    const latX = new THREE.BoxGeometry(1, 0.16, 0.16);
    instanceGeo(latX, nLattice * 2, 0x7ad8ff, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = g % 2 === 0 ? 1 : -1;
      const tier = i % 2;
      const s = ((g + 0.38) / nLattice) * (S - 16) + 8;
      const h = 8 + hash(g, 3) * 10;
      pose(s, side * (10.5 + hash(g, 5) * 3), h * (0.3 + tier * 0.35), 3.2, 1, 1);
    }, pack, 'FlyerIceTruss');

    const nPlate = cap(30, 14);
    const plate = new THREE.BoxGeometry(3.2, 0.18, 2.0);
    instanceGeo(plate, nPlate, 0x9ef2ff, 0.9, quality, false, (i) => {
      const side = hash(i, 1) > 0.5 ? 1 : -1;
      const s = ((i + 0.35) / nPlate) * (S - 18) + 9;
      pose(s, side * (6.5 + hash(i, 3) * 3.2), -0.35 + hash(i, 5) * 2.0, 1.1 + hash(i, 7), 1, 1.1, hash(i, 9) * 1.1);
    }, pack, 'FlyerFracturePlate');

    const nPipe = cap(28, 14);
    const pipe = new THREE.CylinderGeometry(0.16, 0.16, 1, 6);
    instanceGeo(pipe, nPipe, 0x88c8d8, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.18) / nPipe) * (S - 14) + 7;
      if (i % 2 === 0) {
        const h = 5 + hash(i, 4) * 7;
        pose(s, side * (7.2 + hash(i, 6) * 2), h * 0.45, 1, h, 1);
      } else {
        const len = 5 + hash(i, 8) * 4;
        pose(s, side * 7.0, 1.5 + hash(i, 2) * 2, 1, 1, len);
        _dummy.rotateX(Math.PI / 2);
      }
    }, pack, 'FlyerIcePipe');

    const nShard = cap(18, 8);
    const shard = new THREE.OctahedronGeometry(1.15, 0);
    instanceGeo(shard, nShard, 0x7ad8ff, 0.92, quality, false, (i) => {
      const side = hash(i, 1) > 0.5 ? 1 : -1;
      const s = ((i + 0.5) / nShard) * (S - 20) + 11;
      pose(s, side * (7.2 + hash(i, 8) * 2.4), 0.8 + hash(i, 3) * 2.4, 1.0, 2.0 + hash(i, 5) * 2.0, 1.0);
    }, pack, 'FlyerIceShard');

    const nSeam = cap(18, 8);
    const seam = new THREE.BoxGeometry(0.14, 1, 0.14);
    instanceGeo(seam, nSeam, pal.glow, 0.82, quality, true, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const s = ((i + 0.33) / nSeam) * (S - 16) + 8;
      const h = 5 + hash(i, 2) * 9;
      pose(s, side * (8.2 + hash(i, 4) * 2), h * 0.45, 1, h, 1);
    }, pack, 'FlyerIceNeonSeam');
  }

  // WAVE13 yard: continuous orbital dock plate + cranes/gantries ROOTED to deck (not floating crates in void).
  if (sceneId === 'yard') {
    const nDock = Math.max(64, Math.round(cap(96, 48)));
    const dockWall = new THREE.BoxGeometry(1.4, 1, 0.45);
    instanceGeo(dockWall, nDock, 0x5a6570, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.08) / nDock) * (S - 2) + 1;
      const h = 5.5 + hash(i, 3) * 5.5;
      pose(sPos, side * (5.5 + (i % 3) * 0.35), h * 0.5 - 1.45, 1.4, h, 1);
    }, pack, 'FlyerYardDockWall');
    // Crates sit ON the deck (y near -1.0), not mid-air.
    const nCrate = Math.max(40, Math.round(cap(64, 32)));
    const crate = new THREE.BoxGeometry(1.4, 1.1, 1.4);
    instanceGeo(crate, nCrate, 0x6a7580, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.33) / nCrate) * (S - 8) + 4;
      const stack = 1 + (i % 3);
      pose(sPos, side * (8.5 + hash(i, 2) * 2.2), -1.0 + stack * 0.55, 1 + hash(i, 4) * 0.3, stack, 1 + hash(i, 6) * 0.25); // WAVE41 outboard crates
    }, pack, 'FlyerYardWasteCrate');
    // Gantry legs stand on deck; crossbeam spans walls.
    const nGantry = 0; // WAVE41: no midlane-spanning yard gantry beams (void/clutter read)
    const gLeg = new THREE.BoxGeometry(0.35, 1, 0.35);
    instanceGeo(gLeg, nGantry * 2, 0x687880, 1, quality, false, (i) => {
      const g = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((g + 0.25) / nGantry) * (S - 12) + 6;
      const h = 6.5 + hash(g, 2) * 3;
      pose(sPos, side * 9.2, h * 0.5 - 1.45, 1, h, 1);
    }, pack, 'FlyerYardGantryLeg'); // WAVE41
    const gBeam = new THREE.BoxGeometry(1, 0.28, 0.28);
    instanceGeo(gBeam, nGantry, 0x8090a0, 1, quality, false, (i) => {
      const sPos = ((i + 0.25) / nGantry) * (S - 12) + 6;
      const h = 6.5 + hash(i, 2) * 3;
      pose(sPos, 0, h - 1.45, 10.2, 1, 1);
    }, pack, 'FlyerYardGantryBeam');
    const nPanel = Math.max(32, Math.round(cap(48, 24)));
    const panel = new THREE.BoxGeometry(2.8, 4.2, 0.22);
    instanceGeo(panel, nPanel, 0x4a5560, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.2) / nPanel) * (S - 6) + 3;
      pose(sPos, side * 5.3, 1.2, 1, 1, 1);
    }, pack, 'FlyerYardDockPanel');
  }

  // WAVE13 canyon: megacity wall plates + buttresses ROOTED to coherence deck (not mid-air pillars).
  if (sceneId === 'canyon') {
    const nWall = Math.max(80, Math.round(cap(120, 60)));
    const wall = new THREE.BoxGeometry(0.85, 1, 3.2);
    instanceGeo(wall, nWall, 0x5a6a78, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.05) / nWall) * (S - 2) + 1;
      const h = 8.5 + hash(i, 2) * 7.5;
      // Base sits on deck (~-1.45); continuous opaque dress all along path.
      pose(sPos, side * (4.5 + (i % 3) * 0.2), h * 0.5 - 1.35, 1.35, h, 1);
    }, pack, 'FlyerCanyonSideWall');
    // Buttress feet connecting wall to deck
    const nFoot = Math.max(36, Math.round(cap(56, 28)));
    const foot = new THREE.BoxGeometry(1.6, 0.7, 1.2);
    instanceGeo(foot, nFoot, 0x4a5868, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.2) / nFoot) * (S - 4) + 2;
      pose(sPos, side * 3.8, -1.0, 1, 1, 1);
    }, pack, 'FlyerCanyonWallFoot');
    // Skyline parapet + neon spar attached to wall tops (architecture, not floaters)
    const nPara = Math.max(28, Math.round(cap(44, 20)));
    const para = new THREE.BoxGeometry(0.35, 1.4, 2.4);
    instanceGeo(para, nPara, 0x6a7a88, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.15) / nPara) * (S - 6) + 3;
      const h = 8.5 + hash(i, 2) * 7.5;
      pose(sPos, side * (5.5 + (i % 2) * 0.2), h - 1.45 + 0.4, 1, 1, 1);
    }, pack, 'FlyerCanyonParapet');
  }

  // WAVE5b: near-band industrial fillers along ribbon (kill motion emptiness).
  // Pipes + L-beam truss stubs + wreck plates close to path (x~4.5-8), all lit Phong.
  {
    // T-LIVE-R1-01/02: denser near-band fillers for yard/canyon live midground.
    // WAVE12: denser near-band — yard catches canyon; wormhole/rift fill helix gaps.
    const nNear = Math.max(sceneId === 'yard' || sceneId === 'canyon' ? 56 : sceneId === 'wormhole' || sceneId === 'rift' ? 44 : 28, Math.round(cap(sceneId === 'yard' || sceneId === 'canyon' ? 78 : sceneId === 'wormhole' || sceneId === 'rift' ? 58 : 40, sceneId === 'yard' || sceneId === 'canyon' ? 42 : 28)));
    const pipeNear = new THREE.CylinderGeometry(0.16, 0.16, 1, 6);
    instanceGeo(pipeNear, nNear, sceneId === 'yard' ? 0x6e7e8a : sceneId === 'rift' ? 0x78a8b8 : sceneId === 'wormhole' ? 0x9060b0 : 0x6a7888, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.15) / nNear) * (S - 10) + 5;
      const h = 1.2 + hash(i, 4) * 4.5;
      const x = side * (4.6 + hash(i, 6) * 2.8);
      if (i % 3 === 0) {
        const len = 3.5 + hash(i, 8) * 3;
        pose(sPos, x, 0.6 + hash(i, 2) * 1.8, 1, 1, len);
        _dummy.rotateX(Math.PI / 2);
      } else {
        pose(sPos, x, h * 0.45, 1, h, 1);
      }
    }, pack, 'FlyerNearPipe');
    const nElbow = Math.max(10, Math.round(cap(20, 10)));
    const elbow = new THREE.TorusGeometry(0.85, 0.14, 5, 10, Math.PI * 0.55);
    instanceGeo(elbow, nElbow, sceneId === 'yard' ? 0x8090a0 : sceneId === 'wormhole' ? 0xc060e0 : 0x7a8898, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.4) / nElbow) * (S - 14) + 7;
      pose(sPos, side * (5.2 + hash(i, 3) * 2), 1.0 + hash(i, 5) * 2.5, 1, 1, 1, side * 0.6);
    }, pack, 'FlyerPipeElbow');
    const nBeam = Math.max(14, Math.round(cap(28, 14)));
    const lBeam = new THREE.BoxGeometry(0.22, 1, 0.55);
    instanceGeo(lBeam, nBeam, sceneId === 'yard' ? 0x687880 : sceneId === 'rift' ? 0x88c0d0 : 0x5a6a78, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.28) / nBeam) * (S - 12) + 6;
      const h = 3.5 + hash(i, 2) * 5;
      pose(sPos, side * (5.0 + hash(i, 7) * 2.2), h * 0.48, 1, h, 1);
    }, pack, 'FlyerLBeam');
    const flange = new THREE.BoxGeometry(0.7, 0.12, 0.55);
    instanceGeo(flange, nBeam, sceneId === 'yard' ? 0x8898a8 : 0x708090, 1, quality, false, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = ((i + 0.28) / nBeam) * (S - 12) + 6;
      const h = 3.5 + hash(i, 2) * 5;
      pose(sPos, side * (5.0 + hash(i, 7) * 2.2), h - 0.1, 1, 1, 1);
    }, pack, 'FlyerLBeamFlange');
    // WAVE6: skip yard brown wreck plates (cuboid dump language); keep elsewhere.
    if (sceneId !== 'yard') {
      const nPlate = Math.max(16, Math.round(cap(30, 14)));
      const plate = new THREE.BoxGeometry(2.4, 0.12, 1.4);
      instanceGeo(plate, nPlate, sceneId === 'rift' ? 0x4a7080 : sceneId === 'wormhole' ? 0x402060 : 0x4a3a30, 1, quality, false, (i) => {
        const side = hash(i, 1) > 0.5 ? 1 : -1;
        const sPos = ((i + 0.2) / nPlate) * (S - 12) + 6;
        pose(sPos, side * (4.4 + hash(i, 3) * 2.5), -0.9 + hash(i, 5) * 0.8, 1 + hash(i, 7) * 0.5, 1, 1, hash(i, 9) * 0.7);
      }, pack, 'FlyerNearWreckPlate');
    }
  }
}

