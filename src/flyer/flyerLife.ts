/**
 * Motion on the flight that already draws: windowed skyline, lane dashes,
 * rail glow, wake motes, outboard air traffic, and hazard arms.
 * No new lights. Traffic uses the path frame (right, up, -tangent).
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';
import type { GraphicsQuality } from '../data/graphics';
import { PathFrame, type SplinePath } from './SplinePath';
import { pathFrameQuat, W54_LIVE_PARTICLE_CAP } from './flyerWipeoutGrammar';

const _frame = new PathFrame();
const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
type Ship = {
  sOff: number;
  side: number;
  lat: number;
  up: number;
  speed: number;
};

type Trim = { mat: THREE.MeshBasicMaterial; phase: number };

let dirty = true;
let refreshAt = -1;
/** Facade and roof beacons are a slow glow. 20 Hz is enough; dashes stay per frame. */
let glowAt = -1;
let boundRoot: THREE.Object3D | null = null;
let skyline: THREE.InstancedMesh | null = null;
let caps: THREE.InstancedMesh | null = null;
let dashes: THREE.InstancedMesh | null = null;
let traffic: THREE.InstancedMesh | null = null;
let motes: THREE.Points | null = null;
let motePos: Float32Array | null = null;
let moteLane: Float32Array | null = null;
let moteBob: Float32Array | null = null;
const ships: Ship[] = [];
const trims: Trim[] = [];
const arms: THREE.Object3D[] = [];
const shards: THREE.Object3D[] = [];

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function waveSeeds(mesh: THREE.InstancedMesh): Float32Array {
  let seeds = mesh.userData.lifeSeed as Float32Array | undefined;
  if (!seeds || seeds.length !== mesh.count) {
    seeds = new Float32Array(mesh.count);
    for (let i = 0; i < mesh.count; i++) seeds[i] = hash(i, 4);
    mesh.userData.lifeSeed = seeds;
  }
  return seeds;
}

function paintWave(mesh: THREE.InstancedMesh, t: number, speed: number, mode: 'facade' | 'beacon' | 'dash'): void {
  const n = mesh.count;
  if (n <= 0) return;
  const seeds = waveSeeds(mesh);
  const rush = mode === 'dash' ? 0.35 + speed * 0.55 : 0.22;
  for (let i = 0; i < n; i++) {
    const seed = seeds[i];
    const u = i * 0.23 - t * rush;
    const band = 0.5 + 0.5 * Math.cos(u * Math.PI * 2);
    const blink = seed > 0.82 && Math.sin(t * (1.4 + seed) + i) < -0.2 ? 0.72 : 1;
    let v = 1;
    if (mode === 'dash') v = band > 0.82 ? 1 : 0.8;
    else if (mode === 'beacon') v = (band > 0.62 ? 1 : 0.5) * blink;
    else v = (0.78 + 0.22 * band) * blink;
    _col.setRGB(v, v, v);
    mesh.setColorAt(i, _col);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function ensureMotes(craft: THREE.Object3D, sceneId: FlyerSceneId, quality: GraphicsQuality): void {
  if (motes && motes.parent === craft) return;
  motes?.removeFromParent();
  const cap = W54_LIVE_PARTICLE_CAP[quality] ?? 40;
  const n = Math.min(cap, quality === 'low' ? 16 : 26);
  motePos = new Float32Array(n * 3);
  moteLane = new Float32Array(n);
  moteBob = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    moteLane[i] = (hash(i, 8) - 0.5) * 3.2;
    moteBob[i] = (hash(i, 9) - 0.3) * 1.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const color =
    sceneId === 'rift' ? 0xd8f6ff : sceneId === 'yard' ? 0x9ee7ff : sceneId === 'wormhole' ? 0xff88ee : 0xffd0a0;
  const mat = new THREE.PointsMaterial({
    color,
    size: sceneId === 'wormhole' ? 0.55 : 0.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  motes = new THREE.Points(geo, mat);
  motes.name = 'FlyerLifeMotes';
  motes.frustumCulled = false;
  craft.add(motes);
}

function stepMotes(t: number, speed: number): void {
  if (!motes || !motePos || !moteLane || !moteBob) return;
  const n = motePos.length / 3;
  const flow = 1.6 + speed * 3.2;
  for (let i = 0; i < n; i++) {
    const along = ((i * 0.37 + t * flow) % 9) - 1;
    motePos[i * 3] = moteLane[i] + Math.sin(t * 0.8 + i) * 0.15;
    motePos[i * 3 + 1] = moteBob[i] + Math.sin(t * 1.3 + i * 0.6) * 0.12;
    // Craft nose is local -Z. Wake sits behind, on +Z.
    motePos[i * 3 + 2] = along;
  }
  (motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
}

function ensureTraffic(root: THREE.Object3D, sceneId: FlyerSceneId): void {
  if (sceneId === 'wormhole') return;
  if (traffic && traffic.parent === root) return;
  ships.length = 0;
  for (let i = 0; i < 6; i++) {
    ships.push({
      sOff: -24 + hash(i, 2) * 110,
      side: i % 2 === 0 ? 1 : -1,
      lat: 12 + hash(i, 5) * 6,
      up: 3.4 + hash(i, 6) * 5.5,
      speed: (i % 3 === 0 ? -10 : 16) + hash(i, 7) * 8,
    });
  }
  const mat = new THREE.MeshBasicMaterial({
    color: sceneId === 'yard' ? 0xb7ecff : sceneId === 'rift' ? 0xd7f4ff : 0xffe2b0,
    toneMapped: false,
    fog: true,
  });
  traffic = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, ships.length);
  traffic.name = 'FlyerLifeTraffic';
  traffic.frustumCulled = false;
  traffic.count = ships.length;
  for (let i = 0; i < ships.length; i++) {
    const v = 0.55 + 0.45 * hash(i, 11);
    _col.setRGB(v, v, v * (ships[i].side > 0 ? 1 : 0.85));
    traffic.setColorAt(i, _col);
  }
  if (traffic.instanceColor) traffic.instanceColor.needsUpdate = true;
  root.add(traffic);
}

function stepTraffic(path: SplinePath, s: number, dt: number, courseLen: number): void {
  if (!traffic) return;
  const maxS = Math.max(0.05, courseLen - 0.05);
  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];
    ship.sOff += ship.speed * dt;
    if (ship.sOff > 78) ship.sOff = -22;
    if (ship.sOff < -28) ship.sOff = 70;
    const at = THREE.MathUtils.clamp(s + ship.sOff, 0, maxS);
    path.sample(at, _frame);
    _dummy.position.copy(_frame.p).addScaledVector(_frame.r, ship.side * ship.lat).addScaledVector(_frame.u, ship.up);
    pathFrameQuat(_frame, _dummy.quaternion);
    _dummy.scale.set(1.8, 0.55, 5.2);
    _dummy.updateMatrix();
    traffic.setMatrixAt(i, _dummy.matrix);
  }
  traffic.instanceMatrix.needsUpdate = true;
}

function namedChild(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].name === name) return kids[i];
  }
  return null;
}

/** Skip the hidden corridor kit and the craft. Those subtrees are large and do not carry this motion. */
function collectLife(o: THREE.Object3D): void {
  const n = o.name || '';
  if (
    n === 'FlyerWipeoutCorridorKit' ||
    n === 'FlyerWipeoutBuildingLibrary' ||
    n === 'FlyerCraft' ||
    n === 'FlyerCraftHero'
  ) {
    return;
  }
  if (n.includes('BarrierTrim') || n.includes('BoostTiles')) {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material;
    if (mat instanceof THREE.MeshBasicMaterial && mat.transparent) {
      if (typeof mat.userData.lifeBaseOp !== 'number') mat.userData.lifeBaseOp = mat.opacity;
      trims.push({ mat, phase: trims.length * 0.7 });
    }
  }
  if (n === 'ThemeHazardArm') arms.push(o);
  if (n === 'ThemeHazardShard') shards.push(o);
  const kids = o.children;
  for (let i = 0; i < kids.length; i++) collectLife(kids[i]);
}

function refresh(root: THREE.Object3D): void {
  const pack = namedChild(root, 'FlyerWipeoutGrammar') ?? root;
  skyline = namedChild(pack, 'FlyerFastSkyline') as THREE.InstancedMesh | null;
  caps = namedChild(pack, 'FlyerFastSkylineGlow') as THREE.InstancedMesh | null;
  dashes = namedChild(pack, 'FlyerFastLaneDash') as THREE.InstancedMesh | null;
  trims.length = 0;
  arms.length = 0;
  shards.length = 0;
  collectLife(root);
  dirty = false;
}

function stillIn(root: THREE.Object3D, obj: THREE.Object3D | null): boolean {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

/** Drop cached meshes after the run is disposed or the grammar pack is replaced. */
export function releaseFlyerLife(root: THREE.Object3D): void {
  if (boundRoot !== root) return;
  boundRoot = null;
  skyline = null;
  caps = null;
  dashes = null;
  traffic = null;
  motes = null;
  motePos = null;
  moteLane = null;
  moteBob = null;
  ships.length = 0;
  glowAt = -1;
  trims.length = 0;
  arms.length = 0;
  shards.length = 0;
  dirty = true;
  refreshAt = -1;
}

export function tickFlyerLife(
  root: THREE.Object3D,
  path: SplinePath,
  opts: {
    t: number;
    dt: number;
    s: number;
    courseLen: number;
    speed: number;
    sceneId: FlyerSceneId;
    quality: GraphicsQuality;
    craft: THREE.Object3D | null;
  }
): void {
  const { t, dt, s, courseLen, speed, sceneId, quality, craft } = opts;
  if (root !== boundRoot) {
    boundRoot = root;
    dirty = true;
    skyline = null;
    caps = null;
    dashes = null;
    traffic = null;
    motes = null;
    motePos = null;
    moteLane = null;
    moteBob = null;
    ships.length = 0;
    glowAt = -1;
  }
  if (skyline && !stillIn(root, skyline)) {
    skyline = null;
    caps = null;
    dashes = null;
    trims.length = 0;
    arms.length = 0;
    shards.length = 0;
    dirty = true;
  }
  if (craft) ensureMotes(craft, sceneId, quality);
  ensureTraffic(root, sceneId);
  if (dirty || t >= refreshAt) {
    refresh(root);
    refreshAt = t + (skyline ? 1.2 : 0.4);
  }
  stepMotes(t, speed);
  stepTraffic(path, s, dt, courseLen);
  if (t >= glowAt) {
    if (skyline) paintWave(skyline, t, 0, 'facade');
    if (caps) paintWave(caps, t * 1.4, 0, 'beacon');
    glowAt = t + 0.05;
  }
  if (dashes) paintWave(dashes, t, speed, 'dash');
  for (let i = 0; i < trims.length; i++) {
    const trim = trims[i];
    const base = trim.mat.userData.lifeBaseOp as number;
    const pulse = 0.72 + 0.28 * Math.sin(t * 2.1 + trim.phase);
    trim.mat.opacity = Math.min(1, base * pulse);
  }
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i];
    if (!arm.visible) continue;
    arm.rotation.z = Math.sin(t * 0.62 + arm.position.y) * 0.38;
    arm.updateMatrix();
  }
  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    if (!shard.visible) continue;
    shard.rotation.z = Math.sin(t * 0.45 + i) * 0.22;
    shard.updateMatrix();
  }
}
