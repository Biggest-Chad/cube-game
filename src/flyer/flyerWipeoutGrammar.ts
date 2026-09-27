/**
 * WAVE26 SCENERY REMODEL (R13 FAIL@56% T-W25-01..06) + keep WAVE25b HAZARD PATH-FRAME (owner: red cubes/T-bar world-up on bank) + keep WAVE25 remodel.
 * pathFrameQuat / RH makeBasis(r,u,-t); craft lookAt -Z; highway UV continuous; GroundShelf≠road.
 * Brand cyber/neo/industrial; wormhole void exception.
 * WAVE29: Blender corridor kit GLBs PRIMARY (wall/curb/dress/gantry); cut nKit box spam.
 * WAVE30: deepen corridor kit
 * WAVE35: continuous track-wall RIBBON modules (8-20m) over discrete façade slabs; zone harden; graphite deck.
 * WAVE36 CLEAR_LANE: flight highway |x| clear; scenery/walls outboard; mid-road random props FORBIDDEN;
 * intentional hazards only sparse + marked (boost/hazard grammar).
 * WAVE36 F-Zero/BallisticNG: EMPTY lane; emissive edges; far facade shells;
 * supersede densify; Wipeout polish secondary only. Critic: lane clarity heaviest.
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';
import { FLYER_LANE_HALF } from '../data/flyer';
import type { SplinePath } from './SplinePath';
import { PathFrame } from './SplinePath';
import type { GraphicsQuality } from '../data/graphics';
import {
  barrierSegment,
  billboardFaceMap,
  livedInBarrierMap,
  livedInBoostMap,
  highwayAsphaltMap,
  flyerSkylineWindowMap,
  livedInFacadeMap,
  pickBuildingInstance,
  presetParts,
  type BuildingInstance,
  type BuildingPresetId,
} from './flyerCityVariation';
import {
  availableCityProtos,
  cityKitCap,
  getFlyerCityLib,
  instantiateCityGlb,
  pickCityGlbId,
  type CityGlbId,
} from './flyerCityGlb';
import {
  getFlyerCorridorLib,
  instantiateCorridorGlb,
} from './flyerCorridorGlb';

const _F = new PathFrame();
const _dummy = new THREE.Object3D();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

/** Scratch forward = -F.t so makeBasis is right-handed (r,u,-t). SplinePath has r=t×u ⇒ r×u=-t. */
const _pathZ = new THREE.Vector3();
/**
 * PATH FRAME orientation matching craft lookAt: local X=F.r, Y=F.u, Z=-F.t
 * (local -Z = travel). NEVER makeBasis(r,u,t) — that matrix has det=-1 and
 * Quaternion.setFromRotationMatrix collapses prop up toward world-Y (clips on banks).
 */
export function pathFrameQuat(f: PathFrame, outQ: THREE.Quaternion): THREE.Quaternion {
  // RH only: columns (r, u, -t). LH makeBasis(r,u,t) collapses local Y toward world-Y.
  _pathZ.copy(f.t).negate();
  _mat4.makeBasis(f.r, f.u, _pathZ);
  outQ.setFromRotationMatrix(_mat4);
  return outQ;
}

/** Apply path-frame pose onto Object3D (position + RH quat). y = path-up clearance. */
export function applyPathFramePose(
  obj: THREE.Object3D,
  f: PathFrame,
  x: number,
  y: number
): void {
  obj.position.copy(f.p).addScaledVector(f.r, x).addScaledVector(f.u, y);
  pathFrameQuat(f, obj.quaternion);
}


function kitCap(quality: GraphicsQuality, high: number, floor = 8): number {
  const s = quality === 'low' ? 0.5 : quality === 'medium' ? 0.8 : 1;
  return Math.max(floor, Math.round(high * s));
}


/** Highway deck surface in path-up (F.u) — ribbon top at yTop, thickness down. */
export const HIGHWAY_DECK_Y_TOP = -0.18;
export const HIGHWAY_DECK_THICKNESS = 0.42;
/** Clearance above deck top for props seated ON/NEAR highway (radius + margin). */
export function pathDeckClearY(propRadius = 0, margin = 0.06): number {
  return HIGHWAY_DECK_Y_TOP + propRadius + margin;
}

/**
 * WAVE36 CLEAR_LANE — playable ribbon must stay open.
 * |lane x| < CLEAR_LANE_HALF is reserved for craft + marked boost pads + sparse intentional telegraph.
 * Scenery / corridor walls / dress / scaffold / random cubes → |x| >= clearLaneOutboard(barrierX).
 */
export const CLEAR_LANE_MARGIN = 0.85;
export const CLEAR_LANE_HALF = FLYER_LANE_HALF + CLEAR_LANE_MARGIN; // ~7.05
/** Min |lateral| for scenery/props that are NOT intentional on-track hazards. */
export function clearLaneOutboard(barrierX: number): number {
  return Math.max(CLEAR_LANE_HALF, barrierX);
}

/**
 * Boost DECAL in PATH FRAME: position p + x·r + y·u; orientation pathFrameQuat (r,u,-t)
 * so plane banks with ribbon. PlaneGeometry XY → rotateX(-π/2) onto path XZ (right×tangent).
 * NEVER world-up Euler — that clips through banked deck on curves.
 */
function poseAtPathDecal(
  path: SplinePath,
  s: number,
  x: number,
  y: number,
  width: number,
  _unusedH: number,
  length: number
): void {
  const S = path.length;
  path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
  _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
  pathFrameQuat(_F, _dummy.quaternion);
  // PlaneGeometry is XY; tip onto path XZ so normal follows F.u (bank)
  _dummy.rotateX(-Math.PI / 2);
  // width along local X (=r), length along plane Y before rot (=tangent after)
  _dummy.scale.set(width, length, 1);
  _dummy.updateMatrix();
}

function poseAt(
  path: SplinePath,
  s: number,
  x: number,
  y: number,
  sx: number,
  sy: number,
  sz: number,
  yaw = 0
): void {
  const S = path.length;
  path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
  _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
  pathFrameQuat(_F, _dummy.quaternion);
  if (yaw !== 0) _dummy.rotateY(yaw);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
}

/** Keep W16 exports for any callers; route to lived-in maps. */
export function chaseGraphiteDeckMap(): THREE.CanvasTexture {
  return highwayAsphaltMap();
}
export function chaseBarrierWallMap(variant = 0): THREE.CanvasTexture {
  return livedInBarrierMap(variant);
}
export function chaseFacadeBillboardMap(neonHex = 0x44f0ff, variant = 0): THREE.CanvasTexture {
  return livedInFacadeMap(neonHex, variant);
}
export function boostTileMap(): THREE.CanvasTexture {
  return livedInBoostMap();
}

/**
 * WAVE17 Wipeout grammar â€” continuous containment + lived-in variation.
 */

/** World meters of travel per asphalt texture V-repeat (seam spacing). */
const HIGHWAY_TILE_M = 10;

/** WAVE54 — segment stream window (meters along spline). Full-course preload forbidden. */
export const W54_STREAM_AHEAD_M = 96;
export const W54_STREAM_BEHIND_M = 22;
export const W54_STREAM_SEG_M = 48;
export const W54_FAR_FACADE_AHEAD_M = 52;
export const W54_LIVE_MESH_CAP: Record<string, number> = { low: 42, medium: 64, high: 88 };
export const W54_LIVE_LIGHT_CAP: Record<string, number> = { low: 2, medium: 3, high: 4 };
export const W54_LIVE_PARTICLE_CAP: Record<string, number> = { low: 24, medium: 40, high: 64 };


/**
 * WAVE21c HOTFIX â€” building ground SEPARATE from FlyerWipeoutHighwayDeck.
 * Highway follows flight spline (bank/climb OK). Buildings sit on GroundShelf
 * at smoothed/low-pass elevation so the road can rise as an overpass.
 * Do NOT force building plinths to hug spline Y.
 */
const GROUND_SHELF_TILE_M = 14;
const _horizR = new THREE.Vector3();
const _horizT = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/** Lower-envelope + heavy smooth of path world-Y â†’ stable lot elevation. */
const groundYCache = new WeakMap<SplinePath, { S: number; step: number; y: Float32Array }>();

function cachedGroundYProfile(path: SplinePath): { S: number; step: number; y: Float32Array } {
  let profile = groundYCache.get(path);
  if (!profile || profile.S !== path.length) {
    profile = buildGroundYProfile(path, 2.0);
    groundYCache.set(path, profile);
  }
  return profile;
}

function buildGroundYProfile(path: SplinePath, step = 2.0): { S: number; step: number; y: Float32Array } {
  const S = path.length;
  const n = Math.max(4, Math.floor(S / step) + 1);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.min(S, (i / (n - 1)) * S);
    path.sample(s, _F);
    raw[i] = _F.p.y;
  }
  const env = new Float32Array(n);
  const win = Math.max(2, Math.round(18 / step));
  for (let i = 0; i < n; i++) {
    let lo = raw[i];
    for (let k = -win; k <= win; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      if (raw[j] < lo) lo = raw[j];
    }
    env[i] = lo;
  }
  const y = new Float32Array(n);
  const sw = Math.max(2, Math.round(12 / step));
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let wsum = 0;
    for (let k = -sw; k <= sw; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      const w = 1 / (1 + Math.abs(k) * 0.35);
      sum += env[j] * w;
      wsum += w;
    }
    // Keep lots near chase height; drop only when road rises (overpass)
    const local = raw[i];
    const lot = sum / wsum;
    const drop = Math.max(0, local - lot);
    y[i] = local - Math.min(4.5, 0.35 + drop * 0.85);
  }
  return { S, step, y };
}

function sampleGroundY(profile: { S: number; step: number; y: Float32Array }, s: number): number {
  const n = profile.y.length;
  if (n < 2) return profile.y[0] || 0;
  const t = Math.min(1, Math.max(0, s / Math.max(0.001, profile.S))) * (n - 1);
  const i0 = Math.floor(t);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = t - i0;
  return profile.y[i0] * (1 - f) + profile.y[i1] * f;
}

function horizRightFromFrame(): THREE.Vector3 {
  _horizR.set(_F.r.x, 0, _F.r.z);
  if (_horizR.lengthSq() < 1e-6) _horizR.set(1, 0, 0);
  else _horizR.normalize();
  return _horizR;
}

function horizTangentFromFrame(): THREE.Vector3 {
  _horizT.set(_F.t.x, 0, _F.t.z);
  if (_horizT.lengthSq() < 1e-6) _horizT.set(0, 0, 1);
  else _horizT.normalize();
  return _horizT;
}

/** Continuous GroundShelf strip â€” world-up + smoothed groundY (not path-frame u). */
function buildGroundShelfRibbon(
  path: SplinePath,
  side: 1 | -1,
  innerLat: number,
  outerLat: number,
  profile: { S: number; step: number; y: Float32Array },
  thickness: number,
  quality: GraphicsQuality,
  sLo = 0,
  sHi?: number
): THREE.BufferGeometry {
  const S = path.length;
  const lo = Math.max(0, Math.min(sLo, S));
  const hi = Math.min(S, sHi == null ? S : Math.max(lo + 0.5, sHi));
  const span = Math.max(0.5, hi - lo);
  const step = quality === 'low' ? 4.2 : quality === 'medium' ? 3.1 : 2.2;
  const n = Math.max(3, Math.floor(span / step) + 1);
  const pos = new Float32Array(n * 4 * 3);
  const nor = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(hi, lo + (i / (n - 1)) * span);
    path.sample(s, _F);
    const hr = horizRightFromFrame();
    const gY = sampleGroundY(profile, s);
    const yTop = gY;
    const yBot = gY - thickness;
    const v = s / GROUND_SHELF_TILE_M;
    const base = i * 4;
    const latA = side * innerLat;
    const latB = side * outerLat;
    const slots = [
      { lat: latA, y: yTop, nx: 0, ny: 1, nz: 0 },
      { lat: latB, y: yTop, nx: 0, ny: 1, nz: 0 },
      { lat: latA, y: yBot, nx: 0, ny: -1, nz: 0 },
      { lat: latB, y: yBot, nx: 0, ny: -1, nz: 0 },
    ];
    for (let k = 0; k < 4; k++) {
      const sl = slots[k];
      // Lateral matches building seat: path right in XZ; Y forced to shelf groundY
      const px = _F.p.x + _F.r.x * sl.lat;
      const py = sl.y;
      const pz = _F.p.z + _F.r.z * sl.lat;
      const vi = (base + k) * 3;
      pos[vi] = px; pos[vi + 1] = py; pos[vi + 2] = pz;
      nor[vi] = sl.nx; nor[vi + 1] = sl.ny; nor[vi + 2] = sl.nz;
      const ui = (base + k) * 2;
      uv[ui] = k % 2 === 0 ? 0 : 1;
      uv[ui + 1] = v;
    }
    if (i < n - 1) {
      const a = base;
      idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      idx.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7);
      idx.push(a, a + 4, a + 2, a + 2, a + 4, a + 6);
      idx.push(a + 1, a + 3, a + 5, a + 3, a + 7, a + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Continuous highway ribbon following the spline.
 * UV.u = lateral (0=left edge .. 1=right edge); UV.v = arc-length / HIGHWAY_TILE_M.
 * Pattern flows with travel; seams stay perpendicular â€” no stretched plate UVs on bends.
 */
function buildHighwayDeckRibbon(
  path: SplinePath,
  halfW: number,
  yTop: number,
  thickness: number,
  quality: GraphicsQuality,
  sLo = 0,
  sHi?: number
): THREE.BufferGeometry {
  const S = path.length;
  const lo = Math.max(0, Math.min(sLo, S));
  const hi = Math.min(S, sHi == null ? S : Math.max(lo + 0.5, sHi));
  const span = Math.max(0.5, hi - lo);
  const step = quality === 'low' ? 3.4 : quality === 'medium' ? 2.4 : 1.7;
  const n = Math.max(3, Math.floor(span / step) + 1);
  // 4 verts per station: topL, topR, botL, botR
  const pos = new Float32Array(n * 4 * 3);
  const nor = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const idx: number[] = [];
  const yBot = yTop - thickness;

  for (let i = 0; i < n; i++) {
    const s = Math.min(hi, lo + (i / (n - 1)) * span);
    path.sample(s, _F);
    const v = s / HIGHWAY_TILE_M;
    const base = i * 4;
    // top-left (u=0), top-right (u=1), bot-left, bot-right
    const slots: Array<{ uLat: number; y: number; nx: number; ny: number; nz: number }> = [
      { uLat: -1, y: yTop, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
      { uLat: 1, y: yTop, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
      { uLat: -1, y: yBot, nx: -_F.u.x, ny: -_F.u.y, nz: -_F.u.z },
      { uLat: 1, y: yBot, nx: -_F.u.x, ny: -_F.u.y, nz: -_F.u.z },
    ];
    for (let k = 0; k < 4; k++) {
      const sl = slots[k];
      const px = _F.p.x + _F.r.x * sl.uLat * halfW + _F.u.x * sl.y;
      const py = _F.p.y + _F.r.y * sl.uLat * halfW + _F.u.y * sl.y;
      const pz = _F.p.z + _F.r.z * sl.uLat * halfW + _F.u.z * sl.y;
      const vi = (base + k) * 3;
      pos[vi] = px;
      pos[vi + 1] = py;
      pos[vi + 2] = pz;
      nor[vi] = sl.nx;
      nor[vi + 1] = sl.ny;
      nor[vi + 2] = sl.nz;
      const ui = (base + k) * 2;
      uv[ui] = sl.uLat < 0 ? 0 : 1;
      uv[ui + 1] = v;
    }
    if (i < n - 1) {
      const a = base;
      // top
      idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      // bottom (winding flipped)
      idx.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7);
      // left side
      idx.push(a, a + 4, a + 2, a + 2, a + 4, a + 6);
      // right side
      idx.push(a + 1, a + 3, a + 5, a + 3, a + 7, a + 5);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** WAVE21 continuous curb ribbon â€” height jitter along path, still continuous. */
function buildCurbRibbon(
  path: SplinePath,
  xLat: number,
  y0: number,
  h: number,
  thick: number,
  quality: GraphicsQuality,
  jitterSeed = 0,
  sLo = 0,
  sHi?: number
): THREE.BufferGeometry {
  const S = path.length;
  const sStart = Math.max(0, Math.min(sLo, S));
  const sEnd = Math.min(S, sHi == null ? S : Math.max(sStart + 0.5, sHi));
  const span = Math.max(0.5, sEnd - sStart);
  const step = quality === 'low' ? 3.6 : quality === 'medium' ? 2.5 : 1.8;
  const n = Math.max(3, Math.floor(span / step) + 1);
  const pos = new Float32Array(n * 4 * 3);
  const nor = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const sPos = Math.min(sEnd, sStart + (i / (n - 1)) * span);
    path.sample(sPos, _F);
    const v = sPos / HIGHWAY_TILE_M;
    const j =
      Math.sin(sPos * 0.11 + jitterSeed) * 0.08 +
      Math.sin(sPos * 0.037 + jitterSeed * 1.7) * 0.12 +
      Math.sin(sPos * 0.019 + jitterSeed * 0.5) * 0.06;
    const hi = h * (1 + j);
    const base = i * 4;
    const slots = [
      { uLat: xLat - thick * 0.5, y: y0, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
      { uLat: xLat + thick * 0.5, y: y0, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
      { uLat: xLat - thick * 0.5, y: y0 + hi, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
      { uLat: xLat + thick * 0.5, y: y0 + hi, nx: _F.u.x, ny: _F.u.y, nz: _F.u.z },
    ];
    for (let k = 0; k < 4; k++) {
      const sl = slots[k];
      const px = _F.p.x + _F.r.x * sl.uLat + _F.u.x * sl.y;
      const py = _F.p.y + _F.r.y * sl.uLat + _F.u.y * sl.y;
      const pz = _F.p.z + _F.r.z * sl.uLat + _F.u.z * sl.y;
      const vi = (base + k) * 3;
      pos[vi] = px; pos[vi + 1] = py; pos[vi + 2] = pz;
      nor[vi] = sl.nx; nor[vi + 1] = sl.ny; nor[vi + 2] = sl.nz;
      const ui = (base + k) * 2;
      uv[ui] = k % 2 === 0 ? 0 : 1;
      uv[ui + 1] = v;
    }
    if (i < n - 1) {
      const a = base;
      idx.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);
      idx.push(a, a + 2, a + 4, a + 2, a + 6, a + 4);
      idx.push(a + 1, a + 5, a + 3, a + 3, a + 5, a + 7);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.computeVertexNormals();
  return geo;
}



/**
 * WAVE38: hide ANY vertical mass whose nearest path-frame |lat| is inside CLEAR_LANE.
 * Catches hairpin-chord city/far shells, leftover posts, gate volumes, skirt punches.
 * Allowlist: highway deck, boost pads, curb/emissive edge rails, craft, center dash (deck).
 */
const _cullF = new PathFrame();
const _cullWp = new THREE.Vector3();
const _cullBox = new THREE.Box3();
const CLEAR_LANE_ALLOW =
  /HighwayDeck|CorridorDeckPlate|DeckPlate|BoostTiles|CorridorBoostPad|BoostPad|CurbRibbon|CurbBarrier|EmissiveEdge|BarrierTrimLight|BarrierTrimHot|BarrierHazardBand|BarrierLipCont|BarrierSignage|GroundShelf|GroundApron|BuildingPlinth|FlyerCraft|FlyerCraftHero|FlyerCraftFallback|FlyerRunCraft|FlyerInteract|FlyerFinish|EndPortal|Fuselage|Canopy|Wing|EngineGlow|Nozzle|Plume|LocalHemi|LocalKey|LocalFill|LocalRim|DebugRibbon|Sky|Fog|Streak|FlyerFastSkyline|FlyerFastLaneDash|FlyerLife/i;

/** Unlit track surface. Phong + several scene lights was the mobile fill killer. */
function flightSurface(opts: {
  map?: THREE.Texture | null;
  color?: number;
  side?: THREE.Side;
  fog?: boolean;
}): THREE.MeshBasicMaterial {
  if (opts.map) opts.map.anisotropy = Math.min(opts.map.anisotropy || 1, 2);
  return new THREE.MeshBasicMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    side: opts.side ?? THREE.FrontSide,
    fog: opts.fog ?? true,
    toneMapped: false,
  });
}

/**
 * Static meshes do not need a matrix compose every frame.
 * Craft, sky, tracers and flashes stay live (they move).
 */
export function freezeFlightStatic(root: THREE.Object3D): void {
  const live = /FlyerCraft|FlyerSky|FlyerFlash|FlyerLockRing|FlyerTracer|FlyerThrusterPlume|FlyerGunBolt|FlyerThrusterWake/;
  root.traverse((o) => {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (live.test(p.name || '')) return;
      p = p.parent;
    }
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
}

/** One instanced skyline + center dashes for the whole course. Not hundreds of unique GLBs. */
function placeFastSkyline(
  pack: THREE.Group,
  path: SplinePath,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality
): void {
  if (pack.getObjectByName('FlyerFastSkyline')) return;
  const S = path.length;
  const n = quality === 'low' ? 40 : quality === 'high' ? 84 : 64;
  const towerMat = new THREE.MeshBasicMaterial({
    map: flyerSkylineWindowMap(sceneId),
    color: 0xffffff,
    fog: true,
    toneMapped: false,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: pal.glow,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, n);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glowMat, n);
  towers.name = 'FlyerFastSkyline';
  caps.name = 'FlyerFastSkylineGlow';
  towers.frustumCulled = false;
  caps.frustumCulled = false;
  const deckW = sceneId === 'yard' ? 16 : 14;
  const barrierX = deckW * 0.52;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const s = Math.min(S - 1, 6 + (i * (S - 12)) / n);
    path.sample(s, _F);
    const h = 9 + (i % 9) * 3.4 + (i % 3) * 2;
    const lat = barrierX + 28 + (i % 5) * 6 + (i % 3) * 4;
    const depth = 4 + (i % 4) * 1.6;
    const width = 5 + (i % 3) * 2.2;
    _dummy.position.copy(_F.p).addScaledVector(_F.r, side * lat);
    _dummy.position.y = _F.p.y + h * 0.5 - 1.2;
    _dummy.quaternion.identity();
    _dummy.scale.set(width, h, depth);
    _dummy.updateMatrix();
    towers.setMatrixAt(i, _dummy.matrix);
    _dummy.position.y += h * 0.5;
    _dummy.scale.set(width * 1.02, 0.35, depth * 1.02);
    _dummy.updateMatrix();
    caps.setMatrixAt(i, _dummy.matrix);
  }
  const lit = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) {
    towers.setColorAt(i, lit);
    caps.setColorAt(i, lit);
  }
  towers.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  towers.computeBoundingSphere();
  caps.computeBoundingSphere();
  pack.add(towers);
  pack.add(caps);

  const dashesN = quality === 'low' ? 36 : 64;
  const dashMat = new THREE.MeshBasicMaterial({
    color: sceneId === 'yard' ? 0x3de8ff : sceneId === 'rift' ? 0x9ef2ff : 0xfff2c4,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dashMat, dashesN);
  dashes.name = 'FlyerFastLaneDash';
  dashes.frustumCulled = false;
  for (let i = 0; i < dashesN; i++) {
    const s = Math.min(S - 1, 4 + (i * (S - 8)) / dashesN);
    path.sample(s, _F);
    _dummy.position.copy(_F.p).addScaledVector(_F.u, HIGHWAY_DECK_Y_TOP + 0.08);
    const pathZ = _pathZ.copy(_F.t).negate();
    _mat4.makeBasis(_F.r, _F.u, pathZ);
    _dummy.quaternion.setFromRotationMatrix(_mat4);
    _dummy.scale.set(0.28, 0.04, 2.4);
    _dummy.updateMatrix();
    dashes.setMatrixAt(i, _dummy.matrix);
  }
  const dashLit = new THREE.Color(1, 1, 1);
  for (let i = 0; i < dashesN; i++) dashes.setColorAt(i, dashLit);
  dashes.instanceMatrix.needsUpdate = true;
  if (dashes.instanceColor) dashes.instanceColor.needsUpdate = true;
  dashes.computeBoundingSphere();
  pack.add(dashes);
}

function nearestPathLatUp(
  path: SplinePath,
  world: THREE.Vector3,
  sHint?: number
): { lat: number; up: number; s: number } {
  const S = path.length;
  let bestS = 0;
  let bestD = Infinity;
  const lo = sHint != null ? Math.max(0, sHint - 120) : 0;
  const hi = sHint != null ? Math.min(S, sHint + 120) : S;
  const step = Math.max(1.5, (hi - lo) / 160);
  for (let s = lo; s <= hi; s += step) {
    path.sample(Math.min(S - 1e-4, s), _cullF);
    const d = world.distanceToSquared(_cullF.p);
    if (d < bestD) {
      bestD = d;
      bestS = s;
    }
  }
  // refine
  for (let s = Math.max(0, bestS - step); s <= Math.min(S, bestS + step); s += step * 0.2) {
    path.sample(Math.min(S - 1e-4, s), _cullF);
    const d = world.distanceToSquared(_cullF.p);
    if (d < bestD) {
      bestD = d;
      bestS = s;
    }
  }
  path.sample(Math.min(S - 1e-4, bestS), _cullF);
  const dx = world.x - _cullF.p.x;
  const dy = world.y - _cullF.p.y;
  const dz = world.z - _cullF.p.z;
  return {
    lat: dx * _cullF.r.x + dy * _cullF.r.y + dz * _cullF.r.z,
    up: dx * _cullF.u.x + dy * _cullF.u.y + dz * _cullF.u.z,
    s: bestS,
  };
}

export function cullClearLaneIntruders(root: THREE.Object3D, path: SplinePath): number {
  let killed = 0;
  const victims: THREE.Object3D[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const n = o.name || '';
    if (!n) return;
    if (CLEAR_LANE_ALLOW.test(n)) return;
    // WAVE40 P0: never cull player craft hierarchy (meshes named Fuselage/Canopy/etc.)
    {
      let p: THREE.Object3D | null = o;
      let craftHit = false;
      while (p) {
        const pn = p.name || '';
        // FlyerRun is the flight root, so this also keeps the whole run. ThemeHazard arms sit on in-lane obstacles.
        if (/FlyerCraft|FlyerThruster|FlyerRun\b|FlyerInteract|ThemeHazard/i.test(pn)) { craftHit = true; break; }
        p = p.parent;
      }
      if (craftHit) return;
    }
    if (n === 'FlyerWipeoutGrammar' || n === 'FlyerWipeoutCorridorKit' || n === 'FlyerWipeoutBuildingLibrary') return;
    // Only consider renderables / placed props
    const isMesh = (o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh;
    const isGroupProp =
      /^FlyerWipeout(Corridor|City|Mega|Hazard|Gantry|Wall|Bank|Dress|Scaffold|Spike|Cone|Rib|Horizon|Tunnel|Sign|Util|Edge|Parallax|Neon|Hard|Data|Yard|Mid)/.test(
        n
      ) || /CityGlb|FarFacade|Gantry|Pillar|Arch|Gate|Belly|Skirt|Shell|Post|Panel|Ribbon|Facade/.test(n);
    if (!isMesh && !isGroupProp) return;
    if (o.visible === false) return;
    try {
      _cullBox.setFromObject(o);
    } catch {
      return;
    }
    if (!Number.isFinite(_cullBox.min.x)) return;
    // Test AABB center + inward corners toward path
    _cullBox.getCenter(_cullWp);
    const samples = [_cullWp.clone()];
    const size = new THREE.Vector3();
    _cullBox.getSize(size);
    // if huge, also sample the box face closest to origin-ish by testing 4 XZ corners at mid height
    if (size.x > 2 || size.z > 2 || size.y > 3) {
      const y = (_cullBox.min.y + _cullBox.max.y) * 0.35;
      samples.push(
        new THREE.Vector3(_cullBox.min.x, y, _cullBox.min.z),
        new THREE.Vector3(_cullBox.max.x, y, _cullBox.min.z),
        new THREE.Vector3(_cullBox.min.x, y, _cullBox.max.z),
        new THREE.Vector3(_cullBox.max.x, y, _cullBox.max.z)
      );
    }
    let minAbsLat = Infinity;
    let atUp = 0;
    for (const p of samples) {
      const nu = nearestPathLatUp(path, p);
      if (Math.abs(nu.lat) < minAbsLat) {
        minAbsLat = Math.abs(nu.lat);
        atUp = nu.up;
      }
    }
    // Vertical mass on/in the driveable ribbon
    if (minAbsLat < CLEAR_LANE_HALF && atUp > -1.5 && atUp < 22) {
      victims.push(o);
    }
  });
  for (const o of victims) {
    o.visible = false;
    o.userData.clearLaneCullW38 = true;
    killed++;
  }
  try {
    (globalThis as any).__WIPEOUT_W38_CULL = { killed, clearLaneHalf: CLEAR_LANE_HALF };
  } catch {}
  return killed;
}

export function placeWipeoutGrammar(
  root: THREE.Group,
  path: SplinePath,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality = 'medium'
): void {
  const existing = root.getObjectByName('FlyerWipeoutGrammar');
  if (existing) {
    existing.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    root.remove(existing);
  }
  const pack = new THREE.Group();
  pack.name = 'FlyerWipeoutGrammar';
  root.add(pack);
  const S = path.length;
  const grounded = sceneId !== 'wormhole';
  // WAVE54: NEVER tessellate / instantiate the full spline at t=0 — near-ahead window only.
  const w54StreamLo = 0;
  const w54StreamHi = Math.min(S, W54_STREAM_AHEAD_M);
  const w54LiveCap = W54_LIVE_MESH_CAP[quality] ?? W54_LIVE_MESH_CAP.medium;
  pack.userData.w54Stream = {
    lo: w54StreamLo,
    hi: w54StreamHi,
    seg: W54_STREAM_SEG_M,
    ahead: W54_STREAM_AHEAD_M,
    behind: W54_STREAM_BEHIND_M,
    S,
    wave54: true,
  };
  // WAVE52: wormhole tube 2× circumference (void deckW 9→18) for camera envelope.
  const deckW = grounded ? (sceneId === 'yard' ? 16 : 14) : 18;
  const barrierX = deckW * 0.52;
  // WAVE29: when Blender corridor kit is loaded, it owns primary wall/mid/curb look
  const useCorridorKit = grounded && !!getFlyerCorridorLib()?.wall_panel_r;

  // WAVE47: deck ribbon only on canyon / yard / city speedway. Wormhole / portal has no road.
  if (grounded) {
    const map = highwayAsphaltMap();
    // Mesh UVs already encode world meters; keep texture repeat at 1,1
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    // DoubleSide: banked ribbons are seen from the path-up side and the underside in loops.
    const deckMat = flightSurface({ map, color: 0xffffff, side: THREE.DoubleSide, fog: false });
    const halfW = deckW * 0.5;
    const yTop = HIGHWAY_DECK_Y_TOP;
    const thickness = HIGHWAY_DECK_THICKNESS;
    const geo = buildHighwayDeckRibbon(path, halfW, yTop, thickness, quality, w54StreamLo, w54StreamHi);
    const deck = new THREE.Mesh(geo, deckMat);
    deck.name = 'FlyerWipeoutHighwayDeck';
    deck.frustumCulled = true;
    deck.userData.highwayTileM = HIGHWAY_TILE_M;
    deck.userData.uvScheme = 'u=lateral,v=s/HIGHWAY_TILE_M';
    pack.add(deck);
  }

  // --- 1b) WAVE21c GroundShelf: building lots SEPARATE from highway spline deck ---
  // Smoothed/low-pass world-Y; road can climb away (overpass). No boost-pad changes.
  let groundProfile: { S: number; step: number; y: Float32Array } | null = null;
  if (grounded) {
    groundProfile = cachedGroundYProfile(path);
    const shelfMat = flightSurface({
      map: livedInBarrierMap(4),
      color: 0x8a93a0,
      side: THREE.DoubleSide,
      fog: true,
    });
    const shelfThick = 1.85;
    const innerLat = barrierX + 10;
    // Was +140m (and a second shelf out to +120). That slab filled the whole frame.
    const outerLat = barrierX + 42;
    for (const side of [1, -1] as const) {
      const geo = buildGroundShelfRibbon(path, side, innerLat, outerLat, groundProfile, shelfThick, quality, w54StreamLo, w54StreamHi);
      const mesh = new THREE.Mesh(geo, shelfMat);
      mesh.name = 'FlyerWipeoutGroundShelf';
      mesh.frustumCulled = true;
      mesh.renderOrder = -12;
      mesh.userData.buildingGround = true;
      mesh.userData.separateFromHighway = true;
      pack.add(mesh);
    }
    const apronMat = flightSurface({
      map: livedInBarrierMap(6),
      color: 0x6a7380,
      side: THREE.DoubleSide,
      fog: true,
    });
    for (const side of [1, -1] as const) {
      const geo = buildGroundShelfRibbon(path, side, barrierX + 2.0, barrierX + 16, groundProfile, 1.1, quality, w54StreamLo, w54StreamHi);
      const mesh = new THREE.Mesh(geo, apronMat);
      mesh.name = 'FlyerWipeoutGroundApron';
      mesh.frustumCulled = true;
      mesh.renderOrder = -11;
      mesh.userData.buildingGround = true;
      pack.add(mesh);
    }
    // WAVE38: UnderDeckSkirt + Belly removed (banked pathFrame punched purple midlane pillars).
  }

  // --- 2) WALLS: WAVE26 industrial containment H≈3.35 (keep height) + dressed bands/gantries ---
  if (grounded) {
    const barMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 8; i++) {
      barMats.push(flightSurface({
        map: livedInBarrierMap(i),
        color: 0xffffff,
        side: THREE.DoubleSide,
        fog: true,
      }));
    }
    // WAVE29: when corridor kit owns walls, keep only a thin underlay curb (not primary box wall)
    const wallH = useCorridorKit ? 0.55 : 3.35;
    const curbY0 = -0.12;
    const curbThick = useCorridorKit ? 0.55 : 1.35;
    for (const side of [1, -1] as const) {
      const v = side > 0 ? 0 : 1;
      const mat = barMats[v].clone();
      mat.map = livedInBarrierMap(v + 2);
      const geo = buildCurbRibbon(path, side * barrierX, curbY0, wallH, curbThick, quality, side > 0 ? 1.2 : 2.7, w54StreamLo, w54StreamHi);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'FlyerWipeoutCurbBarrierV' + v;
      mesh.frustumCulled = true;
      pack.add(mesh);
      const mat2 = barMats[v].clone();
      mat2.map = livedInBarrierMap(v + 4);
      mat2.color = new THREE.Color(0xd8dce0);
      const geo2 = buildCurbRibbon(
        path,
        side * (barrierX + 0.72),
        curbY0 + 0.05,
        wallH * 0.88,
        0.7, quality, side > 0 ? 3.1 : 4.4
      , w54StreamLo, w54StreamHi);
      const mesh2 = new THREE.Mesh(geo2, mat2);
      mesh2.name = 'FlyerWipeoutCurbBarrierV' + ((v + 2) % 8);
      mesh2.frustumCulled = true;
      pack.add(mesh2);
    }
    {
      // WAVE41 T-W40-03: bilateral rails L=cyan R=magenta — equally hot/readable
      for (const side of [1, -1] as const) {
        const trimCol = side < 0 ? 0x22f0ff : 0xff2a9a; // L cyan / R magenta
        const trimMat = new THREE.MeshBasicMaterial({
          color: trimCol,
          toneMapped: false,
          fog: false,
          transparent: true,
          opacity: 0.96,
        });
        const geo = buildCurbRibbon(
          path,
          side * (barrierX - 0.05),
          wallH - 0.08,
          0.18,
          0.62, quality, side > 0 ? 5.5 : 6.2
        , w54StreamLo, w54StreamHi);
        const mesh = new THREE.Mesh(geo, trimMat);
        mesh.name = side < 0 ? 'FlyerWipeoutBarrierTrimLight_L' : 'FlyerWipeoutBarrierTrimLight_R';
        mesh.frustumCulled = true;
        mesh.renderOrder = 2;
        pack.add(mesh);
        // Second hotter lip so R matches L at chase distance
        const geo2 = buildCurbRibbon(
          path,
          side * (barrierX + 0.02),
          wallH - 0.02,
          0.1,
          0.4, quality, side > 0 ? 5.7 : 6.4
        , w54StreamLo, w54StreamHi);
        const mesh2 = new THREE.Mesh(geo2, trimMat.clone());
        mesh2.name = side < 0 ? 'FlyerWipeoutBarrierTrimHot_L' : 'FlyerWipeoutBarrierTrimHot_R';
        mesh2.frustumCulled = true;
        mesh2.renderOrder = 3;
        pack.add(mesh2);
      }
    }
    {
      const bandMat = new THREE.MeshBasicMaterial({
        color: 0x8a6a38,
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.32,
      });
      for (const side of [1, -1] as const) {
        const geo = buildCurbRibbon(
          path,
          side * (barrierX - 0.15),
          wallH * 0.42,
          0.28,
          0.85, quality, side > 0 ? 7.1 : 8.2
        , w54StreamLo, w54StreamHi);
        const mesh = new THREE.Mesh(geo, bandMat);
        mesh.name = 'FlyerWipeoutBarrierHazardBand';
        mesh.frustumCulled = true;
        mesh.renderOrder = 2;
        pack.add(mesh);
      }
    }
    {
      const lipMat = barMats[1].clone();
      for (const side of [1, -1] as const) {
        const geo = buildCurbRibbon(
          path,
          side * (barrierX - 0.2),
          wallH - 0.05,
          0.42,
          1.15, quality, side > 0 ? 5.5 : 6.2
        , w54StreamLo, w54StreamHi);
        const mesh = new THREE.Mesh(geo, lipMat);
        mesh.name = 'FlyerWipeoutBarrierLipCont';
        mesh.frustumCulled = true;
        pack.add(mesh);
      }
    }
    const boxGeoWall = new THREE.BoxGeometry(1, 1, 1);
    const gantryMat = flightSurface({
      map: livedInBarrierMap(3),
      color: pal.glow,
      side: THREE.FrontSide,
      fog: true,
    });
    // WAVE29: corridor arch_gantry GLB owns overhead when kit loaded — cut box MidGantry spam
    const gantrySs: number[] = [];
    let gs = 8;
    let gi = 0;
    const gantryCap = useCorridorKit ? 4 : Math.min(24, w54LiveCap);
    const gantryStep = useCorridorKit ? 48 : 5.2;
    while (gs < w54StreamHi - 8 && gi < gantryCap) {
      gantrySs.push(gs);
      const seg = barrierSegment(sceneId, gs, 1, 1, gi + 300);
      gs += gantryStep + seg.scuff * (useCorridorKit ? 0.5 : 1.8);
      gi++;
    }
    const nG = gantrySs.length;
    const midGantry = new THREE.InstancedMesh(boxGeoWall, gantryMat, nG);
    midGantry.name = 'FlyerWipeoutMidGantry';
    for (let i = 0; i < nG; i++) {
      const seg = barrierSegment(sceneId, gantrySs[i], 1, 1, i);
      poseAt(
        path,
        gantrySs[i],
        (seg.scuff - 0.5) * 1.2,
        5.2 + seg.scuff * 1.2,
        deckW + 1.2 + seg.scuff,
        0.45 + seg.scuff * 0.25,
        0.45
      );
      midGantry.setMatrixAt(i, _dummy.matrix);
    }
    midGantry.instanceMatrix.needsUpdate = true;
    midGantry.computeBoundingSphere();
    // WAVE36: box mid-gantry spans full deck — only when corridor kit NOT primary (kit owns arch_gantry)
    if (!useCorridorKit) {
      pack.add(midGantry);
    }
    const gantryPosts = new THREE.InstancedMesh(boxGeoWall, gantryMat, nG * 2);
    gantryPosts.name = 'FlyerWipeoutGantryPost';
    for (let i = 0; i < nG * 2; i++) {
      const r = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const seg = barrierSegment(sceneId, gantrySs[r], side, 1, i + 400);
      const zh = 4.8 + seg.scuff * 1.8;
      poseAt(
        path,
        gantrySs[r],
        side * clearLaneOutboard(barrierX + 0.25 + seg.scuff * 0.3),
        zh * 0.48,
        0.35 + seg.scuff * 0.12,
        zh,
        0.35
      );
      gantryPosts.setMatrixAt(i, _dummy.matrix);
    }
    gantryPosts.instanceMatrix.needsUpdate = true;
    gantryPosts.computeBoundingSphere();
    if (!useCorridorKit) {
      pack.add(gantryPosts);
    }
    const signMat = new THREE.MeshBasicMaterial({
      color: 0xff5522,
      toneMapped: false,
      fog: false,
    });
    const nSign = Math.min(w54LiveCap, kitCap(quality, 6, 3));
    const signs = new THREE.InstancedMesh(boxGeoWall, signMat, nSign);
    signs.name = 'FlyerWipeoutBarrierSignage';
    for (let i = 0; i < nSign; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = Math.min(S - 6, 14 + i * ((S - 30) / nSign));
      poseAt(path, sPos, side * clearLaneOutboard(barrierX), 1.55 + (i % 3) * 0.25, 0.08, 0.45, 1.1);
      signs.setMatrixAt(i, _dummy.matrix);
    }
    signs.instanceMatrix.needsUpdate = true;
    signs.computeBoundingSphere();
    pack.add(signs);
  }

  // --- 3) HAZARDS: WAVE36 CLEAR_LANE — sparse marked telegraph ONLY; no mid-road soup ---
  // Lasers/gates: intentional sparse full-span. Spikes/T-bars: OUTBOARD at barrier (never |x|≪CLEAR_LANE_HALF).
  {
    const laneOut = clearLaneOutboard(barrierX);
    const laserMat = new THREE.MeshPhongMaterial({
      color: 0xff2245,
      emissive: new THREE.Color(0xff0033).multiplyScalar(0.55),
      shininess: 80,
      toneMapped: false,
      fog: true,
      transparent: true,
      opacity: 0.92,
    });
    // WAVE36 F-Zero: grounded = NO midlane laser beams (clear ribbon). Wormhole keeps sparse telegraph.
    const nL = grounded ? 0 : kitCap(quality, 4, 2);
    const laserGeo = new THREE.CylinderGeometry(0.18, 0.18, 1, 8);
    const lasers = new THREE.InstancedMesh(laserGeo, laserMat, nL);
    lasers.name = 'FlyerWipeoutHazardLaser';
    lasers.renderOrder = 4;
    for (let i = 0; i < nL; i++) {
      const sPos = Math.min(S - 10, 48 + i * ((S - 90) / Math.max(1, nL)));
      // PATH FRAME: CylinderGeometry +Y -> rotateZ(PI/2) -> +X = F.r (span on bank)
      const laserY = grounded ? 2.55 : 1.15 + (i % 3) * 0.4;
      const laserSpan = deckW * (grounded ? 0.82 : 0.88);
      path.sample(THREE.MathUtils.clamp(sPos, 0, Math.max(0, S - 0.05)), _F);
      _dummy.position.copy(_F.p).addScaledVector(_F.u, laserY);
      pathFrameQuat(_F, _dummy.quaternion);
      _dummy.rotateZ(Math.PI / 2);
      _dummy.scale.set(1, laserSpan, 1);
      _dummy.updateMatrix();
      lasers.setMatrixAt(i, _dummy.matrix);
    }
    lasers.instanceMatrix.needsUpdate = true;
    lasers.computeBoundingSphere();
    if (nL > 0) pack.add(lasers);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const nV = grounded ? 0 : kitCap(quality, 4, 2);
    const vLasers = new THREE.InstancedMesh(boxGeo, laserMat, nV);
    vLasers.name = 'FlyerWipeoutHazardLaserV';
    vLasers.renderOrder = 4;
    for (let i = 0; i < nV; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = Math.min(S - 8, 50 + i * ((S - 100) / Math.max(1, nV)));
      // emitter boxes seated ON containment wall — outboard of clear lane
      poseAt(path, sPos, side * laneOut, 2.1 + (i % 3) * 0.35, 0.35, 0.55, 0.55);
      vLasers.setMatrixAt(i, _dummy.matrix);
    }
    vLasers.instanceMatrix.needsUpdate = true;
    vLasers.computeBoundingSphere();
    if (nV > 0) pack.add(vLasers);

    const spikeMat = new THREE.MeshPhongMaterial({
      color: 0x6a7080,
      emissive: new THREE.Color(0xff2244).multiplyScalar(0.35),
      shininess: 45,
      toneMapped: false,
      fog: true,
    });
    // WAVE36 F-Zero: strip midlane/edge spike packs — hazards sparse telegraph only
    const nSpike = kitCap(quality, grounded ? 0 : 2, 0); // WAVE37: no edge spikes on grounded F-Zero
    const spikeGeo = new THREE.ConeGeometry(0.32, 1.1, 5);
    const spikes = new THREE.InstancedMesh(spikeGeo, spikeMat, nSpike);
    spikes.name = 'FlyerWipeoutEdgeSpike';
    for (let i = 0; i < nSpike; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = Math.min(S - 4, 12 + i * ((S - 30) / Math.max(1, nSpike)));
      const cluster = i % 2; // 0..1 — stay at/beyond barrier, never pack inward
      {
        const sy = 0.85 + (i % 3) * 0.12;
        const spikeY = pathDeckClearY(0.55 * sy, 0.05);
        poseAt(
          path,
          sPos,
          side * (laneOut + 0.12 + cluster * 0.18),
          spikeY,
          0.7 + (cluster % 2) * 0.12,
          sy,
          0.7
        );
      }
      spikes.setMatrixAt(i, _dummy.matrix);
    }
    spikes.instanceMatrix.needsUpdate = true;
    spikes.computeBoundingSphere();
    if (nSpike > 0) pack.add(spikes);

    // WAVE36 F-Zero: T-bar edge telegraph only, very sparse
    const nT = kitCap(quality, grounded ? 0 : 2, 0); // WAVE37: no T-posts on grounded (purple pillar look)
    const tbarBeam = new THREE.InstancedMesh(boxGeo, laserMat, nT);
    tbarBeam.name = 'FlyerWipeoutHazardTBar';
    tbarBeam.renderOrder = 4;
    const tbarPost = new THREE.InstancedMesh(boxGeo, laserMat, nT);
    tbarPost.name = 'FlyerWipeoutHazardTPost';
    tbarPost.renderOrder = 4;
    for (let i = 0; i < nT; i++) {
      const sPos = Math.min(S - 12, 60 + i * ((S - 110) / Math.max(1, nT)));
      const side = i % 2 === 0 ? -1 : 1;
      const clearY = pathDeckClearY(0.55, 0.1);
      // short stub ON wall (outboard) — does not cross clear lane
      poseAt(path, sPos, side * (laneOut + 0.05), clearY + 1.15, 1.15, 0.26, 0.26);
      tbarBeam.setMatrixAt(i, _dummy.matrix);
      poseAt(path, sPos, side * (laneOut + 0.05), clearY + 0.55, 0.26, 1.25, 0.26);
      tbarPost.setMatrixAt(i, _dummy.matrix);
    }
    tbarBeam.instanceMatrix.needsUpdate = true;
    tbarPost.instanceMatrix.needsUpdate = true;
    tbarBeam.computeBoundingSphere();
    tbarPost.computeBoundingSphere();
    if (nT > 0) { pack.add(tbarBeam); pack.add(tbarPost); }
  }

  // --- 4) BOOST: ONLY low-profile cyan CHECKER pads on deck every ~35â€“45u ---
  if (grounded) {
    const boostMap = livedInBoostMap();
    const boostMat = new THREE.MeshPhongMaterial({
      map: boostMap,
      color: 0xffffff,
      emissive: new THREE.Color(0x22f0ff).multiplyScalar(0.75),
      emissiveMap: boostMap,
      shininess: 120,
      specular: new THREE.Color(0xaaffff),
      toneMapped: false,
      fog: false,
    });
    // WAVE19: spacing 35â€“45u (was 28) â€” remove ring-as-boost confusion
    // WAVE21b HOTFIX: track-relative flat pads ON deck (not giant mid-air boxes)
    // WAVE27 T-W26-07: short cyan boost sequences (safe-lane telegraph)
    const boostStep = 36;
    const nClusters = Math.max(1, Math.min(3, Math.floor(w54StreamHi / 40)));
    const tilesPer = 8; // WAVE34: longer cyan boost telegraph sequences
    const nBoost = nClusters * tilesPer;
    const padW = FLYER_LANE_HALF * 0.28; // ~1.7m deck decal
    const padL = 8; // 8-12m
    const padH = 0.02; // unused for PlaneGeometry
    const deckTop = HIGHWAY_DECK_Y_TOP;
    const padY = pathDeckClearY(0, 0.02); // thin decal just above banked deck
    boostMat.depthWrite = false;
    boostMat.polygonOffset = true;
    boostMat.polygonOffsetFactor = -2;
    boostMat.polygonOffsetUnits = -2;
    const boostGeo = new THREE.PlaneGeometry(1, 1); // WAVE22c deck decal only
    const boosts = new THREE.InstancedMesh(boostGeo, boostMat, nBoost);
    boosts.name = 'FlyerWipeoutBoostTiles';
    boosts.renderOrder = 3;
    let idx = 0;
    for (let c = 0; c < nClusters; c++) {
      const jitter = ((c * 17) % 9) - 4;
      const sBase = 48 + c * boostStep + jitter;
      const lane = (c % 2 === 0) ? -1 : 1;
      for (let t = 0; t < tilesPer; t++) {
        if (idx >= nBoost) break;
        const sTile = Math.min(S - 6, sBase + t * 9.5);
        poseAtPathDecal(path, sTile, lane * (FLYER_LANE_HALF * 0.55), padY, padW, padH, padL * 0.72);
        boosts.setMatrixAt(idx++, _dummy.matrix);
      }
    }
    for (; idx < nBoost; idx++) {
      poseAt(path, 10, 0, -10, 0.01, 0.01, 0.01);
      boosts.setMatrixAt(idx, _dummy.matrix);
    }
    boosts.instanceMatrix.needsUpdate = true;
    boosts.computeBoundingSphere();
    pack.add(boosts);
  }

  // --- 5) WAVE20: amber candy arches REMOVED (industrial mid owns density) ---

    try {
  // --- 5b) WAVE31 MID: Blender corridor kit GLBs (PRIMARY) — pathFrameQuat RH
  // Zone-unique facades + horizon shell + mega ads + denser authored mid cadence.
  // No procedural densify thrash.
  if (grounded) {
    const libC = getFlyerCorridorLib();
    const kitRoot = new THREE.Group();
    kitRoot.name = 'FlyerWipeoutCorridorKit';
    pack.add(kitRoot);
    let corridorPlaced = 0;
    const usedIds: string[] = [];

    const kitCapLocal = (high: number, floor = 4) => {
      const s = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
      return Math.max(floor, Math.round(high * s));
    };

    if (libC) {
      const panelR = libC.wall_panel_r;
      const panelL = libC.wall_panel_l;
      // WAVE32: zone facade + DISTINCT massing variants (setbacks/towers/bridges) — reduce identical clone reuse
      const facR =
        (sceneId === 'canyon' ? libC.facade_canyon_r : sceneId === 'yard' ? libC.facade_yard_r : libC.facade_rift_r) ||
        libC.facade_windowed_r;
      const facL =
        (sceneId === 'canyon' ? libC.facade_canyon_l : sceneId === 'yard' ? libC.facade_yard_l : libC.facade_rift_l) ||
        libC.facade_windowed_l;
      const facMassR =
        (sceneId === 'canyon' ? libC.facade_tower_r : sceneId === 'yard' ? libC.facade_stack_r : libC.facade_bridge_r) ||
        facR;
      const facMassL =
        (sceneId === 'canyon' ? libC.facade_tower_l : sceneId === 'yard' ? libC.facade_stack_l : libC.facade_bridge_l) ||
        facL;
      const facXtraR =
        (sceneId === 'canyon' ? libC.facade_band_r : sceneId === 'yard' ? libC.facade_pipe_r : libC.facade_fin_r) ||
        facMassR;
      const facXtraL =
        (sceneId === 'canyon' ? libC.facade_band_l : sceneId === 'yard' ? libC.facade_pipe_l : libC.facade_fin_l) ||
        facMassL;
      // WAVE34: silhouette pieces replace shared purple-neon windowed alt
      const facSilR =
        (sceneId === 'canyon' ? libC.facade_overhang_r : sceneId === 'yard' ? libC.facade_cantilever_r : libC.facade_broken_r) ||
        facXtraR;
      const facSilL =
        (sceneId === 'canyon' ? libC.facade_overhang_l : sceneId === 'yard' ? libC.facade_cantilever_l : libC.facade_broken_l) ||
        facXtraL;
      const laserGate = libC.hazard_laser_gate;
      const coneCluster = libC.hazard_cone_cluster;
      const ribArch = libC.rib_arch;
      const adW = libC.ad_board_wide;
      const adT = libC.ad_board_tall;
      const adM = libC.ad_board_mega;
      const dress = libC.wall_dress_strip;
      const curb = libC.curb_barrier;
      // WAVE36 F-Zero kit (BLENDER_KIT_SPEC)
      const deckRibbon = libC.deck_ribbon || libC.deck_plate_seg;
      const curbRL = libC.curb_ribbon_l || libC.curb_ribbon || curb;
      const curbRR = libC.curb_ribbon_r || libC.curb_ribbon || curb;
      const edgeZL =
        (sceneId === 'canyon'
          ? libC.emissive_edge_canyon_l
          : sceneId === 'yard'
            ? libC.emissive_edge_yard_l
            : libC.emissive_edge_rift_l) || libC.emissive_edge_l;
      const edgeZR =
        (sceneId === 'canyon'
          ? libC.emissive_edge_canyon_r
          : sceneId === 'yard'
            ? libC.emissive_edge_yard_r
            : libC.emissive_edge_rift_r) || libC.emissive_edge_r;
      const farShellR =
        (sceneId === 'canyon'
          ? libC.far_facade_shell_canyon_r
          : sceneId === 'yard'
            ? libC.far_facade_shell_yard_r
            : libC.far_facade_shell_rift_r) || facSilR || facR;
      const farShellL =
        (sceneId === 'canyon'
          ? libC.far_facade_shell_canyon_l
          : sceneId === 'yard'
            ? libC.far_facade_shell_yard_l
            : libC.far_facade_shell_rift_l) || facSilL || facL;
      const bankPipe = libC.bank_halfpipe;
      const boostPadGlb = libC.boost_pad;
      const gantry = libC.arch_gate || libC.arch_gantry;
      const deckSeg = deckRibbon || libC.deck_plate_seg;
      const scaffold = libC.edge_scaffold;
      const horizon = libC.horizon_shell;
      const spikeRack = null as typeof libC.hazard_spike_rack; // F-Zero: strip spike packs

      // WAVE35: continuous zone wall RIBBONS end-to-end (PRIMARY). Discard denser short façade thrash.
      const ribbonR =
        (sceneId === 'canyon'
          ? libC.wall_ribbon_canyon_r
          : sceneId === 'yard'
            ? libC.wall_ribbon_yard_r
            : libC.wall_ribbon_rift_r) || panelR;
      const ribbonL =
        (sceneId === 'canyon'
          ? libC.wall_ribbon_canyon_l
          : sceneId === 'yard'
            ? libC.wall_ribbon_yard_l
            : libC.wall_ribbon_rift_l) || panelL;
      const ribbonLen = ribbonR?.length || ribbonL?.length || 14;
      // Fewer long segments: stride ≈ ribbon length * 0.92 so they read continuous
      // WAVE37 F-Zero: NO near-curb wall_ribbon pillars (was hScale 4.4 at barrierX+0.35 — purple masses on ribbon).
      // Track border = curb_ribbon + emissive_edge only; city/mega stay FAR outboard.
      const nRibbon = 0;
      for (let i = 0; i < nRibbon; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const proto = side > 0 ? ribbonR : ribbonL;
        if (!proto) continue;
        const sPos = Math.min(
          S - 2,
          1.0 + Math.floor(i / 2) * (ribbonLen * 0.94) + (side < 0 ? ribbonLen * 0.47 : 0),
        );
        const seed = (i * 7919 + sceneId.length * 131) >>> 0;
        const g = instantiateCorridorGlb(proto, seed);
        const hScale = 4.4 / Math.max(0.01, proto.height);
        const zScale = (ribbonLen * 0.98) / Math.max(0.01, proto.length);
        g.scale.set(side > 0 ? 1 : -1, hScale, zScale);
        path.sample(Math.min(S - 0.05, sPos), _F);
        g.position
          .copy(_F.p)
          .addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 0.35))
          .addScaledVector(_F.u, pathDeckClearY(0, 0.02));
        pathFrameQuat(_F, g.quaternion);
        g.name = 'FlyerWipeoutCorridorWallRibbon_' + (side > 0 ? 'R' : 'L');
        g.renderOrder = -3;
        kitRoot.add(g);
        corridorPlaced++;
        if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
      }

      // Sparse short wall panels only as joint fillers (NOT primary language)
      {
        const panelLen = panelR?.length || panelL?.length || 4;
        const nPanel = 0; // WAVE37: no near wall panels — empty asphalt
        for (let i = 0; i < nPanel; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const proto = side > 0 ? panelR : panelL;
          if (!proto) continue;
          const sPos = Math.min(S - 2, 3.5 + Math.floor(i / 2) * (panelLen * 2.1) + (side < 0 ? 1.0 : 0));
          const seed = (i * 6907 + 19) >>> 0;
          const g = instantiateCorridorGlb(proto, seed);
          const hScale = 3.4 / Math.max(0.01, proto.height);
          g.scale.set(1.0, hScale, (panelLen * 0.9) / Math.max(0.01, proto.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 6.5))
            .addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorWall_' + (side > 0 ? 'R' : 'L');
          g.renderOrder = -3;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
      }

      // WAVE36 F-Zero: FAR facade shells OFF-LANE (large lateral offset). EMPTY racing line.
      {
        const fLen = farShellR?.length || farShellL?.length || facR?.length || 16;
        // WAVE39: denser FAR Mute City skyline OUTBOARD only (never curb-hug / midlane)
        // WAVE54: only near-ahead façades at start (no full-course instantiate)
        const nFac = Math.min(6, kitCapLocal(Math.max(8, Math.floor(w54StreamHi / Math.max(8, fLen * 0.9))), 4));
        for (let i = 0; i < nFac; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const proto = side > 0 ? farShellR : farShellL;
          if (!proto) continue;
          const sPos = Math.min(w54StreamHi - 2, 8 + Math.floor(i / 2) * (fLen * 0.9) + (side < 0 ? fLen * 0.4 : 0));
          if (sPos > w54StreamHi || sPos < w54StreamLo) continue;
          const seed = (i * 5303 + 41 + sceneId.length * 17) >>> 0;
          const g = instantiateCorridorGlb(proto, seed);
          const hScale =
            (sceneId === 'canyon' ? 18 : sceneId === 'yard' ? 17 : 19) / Math.max(0.01, proto.height); // WAVE41 taller multi-mass
          g.scale.set(side > 0 ? 1 : -1, hScale, (fLen * 0.98) / Math.max(0.01, proto.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          // >= 1.5x deck half-width beyond barrier — mute-city off-lane
          // WAVE37: push FAR facade MUCH further outboard (Mute-City skyline, never curb-hug)
          const yardExtra = sceneId === 'yard' ? 10 : sceneId === 'canyon' ? 8 : 10;
          const farX = clearLaneOutboard(barrierX + Math.max(deckW * 4.2, 52) + yardExtra + (i % 3) * 5.5); // WAVE41 closer mid/far readable
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * farX)
            .addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.userData.laneS = sPos; g.userData.lat = farX; g.userData.side = side;
          g.name = 'FlyerWipeoutCorridorFarFacade';
          g.renderOrder = -4;
          // WAVE39: façades dimmer than edge/boost hierarchy
          g.traverse((o) => {
            const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
            if (!mesh || !mesh.material) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const raw of mats) {
              const m = raw as THREE.MeshStandardMaterial;
              if (!m) continue;
              if ('emissiveIntensity' in m) {
                m.emissiveIntensity = Math.min(0.85, Math.max(0.12, (m.emissiveIntensity || 0.5) * 0.45));
              }
              if (m.color) {
                const hsl = { h: 0, s: 0, l: 0 };
                m.color.getHSL(hsl);
                m.color.setHSL(hsl.h, Math.min(0.55, hsl.s * 0.85), hsl.l * 0.72);
              }
            }
          });
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
      }


      // WAVE41 mass kits mid/far — towers / billboards / scaffold rings / gantries (METHOD CHANGE vs thin shells)
      {
        const massIdsR = (
          sceneId === 'canyon'
            ? (['mass_tower_cluster_canyon_r', 'mass_billboard_stack_canyon_r', 'mass_scaffold_ring_canyon_r', 'mass_gantry_block_canyon_r'] as const)
            : sceneId === 'yard'
              ? (['mass_tower_cluster_yard_r', 'mass_billboard_stack_yard_r', 'mass_scaffold_ring_yard_r', 'mass_gantry_block_yard_r'] as const)
              : (['mass_tower_cluster_rift_r', 'mass_billboard_stack_rift_r', 'mass_scaffold_ring_rift_r', 'mass_gantry_block_rift_r'] as const)
        );
        const massIdsL = (
          sceneId === 'canyon'
            ? (['mass_tower_cluster_canyon_l', 'mass_billboard_stack_canyon_l', 'mass_scaffold_ring_canyon_l', 'mass_gantry_block_canyon_l'] as const)
            : sceneId === 'yard'
              ? (['mass_tower_cluster_yard_l', 'mass_billboard_stack_yard_l', 'mass_scaffold_ring_yard_l', 'mass_gantry_block_yard_l'] as const)
              : (['mass_tower_cluster_rift_l', 'mass_billboard_stack_rift_l', 'mass_scaffold_ring_rift_l', 'mass_gantry_block_rift_l'] as const)
        );
        // WAVE54: mass only inside stream window (pool/recycle rest via FlyerRun stream)
        const nMass = Math.min(8, kitCapLocal(Math.max(8, Math.floor(w54StreamHi / 14)), 4));
        for (let i = 0; i < nMass; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const ids = side > 0 ? massIdsR : massIdsL;
          const massId = ids[i % ids.length];
          const proto = libC[massId];
          if (!proto) continue;
          const sPos = Math.min(w54StreamHi - 2, 4 + Math.floor(i / 2) * Math.max(12, w54StreamHi / Math.max(1, Math.floor(nMass / 2))) + (side < 0 ? 3.5 : 0));
          if (sPos > w54StreamHi || sPos < w54StreamLo) continue;
          const seed = (i * 6151 + 29 + sceneId.length * 13) >>> 0;
          const gMass = instantiateCorridorGlb(proto, seed);
          const hScale = (sceneId === 'yard' ? 15 : sceneId === 'canyon' ? 14 : 15) / Math.max(0.01, proto.height);
          const zScale = (14 + (i % 3) * 2) / Math.max(0.01, proto.length);
          gMass.scale.set(side > 0 ? 1 : -1, hScale, zScale);
          path.sample(Math.min(S - 0.05, sPos), _F);
          // Mid layer closer than far shells but still CLEAR_LANE outboard — sustain through hairpin
          const midX = clearLaneOutboard(barrierX + Math.max(deckW * 2.4, sceneId === 'yard' ? 28 : 32) + (i % 4) * 3.8);
          gMass.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * midX)
            .addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, gMass.quaternion);
          gMass.userData.laneS = sPos; gMass.userData.lat = midX; gMass.userData.side = side;
          gMass.name = 'FlyerWipeoutCorridorMassKit';
          gMass.renderOrder = -3;
          kitRoot.add(gMass);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
      }

      // Ad boards: wide / tall / mega — denser mid billboards
      {
        const nAd = 0; // WAVE37: ads off — empty asphalt + far skyline only
        for (let i = 0; i < nAd; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const proto = (i % 5 === 0 ? adM : i % 3 === 0 ? adT : adW) || adW || adT || adM;
          if (!proto) continue;
          const sPos = Math.min(S - 4, 8 + i * ((S - 24) / Math.max(1, nAd)));
          const seed = (i * 6701 + 7) >>> 0;
          const g = instantiateCorridorGlb(proto, seed);
          const isMega = proto.id === 'ad_board_mega';
          const isTall = proto.id === 'ad_board_tall';
          const hScale = (isMega ? 5.2 : isTall ? 4.2 : 2.6) / Math.max(0.01, proto.height);
          const zScale = (isMega ? 4.0 : isTall ? 1.6 : 2.8) / Math.max(0.01, proto.length);
          g.scale.set(side > 0 ? 1 : -1, hScale, zScale);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * clearLaneOutboard(barrierX + Math.max(deckW * 2.0, 22) + (sceneId === 'yard' ? 8 : 4)))
            .addScaledVector(_F.u, pathDeckClearY(0, 0.05));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorAdBoard';
          g.renderOrder = -2;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
      }

      // Midground wall-dress strip denser
      if (dress) {
        const dLen = dress.length || 4;
        const nDress = 0; // WAVE37: no near-curb dress pillars on ribbon // F-Zero: dress sparse outboard
        for (let i = 0; i < nDress; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 2, 2 + Math.floor(i / 2) * (dLen * 0.82) + (side < 0 ? 1.2 : 0));
          const seed = (i * 6151 + 17) >>> 0;
          const g = instantiateCorridorGlb(dress, seed);
          const hScale = 3.1 / Math.max(0.01, dress.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, (dLen * 0.95) / Math.max(0.01, dress.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 1.2)).addScaledVector(_F.u, pathDeckClearY(0, 0.05));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorDress';
          g.renderOrder = -2;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(dress.id)) usedIds.push(dress.id);
        }
      }

      // WAVE36 F-Zero: curb L/R + continuous emissive edge rails (track defined by light)
      {
        const cLen = curbRR?.length || curbRL?.length || 10;
        const nCurb = kitCapLocal(Math.max(6, Math.floor(w54StreamHi / Math.max(9, cLen * 0.92))), 4);
        for (let i = 0; i < nCurb; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const proto = side > 0 ? curbRR : curbRL;
          if (!proto) continue;
          const sPos = Math.min(
            S - 2,
            1.0 + Math.floor(i / 2) * (cLen * 0.94) + (side < 0 ? cLen * 0.47 : 0),
          );
          const seed = (i * 4271 + 99) >>> 0;
          const g = instantiateCorridorGlb(proto, seed);
          const hScale = 0.72 / Math.max(0.01, proto.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, (cLen * 0.98) / Math.max(0.01, proto.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * (barrierX - 0.05))
            .addScaledVector(_F.u, pathDeckClearY(0, 0.0));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorCurbRibbon';
          g.renderOrder = -1;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
        // Emissive edge strips on curb lip — hottest neon hierarchy
        const eLen = edgeZR?.length || edgeZL?.length || 10;
        const nEdge = kitCapLocal(Math.max(6, Math.floor(w54StreamHi / Math.max(9, eLen * 0.92))), 4);
        for (let i = 0; i < nEdge; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const proto = side > 0 ? edgeZR : edgeZL;
          if (!proto) continue;
          const sPos = Math.min(
            S - 2,
            1.0 + Math.floor(i / 2) * (eLen * 0.94) + (side < 0 ? eLen * 0.47 : 0),
          );
          const seed = (i * 5003 + 17) >>> 0;
          const g = instantiateCorridorGlb(proto, seed);
          const hScale = 0.22 / Math.max(0.01, proto.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, (eLen * 0.98) / Math.max(0.01, proto.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * (barrierX + 0.08))
            .addScaledVector(_F.u, pathDeckClearY(0.12, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorEmissiveEdge';
          g.renderOrder = 2;
          // WAVE39: edges/gates/boost hottest; façades stay dimmer
          g.traverse((o) => {
            const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
            if (!mesh || !mesh.material) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const raw of mats) {
              const m = raw as THREE.MeshStandardMaterial;
              if (!m) continue;
              if (m.emissive) {
                // WAVE41 T-W40-03: L=cyan R=magenta contract (ignore scene mono-hue)
                const hx = side < 0 ? 0x22f0ff : 0xff2a9a;
                m.emissive.setHex(hx);
              }
              if (m.color) m.color.setHex(side < 0 ? 0x88f8ff : 0xff88c8);
              if ('emissiveIntensity' in m) {
                m.emissiveIntensity = Math.min(4.8, Math.max(2.8, (m.emissiveIntensity || 1) * 2.2));
              }
            }
          });
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(proto.id)) usedIds.push(proto.id);
        }
      }

      // WAVE36: sparse bank halfpipe segments (track geo, not props)
      if (bankPipe) {
        const bLen = bankPipe.length || 10;
        const nBank = 0; // WAVE37: bank_halfpipe reads as tall midlane pillar on bank stills — pathFrame banks deck already
        for (let i = 0; i < nBank; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 4, 40 + i * ((S - 80) / Math.max(1, nBank)));
          const seed = (i * 6113 + 7) >>> 0;
          const g = instantiateCorridorGlb(bankPipe, seed);
          const hScale = 3.8 / Math.max(0.01, bankPipe.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, (bLen * 0.95) / Math.max(0.01, bankPipe.length));
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * clearLaneOutboard(barrierX - 0.4))
            .addScaledVector(_F.u, pathDeckClearY(0, 0.0));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorBank';
          g.renderOrder = -3;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(bankPipe.id)) usedIds.push(bankPipe.id);
        }
      }

      // WAVE36: sparse boost pad overlays (telegraphed speed gift)
      if (boostPadGlb) {
        const nBp = kitCapLocal(Math.max(2, Math.floor(w54StreamHi / 90)), 1);
        for (let i = 0; i < nBp; i++) {
          const sPos = Math.min(S - 4, 35 + i * ((S - 70) / Math.max(1, nBp)));
          const seed = (i * 7331 + 3) >>> 0;
          const g = instantiateCorridorGlb(boostPadGlb, seed);
          const zScale = 4.2 / Math.max(0.01, boostPadGlb.length);
          const xScale = 3.0 / Math.max(0.01, boostPadGlb.width);
          g.scale.set(xScale, 1.0, zScale);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorBoostPad';
          g.renderOrder = 1;
          g.traverse((o) => {
            const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
            if (!mesh || !mesh.material) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const raw of mats) {
              const m = raw as THREE.MeshStandardMaterial;
              if (m && 'emissiveIntensity' in m) {
                m.emissiveIntensity = Math.min(3.8, Math.max(2.0, (m.emissiveIntensity || 1) * 1.9));
                if (m.emissive) m.emissive.setHex(0x22f0ff);
              }
            }
          });
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(boostPadGlb.id)) usedIds.push(boostPadGlb.id);
        }
      }

      // WAVE36: edge scaffold SPARSE + outboard (never densify into driveable lane)
      if (scaffold) {
        const nSc = grounded ? 0 : kitCapLocal(Math.max(14, Math.floor(S / 36)), 6); // WAVE37: no near scaffold pillars
        for (let i = 0; i < nSc; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 3, 18 + i * ((S - 40) / Math.max(1, nSc)));
          const seed = (i * 2999 + 13) >>> 0;
          const g = instantiateCorridorGlb(scaffold, seed);
          const hScale = 2.8 / Math.max(0.01, scaffold.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, 1.0);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 0.65)).addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorScaffold';
          g.renderOrder = -2;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(scaffold.id)) usedIds.push(scaffold.id);
        }
      }

      // WAVE36: spike racks SPARSE edge telegraph — outboard of clear lane
      if (spikeRack) {
        const nSp = kitCapLocal(Math.max(2, Math.floor(w54StreamHi / 48)), 1);
        for (let i = 0; i < nSp; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 3, 28 + i * ((S - 60) / Math.max(1, nSp)));
          const seed = (i * 3881 + 23) >>> 0;
          const g = instantiateCorridorGlb(spikeRack, seed);
          const hScale = 1.4 / Math.max(0.01, spikeRack.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, 1.1);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 0.55)).addScaledVector(_F.u, pathDeckClearY(0, 0.01));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorSpikeRack';
          g.renderOrder = -1;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(spikeRack.id)) usedIds.push(spikeRack.id);
        }
      }

      // WAVE37: skip grounded arch_gate — vertical posts planted ON ribbon (Mute-City wants empty asphalt).
      // Wormhole may still use gantry as telegraph; grounded F-Zero = no midlane pillars.
      if (gantry && !grounded) {
        const nG = kitCapLocal(Math.max(4, Math.floor(S / 110)), 2);
        for (let i = 0; i < nG; i++) {
          const sPos = Math.min(S - 4, 28 + i * (S / Math.max(1, nG)));
          const seed = (i * 3343 + 5) >>> 0;
          const g = instantiateCorridorGlb(gantry, seed);
          const hScale = 6.4 / Math.max(0.01, gantry.height);
          const xScale = (barrierX * 3.4) / Math.max(0.01, gantry.width);
          g.scale.set(Math.min(2.2, xScale), hScale, 1.0);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0.35, 0.08));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorGantry';
          g.renderOrder = -2;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(gantry.id)) usedIds.push(gantry.id);
        }
      }

      // Plated deck segment overlays
      if (deckSeg) {
        const dLen = deckSeg.length || 4;
        const nDeck = kitCapLocal(Math.max(4, Math.floor(w54StreamHi / 10)), 3);
        for (let i = 0; i < nDeck; i++) {
          const sPos = Math.min(S - 2, 1 + i * (dLen * 0.95));
          const seed = (i * 5113 + 3) >>> 0;
          const g = instantiateCorridorGlb(deckSeg, seed);
          const zScale = (dLen * 0.98) / Math.max(0.01, deckSeg.length);
          const xScale = (deckW * 0.98) / Math.max(0.01, deckSeg.width);
          g.scale.set(xScale, 1.0, zScale);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0, 0.01));
          pathFrameQuat(_F, g.quaternion);
          g.userData.laneS = sPos;
          g.name = 'FlyerWipeoutCorridorDeckPlate';
          g.renderOrder = -5;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(deckSeg.id)) usedIds.push(deckSeg.id);
        }
      }


      // WAVE36 F-Zero: skip midlane laser-gate GLB on grounded (arch_gate is landmark)
      if (laserGate && !grounded) {
        const nLg = kitCapLocal(Math.max(1, Math.floor(w54StreamHi / 120)), 1);
        for (let i = 0; i < nLg; i++) {
          const sPos = Math.min(S - 4, 55 + i * ((S - 100) / Math.max(1, nLg)));
          const seed = (i * 4517 + 31) >>> 0;
          const g = instantiateCorridorGlb(laserGate, seed);
          const hScale = 2.6 / Math.max(0.01, laserGate.height);
          const xScale = (barrierX * 1.05) / Math.max(0.01, laserGate.width * 0.5);
          g.scale.set(Math.min(1.35, xScale), hScale, 1.0);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0, 0.02));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorLaserGate';
          g.renderOrder = -1;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(laserGate.id)) usedIds.push(laserGate.id);
        }
      }


      // WAVE36 cone clusters — sparse edge telegraph OUTBOARD (safe-lane negative space)
      if (coneCluster) {
        const nCc = grounded ? 0 : kitCapLocal(Math.max(3, Math.floor(S / 110)), 1); // WAVE37: no cones on grounded
        for (let i = 0; i < nCc; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 3, 30 + i * ((S - 70) / Math.max(1, nCc)));
          const seed = (i * 4129 + 47) >>> 0;
          const g = instantiateCorridorGlb(coneCluster, seed);
          const hScale = 1.2 / Math.max(0.01, coneCluster.height);
          g.scale.set(side > 0 ? 1 : -1, hScale, 1.05);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position
            .copy(_F.p)
            .addScaledVector(_F.r, side * clearLaneOutboard(barrierX + 0.4))
            .addScaledVector(_F.u, pathDeckClearY(0, 0.01));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorConeCluster';
          g.renderOrder = -1;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(coneCluster.id)) usedIds.push(coneCluster.id);
        }
      }

      // WAVE37: rib_arch posts plant ON ribbon — skip on grounded F-Zero (empty asphalt)
      if (ribArch && !grounded) {
        const nRa = kitCapLocal(Math.max(1, Math.floor(w54StreamHi / 140)), 1);
        for (let i = 0; i < nRa; i++) {
          const sPos = Math.min(S - 4, 8 + i * ((S - 24) / Math.max(1, nRa)));
          const seed = (i * 3727 + 11) >>> 0;
          const g = instantiateCorridorGlb(ribArch, seed);
          const hScale = 4.6 / Math.max(0.01, ribArch.height);
          const xScale = (barrierX * 2.0) / Math.max(0.01, ribArch.width);
          g.scale.set(Math.min(1.35, xScale), hScale, 1.0);
          path.sample(Math.min(S - 0.05, sPos), _F);
          g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0, 0.04));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorRibArch';
          g.renderOrder = -2;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(ribArch.id)) usedIds.push(ribArch.id);
        }
      }

      // WAVE37: horizon_shell banked with path can silhouette as midlane cubes — skip grounded
      if (horizon && !grounded) {
        const nH = kitCapLocal(Math.max(4, Math.floor(w54StreamHi / 24)), 2);
        for (let i = 0; i < nH; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 6, 20 + i * ((S - 40) / Math.max(1, nH)));
          const seed = (i * 2203 + 61) >>> 0;
          const g = instantiateCorridorGlb(horizon, seed);
          const hScale = (sceneId === 'rift' ? 18 : sceneId === 'yard' ? 16 : 15) / Math.max(0.01, horizon.height);
          const zScale = 8.2 / Math.max(0.01, horizon.length);
          g.scale.set(side > 0 ? 1.2 : -1.2, hScale, zScale);
          path.sample(Math.min(S - 0.05, sPos), _F);
          const xOff = barrierX + (sceneId === 'rift' ? 70 : sceneId === 'yard' ? 90 : 80); // WAVE37 far horizon
          g.position.copy(_F.p).addScaledVector(_F.r, side * xOff).addScaledVector(_F.u, pathDeckClearY(0, -2.5));
          pathFrameQuat(_F, g.quaternion);
          g.name = 'FlyerWipeoutCorridorHorizon';
          g.renderOrder = -8;
          kitRoot.add(g);
          corridorPlaced++;
          if (!usedIds.includes(horizon.id)) usedIds.push(horizon.id);
        }
      }
    }

    kitRoot.userData.corridorGlbPlaced = corridorPlaced;
    kitRoot.userData.corridorGlbIds = usedIds;
    if (corridorPlaced > 0) {
      const alias = new THREE.Group();
      alias.name = 'FlyerWipeoutWallDressRib';
      alias.visible = false;
      alias.userData.w35Alias = true;
      kitRoot.add(alias);
    }
  }

  // WAVE31 wormhole: richer honeycomb cadence (void BG kept)
  if (!grounded) {
    const libC = getFlyerCorridorLib();
    const honey = libC?.wormhole_honeycomb;
    if (honey) {
      const whRoot = new THREE.Group();
      whRoot.name = 'FlyerWipeoutCorridorKit';
      pack.add(whRoot);
      let placed = 0;
      const nH = kitCap(quality, Math.max(80, Math.floor(S / 4.6)), 38); // WAVE34 denser wormhole ribs
      for (let i = 0; i < nH; i++) {
        const sPos = Math.min(S - 2, 1.5 + i * (S / Math.max(1, nH)));
        const seed = (i * 4409 + 19) >>> 0;
        const g = instantiateCorridorGlb(honey, seed);
        const rad = Math.min(deckW * 0.72, 12.5); // WAVE52: was cap 5.5 — allow 2× tube
        const s = (rad * 2) / Math.max(0.01, Math.max(honey.width, honey.height));
        // alternate scale for richer cadence
        const pulse = 0.95 + (i % 3) * 0.14; // WAVE52 stronger rib cadence pulse
        g.scale.set(s * pulse, s * pulse, s * (0.45 + (i % 2) * 0.12));
        path.sample(Math.min(S - 0.05, sPos), _F);
        g.position.copy(_F.p).addScaledVector(_F.u, pathDeckClearY(0, 2.2));
        pathFrameQuat(_F, g.quaternion);
        g.rotateX(Math.PI / 2);
        if (i % 2 === 1) g.rotateZ(Math.PI / 16);
        g.name = 'FlyerWipeoutWormholeHoneycomb';
        g.renderOrder = -3;
        whRoot.add(g);
        placed++;
      }
      whRoot.userData.corridorGlbPlaced = placed;
      whRoot.userData.corridorGlbIds = ['wormhole_honeycomb'];
    }
  }

  // --- 6) BG: WAVE21 CITY GLB skyline (unique silhouettes; no adjacent same GLB) ---
  if (grounded) {
    const cityRoot = new THREE.Group();
    cityRoot.name = 'FlyerWipeoutBuildingLibrary';
    pack.add(cityRoot);

    const lib = getFlyerCityLib();
    const protos = lib ? availableCityProtos(lib) : [];
    const useGlb = protos.length >= 4;

    if (useGlb && lib) {
      // WAVE21c HOTFIX: seat buildings ON GroundShelf (not path-frame u / spline Y).
      // Highway stays on FlyerWipeoutHighwayDeck; lots use smoothed groundProfile Y.
      if (!groundProfile) groundProfile = cachedGroundYProfile(path);
      const plinthMatA = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        map: livedInBarrierMap(3),
        emissive: new THREE.Color(0x2a2818).multiplyScalar(0.7),
        shininess: 28,
        specular: new THREE.Color(0x4a4a40),
        toneMapped: false,
        fog: false,
      });
      const plinthMatB = plinthMatA.clone();
      plinthMatB.map = livedInBarrierMap(5);
      const plinthGeo = new THREE.BoxGeometry(1, 1, 1);
      const plinthH = 0.28;
      const layers: { layer: 0 | 1 | 2; n: number; far0: number; farSpan: number; h0: number; hSpan: number }[] = [
        // WAVE37c: skyline FAR — Mute-City distance (never curb-hug; account for GLB half-width)
        // A handful of real GLBs in the near window. The instanced skyline carries the rest.
        // Unique-material GLB towers were ~25 draws each. The instanced skyline is the horizon.
        { layer: 0, n: 0, far0: barrierX + 50, farSpan: 22, h0: 10, hSpan: 14 },
        { layer: 1, n: 0, far0: barrierX + 74, farSpan: 28, h0: 12, hSpan: 16 },
        { layer: 2, n: 0, far0: barrierX + 98, farSpan: 20, h0: 14, hSpan: 8 },
      ];
      let placed = 0;
      let plinths = 0;
      const seatBuilding = (
        g: THREE.Group,
        sPos: number,
        side: number,
        far: number,
        yaw: number,
        seed: number
      ) => {
        path.sample(Math.min(S - 0.05, sPos), _F);
        const ht = horizTangentFromFrame();
        const gY = sampleGroundY(groundProfile!, sPos);
        // Same lateral as GroundShelf ribbon (path.r * far), then snap world-Y to shelf
        const px = _F.p.x + _F.r.x * side * far;
        const pz = _F.p.z + _F.r.z * side * far;
        const baseY = gY + 0.02;
        g.position.set(px, baseY, pz);
        // AABB snap to shelf: force visual footprint onto GroundShelf (no hover from pivot)
        g.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(g);
        if (Number.isFinite(bb.min.y)) {
          g.position.y += gY - bb.min.y;
        }
        // World-up orientation; yaw only (do not bank with highway)
        // World-up lot orientation (do not bank with highway)
        const up = new THREE.Vector3(0, 1, 0);
        const hr = horizRightFromFrame().clone();
        hr.crossVectors(up, ht);
        if (hr.lengthSq() < 1e-8) hr.set(1, 0, 0); else hr.normalize();
        ht.crossVectors(hr, up).normalize();
        _mat4.makeBasis(hr, up, ht);
        const qPath = new THREE.Quaternion().setFromRotationMatrix(_mat4);
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        g.quaternion.copy(qPath).multiply(qYaw);
        // Plinth / lot pad under footprint
        const clamp = g.userData.cityScaleClamp || { sx: 6, sz: 6 };
        const protoW = g.userData._protoW || 1;
        const protoD = g.userData._protoD || 1;
        const pw = Math.max(5.5, Math.min(16, protoW * (clamp.sx || 6) + 2.4));
        const pd = Math.max(5.5, Math.min(16, protoD * (clamp.sz || 6) + 2.4));
        const plinth = new THREE.Mesh(plinthGeo, seed % 2 === 0 ? plinthMatA : plinthMatB);
        plinth.name = 'FlyerWipeoutBuildingPlinth';
        // Plinth top ~ flush with shelf; slight raise so lot reads as dock plate
        plinth.position.set(g.position.x, gY + plinthH * 0.35, g.position.z);
        plinth.scale.set(pw, plinthH, pd);
        plinth.quaternion.copy(qPath);
        plinth.frustumCulled = true;
        plinth.renderOrder = -11;
        plinth.userData.buildingGround = true;
        // WAVE38: hairpin-chord guard — if footprint sits inside CLEAR_LANE of ANY nearby path sample, skip
        g.updateMatrixWorld(true);
        const bbChord = new THREE.Box3().setFromObject(g);
        const cChord = new THREE.Vector3();
        bbChord.getCenter(cChord);
        const nearChord = nearestPathLatUp(path, cChord, sPos);
        const halfWChord = Math.max(2, (bbChord.max.x - bbChord.min.x) * 0.35, (bbChord.max.z - bbChord.min.z) * 0.35);
        if (Math.abs(nearChord.lat) < CLEAR_LANE_HALF + halfWChord && nearChord.up > -2 && nearChord.up < 28) {
          // push further outboard once
          const push = CLEAR_LANE_HALF + halfWChord + 12 - Math.abs(nearChord.lat);
          g.position.x += _F.r.x * side * push;
          g.position.z += _F.r.z * side * push;
          plinth.position.x = g.position.x;
          plinth.position.z = g.position.z;
          g.updateMatrixWorld(true);
          bbChord.setFromObject(g);
          bbChord.getCenter(cChord);
          const near2 = nearestPathLatUp(path, cChord, sPos);
          if (Math.abs(near2.lat) < CLEAR_LANE_HALF + halfWChord * 0.85) {
            // WAVE41: push AGAIN outboard (sustain hairpin skyline) — never midlane, never void drop
            const push2 = CLEAR_LANE_HALF + halfWChord + 28 - Math.abs(near2.lat);
            g.position.x += _F.r.x * side * push2;
            g.position.z += _F.r.z * side * push2;
            plinth.position.x = g.position.x;
            plinth.position.z = g.position.z;
          }
        }
        cityRoot.add(plinth);
        plinths++;
        cityRoot.add(g);
        placed++;
      };
      for (const L of layers) {
        let prevL: CityGlbId | null = null;
        let prevR: CityGlbId | null = null;
        let cursor = 1.2 + L.layer * 1.4;
        for (let i = 0; i < L.n; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const stepBase = (Math.min(S, w54StreamHi) - 8) / Math.max(1, L.n);
          const rndJ = 0.35 + ((i * 19 + L.layer * 11) % 13) * 0.05;
          const sPos = Math.min(S - 2, cursor);
          if (sPos > w54StreamHi) break;
          cursor += stepBase * rndJ;
          const prev = side === 1 ? prevL : prevR;
          const opp = side === 1 ? prevR : prevL;
          const id = pickCityGlbId(i, L.layer, side, prev, opp);
          const proto = lib[id];
          if (!proto) continue;
          if (side === 1) prevL = id; else prevR = id;
          const seed = (i * 7919 + L.layer * 104729 + sceneId.length * 97 + (side < 0 ? 3331 : 0)) >>> 0;
          const h = L.h0 + (i % 11) * (L.hSpan / 11) + (seed % 9) * 1.8 + ((seed >>> 9) % 5) * 0.9;
          const yaw = ((seed % 31) - 15) * 0.055 + (side > 0 ? -0.18 : 0.18) + ((seed >>> 4) % 7) * 0.02;
          const g = instantiateCityGlb(proto, h, seed, yaw);
          // WAVE28 unique non-uniform scale (anti clone-box skyline)
          const ux = 0.82 + ((seed >>> 2) % 11) * 0.035;
          const uz = 0.78 + ((seed >>> 6) % 13) * 0.03;
          g.scale.x *= ux;
          g.scale.z *= uz;
          g.name = 'FlyerWipeoutCityGlb_' + id + '_L' + L.layer + '_' + i;
          g.userData._protoW = proto.width || proto.maxDim;
          g.userData._protoD = proto.depth || proto.maxDim;
          const far =
            L.far0 +
            ((i * 7 + L.layer * 11) % 9) * (L.farSpan / 9) +
            (L.layer === 2 ? ((i * 5) % 7) * 2.8 : 0) +
            (seed % 4) * 0.6;
          g.renderOrder = -5 - L.layer;
          seatBuilding(g, sPos, side, far, yaw, seed);
        }
      }

      // Far packed gap-fill on same GroundShelf (not hovering cards)
      {
        const nFill = 0;
        let prevF: CityGlbId | null = null;
        for (let i = 0; i < nFill; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 2, 0.8 + i * ((S - 4) / nFill) + ((i * 13) % 5) * 0.25);
          const id = pickCityGlbId(i + 50, 2, side, prevF, null);
          prevF = id;
          const proto = lib[id];
          if (!proto) continue;
          const seed = (0xface00 + i * 131 + side * 997) >>> 0;
          const h = Math.min(48, 20 + (i % 13) * 2.1 + (seed % 11) * 1.5);
          const yaw = ((seed % 29) - 14) * 0.06;
          const g = instantiateCityGlb(proto, h, seed, yaw);
          g.scale.x *= 0.85 + ((seed >>> 3) % 9) * 0.04;
          g.scale.z *= 0.8 + ((seed >>> 8) % 11) * 0.035;
          g.name = 'FlyerWipeoutCityGlbFill_' + id + '_' + i;
          g.userData._protoW = proto.width || proto.maxDim;
          g.userData._protoD = proto.depth || proto.maxDim;
          const far = barrierX + (sceneId === 'yard' ? 150 : sceneId === 'rift' ? 145 : 140) + (i % 17) * 4.5 + (side < 0 ? 3.0 : 0);
          g.renderOrder = -8;
          seatBuilding(g, sPos, side, far, yaw, seed);
        }
      }
      cityRoot.userData.cityGlbPlaced = placed;
      cityRoot.userData.buildingPlinths = plinths;
      cityRoot.userData.buildingGroundHotfix = true;
      cityRoot.userData.cityGlbMode = 'glb';
    } else {
      // WAVE21b HOTFIX: no FacadePending / SkyBrandFill / HorizonGrad plates (cyan flood)
      cityRoot.userData.cityGlbMode = 'pending';
      cityRoot.userData.cityGlbPlaced = 0;
    }

    // WAVE21b: no SkyBrandFill / HorizonGrad / FacadeCard flat brand plates
  }

  // --- 5b2) WAVE28 groundedness: megaShell + belly meet ground plane; continuous silhouette to horizon ---
  if (false && grounded && (sceneId === 'yard' || sceneId === 'rift' || sceneId === 'canyon')) { // WAVE37: MegaShell OFF — hairpin chord was midlane pillar
        // WAVE37 F-Zero night: dark steel megaShell FAR outboard; equirect night/space sky reads (no mauve/purple curb pillars)
    const shellMat = new THREE.MeshPhongMaterial({
      color: sceneId === 'rift' ? 0x1a2230 : sceneId === 'yard' ? 0x152028 : 0x181c28,
      emissive: new THREE.Color(sceneId === 'rift' ? 0x101828 : sceneId === 'yard' ? 0x0c1820 : 0x101018).multiplyScalar(0.45),
      map: livedInBarrierMap(sceneId === 'rift' ? 5 : 3),
      shininess: 28,
      toneMapped: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    // Far continuous megastructure — capped below skyband so dome/horizon silhouette own the upper frame
    for (const side of [1, -1] as const) {
      const geo = buildCurbRibbon(
        path,
        side * (barrierX + (sceneId === 'rift' ? 100 : sceneId === 'yard' ? 120 : 110)),
        sceneId === 'rift' ? -6 : -12,
        sceneId === 'rift' ? 16 : sceneId === 'yard' ? 22 : 20,
        sceneId === 'yard' ? 14 : sceneId === 'rift' ? 10 : 12, quality, side > 0 ? 11.1 : 12.4
      , w54StreamLo, w54StreamHi);
      const mesh = new THREE.Mesh(geo, shellMat.clone());
      mesh.name = 'FlyerWipeoutMegaShell';
      mesh.frustumCulled = true;
      mesh.renderOrder = -14;
      pack.add(mesh);
    }
    // WAVE37: REMOVED MegaShellBelly (tall purple masses hugged curb/ribbon).
    // Far MegaShell + city GLBs + arch_gate overhead own silhouette; no near-curb pillars.
    if (!groundProfile) groundProfile = cachedGroundYProfile(path);
    const dockProfile = groundProfile!;
    const dockMat = new THREE.MeshPhongMaterial({
      color: 0x8a8680,
      map: livedInBarrierMap(6),
      emissive: new THREE.Color(0x222018).multiplyScalar(0.55),
      shininess: 22,
      toneMapped: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    for (const side of [1, -1] as const) {
      const geo = buildGroundShelfRibbon(
        path,
        side,
        barrierX + 4,
        barrierX + (sceneId === 'rift' ? 28 : 32), // WAVE37 shorter shelf
        dockProfile,
        sceneId === 'rift' ? 5.2 : sceneId === 'yard' ? 4.6 : 4.2,
        quality
      );
      const mesh = new THREE.Mesh(geo, dockMat);
      mesh.name = 'FlyerWipeoutHorizonDock';
      mesh.frustumCulled = true;
      mesh.renderOrder = -13;
      mesh.userData.buildingGround = true;
      pack.add(mesh);
    }
  }

  // --- 5c) WAVE26 WORMHOLE: dense rings/ribbons/scaffold corridor (keep void BG) ---
  if (!grounded) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const torusGeo = new THREE.TorusGeometry(1, 0.12, 4, 12);
    const torusGeoOuter = new THREE.TorusGeometry(1, 0.085, 4, 10);
    const torusGeoInner = new THREE.TorusGeometry(1, 0.055, 4, 10);
    const ribMat = new THREE.MeshBasicMaterial({
      color: pal.glow,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xff44dd,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const lampMat = new THREE.MeshBasicMaterial({
      color: 0xff66dd,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: 0.92,
    });
    const scaffoldMat = new THREE.MeshBasicMaterial({
      color: 0x6a4a88,
      transparent: true,
      opacity: 0.72,
      toneMapped: false,
      fog: false,
    });
    const step = 14;
    const nRib = Math.max(16, Math.min(28, Math.floor(S / step)));
    // Connected TORUS rings — continuous tube grammar (not box stairs)
    const rings = new THREE.InstancedMesh(torusGeo, ribMat, nRib);
    rings.name = 'FlyerWipeoutTunnelRib';
    for (let i = 0; i < nRib; i++) {
      const sPos = Math.min(S - 4, 2 + (i / Math.max(1, nRib - 1)) * (S - 10));
      path.sample(THREE.MathUtils.clamp(sPos, 0, Math.max(0, S - 0.05)), _F);
      _dummy.position.copy(_F.p);
      // Torus in XY by default; align so ring faces along travel (local Z = -t)
      pathFrameQuat(_F, _dummy.quaternion);
      const rad = deckW * 0.72 + (i % 3) * 0.08;
      _dummy.scale.set(rad, rad, rad);
      _dummy.updateMatrix();
      rings.setMatrixAt(i, _dummy.matrix);
    }
    rings.instanceMatrix.needsUpdate = true;
    rings.computeBoundingSphere();
    pack.add(rings);
        // WAVE27 nested secondary + tertiary rings (honeycomb depth)
    {
      const nRib2 = Math.max(8, Math.min(16, Math.floor(S / 28)));
      const rings2 = new THREE.InstancedMesh(torusGeoInner, ribbonMat, nRib2);
      rings2.name = 'FlyerWipeoutTunnelRibInner';
      for (let i = 0; i < nRib2; i++) {
        const sPos = Math.min(S - 4, 1.0 + (i / Math.max(1, nRib2)) * (S - 8));
        path.sample(THREE.MathUtils.clamp(sPos, 0, Math.max(0, S - 0.05)), _F);
        _dummy.position.copy(_F.p);
        pathFrameQuat(_F, _dummy.quaternion);
        const rad = deckW * 0.55 + (i % 2) * 0.06;
        _dummy.scale.set(rad, rad, rad * 0.9);
        _dummy.updateMatrix();
        rings2.setMatrixAt(i, _dummy.matrix);
      }
      rings2.instanceMatrix.needsUpdate = true;
      rings2.computeBoundingSphere();
      pack.add(rings2);
      const nRib3 = Math.max(8, Math.min(20, Math.floor(S / 28)));
      const rings3 = new THREE.InstancedMesh(torusGeoOuter, ribMat, nRib3);
      rings3.name = 'FlyerWipeoutTunnelRibOuter';
      for (let i = 0; i < nRib3; i++) {
        const sPos = Math.min(S - 4, 1.6 + (i / Math.max(1, nRib3)) * (S - 8));
        path.sample(THREE.MathUtils.clamp(sPos, 0, Math.max(0, S - 0.05)), _F);
        _dummy.position.copy(_F.p);
        pathFrameQuat(_F, _dummy.quaternion);
        const rad = deckW * 0.88 + (i % 3) * 0.05;
        _dummy.scale.set(rad, rad, rad * 0.75);
        _dummy.updateMatrix();
        rings3.setMatrixAt(i, _dummy.matrix);
      }
      rings3.instanceMatrix.needsUpdate = true;
      rings3.computeBoundingSphere();
      pack.add(rings3);
    }
    // Helical ribbon strips connecting rings
    const nRibbon = Math.max(12, Math.min(28, Math.floor(S / 22)));
    const ribbons = new THREE.InstancedMesh(boxGeo, ribbonMat, nRibbon);
    ribbons.name = 'FlyerWipeoutTunnelRibbon';
    for (let i = 0; i < nRibbon; i++) {
      const sPos = Math.min(S - 3, 1.0 + (i / Math.max(1, nRibbon)) * (S - 8));
      const ang = (i * 0.55) % (Math.PI * 2);
      const rad = deckW * 0.68;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad * 0.55;
      poseAt(path, sPos, x * 0.15, y + 0.4, 0.12, 0.12, 3.2, ang);
      ribbons.setMatrixAt(i, _dummy.matrix);
    }
    ribbons.instanceMatrix.needsUpdate = true;
    ribbons.computeBoundingSphere();
    pack.add(ribbons);
    // Scaffold lattice posts + cross braces
    const nScaf = Math.max(6, Math.min(12, Math.floor(S / 40)));
    const scaf = new THREE.InstancedMesh(boxGeo, scaffoldMat, nScaf * 4);
    scaf.name = 'FlyerWipeoutTunnelScaffold';
    let si = 0;
    for (let i = 0; i < nScaf; i++) {
      const sPos = Math.min(S - 4, 1.2 + (i / Math.max(1, nScaf)) * (S - 8));
      for (const side of [1, -1] as const) {
        poseAt(path, sPos, side * (barrierX + 0.15), 2.8, 0.12, 5.6, 0.12);
        scaf.setMatrixAt(si++, _dummy.matrix);
        poseAt(path, sPos, side * (barrierX * 0.5), 5.2, deckW * 0.4, 0.1, 0.1);
        scaf.setMatrixAt(si++, _dummy.matrix);
      }
    }
    for (; si < nScaf * 4; si++) {
      poseAt(path, 2, 0, -20, 0.01, 0.01, 0.01);
      scaf.setMatrixAt(si, _dummy.matrix);
    }
    scaf.instanceMatrix.needsUpdate = true;
    scaf.computeBoundingSphere();
    pack.add(scaf);
    // WAVE28 continuous scaffold rings (tube grammar — not box stairs)
    {
      const nScafRing = Math.max(6, Math.min(14, Math.floor(S / 36)));
      const scafRings = new THREE.InstancedMesh(torusGeoOuter, scaffoldMat, nScafRing);
      scafRings.name = 'FlyerWipeoutTunnelScaffoldRing';
      for (let i = 0; i < nScafRing; i++) {
        const sPos = Math.min(S - 4, 2.5 + (i / Math.max(1, nScafRing)) * (S - 8));
        path.sample(THREE.MathUtils.clamp(sPos, 0, Math.max(0, S - 0.05)), _F);
        _dummy.position.copy(_F.p);
        pathFrameQuat(_F, _dummy.quaternion);
        const rad = deckW * 0.78;
        _dummy.scale.set(rad, rad, rad * 0.65);
        _dummy.updateMatrix();
        scafRings.setMatrixAt(i, _dummy.matrix);
      }
      scafRings.instanceMatrix.needsUpdate = true;
      scafRings.computeBoundingSphere();
      pack.add(scafRings);
    }
    // lamps along tunnel
    const nLamp = Math.max(12, Math.min(32, Math.floor(S / 20)));
    const lamps = new THREE.InstancedMesh(boxGeo, lampMat, nLamp * 2);
    lamps.name = 'FlyerWipeoutTunnelLamp';
    for (let i = 0; i < nLamp * 2; i++) {
      const li = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const sPos = Math.min(S - 3, 1.2 + (li / Math.max(1, nLamp)) * (S - 8) + (side < 0 ? 1.3 : 0));
      poseAt(path, sPos, side * (barrierX - 0.25), 3.6 + (li % 3) * 0.25, 0.22, 0.16, 0.5);
      lamps.setMatrixAt(i, _dummy.matrix);
    }
    lamps.instanceMatrix.needsUpdate = true;
    lamps.computeBoundingSphere();
    pack.add(lamps);
    // arch crowns every few rings
    const nArch = Math.max(6, Math.min(14, Math.floor(nRib / 4)));
    const arches = new THREE.InstancedMesh(boxGeo, ribMat, nArch);
    arches.name = 'FlyerWipeoutTunnelArch';
    for (let i = 0; i < nArch; i++) {
      const sPos = Math.min(S - 4, 3 + i * step * 2);
      poseAt(path, sPos, 0, 5.6, deckW * 1.15, 0.18, 0.4);
      arches.setMatrixAt(i, _dummy.matrix);
    }
    arches.instanceMatrix.needsUpdate = true;
    arches.computeBoundingSphere();
    pack.add(arches);
  }

  if (grounded) placeFastSkyline(pack, path, sceneId, pal, quality);
  hideCompetingWipeoutFloors(root);
  // Corridor GLB clones are tens of materials each and stay in the chase window.
  // The unlit deck, rails, skyline and speed lines are the flight. The kit stays for stills tools.
  const heavyKit = pack.getObjectByName('FlyerWipeoutCorridorKit');
  if (heavyKit) {
    heavyKit.visible = false;
    // Hidden for play. Park it off the updating graph so the renderer does not walk the GLB clones.
    heavyKit.removeFromParent();
    pack.userData.parkedCorridorKit = heavyKit;
  }
  if (!grounded) hideVoidTravelRoads(root);
  cullClearLaneIntruders(root, path);
  freezeFlightStatic(pack);
  } catch (err) {
    try { (globalThis as any).__WIPEOUT_W21_ERR = String((err as any)?.message || err); console.warn('[wipeout-w21]', err); } catch {}
  } finally {
    try {
      const deck = pack.getObjectByName('FlyerWipeoutHighwayDeck');
      (globalThis as any).__WIPEOUT_W21 = {
        v: '1.1.75', rev: 'flight-budget', wave54:true, streamAhead:W54_STREAM_AHEAD_M, streamBehind:W54_STREAM_BEHIND_M, streamSeg:W54_STREAM_SEG_M, wave47:true, flightSettle:true, voidNoRoad:true, wave46:true, speedLean:true, perfectRunIncentive:true, cubeAimLean:true, wave45:true, interactSilhouettes:true, wave44:true, interactPlace:true, wave43:true, interactives:true, endPortal:true, ringChain:true, enemyCubes:true, buffPickups:true, wave42:true, heavyStrafe:true, wallSlap:true, quietHud:true, wave41:true, muteCityMass:true, bilateralRails:true, craftVisible:true, wave40:true, wave39:true, fzeroFeel:true, thrusterBloom:true, wave38:true, clearPillars:true, wave37:true, fzeroOutboard:true, wave36:true, fzeroBallistic:true, clearLane:true, wave35:true, wave34:true, wave33:true, wave32:true, wave31:true, wave30:true, wave29:true, wave28:true, wave27:true, wave26:true, wave25b:true, discardedDensifyThrash:true, blenderCorridorKit:true, hazardPathFrame:true, checkerCraftFix:true, padsSideLane:true, padsYawFlat:false, padsPathFrame:true, pathFrameProps:true, pathFrameRH:true, padsDecal:true, midDense:false, facadeOverlay:true, noseTangent:true, wave25:true, containmentWall:true, platedDeck: grounded, megaShell: !!pack.getObjectByName('FlyerWipeoutMegaShell'), tunnelRings:true, underDeckSkirt:false, hazardGrammar:true, clearLaneHalf: CLEAR_LANE_HALF,
        sceneId,
        children: pack.children.length,
        names: pack.children.map((c) => c.name),
        buildingLibrary: !!pack.getObjectByName('FlyerWipeoutBuildingLibrary'),
        cityGlb: !!(pack.getObjectByName('FlyerWipeoutBuildingLibrary') as any)?.userData?.cityGlbMode,
        cityGlbMode: (pack.getObjectByName('FlyerWipeoutBuildingLibrary') as any)?.userData?.cityGlbMode || null,
        cityGlbPlaced: (pack.getObjectByName('FlyerWipeoutBuildingLibrary') as any)?.userData?.cityGlbPlaced || 0,
        curbBarrier: !!pack.getObjectByName('FlyerWipeoutCurbBarrierV0'),
        noCrateWalls: true,
        presets: 11,
        uniqueMats: true,
        highwayDeck: !!deck,
        highwayTileM: HIGHWAY_TILE_M,
        boostStep: 40,
        cyanClipHotfix: true,
        buildingGroundHotfix: true,
        groundShelf: !!pack.getObjectByName('FlyerWipeoutGroundShelf'),
        groundApron: !!pack.getObjectByName('FlyerWipeoutGroundApron'),
        buildingPlinths: (pack.getObjectByName('FlyerWipeoutBuildingLibrary') as any)?.userData?.buildingPlinths || 0,
        industrialMid: !!pack.userData.parkedCorridorKit || !!pack.getObjectByName('FlyerWipeoutWallDressRib') || !!pack.getObjectByName('FlyerWipeoutWallArch'),
        megaShellBelly: !!pack.getObjectByName('FlyerWipeoutMegaShellBelly'),
        pathLamp: !!pack.getObjectByName('FlyerWipeoutPathLamp'),
        tunnelRibs: !!pack.getObjectByName('FlyerWipeoutTunnelRib'),
        tunnelLamps: !!pack.getObjectByName('FlyerWipeoutTunnelLamp'),
        corridorKit: !!pack.userData.parkedCorridorKit,
        corridorGlbPlaced: (pack.userData.parkedCorridorKit as any)?.userData?.corridorGlbPlaced || 0,
        corridorGlbIds: (pack.userData.parkedCorridorKit as any)?.userData?.corridorGlbIds || [],
        wallDress: !!pack.getObjectByName('FlyerWipeoutCorridorDress') || !!pack.getObjectByName('FlyerWipeoutWallDressRib'),
        err: (globalThis as any).__WIPEOUT_W21_ERR || null,
      };
      (globalThis as any).__WIPEOUT_W20 = (globalThis as any).__WIPEOUT_W21;
      (globalThis as any).__WIPEOUT_W19 = (globalThis as any).__WIPEOUT_W21;
      (globalThis as any).__WIPEOUT_W18 = (globalThis as any).__WIPEOUT_W21;
    } catch {}
  }
}



/** Dispose GPU resources for a stream segment group. */
function disposeStreamSeg(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as any).isMesh && !(mesh as any).isInstancedMesh) return;
    if (mesh.geometry && !(mesh.geometry as any).userData?.shared) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => { if (m && !(m as any).userData?.shared) m.dispose(); });
    else if (mat && !(mat as any).userData?.shared) mat.dispose();
  });
}

/**
 * WAVE54: append one ribbon chunk [sLo,sHi] (deck + shelves + curbs) without rebuilding the whole course.
 */
function appendWipeoutStreamSegment(
  pack: THREE.Group,
  path: SplinePath,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality,
  sLo: number,
  sHi: number
): void {
  const grounded = sceneId !== 'wormhole';
  if (!grounded) return;
  const deckW = sceneId === 'yard' ? 16 : 14;
  const barrierX = deckW * 0.52;
  const seg = new THREE.Group();
  seg.name = 'FlyerWipeoutStreamSeg_' + Math.floor(sLo);
  seg.userData.sLo = sLo;
  seg.userData.sHi = sHi;
  seg.userData.wave54 = true;

  const map = highwayAsphaltMap();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 1);
  const deckMat = flightSurface({ map, color: 0xffffff, side: THREE.DoubleSide, fog: false });
  const deck = new THREE.Mesh(
    buildHighwayDeckRibbon(path, deckW * 0.5, HIGHWAY_DECK_Y_TOP, HIGHWAY_DECK_THICKNESS, quality, sLo, sHi),
    deckMat
  );
  deck.name = 'FlyerWipeoutHighwayDeck';
  deck.frustumCulled = true;
  seg.add(deck);

  const groundProfile = cachedGroundYProfile(path);
  const shelfMat = flightSurface({
    map: livedInBarrierMap(4),
    color: 0x8a93a0,
    side: THREE.DoubleSide,
    fog: true,
  });
  for (const side of [1, -1] as const) {
    const mesh = new THREE.Mesh(
      buildGroundShelfRibbon(path, side, barrierX + 10, barrierX + 42, groundProfile, 1.85, quality, sLo, sHi),
      shelfMat
    );
    mesh.name = 'FlyerWipeoutGroundShelf';
    mesh.frustumCulled = true;
    mesh.renderOrder = -12;
    seg.add(mesh);
  }
  const wallH = 0.55;
  for (const side of [1, -1] as const) {
    const mat = flightSurface({
      map: livedInBarrierMap(side > 0 ? 2 : 3),
      color: 0xffffff,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(
      buildCurbRibbon(path, side * barrierX, -0.12, wallH, 0.55, quality, side > 0 ? 1.2 : 2.7, sLo, sHi),
      mat
    );
    mesh.name = 'FlyerWipeoutCurbBarrierV' + (side > 0 ? 0 : 1);
    mesh.frustumCulled = true;
    seg.add(mesh);
    const trimCol = side < 0 ? 0x22f0ff : 0xff2a9a;
    const trimMat = new THREE.MeshBasicMaterial({
      color: trimCol,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: 0.96,
    });
    const trim = new THREE.Mesh(
      buildCurbRibbon(path, side * (barrierX - 0.05), wallH - 0.08, 0.18, 0.62, quality, side > 0 ? 5.5 : 6.2, sLo, sHi),
      trimMat
    );
    trim.name = side < 0 ? 'FlyerWipeoutBarrierTrimLight_L' : 'FlyerWipeoutBarrierTrimLight_R';
    trim.frustumCulled = true;
    trim.renderOrder = 2;
    seg.add(trim);
  }
  void pal;
  freezeFlightStatic(seg);
  pack.add(seg);
}

/**
 * WAVE54: extend/dispose spline corridor segments around craftS.
 * Far façades stay invisible until within W54_FAR_FACADE_AHEAD_M.
 */
export function streamWipeoutGrammarWindow(
  root: THREE.Group,
  path: SplinePath,
  craftS: number,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality = 'medium'
): void {
  if (sceneId === 'wormhole') return;
  const pack = root.getObjectByName('FlyerWipeoutGrammar') as THREE.Group | null;
  if (!pack) return;
  const st = pack.userData.w54Stream as
    | { lo: number; hi: number; seg: number; S: number; wave54?: boolean }
    | undefined;
  if (!st?.wave54) return;
  const S = path.length;
  const needHi = Math.min(S, craftS + W54_STREAM_AHEAD_M);
  const needLo = Math.max(0, craftS - W54_STREAM_BEHIND_M);

  const doomed: THREE.Object3D[] = [];
  for (const ch of pack.children) {
    if (!String(ch.name || '').startsWith('FlyerWipeoutStreamSeg_')) continue;
    const hi = ch.userData.sHi as number;
    if (typeof hi === 'number' && hi < needLo) doomed.push(ch);
  }
  for (const ch of doomed) {
    disposeStreamSeg(ch);
    pack.remove(ch);
  }

  let guard = 0;
  while (st.hi < needHi - 0.5 && guard++ < 8) {
    const lo = st.hi;
    const hi = Math.min(S, lo + W54_STREAM_SEG_M);
    if (hi <= lo + 0.25) break;
    appendWipeoutStreamSegment(pack, path, sceneId, pal, quality, lo, hi);
    st.hi = hi;
  }
  st.lo = needLo;

  // WAVE54 hide initial window ribbons once craft has left the first chunk behind.
  if (needLo > W54_STREAM_AHEAD_M - 8) {
    for (const ch of pack.children) {
      if (String(ch.name || '').startsWith('FlyerWipeoutStreamSeg_')) continue;
      const n = ch.name || '';
      if (/HighwayDeck|GroundShelf|GroundApron|CurbBarrier|BarrierTrim|BarrierHazard|BarrierLip|MegaShell/.test(n)) {
        ch.visible = false;
      }
    }
  }

  const kit = pack.getObjectByName('FlyerWipeoutCorridorKit');
  if (kit) {
    const cap = W54_LIVE_MESH_CAP[quality] ?? W54_LIVE_MESH_CAP.medium;
    let live = 0;
    for (const ch of kit.children) {
      const ls = ch.userData.laneS as number | undefined;
      if (typeof ls !== 'number') continue;
      const far = ch.name === 'FlyerWipeoutCorridorFarFacade';
      const ahead = far ? W54_FAR_FACADE_AHEAD_M : W54_STREAM_AHEAD_M;
      const on = ls >= needLo && ls <= craftS + ahead;
      ch.visible = on && live < cap;
      if (ch.visible) live++;
      ch.castShadow = false;
      ch.receiveShadow = false;
    }
  }

  try {
    (globalThis as any).__WIPEOUT_W54_STREAM = {
      craftS,
      needLo,
      needHi,
      builtHi: st.hi,
      segs: pack.children.filter((c) => String(c.name).startsWith('FlyerWipeoutStreamSeg_')).length,
      ahead: W54_STREAM_AHEAD_M,
      behind: W54_STREAM_BEHIND_M,
      seg: W54_STREAM_SEG_M,
    };
  } catch {}
}

/**
 * WAVE47: wormhole / portal / void transit must not show a road.
 * Hides deck_ribbon, curb_ribbon, emissive road edges, and asphalt/deck decals.
 * Energy tunnel, rings, and starfield stay. Interactives stay path-framed.
 */
export function hideVoidTravelRoads(root: THREE.Object3D): number {
  let hidden = 0;
  const roadName =
    /HighwayDeck|CorridorDeckPlate|DeckPlate|deck_ribbon|curb_ribbon|CurbRibbon|CurbBarrier|emissive_edge|EmissiveEdge|BoostTiles|CorridorBoostPad|GroundShelf|GroundApron|HorizonDock|BarrierLip|BarrierTrim/i;
  root.traverse((o) => {
    const n = o.name || '';
    const id = String((o.userData && (o.userData.id || o.userData.corridorId)) || '');
    if (!roadName.test(n) && !roadName.test(id)) return;
    if (o.visible) {
      o.visible = false;
      hidden++;
    }
    o.userData.voidTravelNoRoad = true;
  });
  return hidden;
}

/**
 * Kill competing FEEL / window-grid / pillars / orbs / dress mush so grammar owns chase.
 */
export function hideCompetingWipeoutFloors(root: THREE.Object3D): void {
  // WAVE20_HIDE_CRATE: kill crate-stack / container-row / candy / old tall barrier walls
  root.traverse((o) => {
    const n = o.name || '';
    if (!n) return;
    if (
      n === 'FlyerWipeoutLightRibbon' ||
      n === 'FlyerWipeoutLightRibbonHi' ||
      n === 'FlyerWipeoutWallPanel' ||
      n === 'FlyerWipeoutChevron' ||
      n === 'FlyerWipeoutLaneDash' ||
      n === 'FlyerWipeoutDress' ||
      n === 'FlyerWipeoutBarrier' ||
      n === 'FlyerWipeoutBarrierLip' ||
      n === 'FlyerDataPillar' ||
      n === 'FlyerNeonCityChase' ||
      n === 'FlyerNeonCityEdgeChase' ||
      n === 'FlyerWireRings' ||
      n === 'FlyerParallaxSilhouette' ||
      n === 'FlyerSceneryInst' ||
      n === 'FlyerWipeoutUnderDeckSkirt' ||
      n === 'FlyerWipeoutUnderDeckBelly' ||
      n === 'FlyerWipeoutMegaShellBelly' ||
      n === 'FlyerWipeoutGantryPost' ||
      n === 'FlyerWipeoutMidGantry' ||
      n === 'FlyerWipeoutCorridorGantry' ||
      n === 'FlyerWipeoutCorridorRibArch' ||
      n === 'FlyerWipeoutCorridorBank' ||
      n === 'FlyerWipeoutCorridorLaserGate'
    ) {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
      return;
    }
    if (n.startsWith('FlyerWipeout')) return;
    if (
      /CoherenceDeck|HardCoherenceFloor|HardCoherenceWall|ChaseFog|GroundFog|PathRibbon|DebugRibbon|HardSkyFill|SkyBrandFill|HorizonGrad|FacadeCard|FacadePending|NeonCityCard|NeonCityEdge|NeonCityWindows/i.test(
        n
      )
    ) {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
      return;
    }
    if (
      /NeonCity|NeonSpar|NeonEdge|NeonCityWindows|FlyerCoherenceWall|CanyonSideWall|CanyonWallFoot|CanyonParapet|YardWasteCrate|YardDockWall|GroundHorizon|GlbScenery|SceneryInst|DataPillar|MidPillar|ScrapOrb|HazardMine|markRing|Crate|Container|BarrierWallV/i.test(
        n
      ) ||
      /FlyerMidground/i.test(n)
    ) {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
      return;
    }
    if (/ribbon/i.test(n) && !n.startsWith('FlyerWipeout')) {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
    }
  });
  const packs = [
    'FlyerGroundHorizon',
    'FlyerMidground',
    'FlyerGlbScenery',
    'FlyerNeonCity',
    'FlyerWipeoutDress',
    'FlyerHardCoherence',
  ];
  for (const pn of packs) {
    const p = root.getObjectByName(pn);
    if (p) {
      p.visible = false;
      p.userData.FlyerWipeoutHideCompeting = true;
    }
  }
  root.traverse((o) => {
    if (!o.userData) return;
    const kind = o.userData.flyerHitKind || o.userData.markKind || o.userData.kind;
    if (kind === 'mine' || kind === 'emp' || kind === 'solid') {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
    }
    if (o.name === 'markTag' || o.name === 'markRing') {
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
    }
    // WAVE18: hide markTag candy pyramids/plates
    if (o.name === 'warn' && (o as THREE.Mesh).isMesh) {
      const g = (o as THREE.Mesh).geometry;
      if (g && (g as THREE.BufferGeometry).type === 'SphereGeometry') {
        o.visible = false;
        if (o.parent) {
          const parent = o.parent;
          let sphereHeavy = true;
          parent.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) {
              const cg = (c as THREE.Mesh).geometry;
              if (cg && (cg as THREE.BufferGeometry).type === 'ConeGeometry') sphereHeavy = false;
            }
          });
          if (sphereHeavy) {
            parent.visible = false;
            parent.userData.FlyerWipeoutHideCompeting = true;
          }
        }
      }
    }
  });

  // WAVE21b_HIDE_BRAND: kill cyan brand plates + oversized facade cards + candy mid
  root.traverse((o) => {
    const n = o.name || '';
    if (!n) return;
    if (/SkyBrandFill|HorizonGrad|FacadeCard|FacadePending|HardSkyFill|NeonCityCard|NeonCityEdge|NeonCityWindows|AmberGate|AmberBand|WipeoutDress|LightRibbon|markTag|markRing/i.test(n)) {
      if (/BoostTiles|HighwayDeck|CurbBarrier|CityGlb|HazardLaser|HazardTBar|HazardTPost|EdgeSpike|GroundShelf|GroundApron|BuildingPlinth/i.test(n)) return;
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
    }
  });

  // WAVE20: explicit crate/container/candy/old-wall kill
  root.traverse((o) => {
    const n = o.name || '';
    if (!n) return;
    if (
      /YardWasteCrate|YardDockWall|CanyonSideWall|CanyonWallFoot|CanyonParapet|FlyerCoherenceWall|HardCoherenceWall|BarrierWallV|AmberGate|AmberBand|WipeoutDress|LightRibbon|WallPanel|Chevron|markRing|WireRings|ScrapOrb|container|crate/i.test(
        n
      )
    ) {
      // Keep new curb barriers + industrial kits + highway deck
      if (/CurbBarrier|BarrierLipCont|BarrierTrimLight|BarrierTrimHot|BarrierHazardBand|BarrierRepair|MidGantry|GantryPost|WallDress|HighwayDeck|BuildingLibrary|CityGlb|MegaShell|BoostTiles|HazardLaser|HazardTBar|HazardTPost|EdgeSpike|Truss|CraneArm|PipeRack|GantryTower|PathLamp|PathSign|PathBillboard|Scaffold|WallArch|TunnelRib|TunnelRibInner|TunnelRibOuter|TunnelLamp|TunnelArch|TunnelRibbon|TunnelScaffold|GroundShelf|GroundApron|BuildingPlinth|MegaShell|HorizonDock|UnderDeckSkirt|UnderDeckBelly|EdgeMarker|UtilBox/i.test(n)) return;
      o.visible = false;
      o.userData.FlyerWipeoutHideCompeting = true;
    }
  });
}
