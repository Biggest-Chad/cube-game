/**
 * Allied drone visuals — original procedural hulls.
 * Product language: cyber/neon faceted metal, same family as Vesper, smaller.
 * Local −Z is forward. Gentle cyan IFF halo. Role paint is gold / orange / green.
 */
import * as THREE from 'three';
import type { DroneRole } from '../data/drones';
import {
  ALLIED_IFF,
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
  zPrism,
} from './droneGeom';

export { countGroupTris, ALLIED_IFF };

type AlliedMats = {
  hull: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  orange: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  iff: THREE.MeshBasicMaterial;
  iffSoft: THREE.MeshBasicMaterial;
  engine: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
};

let mats: AlliedMats | null = null;

function alliedMats(): AlliedMats {
  if (mats) return mats;
  mats = {
    hull: hullMat(0x121820, 0.88, 0.28, 0x0a2430, 0.28),
    plate: hullMat(0x1c2a38, 0.76, 0.34, 0x102030, 0.18),
    dark: hullMat(0x080c12, 0.9, 0.42, 0x081018, 0.12),
    edge: hullMat(0x3a4d62, 0.62, 0.24, 0x1a3040, 0.22),
    gold: neonMat(0xffd060, 0.85),
    orange: neonMat(0xff6622, 0.8),
    green: neonMat(0x00ffaa, 0.8),
    iff: additive(ALLIED_IFF, 0.5),
    iffSoft: additive(ALLIED_IFF, 0.28),
    engine: neonMat(ALLIED_IFF, 1.15),
    glass: new THREE.MeshStandardMaterial({
      color: 0x6ad8f0,
      metalness: 0.12,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
      emissive: 0x1488aa,
      emissiveIntensity: 0.65,
    }),
  };
  mats.glass.userData.shared = true;
  return mats;
}

const protos: Partial<Record<DroneRole, THREE.Group>> = {};

function addRotor(
  parent: THREE.Object3D,
  m: AlliedMats,
  z: number,
  ringR: number,
  vanes = 4
): THREE.Group {
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0, z);
  addMesh(rotor, new THREE.TorusGeometry(ringR, ringR * 0.16, 5, 10), m.iff, 'Ring').rotation.y =
    Math.PI / 2;
  for (let i = 0; i < vanes; i++) {
    const a = (i / vanes) * Math.PI * 2;
    box(
      rotor,
      `Vane_${i}`,
      ringR * 1.5,
      0.012,
      0.028,
      m.dark,
      Math.cos(a) * ringR * 0.35,
      Math.sin(a) * ringR * 0.35,
      0,
      0,
      0,
      a
    );
  }
  const nozzle = cyl(
    rotor,
    'thruster',
    ringR * 0.38,
    ringR * 0.55,
    0.1,
    8,
    m.engine,
    0,
    0,
    0.06,
    Math.PI / 2,
    0,
    0
  );
  nozzle.name = 'thruster';
  addMesh(
    rotor,
    new THREE.ConeGeometry(ringR * 0.42, 0.16, 8),
    m.iffSoft,
    'Plume',
    0,
    0,
    0.16,
    -Math.PI / 2,
    0,
    0
  ).renderOrder = 2;
  parent.add(rotor);
  return rotor;
}

function addEye(
  parent: THREE.Object3D,
  m: AlliedMats,
  accent: THREE.Material,
  x: number,
  y: number,
  z: number,
  r = 0.045
): THREE.Mesh {
  const eye = addMesh(parent, new THREE.IcosahedronGeometry(r, 0), accent, 'eye', x, y, z);
  eye.name = 'eye';
  addMesh(parent, new THREE.TorusGeometry(r * 1.35, r * 0.22, 4, 8), m.iff, 'EyeRim', x, y, z).rotation.y =
    Math.PI / 2;
  return eye;
}

function buildFighter(m: AlliedMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'AlliedFighter';

  addMesh(
    g,
    loftZ(
      [
        { z: -0.72, rx: 0.028, ry: 0.02, n: 1.25 },
        { z: -0.42, rx: 0.07, ry: 0.046, n: 1.35 },
        { z: -0.08, rx: 0.095, ry: 0.056, n: 1.45 },
        { z: 0.22, rx: 0.085, ry: 0.05, n: 1.5 },
        { z: 0.48, rx: 0.055, ry: 0.038, n: 1.7 },
        { z: 0.64, rx: 0.03, ry: 0.022, n: 2.0 },
      ],
      6
    ),
    m.hull,
    'Hull'
  );

  box(g, 'Spine', 0.028, 0.036, 0.78, m.dark, 0, 0.062, 0.0);
  box(g, 'SpineNeon', 0.016, 0.01, 0.36, m.gold, 0, 0.084, -0.12);
  box(g, 'Keel', 0.034, 0.022, 0.5, m.dark, 0, -0.052, -0.06);
  box(g, 'Chin', 0.05, 0.018, 0.22, m.plate, 0, -0.048, -0.42, 0.18, 0, 0);

  for (let i = 0; i < 3; i++) {
    box(g, `Band_${i}`, 0.12, 0.006, 0.012, m.dark, 0, 0.05, -0.32 + i * 0.24);
  }

  for (const s of [-1, 1] as const) {
    box(g, `Cheek_${s}`, 0.04, 0.05, 0.42, m.plate, s * 0.072, 0.01, -0.08, 0, 0, s * -0.38);
    box(g, `Rail_${s}`, 0.01, 0.016, 0.7, m.iff, s * 0.055, 0.03, 0.0);
    addMesh(
      g,
      wingFrom(
        [s * 0.08, 0.012, -0.14],
        [s * 0.42, 0.04, -0.02],
        [s * 0.44, 0.03, 0.24],
        [s * 0.09, 0.0, 0.28],
        0.012
      ),
      m.plate,
      `Wing_${s}`
    );
    box(g, `WingTip_${s}`, 0.11, 0.014, 0.045, m.gold, s * 0.42, 0.04, 0.1, 0, s * 0.2, s * 0.12);
    addMesh(
      g,
      wingFrom(
        [s * 0.06, 0.02, -0.48],
        [s * 0.26, 0.035, -0.62],
        [s * 0.26, 0.03, -0.48],
        [s * 0.06, 0.015, -0.34],
        0.009
      ),
      m.plate,
      `Canard_${s}`
    );
    box(g, `CanardEdge_${s}`, 0.07, 0.01, 0.022, m.gold, s * 0.24, 0.035, -0.6);

    box(g, `Pylon_${s}`, 0.034, 0.045, 0.14, m.dark, s * 0.14, -0.045, -0.2);
    cyl(g, `Pod_${s}`, 0.034, 0.04, 0.24, 6, m.plate, s * 0.18, -0.06, -0.24, Math.PI / 2, 0, 0);
    cyl(g, `Barrel_${s}`, 0.016, 0.022, 0.38, 6, m.edge, s * 0.18, -0.06, -0.46, Math.PI / 2, 0, 0);
    cyl(g, `Muzzle_${s}`, 0.024, 0.018, 0.045, 6, m.dark, s * 0.18, -0.06, -0.64, Math.PI / 2, 0, 0);
    addMesh(
      g,
      new THREE.TorusGeometry(0.02, 0.006, 4, 8),
      m.gold,
      `MuzRing_${s}`,
      s * 0.18,
      -0.06,
      -0.66
    ).rotation.y = Math.PI / 2;
  }

  box(g, 'DorsalFin', 0.014, 0.12, 0.16, m.plate, 0, 0.12, 0.28, 0.22, 0, 0);
  box(g, 'FinCap', 0.012, 0.04, 0.04, m.gold, 0, 0.18, 0.24);
  addEye(g, m, m.gold, 0, 0.012, -0.7, 0.032);
  addRotor(g, m, 0.68, 0.095, 3);
  g.add(makeHaloSprite(ALLIED_IFF, 1.35, 0.42, 'allied'));
  return g;
}

function buildBomber(m: AlliedMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'AlliedBomber';

  addMesh(
    g,
    loftZ(
      [
        { z: -0.52, rx: 0.16, ry: 0.1, n: 2.5 },
        { z: -0.22, rx: 0.3, ry: 0.16, n: 2.7 },
        { z: 0.08, rx: 0.38, ry: 0.18, n: 2.9 },
        { z: 0.38, rx: 0.28, ry: 0.14, n: 2.6 },
        { z: 0.62, rx: 0.12, ry: 0.08, n: 2.2 },
      ],
      6
    ),
    m.hull,
    'Hull'
  );

  addMesh(g, zPrism(0.18, 0.14, 0.08, 6), m.plate, 'BluntNose', 0, 0.02, -0.56);
  box(g, 'DorsalCarapace', 0.42, 0.05, 0.7, m.plate, 0, 0.16, 0.02);
  box(g, 'Spine', 0.04, 0.06, 0.72, m.dark, 0, 0.2, 0.04);
  box(g, 'SpineNeon', 0.028, 0.012, 0.4, m.orange, 0, 0.232, -0.06);

  for (let i = 0; i < 3; i++) {
    box(g, `CarapaceBand_${i}`, 0.4, 0.008, 0.014, m.dark, 0, 0.186, -0.2 + i * 0.2);
  }

  for (const s of [-1, 1] as const) {
    addMesh(
      g,
      wingFrom(
        [s * 0.18, 0.03, -0.28],
        [s * 0.72, 0.1, 0.08],
        [s * 0.66, 0.08, 0.44],
        [s * 0.2, 0.0, 0.5],
        0.018
      ),
      m.plate,
      `Delta_${s}`
    );
    box(g, `DeltaLE_${s}`, 0.5, 0.016, 0.055, m.iff, s * 0.46, 0.07, -0.06, 0.12, s * 0.5, s * 0.1);
    box(g, `DeltaTip_${s}`, 0.12, 0.02, 0.055, m.orange, s * 0.68, 0.1, 0.2, 0, s * 0.2, 0);

    // Twin intakes
    cyl(g, `Intake_${s}`, 0.07, 0.055, 0.2, 6, m.dark, s * 0.2, 0.02, -0.28, Math.PI / 2, 0, 0);
    addMesh(
      g,
      new THREE.TorusGeometry(0.068, 0.012, 4, 8),
      m.orange,
      `IntakeLip_${s}`,
      s * 0.2,
      0.02,
      -0.38
    ).rotation.y = Math.PI / 2;
    cyl(g, `IntakeHole_${s}`, 0.042, 0.048, 0.08, 6, m.dark, s * 0.2, 0.02, -0.36, Math.PI / 2, 0, 0);

    box(g, `Cheek_${s}`, 0.08, 0.12, 0.5, m.plate, s * 0.28, 0.0, 0.05, 0, 0, s * -0.18);
    box(g, `Tail_${s}`, 0.02, 0.18, 0.2, m.plate, s * 0.12, 0.2, 0.48, 0.18, 0, s * 0.22);
    box(g, `TailCap_${s}`, 0.016, 0.05, 0.05, m.orange, s * 0.13, 0.3, 0.46);
    box(g, `Rail_${s}`, 0.012, 0.018, 0.7, m.iff, s * 0.22, 0.08, 0.0);
  }

  // Ventral bomb bay — U housing + decorative warhead shell (not the projectile)
  box(g, 'BayRoof', 0.28, 0.03, 0.38, m.dark, 0, -0.12, 0.06);
  box(g, 'BayL', 0.04, 0.1, 0.38, m.plate, 0.14, -0.16, 0.06);
  box(g, 'BayR', 0.04, 0.1, 0.38, m.plate, -0.14, -0.16, 0.06);
  box(g, 'BayLip', 0.3, 0.016, 0.04, m.orange, 0, -0.21, -0.14);
  cyl(g, 'WarheadHouse', 0.055, 0.08, 0.22, 6, m.edge, 0, -0.18, 0.08, Math.PI / 2, 0, 0);
  addMesh(g, new THREE.OctahedronGeometry(0.055, 0), m.orange, 'WarheadTip', 0, -0.18, -0.06);

  addEye(g, m, m.orange, 0, 0.03, -0.6, 0.042);
  addRotor(g, m, 0.7, 0.13, 4);
  g.add(makeHaloSprite(ALLIED_IFF, 1.7, 0.4, 'allied'));
  return g;
}

function buildDefender(m: AlliedMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'AlliedDefender';

  addMesh(g, zPrism(0.22, 0.2, 0.32, 6), m.hull, 'Hub');
  addMesh(g, zPrism(0.18, 0.16, 0.22, 6), m.plate, 'HubCore', 0, 0, 0.06);
  box(g, 'DorsalCap', 0.2, 0.04, 0.2, m.dark, 0, 0.14, 0.04);
  box(g, 'VentralCap', 0.18, 0.03, 0.18, m.dark, 0, -0.13, 0.04);

  // Frontal hex shield plate — the readable disc
  addMesh(g, zPrism(0.46, 0.46, 0.045, 6), m.plate, 'ShieldPlate', 0, 0, -0.22);
  addMesh(g, zPrism(0.4, 0.4, 0.02, 6), m.dark, 'ShieldInset', 0, 0, -0.24);
  addMesh(g, new THREE.TorusGeometry(0.42, 0.016, 4, 6), m.green, 'ShieldFrame', 0, 0, -0.22).rotation.y =
    Math.PI / 2;

  const energy = addMesh(
    g,
    zPrism(0.43, 0.43, 0.012, 6),
    additive(0x00ffaa, 0.32),
    'shield-energy',
    0,
    0,
    -0.255
  );
  energy.name = 'shield-energy';
  energy.renderOrder = 2;

  // Point-defense ring around hull
  addMesh(g, new THREE.TorusGeometry(0.32, 0.02, 5, 10), m.edge, 'PdRing', 0, 0, 0.02).rotation.y =
    Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 0.32;
    const y = Math.sin(a) * 0.32;
    box(g, `PdNub_${i}`, 0.05, 0.05, 0.08, m.green, x, y, -0.1);
    box(g, `PdBarrel_${i}`, 0.018, 0.018, 0.1, m.edge, x, y, -0.18);
  }

  for (const s of [-1, 1] as const) {
    box(g, `SideBlade_${s}`, 0.08, 0.22, 0.04, m.plate, s * 0.28, 0, 0.06, 0, 0, s * 0.12);
    box(g, `SideNeon_${s}`, 0.012, 0.16, 0.012, m.iff, s * 0.3, 0, 0.06);
  }

  addEye(g, m, m.green, 0, 0, -0.28, 0.04);
  addRotor(g, m, 0.28, 0.11, 4);
  g.add(makeHaloSprite(ALLIED_IFF, 1.55, 0.4, 'allied'));
  return g;
}

function buildRole(role: DroneRole): THREE.Group {
  const m = alliedMats();
  if (role === 'bomber') return buildBomber(m);
  if (role === 'defender') return buildDefender(m);
  return buildFighter(m);
}

export function createAlliedDrone(role: DroneRole): THREE.Group {
  let proto = protos[role];
  if (!proto) {
    proto = buildRole(role);
    mergeStaticHull(proto);
    markShared(proto);
    protos[role] = proto;
  }
  const g = proto.clone(true);
  g.name = `AlliedDrone_${role}`;
  uniquifyPulseMaterials(g);
  return g;
}
