/**
 * WAVE14 Wipeout texture pass — procedural CanvasTextures for steel walls,
 * deck plating, hazard/boost pads, neon strips. Track-edge dress (barriers,
 * chevrons, light ribbons) matches continuous Wipeout corridor polish.
 * Additive module: does not replace existing scenery; enriches materials + densifies edges.
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';
import type { SplinePath } from './SplinePath';
import { PathFrame } from './SplinePath';
import type { GraphicsQuality } from '../data/graphics';

export type FlyerTexKind = 'steel' | 'deck' | 'hazard' | 'boost' | 'neon' | 'chevron';

const _cache = new Map<string, THREE.CanvasTexture>();
const _F = new PathFrame();
const _dummy = new THREE.Object3D();
const _mat4 = new THREE.Matrix4();
const _pathZ = new THREE.Vector3();

function canvasTex(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, n: number) => void): THREE.CanvasTexture {
  const hit = _cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _cache.set(key, tex);
  return tex;
}

/** Brushed steel panel with rivets + seam lines (Wipeout wall language). */
export function steelWallMap(variant = 0): THREE.CanvasTexture {
  return canvasTex('steel-' + variant, 256, (ctx, n) => {
    const base = variant % 3 === 0 ? '#3a424c' : variant % 3 === 1 ? '#454e58' : '#505860';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(20,24,28,0.55)';
    ctx.lineWidth = 2;
    const cell = 32;
    for (let x = 0; x <= n; x += cell) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, n); ctx.stroke();
    }
    for (let y = 0; y <= n; y += cell) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(n, y + 0.5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(180,200,220,0.08)';
    ctx.lineWidth = 1;
    for (let i = -n; i < n * 2; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + n, n); ctx.stroke();
    }
    for (let y = 8; y < n; y += cell) {
      for (let x = 8; x < n; x += cell) {
        ctx.fillStyle = 'rgba(12,14,16,0.7)';
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,210,220,0.35)';
        ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }
    const neon = variant % 2 === 0 ? '#33ccee' : '#ff44aa';
    ctx.fillStyle = neon;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, 4, n);
    ctx.fillRect(n - 4, 0, 4, n);
    ctx.globalAlpha = 1;
  });
}

/** Deck plating — tread plate + lane chevron ghost. */
export function deckPlateMap(variant = 0): THREE.CanvasTexture {
  // WAVE14_GRAPHITE_VENTS: dark graphite plated track + seams/vents + cyan emissive inlays (Wipeout ref).
  return canvasTex('deck-g-' + variant, 256, (ctx, n) => {
    ctx.fillStyle = variant % 2 === 0 ? '#1c2228' : '#242a32';
    ctx.fillRect(0, 0, n, n);
    const cell = 32;
    for (let y = 0; y < n; y += cell) {
      for (let x = 0; x < n; x += cell) {
        const shade = 28 + ((x * 3 + y * 5 + variant * 7) % 18);
        ctx.fillStyle = 'rgb(' + shade + ',' + (shade + 4) + ',' + (shade + 8) + ')';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = 'rgba(160,175,190,0.18)';
        ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
        ctx.strokeStyle = 'rgba(6,8,10,0.9)';
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        if ((x + y + variant) % 64 === 0) {
          ctx.fillStyle = 'rgba(4,6,8,0.95)';
          for (let k = 0; k < 4; k++) ctx.fillRect(x + 6 + k * 6, y + 12, 3, 10);
        } else if ((x * y + variant) % 96 < 20) {
          ctx.fillStyle = 'rgba(8,10,12,0.85)';
          ctx.fillRect(x + 8, y + 22, cell - 16, 3);
        }
      }
    }
    ctx.fillStyle = 'rgba(40,230,255,0.55)';
    ctx.fillRect(n * 0.46, 0, 4, n);
    ctx.fillRect(n * 0.52, 0, 4, n);
    ctx.fillStyle = 'rgba(40,230,255,0.35)';
    for (let i = 0; i < 4; i++) ctx.fillRect(16 + i * 56, n * 0.42, 28, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 12; i++) ctx.fillRect((i * 37) % n, (i * 53) % n, 18, 6);
  });
}

export function hazardPadMap(): THREE.CanvasTexture {
  return canvasTex('hazard', 128, (ctx, n) => {
    ctx.fillStyle = '#120406';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#ff2244';
    for (let i = -n; i < n * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + n * 0.4 + 8, n);
      ctx.lineTo(i + n * 0.4, n);
      ctx.closePath();
      ctx.fill();
    }
    // horizontal laser lines
    ctx.fillStyle = '#ff5577';
    ctx.fillRect(0, n * 0.28, n, 4);
    ctx.fillRect(0, n * 0.68, n, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, n * 0.28 + 1, n, 1);
    ctx.strokeStyle = '#ff99aa';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, n - 6, n - 6);
  });
}

/** Boost pad — cyan speed arrows. */
/** Cyan checker/segmented boost tiles (Wipeout HD lane pads — not giant arrows). */
export function boostPadMap(): THREE.CanvasTexture {
  return canvasTex('boost', 128, (ctx, n) => {
    ctx.fillStyle = '#041820';
    ctx.fillRect(0, 0, n, n);
    const cell = 16;
    for (let y = 0; y < n; y += cell) {
      for (let x = 0; x < n; x += cell) {
        const on = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = on ? '#33e8ff' : '#0a3040';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        if (on) {
          ctx.fillStyle = 'rgba(180,255,255,0.45)';
          ctx.fillRect(x + 3, y + 3, cell - 6, 3);
        }
      }
    }
    ctx.strokeStyle = '#66f0ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, n - 4, n - 4);
    // segmented lane dashes
    ctx.fillStyle = '#aaf8ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(n * 0.42, 10 + i * 28, n * 0.16, 10);
  });
}

/** Neon strip emissive map. */
export function neonStripMap(color: 'cyan' | 'magenta' | 'ice' = 'cyan'): THREE.CanvasTexture {
  return canvasTex('neon-' + color, 64, (ctx, n) => {
    const col = color === 'magenta' ? '#ff44aa' : color === 'ice' ? '#9ef2ff' : '#33ccee';
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, n, n);
    const g = ctx.createLinearGradient(0, 0, n, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, col);
    g.addColorStop(0.65, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, n * 0.28, n, n * 0.44);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, n * 0.42, n, n * 0.12);
    ctx.globalAlpha = 1;
  });
}

/** Track-edge chevron warning strip. */
export function chevronRibbonMap(sceneId: FlyerSceneId): THREE.CanvasTexture {
  const warm = sceneId === 'wormhole';
  return canvasTex('chevron-' + sceneId, 128, (ctx, n) => {
    ctx.fillStyle = warm ? '#1a0820' : '#0a1018';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = warm ? '#ff55dd' : sceneId === 'rift' ? '#7ad8ff' : '#44f0ff';
    for (let x = -16; x < n + 16; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, n * 0.15);
      ctx.lineTo(x + 14, n * 0.5);
      ctx.lineTo(x, n * 0.85);
      ctx.lineTo(x - 8, n * 0.85);
      ctx.lineTo(x + 6, n * 0.5);
      ctx.lineTo(x - 8, n * 0.15);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function makeTexturedPhong(
  kind: FlyerTexKind,
  color: number,
  quality: GraphicsQuality,
  opts?: { emissive?: number; emissiveScale?: number; repeat?: number; variant?: number; sceneId?: FlyerSceneId }
): THREE.MeshPhongMaterial {
  const variant = opts?.variant ?? 0;
  const sceneId = opts?.sceneId ?? 'canyon';
  let map: THREE.CanvasTexture;
  let emissiveMap: THREE.CanvasTexture | null = null;
  switch (kind) {
    case 'steel':
      map = steelWallMap(variant);
      map.repeat.set(opts?.repeat ?? 2.5, opts?.repeat ?? 3.5);
      break;
    case 'deck':
      map = deckPlateMap(variant);
      map.repeat.set(opts?.repeat ?? 4, opts?.repeat ?? 2);
      break;
    case 'hazard':
      map = hazardPadMap();
      map.repeat.set(1, 1);
      break;
    case 'boost':
      map = boostPadMap();
      map.repeat.set(1, 1);
      break;
    case 'neon':
      map = neonStripMap(sceneId === 'wormhole' ? 'magenta' : sceneId === 'rift' ? 'ice' : 'cyan');
      emissiveMap = map;
      map.repeat.set(opts?.repeat ?? 1, opts?.repeat ?? 6);
      break;
    case 'chevron':
      map = chevronRibbonMap(sceneId);
      map.repeat.set(opts?.repeat ?? 8, 1);
      break;
    default:
      map = steelWallMap(0);
  }
  const em = opts?.emissive ?? (kind === 'neon' || kind === 'boost' ? color : kind === 'hazard' ? 0xff3355 : 0x1a3040);
  const emScale = opts?.emissiveScale ?? (kind === 'neon' ? 0.85 : kind === 'boost' ? 0.55 : kind === 'hazard' ? 0.4 : 0.12);
  return new THREE.MeshPhongMaterial({
    color,
    map,
    emissive: new THREE.Color(em).multiplyScalar(emScale),
    emissiveMap: emissiveMap ?? undefined,
    shininess: quality === 'high' ? 78 : 52,
    specular: new THREE.Color(0xa8b8c8),
    toneMapped: false,
    fog: true,
    flatShading: false,
  });
}

/** Apply procedural maps onto existing coherence / midground meshes by name. */
export function enrichSceneryTextures(root: THREE.Object3D, sceneId: FlyerSceneId, quality: GraphicsQuality): void {
  const steel = steelWallMap(sceneId === 'yard' ? 1 : sceneId === 'rift' ? 2 : 0);
  steel.repeat.set(2.2, 3.2);
  const deck = deckPlateMap(sceneId === 'yard' ? 1 : 0);
  deck.repeat.set(3.5, 2.2);
  const neon = neonStripMap(sceneId === 'wormhole' ? 'magenta' : sceneId === 'rift' ? 'ice' : 'cyan');
  neon.repeat.set(1, 5);
  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh || !mesh.material) return;
    // WAVE18: never overwrite lived-in wipeout grammar (deck/barrier/facade/boost/buildings)
    let climb: THREE.Object3D | null = mesh;
    let wipeoutOwned = false;
    while (climb) {
      const cn = climb.name || '';
      if (cn.startsWith('FlyerWipeout')) {
        wipeoutOwned = true;
        break;
      }
      climb = climb.parent;
    }
    if (wipeoutOwned) return;
    const name = mesh.name || mesh.parent?.name || '';
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const m = raw as THREE.MeshPhongMaterial | THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
      if (!m || !('map' in m)) continue;
      const isDeck =
        /Deck|Floor|Curb|Plate|Dock|Foot|Wreck/i.test(name) ||
        /FlyerHardCoherenceFloor|FlyerCoherenceDeck|FlyerCoherenceCurb/i.test(name);
      const isWall =
        /Wall|Rail|Ribbon|Gantry|Span|Truss|Mast|Pillar|Panel|Parapet|Shell/i.test(name) ||
        /FlyerHardCoherenceWall|FlyerCoherenceWall|FlyerCanyonSideWall|FlyerYardDock/i.test(name);
      const isNeon = /Neon|Edge|Seam|Spar/i.test(name) || /FlyerNeon|GantryNeon|GantryRail/i.test(name);
      if (isNeon && m instanceof THREE.MeshPhongMaterial) {
        m.map = neon;
        m.emissiveMap = neon;
        m.emissive.setHex(sceneId === 'wormhole' ? 0xff44aa : 0x33ccee).multiplyScalar(0.7);
        m.needsUpdate = true;
      } else if (isDeck) {
        m.map = deck;
        if (m instanceof THREE.MeshPhongMaterial) {
          m.shininess = Math.max(m.shininess || 0, 40);
          m.specular = new THREE.Color(0x8899aa);
        }
        m.needsUpdate = true;
      } else if (isWall) {
        m.map = steel;
        if (m instanceof THREE.MeshPhongMaterial) {
          m.shininess = Math.max(m.shininess || 0, quality === 'high' ? 70 : 48);
          m.specular = new THREE.Color(0xa8b8c8);
          if (!m.emissive || m.emissive.getHex() === 0) m.emissive.setHex(0x1a4050).multiplyScalar(0.15);
        }
        m.needsUpdate = true;
      }
    }
  });
}

/** Texture boost/hazard pickup meshes (kill flat greybox pads). */
export function texturePickupMesh(mesh: THREE.Object3D, kind: 'boost' | 'hazard' | 'gate', quality: GraphicsQuality): void {
  const map = kind === 'boost' ? boostPadMap() : kind === 'hazard' ? hazardPadMap() : neonStripMap('magenta');
  mesh.traverse((o) => {
    const m = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!m || m.name === 'markTag' || m.name === 'markRing' || m.name === 'warn') return;
    const mat = m.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
    if (!mat || Array.isArray(m.material)) return;
    if (mat instanceof THREE.MeshPhongMaterial) {
      mat.map = map;
      mat.emissive = new THREE.Color(kind === 'boost' ? 0x66ffaa : kind === 'hazard' ? 0xff3355 : 0xff44aa).multiplyScalar(0.45);
      mat.shininess = quality === 'high' ? 80 : 55;
      mat.needsUpdate = true;
    } else if ('map' in mat) {
      const phong = new THREE.MeshPhongMaterial({
        color: kind === 'boost' ? 0x88ffcc : kind === 'hazard' ? 0xff6688 : 0xff88dd,
        map,
        emissive: new THREE.Color(kind === 'boost' ? 0x66ffaa : kind === 'hazard' ? 0xff3355 : 0xff44aa).multiplyScalar(0.5),
        shininess: 60,
        toneMapped: false,
        fog: true,
      });
      m.material = phong;
    }
  });
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function kitCap(quality: GraphicsQuality, high: number, floor = 4): number {
  const s = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1;
  return Math.max(floor, Math.round(high * s));
}

/**
 * Wipeout track-edge dress: continuous barriers, chevrons, light ribbons along path.
 * Dense enough that chase edges never read as empty MVP blocks.
 */
export function placeWipeoutTrackDress(
  root: THREE.Group,
  path: SplinePath,
  sceneId: FlyerSceneId,
  pal: { accent: number; glow: number; fill: number },
  quality: GraphicsQuality = 'medium'
): void {
  if (root.getObjectByName('FlyerWipeoutDress')) return;
  const pack = new THREE.Group();
  pack.name = 'FlyerWipeoutDress';
  root.add(pack);
  const S = path.length;
  const pose = (s: number, x: number, y: number, sx: number, sy: number, sz: number, yaw = 0) => {
    path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
    _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
    _pathZ.copy(_F.t).negate();
    _mat4.makeBasis(_F.r, _F.u, _pathZ);
    _dummy.quaternion.setFromRotationMatrix(_mat4);
    if (yaw !== 0) _dummy.rotateY(yaw);
    _dummy.scale.set(sx, sy, sz);
    _dummy.updateMatrix();
  };

  const barrierMat = makeTexturedPhong(
    'steel',
    sceneId === 'yard' ? 0x5a6570 : sceneId === 'rift' ? 0x4a7080 : sceneId === 'wormhole' ? 0x3a2850 : 0x556878,
    quality,
    { variant: 1, repeat: 1.8, emissive: pal.accent, emissiveScale: 0.08 }
  );
  const stepB = sceneId === 'canyon' || sceneId === 'yard' ? 1.05 : 1.35;
  const nBarrier = Math.min(kitCap(quality, 320, 120), Math.max(140, Math.floor(S / stepB) * 2));
  const barrierGeo = new THREE.BoxGeometry(0.55, 1.15, 1);
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, nBarrier);
  barriers.name = 'FlyerWipeoutBarrier';
  barriers.frustumCulled = true;
  for (let i = 0; i < nBarrier; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 2, 1.5 + pair * stepB);
    const h = 1.1 + hash(i, 2) * 0.55;
    pose(sPos, side * (3.55 + (pair % 3) * 0.12), -0.55 + h * 0.5, 1, h, stepB * 1.05);
    barriers.setMatrixAt(i, _dummy.matrix);
  }
  barriers.instanceMatrix.needsUpdate = true;
  barriers.computeBoundingSphere();
  pack.add(barriers);

  const lipMat = makeTexturedPhong('steel', sceneId === 'wormhole' ? 0x503070 : 0x6a7888, quality, { variant: 2, repeat: 2.4 });
  const nLip = Math.min(kitCap(quality, 220, 80), Math.max(100, Math.floor(S / (stepB * 1.1)) * 2));
  const lipGeo = new THREE.BoxGeometry(0.35, 0.28, 1);
  const lips = new THREE.InstancedMesh(lipGeo, lipMat, nLip);
  lips.name = 'FlyerWipeoutBarrierLip';
  for (let i = 0; i < nLip; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 2, 1.2 + pair * stepB * 1.1);
    pose(sPos, side * 3.7, 0.85 + hash(i, 4) * 0.35, 1.2, 1, stepB * 1.15);
    lips.setMatrixAt(i, _dummy.matrix);
  }
  lips.instanceMatrix.needsUpdate = true;
  lips.computeBoundingSphere();
  pack.add(lips);

  const chevMat = makeTexturedPhong('chevron', 0xffffff, quality, { sceneId, repeat: 10 });
  chevMat.emissive = new THREE.Color(pal.accent).multiplyScalar(0.55);
  const stepC = sceneId === 'canyon' || sceneId === 'yard' ? 2.2 : 2.8;
  const nChev = Math.min(kitCap(quality, 160, 64), Math.max(70, Math.floor(S / stepC) * 2));
  const chevGeo = new THREE.PlaneGeometry(1.4, 0.55);
  const chevs = new THREE.InstancedMesh(chevGeo, chevMat, nChev);
  chevs.name = 'FlyerWipeoutChevron';
  for (let i = 0; i < nChev; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 3, 2 + pair * stepC);
    pose(sPos, side * 3.15, -0.95, 1, 1, 1, side * -0.08);
    _dummy.rotateX(-Math.PI * 0.5);
    _dummy.updateMatrix();
    chevs.setMatrixAt(i, _dummy.matrix);
  }
  chevs.instanceMatrix.needsUpdate = true;
  chevs.computeBoundingSphere();
  pack.add(chevs);

  const ribbonMat = makeTexturedPhong('neon', pal.accent, quality, {
    sceneId,
    repeat: 8,
    emissive: pal.accent,
    emissiveScale: 0.95,
  });
  ribbonMat.transparent = true;
  ribbonMat.opacity = 0.92;
  ribbonMat.depthWrite = false;
  const stepR = sceneId === 'canyon' || sceneId === 'yard' ? 0.85 : 1.1;
  const nRib = Math.min(kitCap(quality, 360, 140), Math.max(160, Math.floor(S / stepR) * 2));
  const ribGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  const ribs = new THREE.InstancedMesh(ribGeo, ribbonMat, nRib);
  ribs.name = 'FlyerWipeoutLightRibbon';
  ribs.renderOrder = 3;
  for (let i = 0; i < nRib; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 1.5, 1 + pair * stepR);
    const y = pair % 3 === 0 ? 1.65 : pair % 3 === 1 ? 0.35 : -0.35;
    pose(sPos, side * (3.95 + (pair % 2) * 0.15), y, 1, 1, stepR * 1.15);
    ribs.setMatrixAt(i, _dummy.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  ribs.computeBoundingSphere();
  pack.add(ribs);

  const rib2Mat = makeTexturedPhong('neon', pal.glow, quality, {
    sceneId,
    repeat: 6,
    emissive: pal.glow,
    emissiveScale: 0.8,
  });
  rib2Mat.transparent = true;
  rib2Mat.opacity = 0.75;
  rib2Mat.depthWrite = false;
  const nRib2 = Math.min(kitCap(quality, 200, 80), Math.max(90, Math.floor(S / (stepR * 1.4)) * 2));
  const ribs2 = new THREE.InstancedMesh(ribGeo, rib2Mat, nRib2);
  ribs2.name = 'FlyerWipeoutLightRibbonHi';
  ribs2.renderOrder = 3;
  for (let i = 0; i < nRib2; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 1.5, 1.4 + pair * stepR * 1.4);
    pose(sPos, side * 4.25, 2.4 + hash(i, 5) * 1.2, 1, 1, stepR * 1.5);
    ribs2.setMatrixAt(i, _dummy.matrix);
  }
  ribs2.instanceMatrix.needsUpdate = true;
  ribs2.computeBoundingSphere();
  pack.add(ribs2);

  if (sceneId !== 'wormhole') {
    const dashMat = makeTexturedPhong('boost', 0x66ffaa, quality, { emissiveScale: 0.35 });
    const nDash = Math.min(kitCap(quality, 90, 36), Math.max(40, Math.floor(S / 3.2)));
    const dashGeo = new THREE.BoxGeometry(0.55, 0.06, 1.4);
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, nDash);
    dashes.name = 'FlyerWipeoutLaneDash';
    for (let i = 0; i < nDash; i++) {
      const sPos = Math.min(S - 2, 2 + i * 3.2);
      pose(sPos, 0, -1.18, 1, 1, 1);
      dashes.setMatrixAt(i, _dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    dashes.computeBoundingSphere();
    pack.add(dashes);
  }

  const panelMat = makeTexturedPhong(
    'steel',
    sceneId === 'yard' ? 0x4a5560 : sceneId === 'rift' ? 0x3a6070 : sceneId === 'wormhole' ? 0x2a1840 : 0x4a5a68,
    quality,
    { variant: 0, repeat: 2.8, emissive: pal.glow, emissiveScale: 0.06 }
  );
  const stepP = sceneId === 'canyon' || sceneId === 'yard' ? 1.6 : 2.0;
  const nPanel = Math.min(kitCap(quality, 240, 100), Math.max(110, Math.floor(S / stepP) * 2));
  const panelGeo = new THREE.BoxGeometry(0.7, 1, 1);
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, nPanel);
  panels.name = 'FlyerWipeoutWallPanel';
  for (let i = 0; i < nPanel; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const sPos = Math.min(S - 2, 1 + pair * stepP);
    const h = sceneId === 'wormhole' ? 5.5 + hash(i, 3) * 2.5 : 8.5 + hash(i, 3) * 5.5;
    pose(sPos, side * (4.9 + (pair % 3) * 0.25), h * 0.5 - 1.2, 1.15, h, stepP * 1.05);
    panels.setMatrixAt(i, _dummy.matrix);
  }
  panels.instanceMatrix.needsUpdate = true;
  panels.computeBoundingSphere();
  pack.add(panels);
}
