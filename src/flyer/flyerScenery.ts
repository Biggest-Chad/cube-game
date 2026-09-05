/**
 * Dense flyer corridor scenery. Modular Blender packs + Tripo singles already
 * on disk under public/flyer/. Instanced along the spline with path-local
 * (right, up, tangent) orientation. Caps keep mobile draw cost reasonable.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SplinePath } from './SplinePath';
import { PathFrame } from './SplinePath';

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

interface Proto {
  meshes: Array<{ geo: THREE.BufferGeometry; local: THREE.Matrix4 }>;
  fit: number;
}

export interface FlyerSceneryLib {
  rings: Proto | null;
  rails: Proto | null;
  buoys: Proto | null;
  gates: Proto | null;
  pads: Proto | null;
  corridor: Proto | null;
}

const TARGET: Record<Kind, number> = {
  rings: 17,
  rails: 9,
  buoys: 2.2,
  gates: 7,
  pads: 3.2,
  corridor: 22,
};

/** Mobile-capped instance counts (denser than the old sparse primitives). */
const CAP: Record<Kind, number> = {
  rings: 56,
  rails: 64,
  buoys: 36,
  gates: 16,
  pads: 12,
  corridor: 6,
};

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _F = new PathFrame();
const _mat = new THREE.Matrix4();

let cache: Promise<FlyerSceneryLib> | null = null;

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
  return { rings, rails, buoys, gates, pads, corridor };
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
      meshes.push({ geo: mesh.geometry, local });
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

function unlit(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 0.98,
    opacity,
    toneMapped: false,
    fog: true,
    depthWrite: opacity >= 0.9,
  });
}

function instanceKind(
  proto: Proto,
  count: number,
  color: number,
  opacity: number,
  place: (i: number) => void,
  root: THREE.Group
): void {
  if (count <= 0) return;
  const mat = unlit(color, opacity);
  for (const part of proto.meshes) {
    const inst = new THREE.InstancedMesh(part.geo, mat, count);
    inst.frustumCulled = false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      place(i);
      _dummy.updateMatrix();
      _mat.copy(_dummy.matrix).multiply(part.local);
      inst.setMatrixAt(i, _mat);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.name = 'FlyerSceneryInst';
    root.add(inst);
  }
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Instance modular GLBs along arc-length. Safe to call once lib resolves.
 * Parent group is named so dispose can skip double-adding.
 */
export function placeFlyerGlbScenery(
  root: THREE.Group,
  path: SplinePath,
  accent: number,
  glow: number,
  fill: number
): void {
  if (root.getObjectByName('FlyerGlbScenery')) return;
  const pack = new THREE.Group();
  pack.name = 'FlyerGlbScenery';
  root.add(pack);

  const S = path.length;
  const libP = preloadFlyerScenery();
  void libP.then((lib) => {
    if (!pack.parent) return;
    const pose = (s: number, x: number, y: number, sx: number, sy: number, sz: number) => {
      path.sample(THREE.MathUtils.clamp(s, 0, Math.max(0, S - 0.05)), _F);
      _dummy.position.copy(_F.p).addScaledVector(_F.r, x).addScaledVector(_F.u, y);
      _mat.makeBasis(_F.r, _F.u, _F.t);
      _dummy.quaternion.setFromRotationMatrix(_mat);
      _dummy.scale.set(sx, sy, sz);
    };

    if (lib.rings) {
      const n = Math.min(CAP.rings, Math.max(18, Math.floor(S / 14)));
      const fit = lib.rings.fit;
      instanceKind(
        lib.rings,
        n,
        accent,
        0.55,
        (i) => {
          const s = ((i + 0.5) / n) * (S - 8) + 4;
          pose(s, 0, 0, fit, fit, fit);
        },
        pack
      );
    }

    if (lib.rails) {
      const n = Math.min(CAP.rails, Math.max(20, Math.floor(S / 12)));
      const fit = lib.rails.fit;
      instanceKind(
        lib.rails,
        n,
        fill,
        0.95,
        (i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const s = ((Math.floor(i / 2) + 0.35) / Math.max(1, n / 2)) * (S - 10) + 5;
          pose(s, side * (8.4 + (i % 3) * 0.35), 0.4, fit, fit, fit);
        },
        pack
      );
    }

    if (lib.buoys) {
      const n = Math.min(CAP.buoys, Math.max(14, Math.floor(S / 22)));
      const fit = lib.buoys.fit;
      instanceKind(
        lib.buoys,
        n,
        glow,
        0.85,
        (i) => {
          const s = ((i + 0.2) / n) * (S - 16) + 8;
          const side = hash(i, 5) > 0.5 ? 1 : -1;
          pose(
            s,
            side * (5.2 + hash(i, 9) * 3.4),
            (hash(i, 11) - 0.4) * 3.2,
            fit,
            fit,
            fit
          );
        },
        pack
      );
    }

    if (lib.gates) {
      const n = Math.min(CAP.gates, Math.max(8, Math.floor(S / 55)));
      const fit = lib.gates.fit;
      instanceKind(
        lib.gates,
        n,
        glow,
        0.62,
        (i) => {
          const s = ((i + 0.5) / n) * (S - 24) + 12;
          pose(s, 0, 0.2, fit, fit, fit);
        },
        pack
      );
    }

    if (lib.pads) {
      const n = Math.min(CAP.pads, Math.max(6, Math.floor(S / 70)));
      const fit = lib.pads.fit;
      instanceKind(
        lib.pads,
        n,
        0x66ffaa,
        0.8,
        (i) => {
          const s = ((i + 0.4) / n) * (S - 30) + 16;
          pose(s, (hash(i, 3) - 0.5) * 3.2, -2.6, fit, fit, fit);
        },
        pack
      );
    }

    if (lib.corridor) {
      const n = Math.min(CAP.corridor, Math.max(4, Math.floor(S / 140)));
      const fit = lib.corridor.fit;
      instanceKind(
        lib.corridor,
        n,
        fill,
        0.55,
        (i) => {
          const s = ((i + 0.5) / n) * (S - 40) + 20;
          pose(s, 0, 0, fit, fit, fit);
        },
        pack
      );
    }
  });
}
