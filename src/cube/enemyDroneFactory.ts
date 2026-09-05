/**
 * Enemy drone visuals — original procedural hulls.
 * Same cyber/neon faceted-metal language as allied, but hostile: sharper,
 * cube-derived, red IFF. Not recolors of friendlies.
 * Local −Z is forward.
 */
import * as THREE from 'three';
import type { EnemyDroneRole } from './EnemyDrone';
import {
  ENEMY_IFF,
  addMesh,
  additive,
  box,
  countGroupTris,
  cyl,
  hullMat,
  loftZ,
  makeHaloSprite,
  markShared,
  mergeStaticHull,
  neonMat,
  uniquifyPulseMaterials,
  wingFrom,
} from '../drones/droneGeom';

export { countGroupTris, ENEMY_IFF };

type EnemyMats = {
  hull: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  iff: THREE.MeshBasicMaterial;
  iffSoft: THREE.MeshBasicMaterial;
  engine: THREE.MeshStandardMaterial;
  mint: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  pink: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
};

let mats: EnemyMats | null = null;

function enemyMats(): EnemyMats {
  if (mats) return mats;
  mats = {
    hull: hullMat(0x1a0810, 0.88, 0.32, 0x220408, 0.32),
    plate: hullMat(0x2a1018, 0.72, 0.36, 0x180408, 0.2),
    dark: hullMat(0x0c0408, 0.9, 0.44, 0x100208, 0.14),
    edge: hullMat(0x4a2030, 0.58, 0.28, 0x2a0810, 0.24),
    iff: additive(ENEMY_IFF, 0.5),
    iffSoft: additive(ENEMY_IFF, 0.26),
    engine: neonMat(ENEMY_IFF, 1.05),
    mint: neonMat(0xaaffcc, 0.85),
    yellow: neonMat(0xffee88, 0.9),
    pink: neonMat(0xffa0c8, 0.85),
    red: neonMat(0xff3344, 0.8),
  };
  return mats;
}

const protos: Partial<Record<EnemyDroneRole, THREE.Group>> = {};

function addFlash(parent: THREE.Object3D, z: number): THREE.Mesh {
  const flash = addMesh(
    parent,
    new THREE.SphereGeometry(0.14, 6, 6),
    additive(0xffffff, 0),
    'flash',
    0,
    0,
    z
  );
  flash.name = 'flash';
  flash.visible = false;
  flash.renderOrder = 3;
  return flash;
}

function addEye(
  parent: THREE.Object3D,
  accent: THREE.Material,
  iff: THREE.Material,
  x: number,
  y: number,
  z: number,
  r = 0.045
): THREE.Mesh {
  const eye = addMesh(parent, new THREE.OctahedronGeometry(r, 0), accent, 'eye', x, y, z);
  eye.name = 'eye';
  addMesh(parent, new THREE.TorusGeometry(r * 1.4, r * 0.2, 4, 8), iff, 'EyeRim', x, y, z).rotation.y =
    Math.PI / 2;
  return eye;
}

function haloFor(role: EnemyDroneRole): THREE.Sprite {
  const size = role === 'kamikaze' ? 2.2 : role === 'cube-fighter' ? 2.05 : role === 'repair' ? 1.8 : 2.45;
  const op = role === 'attack' ? 0.68 : 0.5;
  return makeHaloSprite(ENEMY_IFF, size, op, 'enemy');
}

/** Faceted arrowhead, offset cubic gun, aggressive dihedral. Not a red fighter. */
function buildAttack(m: EnemyMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'EnemyAttack';

  addMesh(
    g,
    loftZ(
      [
        { z: -0.7, rx: 0.03, ry: 0.022, n: 1.15 },
        { z: -0.32, rx: 0.16, ry: 0.06, n: 1.2 },
        { z: 0.02, rx: 0.32, ry: 0.08, n: 1.15 },
        { z: 0.32, rx: 0.16, ry: 0.07, n: 1.3 },
        { z: 0.52, rx: 0.06, ry: 0.045, n: 1.6 },
      ],
      6
    ),
    m.hull,
    'Arrow'
  );

  box(g, 'Spine', 0.04, 0.03, 0.7, m.dark, 0, 0.055, -0.04);
  box(g, 'Keel', 0.05, 0.04, 0.55, m.dark, 0, -0.06, 0.0, 0.12, 0, 0);
  box(g, 'IffStrip', 0.012, 0.01, 0.55, m.iff, 0, 0.072, -0.08);

  for (const s of [-1, 1] as const) {
    addMesh(
      g,
      wingFrom(
        [s * 0.1, 0.02, -0.2],
        [s * 0.52, 0.22, -0.06],
        [s * 0.5, 0.2, 0.24],
        [s * 0.12, 0.0, 0.3],
        0.016
      ),
      m.plate,
      `Dihedral_${s}`
    );
    box(g, `DihedralLE_${s}`, 0.38, 0.014, 0.045, m.red, s * 0.32, 0.12, -0.08, 0.35, s * 0.35, s * 0.15);
    box(g, `Tip_${s}`, 0.09, 0.016, 0.045, m.iff, s * 0.5, 0.21, 0.06);
  }

  // Offset cubic gun block — the asymmetric tell
  box(g, 'GunCube', 0.24, 0.24, 0.26, m.dark, 0.3, -0.05, -0.16);
  box(g, 'GunFace', 0.18, 0.18, 0.03, m.red, 0.3, -0.05, -0.3);
  cyl(g, 'GunBarrel', 0.032, 0.04, 0.32, 6, m.edge, 0.3, -0.05, -0.42, Math.PI / 2, 0, 0);
  cyl(g, 'GunMuzzle', 0.038, 0.028, 0.05, 6, m.red, 0.3, -0.05, -0.58, Math.PI / 2, 0, 0);
  box(g, 'GunBrace', 0.14, 0.05, 0.12, m.plate, 0.18, -0.02, -0.06);

  box(g, 'AftCube', 0.14, 0.14, 0.12, m.plate, 0, 0, 0.42);
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0, 0.54);
  box(rotor, 'collar', 0.12, 0.12, 0.06, m.dark, 0, 0, 0);
  const nozzle = cyl(rotor, 'thruster', 0.04, 0.06, 0.1, 6, m.engine, 0, 0, 0.08, Math.PI / 2, 0, 0);
  nozzle.name = 'thruster';
  addMesh(rotor, new THREE.ConeGeometry(0.05, 0.14, 6), m.iffSoft, 'Plume', 0, 0, 0.18, -Math.PI / 2, 0, 0);
  g.add(rotor);

  addEye(g, m.red, m.iff, 0, 0.02, -0.68, 0.038);
  addFlash(g, -0.72);
  g.add(haloFor('attack'));
  return g;
}

/** Cube-core utility with armature/claw and hose. Not a red defender. */
function buildRepair(m: EnemyMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'EnemyRepair';

  box(g, 'Core', 0.34, 0.34, 0.34, m.hull, 0, 0, 0.04);
  box(g, 'CoreInset', 0.26, 0.26, 0.04, m.dark, 0, 0, -0.14);
  box(g, 'CoreGlow', 0.18, 0.18, 0.18, m.mint, 0, 0, 0.04);
  for (const s of [-1, 1] as const) {
    box(g, `Tank_${s}`, 0.16, 0.22, 0.22, m.plate, s * 0.26, 0.02, 0.08);
    box(g, `TankBand_${s}`, 0.17, 0.03, 0.17, m.mint, s * 0.26, 0.06, 0.08);
    box(g, `TankCap_${s}`, 0.1, 0.04, 0.1, m.dark, s * 0.26, 0.15, 0.08);
  }
  box(g, 'TopBrick', 0.2, 0.1, 0.2, m.plate, 0, 0.22, 0.02);
  box(g, 'TopLight', 0.08, 0.02, 0.08, m.mint, 0, 0.28, 0.02);

  // Compact grabber in front of the cube — reads as a claw at combat scale
  box(g, 'Shoulder', 0.14, 0.1, 0.1, m.edge, 0, -0.18, -0.16);
  box(g, 'Wrist', 0.1, 0.08, 0.1, m.plate, 0, -0.22, -0.28);
  box(g, 'ClawBase', 0.16, 0.05, 0.08, m.dark, 0, -0.22, -0.36);
  box(g, 'ClawL', 0.04, 0.12, 0.18, m.mint, 0.07, -0.24, -0.48, 0.15, 0, 0.18);
  box(g, 'ClawR', 0.04, 0.12, 0.18, m.mint, -0.07, -0.24, -0.48, 0.15, 0, -0.18);

  addMesh(
    g,
    new THREE.TorusGeometry(0.12, 0.024, 5, 8, Math.PI * 1.2),
    m.dark,
    'Hose',
    -0.22,
    -0.04,
    0.0
  ).rotation.set(0.2, 1.2, 0.4);
  cyl(g, 'HoseTip', 0.022, 0.03, 0.08, 5, m.mint, -0.28, -0.12, -0.1, 0.9, 0, 0);

  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0, 0.28);
  addMesh(rotor, new THREE.TorusGeometry(0.1, 0.018, 5, 10), m.iff, 'FanRing').rotation.y = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    box(rotor, `Fan_${i}`, 0.16, 0.012, 0.03, m.dark, Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0, 0, 0, a);
  }
  const nozzle = cyl(rotor, 'thruster', 0.035, 0.05, 0.08, 6, m.engine, 0, 0, 0.05, Math.PI / 2, 0, 0);
  nozzle.name = 'thruster';
  g.add(rotor);

  addEye(g, m.mint, m.iff, 0, 0.04, -0.16, 0.04);
  addFlash(g, -0.22);
  g.add(haloFor('repair'));
  return g;
}

/** Spike-dart ram cone, almost no wings, spinning cubic collar. Reads as a missile. */
function buildKamikaze(m: EnemyMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'EnemyKamikaze';

  addMesh(
    g,
    loftZ(
      [
        { z: -0.15, rx: 0.07, ry: 0.07, n: 1.8 },
        { z: 0.12, rx: 0.09, ry: 0.09, n: 1.9 },
        { z: 0.38, rx: 0.07, ry: 0.07, n: 2.0 },
        { z: 0.58, rx: 0.04, ry: 0.04, n: 2.2 },
      ],
      6
    ),
    m.hull,
    'Body'
  );

  addMesh(g, new THREE.ConeGeometry(0.09, 0.62, 6), m.plate, 'Ram', 0, 0, -0.48, -Math.PI / 2, 0, 0);
  addMesh(g, new THREE.ConeGeometry(0.04, 0.22, 6), m.yellow, 'RamGlow', 0, 0, -0.72, -Math.PI / 2, 0, 0);
  box(g, 'BandA', 0.16, 0.016, 0.03, m.yellow, 0, 0, -0.18);
  box(g, 'BandB', 0.14, 0.016, 0.03, m.iff, 0, 0, 0.08);

  // Tiny fins only — missile, not a gunship
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a);
    const y = Math.sin(a);
    box(g, `Fin_${i}`, 0.01, 0.09, 0.16, m.edge, x * 0.08, y * 0.08, 0.42, 0, 0, a);
  }

  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0, 0.18);
  box(rotor, 'collar', 0.22, 0.22, 0.1, m.dark, 0, 0, 0);
  box(rotor, 'CollarGlow', 0.24, 0.03, 0.03, m.yellow, 0, 0, 0);
  box(rotor, 'CollarGlowV', 0.03, 0.24, 0.03, m.yellow, 0, 0, 0);
  box(rotor, 'CollarGlowZ', 0.03, 0.03, 0.14, m.iff, 0, 0, 0);
  const nozzle = cyl(rotor, 'thruster', 0.04, 0.055, 0.1, 6, m.engine, 0, 0, 0.42, Math.PI / 2, 0, 0);
  nozzle.name = 'thruster';
  addMesh(rotor, new THREE.ConeGeometry(0.05, 0.18, 6), m.iffSoft, 'Plume', 0, 0, 0.54, -Math.PI / 2, 0, 0);
  g.add(rotor);

  addEye(g, m.yellow, m.iff, 0, 0.02, -0.22, 0.03);
  addFlash(g, -0.82);
  g.add(haloFor('kamikaze'));
  return g;
}

/** Flying voxel: stacked cubes with fin blades. Most cube-like silhouette. */
function buildCubeFighter(m: EnemyMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'EnemyCubeFighter';

  box(g, 'Main', 0.42, 0.42, 0.42, m.hull, 0, 0, 0);
  box(g, 'Fore', 0.26, 0.26, 0.26, m.plate, 0.06, 0.08, -0.28);
  box(g, 'Aft', 0.3, 0.22, 0.22, m.plate, -0.08, -0.06, 0.28);
  box(g, 'Top', 0.2, 0.16, 0.2, m.dark, 0, 0.28, -0.04);
  box(g, 'Core', 0.2, 0.2, 0.2, m.pink, 0, 0, 0);
  box(g, 'CoreRim', 0.46, 0.04, 0.46, m.iff, 0, 0.22, 0);

  for (const s of [-1, 1] as const) {
    box(g, `Fin_${s}`, 0.05, 0.36, 0.28, m.plate, s * 0.32, 0.04, 0.04, 0, 0, s * 0.18);
    box(g, `FinEdge_${s}`, 0.02, 0.32, 0.04, m.pink, s * 0.35, 0.04, -0.08);
    box(g, `SideBrick_${s}`, 0.14, 0.14, 0.14, m.dark, s * 0.22, -0.16, -0.12);
  }

  box(g, 'Chin', 0.16, 0.12, 0.2, m.edge, 0, -0.22, -0.18);
  cyl(g, 'Barrel', 0.02, 0.026, 0.22, 6, m.edge, 0, -0.22, -0.32, Math.PI / 2, 0, 0);
  box(g, 'AftNozzleHouse', 0.16, 0.16, 0.08, m.dark, 0, 0, 0.42);
  cyl(g, 'AftNozzle', 0.04, 0.06, 0.1, 6, m.engine, 0, 0, 0.5, Math.PI / 2, 0, 0);

  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0.3, 0.12);
  box(rotor, 'SpinCube', 0.1, 0.1, 0.1, m.pink, 0, 0, 0);
  box(rotor, 'SpinBlade', 0.22, 0.02, 0.02, m.iff, 0, 0, 0);
  g.add(rotor);

  addEye(g, m.pink, m.iff, 0.06, 0.08, -0.42, 0.04);
  addFlash(g, -0.44);
  g.add(haloFor('cube-fighter'));
  return g;
}

function buildRole(role: EnemyDroneRole): THREE.Group {
  const m = enemyMats();
  if (role === 'repair') return buildRepair(m);
  if (role === 'kamikaze') return buildKamikaze(m);
  if (role === 'cube-fighter') return buildCubeFighter(m);
  return buildAttack(m);
}

export function createEnemyDrone(role: EnemyDroneRole, _color: number): THREE.Group {
  let proto = protos[role];
  if (!proto) {
    proto = buildRole(role);
    mergeStaticHull(proto);
    markShared(proto);
    protos[role] = proto;
  }
  const g = proto.clone(true);
  g.name = `EnemyDrone_${role}`;
  uniquifyPulseMaterials(g);
  return g;
}
