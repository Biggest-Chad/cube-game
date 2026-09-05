/**
 * Original cube-game hero ship: Vesper Dagger.
 *
 * Commercially shippable procedural factory (code-only primitives).
 * Silhouette language is the in-house interceptor dagger: needle fuselage,
 * forward-swept wings, exposed nose cannon, layered armor, twin+center
 * engines. Local -Z is forward (toward the cube).
 *
 * This is NOT a copy of 3DHaupt Intergalactic topology or textures.
 * img2threejs python forge was unavailable on this machine; intake used
 * agent-vision / semantic GLB probe of interceptor-v2 bounds + the existing
 * original box-dagger in Ship.buildMesh, then this independent loft/extrude.
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import { SHIP_HEADLIGHTS, SHIP_MUZZLE, SHIP_THRUSTERS } from './ShipMounts';

export const HERO_SHIP_NAME = 'VesperDagger';

const SEG = 8;

function hullMat(color: number, metal = 0.84, rough = 0.3, emissive = 0x102028, emi = 0.22): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 0.9,
    emissive,
    emissiveIntensity: emi,
  });
}

function neonMat(color: number, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.28,
    roughness: 0.16,
  });
}

function addMesh(
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

function box(
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

function cyl(
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
  return addMesh(parent, new THREE.CylinderGeometry(rt, rb, h, segs), mat, name, x, y, z, rx, ry, rz);
}

/** Flattened hex-loft fuselage. Original stations, not extracted GLB verts. */
function loftFuselage(): THREE.BufferGeometry {
  const stations: Array<{ z: number; rx: number; ry: number; k: number }> = [
    { z: -1.72, rx: 0.045, ry: 0.04, k: 0.92 },
    { z: -1.28, rx: 0.11, ry: 0.085, k: 0.82 },
    { z: -0.72, rx: 0.2, ry: 0.13, k: 0.74 },
    { z: -0.18, rx: 0.28, ry: 0.175, k: 0.7 },
    { z: 0.38, rx: 0.3, ry: 0.19, k: 0.68 },
    { z: 0.88, rx: 0.24, ry: 0.155, k: 0.72 },
    { z: 1.18, rx: 0.14, ry: 0.11, k: 0.8 },
  ];
  const segs = SEG;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const point = (s: (typeof stations)[0], i: number): [number, number, number] => {
    const t = i / segs;
    const a = t * Math.PI * 2 + Math.PI / segs;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const diamond = Math.max(Math.abs(cx), Math.abs(cy) * 1.2);
    const mix = THREE.MathUtils.lerp(1, 1 / Math.max(diamond, 0.42), s.k);
    return [cx * s.rx * mix, cy * s.ry * mix, s.z];
  };

  for (let si = 0; si < stations.length; si++) {
    for (let i = 0; i <= segs; i++) {
      const p = point(stations[si], i);
      positions.push(p[0], p[1], p[2]);
      uvs.push(i / segs, si / (stations.length - 1));
    }
  }
  const ring = segs + 1;
  for (let si = 0; si < stations.length - 1; si++) {
    for (let i = 0; i < segs; i++) {
      const a = si * ring + i;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // cap nose + tail
  const nose = stations[0];
  const tail = stations[stations.length - 1];
  const noseIdx = positions.length / 3;
  positions.push(0, 0, nose.z - 0.08);
  uvs.push(0.5, 0);
  const tailIdx = positions.length / 3;
  positions.push(0, 0, tail.z + 0.06);
  uvs.push(0.5, 1);
  for (let i = 0; i < segs; i++) {
    indices.push(noseIdx, i + 1, i);
    const base = (stations.length - 1) * ring;
    indices.push(tailIdx, base + i, base + i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Thin solid wing from 4 planform corners. Forward-swept (tip LE ahead of root LE). */
function sweptWing(side: number): THREE.BufferGeometry {
  const t = 0.018;
  const rootLe = new THREE.Vector3(side * 0.16, 0.0, -0.18);
  const rootTe = new THREE.Vector3(side * 0.2, -0.01, 0.46);
  const tipLe = new THREE.Vector3(side * 1.18, 0.03, -0.58);
  const tipTe = new THREE.Vector3(side * 1.24, 0.02, -0.04);
  const up = new THREE.Vector3(0, t, 0);
  const corners = [rootLe, tipLe, tipTe, rootTe];
  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  for (const c of corners) push(c.clone().add(up));
  for (const c of corners) push(c.clone().sub(up));
  const indices = [
    0, 1, 2, 0, 2, 3, // top
    4, 6, 5, 4, 7, 6, // bottom
    0, 4, 5, 0, 5, 1, // LE
    1, 5, 6, 1, 6, 2, // tip
    2, 6, 7, 2, 7, 3, // TE
    3, 7, 4, 3, 4, 0, // root
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

function additive(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export function countGroupTris(root: THREE.Object3D): { tris: number; meshes: number } {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh) return;
    meshes++;
    const g = mesh.geometry;
    const idx = g.index;
    tris += idx ? idx.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });
  return { tris: Math.round(tris), meshes };
}

/**
 * Build the commercially-shippable hero visual.
 * Live sockets: EngineGlow_*, Nozzle_*, Plume_* (see Ship.installHeroVisual).
 */
export function createHeroShip(): THREE.Group {
  const g = new THREE.Group();
  g.name = HERO_SHIP_NAME;

  const armor = hullMat(0x101820, 0.88, 0.28, 0x0c2430, 0.28);
  const plate = hullMat(0x1a2836, 0.76, 0.36, 0x102030, 0.18);
  const edge = hullMat(0x334556, 0.62, 0.24, 0x1a3040, 0.2);
  const dark = hullMat(0x080c12, 0.9, 0.42, 0x081018, 0.12);
  const cyan = neonMat(COLORS.cyan, 0.9);
  const mag = neonMat(COLORS.magenta, 1.05);
  const eng = neonMat(0xff44bb, 1.45);
  const warn = neonMat(0xff6622, 0.7);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x6ad8f0,
    metalness: 0.12,
    roughness: 0.06,
    transparent: true,
    opacity: 0.7,
    emissive: 0x1488aa,
    emissiveIntensity: 0.7,
  });

  addMesh(g, loftFuselage(), armor, 'HullLoft');

  // Layered armor — overlapping plates, original sizes
  box(g, 'DorsalPlate', 0.36, 0.045, 1.35, plate, 0, 0.14, 0.05);
  box(g, 'Spine', 0.055, 0.09, 1.2, dark, 0, 0.2, 0.08);
  box(g, 'SpineNeon', 0.07, 0.018, 0.62, cyan, 0, 0.245, -0.12);
  box(g, 'ChinPlow', 0.28, 0.07, 0.78, dark, 0, -0.125, -0.58, 0.16, 0, 0);
  box(g, 'Beak', 0.16, 0.045, 0.42, plate, 0, -0.14, -1.02, 0.1, 0, 0);
  box(g, 'BellyKeel', 0.18, 0.05, 0.9, dark, 0, -0.16, 0.12);

  for (const side of [-1, 1] as const) {
    box(g, `Cheek_${side}`, 0.11, 0.16, 0.92, plate, side * 0.26, 0.02, -0.02, 0, 0, side * -0.32);
    box(g, `CheekLow_${side}`, 0.08, 0.09, 0.55, dark, side * 0.3, -0.04, -0.38, 0, 0, side * -0.22);
    box(g, `Scoop_${side}`, 0.09, 0.06, 0.2, dark, side * 0.24, -0.07, -0.18, 0.22, 0, 0);
    box(g, `Heat_${side}`, 0.055, 0.03, 0.1, warn, side * 0.24, -0.07, -0.3);
    box(g, `SideNeon_${side}`, 0.012, 0.022, 1.05, cyan, side * 0.19, 0.055, 0.0);
  }

  // Panel bands
  for (let i = 0; i < 5; i++) {
    box(g, `Band_${i}`, 0.4, 0.008, 0.016, dark, 0, 0.155, -0.55 + i * 0.28);
  }

  // Exposed nose cannon at SHIP_MUZZLE
  const mz = SHIP_MUZZLE;
  cyl(g, 'Barrel', 0.038, 0.046, 0.72, 8, edge, mz.x, mz.y, mz.z + 0.42, Math.PI / 2, 0, 0);
  cyl(g, 'BarrelSleeve', 0.032, 0.032, 0.2, 8, dark, mz.x, mz.y, mz.z + 0.12, Math.PI / 2, 0, 0);
  addMesh(g, new THREE.TorusGeometry(0.048, 0.01, 6, 14), cyan, 'MuzRing_0', mz.x, mz.y, mz.z + 0.04).rotation.y = Math.PI / 2;
  addMesh(g, new THREE.TorusGeometry(0.04, 0.008, 6, 12), cyan, 'MuzRing_1', mz.x, mz.y, mz.z - 0.02).rotation.y = Math.PI / 2;
  const muzGlow = addMesh(
    g,
    new THREE.SphereGeometry(0.032, 10, 10),
    additive(COLORS.cyan, 0.8),
    'EngineGlow_Muzzle',
    mz.x,
    mz.y,
    mz.z
  );
  muzGlow.renderOrder = 2;

  for (const side of [-1, 1] as const) {
    cyl(g, `ChinGun_${side}`, 0.016, 0.02, 0.3, 6, cyan, side * 0.09, -0.12, -1.18, Math.PI / 2, 0, 0);
  }

  // Cockpit
  const canopy = addMesh(g, new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glass, 'Canopy', 0, 0.155, -0.32);
  canopy.scale.set(1.08, 0.62, 1.38);
  box(g, 'CanopyFrame', 0.28, 0.03, 0.4, dark, 0, 0.1, -0.32);
  box(g, 'CanopyRail_1', 0.016, 0.05, 0.34, edge, 0.11, 0.13, -0.32);
  box(g, 'CanopyRail_-1', 0.016, 0.05, 0.34, edge, -0.11, 0.13, -0.32);

  // Forward-swept combat wings
  for (const side of [-1, 1] as const) {
    addMesh(g, sweptWing(side), plate, `Wing_${side}`);
    box(g, `WingLE_${side}`, 0.78, 0.016, 0.07, edge, side * 0.72, 0.02, -0.28, 0, side * 0.42, side * 0.12);
    box(g, `WingTip_${side}`, 0.28, 0.02, 0.1, cyan, side * 1.16, 0.03, -0.12, 0, side * 0.28, side * 0.08);
    box(g, `Rail_${side}`, 0.42, 0.035, 0.09, dark, side * 0.62, -0.14, 0.08);
    const tip = addMesh(g, new THREE.SphereGeometry(0.03, 8, 8), mag, `WingTipLight_${side}`, side * 1.26, 0.03, -0.06);
    void tip;
  }

  // Canards
  for (const side of [-1, 1] as const) {
    box(g, `Canard_${side}`, 0.34, 0.018, 0.13, plate, side * 0.28, 0.0, -0.82, 0, side * -0.22, side * 0.28);
    box(g, `CanardEdge_${side}`, 0.12, 0.012, 0.05, cyan, side * 0.4, 0.01, -0.9);
  }

  // Canted vertical stabs
  for (const side of [-1, 1] as const) {
    box(g, `Stab_${side}`, 0.022, 0.3, 0.26, plate, side * 0.15, 0.28, 0.55, 0.22, 0, side * 0.38);
    box(g, `StabCap_${side}`, 0.018, 0.12, 0.08, mag, side * 0.17, 0.42, 0.5);
    box(g, `Rudder_${side}`, 0.01, 0.18, 0.035, cyan, side * 0.16, 0.28, 0.64);
  }

  box(g, 'SensorFin', 0.018, 0.2, 0.16, plate, 0, 0.34, 0.34, 0.18, 0, 0);
  box(g, 'SensorTip', 0.014, 0.06, 0.05, mag, 0, 0.46, 0.3);
  box(g, 'Hazard', 0.32, 0.01, 0.035, warn, 0, 0.17, 0.72);

  // Engine cluster at SHIP_THRUSTERS
  SHIP_THRUSTERS.forEach((pos, i) => {
    const pod = new THREE.Group();
    pod.name = `EnginePod_${i}`;
    pod.position.copy(pos);
    // Cowling sits forward of the nozzle socket
    cyl(pod, `${i}_Cowling`, 0.09, 0.115, 0.46, 10, armor, 0, 0, -0.22, Math.PI / 2, 0, 0);
    cyl(pod, `${i}_Intake`, 0.1, 0.08, 0.07, 10, edge, 0, 0, -0.48, Math.PI / 2, 0, 0);
    const nozzle = cyl(pod, `Nozzle_${i}`, 0.055, 0.082, 0.12, 10, eng, 0, 0, 0.02, Math.PI / 2, 0, 0);
    nozzle.name = `Nozzle_${i}`;
    const glow = cyl(pod, `EngineGlow_${i}`, 0.048, 0.07, 0.08, 10, eng, 0, 0, 0.08, Math.PI / 2, 0, 0);
    glow.name = `EngineGlow_${i}`;
    const plume = addMesh(pod, new THREE.ConeGeometry(0.07, 0.42, 8), additive(i === 2 ? 0xff66cc : COLORS.magenta, 0.72), `Plume_${i}`, 0, 0, 0.28, -Math.PI / 2, 0, 0);
    plume.renderOrder = 2;
    plume.frustumCulled = false;
    const shell = addMesh(pod, new THREE.ConeGeometry(0.11, 0.52, 8), additive(0xaa44ff, 0.22), `PlumeShell_${i}`, 0, 0, 0.34, -Math.PI / 2, 0, 0);
    shell.renderOrder = 2;
    shell.frustumCulled = false;
    addMesh(pod, new THREE.TorusGeometry(i === 2 ? 0.1 : 0.088, 0.01, 6, 16), cyan, `${i}_Lip`, 0, 0, 0.0).rotation.y = Math.PI / 2;
    g.add(pod);
  });

  addMesh(g, new THREE.TorusGeometry(0.15, 0.012, 8, 18), cyan, 'EngineRing', 0, 0, 0.78).rotation.y = Math.PI / 2;

  // Headlights
  const lamp = hullMat(0x1a2028, 0.5, 0.35);
  const lens = new THREE.MeshStandardMaterial({
    color: 0xffffee,
    emissive: 0xfff2c8,
    emissiveIntensity: 1.4,
    metalness: 0.15,
    roughness: 0.12,
  });
  SHIP_HEADLIGHTS.forEach((p, i) => {
    box(g, `HeadHouse_${i}`, 0.08, 0.06, 0.09, lamp, p.x, p.y, p.z + 0.05);
    const li = addMesh(g, new THREE.CircleGeometry(0.028, 12), lens, `HeadLens_${i}`, p.x, p.y, p.z);
    li.rotation.x = Math.PI;
    const halo = addMesh(g, new THREE.CircleGeometry(0.045, 12), additive(0xfff0c0, 0.5), `HeadHalo_${i}`, p.x, p.y, p.z - 0.005);
    halo.rotation.x = Math.PI;
  });

  // Nav running lights
  for (const side of [-1, 1] as const) {
    const col = side > 0 ? COLORS.magenta : COLORS.cyan;
    addMesh(g, new THREE.SphereGeometry(0.032, 10, 10), additive(col, 0.9), `Nav_${side}`, side * 0.72, 0.02, 0.12);
    addMesh(g, new THREE.SphereGeometry(0.075, 10, 10), additive(col, 0.25), `NavHalo_${side}`, side * 0.72, 0.02, 0.12);
  }

  // Underside vents
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 4; i++) {
      box(g, `Vent_${side}_${i}`, 0.035, 0.012, 0.05, edge, side * 0.18, -0.155, 0.15 + i * 0.12);
    }
  }

  g.userData.license = 'original';
  g.userData.hero = HERO_SHIP_NAME;
  return g;
}
