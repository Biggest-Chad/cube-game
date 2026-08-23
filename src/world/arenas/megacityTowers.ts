/**
 * Procedural megacity tileset reconstructed from:
 *   assets/images/main reference.jpg  (primary composition / palette)
 *   assets/images/tileset only buildings.jpg  (5 tower silhouettes)
 *   assets/images/layer-neon-billboard*.png  (screen art)
 *
 * img2threejs method: code-only primitives + canvas facades + instancing.
 * Stylized real-time reconstruction — not photogrammetry.
 */
import * as THREE from 'three';

const TOWER_N = 84;
const IMPOSTOR_N = 40;
const SCREEN_N = 11;

type BoxSpec = { y: number; sy: number; sx: number; sz: number; ox?: number; oz?: number };
type ScreenSpec = { y: number; h: number; w: number; yaw: number; ox?: number; oz?: number };

const VARIANTS: Array<{ boxes: BoxSpec[]; screens: ScreenSpec[] }> = [
  {
    boxes: [
      { y: 0.07, sy: 0.14, sx: 1.22, sz: 1.18 },
      { y: 0.36, sy: 0.44, sx: 1.0, sz: 1.0 },
      { y: 0.7, sy: 0.24, sx: 0.84, sz: 0.9 },
      { y: 0.9, sy: 0.14, sx: 0.68, sz: 0.7 },
    ],
    screens: [
      { y: 0.52, h: 0.3, w: 0.52, yaw: 0 },
      { y: 0.22, h: 0.16, w: 0.62, yaw: 0 },
    ],
  },
  {
    boxes: [
      { y: 0.08, sy: 0.16, sx: 1.18, sz: 1.12 },
      { y: 0.34, sy: 0.36, sx: 0.95, sz: 1.0, oz: 0.06 },
      { y: 0.52, sy: 0.1, sx: 1.35, sz: 0.7, oz: 0.28 },
      { y: 0.72, sy: 0.32, sx: 0.8, sz: 0.86 },
      { y: 0.94, sy: 0.12, sx: 0.62, sz: 0.64 },
    ],
    screens: [
      { y: 0.7, h: 0.34, w: 0.48, yaw: 0 },
      { y: 0.28, h: 0.14, w: 0.42, yaw: Math.PI / 2, ox: 0.48 },
    ],
  },
  {
    boxes: [
      { y: 0.1, sy: 0.2, sx: 1.28, sz: 1.1 },
      { y: 0.42, sy: 0.44, sx: 0.92, sz: 0.95 },
      { y: 0.78, sy: 0.28, sx: 0.78, sz: 0.82 },
      { y: 0.96, sy: 0.08, sx: 0.58, sz: 0.6 },
    ],
    screens: [
      { y: 0.62, h: 0.26, w: 0.5, yaw: 0 },
      { y: 0.32, h: 0.18, w: 0.7, yaw: 0 },
    ],
  },
  {
    boxes: [
      { y: 0.09, sy: 0.18, sx: 1.2, sz: 1.16 },
      { y: 0.38, sy: 0.4, sx: 1.02, sz: 0.96 },
      { y: 0.68, sy: 0.2, sx: 0.88, sz: 0.9 },
      { y: 0.88, sy: 0.2, sx: 0.72, sz: 0.74 },
    ],
    screens: [
      { y: 0.78, h: 0.22, w: 0.44, yaw: 0 },
      { y: 0.28, h: 0.2, w: 0.72, yaw: 0 },
    ],
  },
  {
    boxes: [
      { y: 0.08, sy: 0.16, sx: 1.14, sz: 1.2 },
      { y: 0.4, sy: 0.48, sx: 0.9, sz: 1.0 },
      { y: 0.76, sy: 0.24, sx: 0.76, sz: 0.82 },
      { y: 0.94, sy: 0.12, sx: 0.6, sz: 0.62 },
    ],
    screens: [
      { y: 0.58, h: 0.28, w: 0.46, yaw: 0 },
      { y: 0.3, h: 0.16, w: 0.5, yaw: Math.PI, oz: -0.02 },
    ],
  },
];

function hash(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintBody(w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b1018';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#151c28';
  ctx.fillRect(2, 2, w - 4, h - 4);
  const cols = 7;
  const rows = 22;
  const padX = 6;
  const padY = 10;
  const gap = 2;
  const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
  const ch = (h - padY * 2 - gap * (rows - 1)) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = hash(x + 3, y + 11 + w);
      if (n < 0.22) continue;
      const warm = n > 0.82;
      ctx.globalAlpha = 0.35 + n * 0.55;
      ctx.fillStyle = warm ? '#ffc878' : n > 0.55 ? '#7ad8ff' : '#3a6a88';
      ctx.fillRect(padX + x * (cw + gap), padY + y * (ch + gap), cw * 0.85, ch * 0.7);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 230, 255, 0.35)';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = 'rgba(255, 40, 170, 0.22)';
  ctx.fillRect(0, h - 4, w, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function fallbackScreen(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6a2aff');
  g.addColorStop(0.5, '#ff44cc');
  g.addColorStop(1, '#221144');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(180,220,255,0.35)';
  ctx.fillRect(20, 40, 88, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

async function loadScreens(): Promise<THREE.Texture[]> {
  const loader = new THREE.TextureLoader();
  const urls = Array.from(
    { length: SCREEN_N },
    (_, i) => `./arenas/grid-void/screens/screen-${String(i).padStart(2, '0')}.png`
  );
  const out: THREE.Texture[] = [];
  for (const url of urls) {
    try {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 1;
      t.generateMipmaps = true;
      out.push(t);
    } catch {
      /* skip missing */
    }
  }
  if (out.length === 0) out.push(fallbackScreen());
  return out;
}

async function loadImpostor(): Promise<THREE.Texture | null> {
  try {
    const t = await new THREE.TextureLoader().loadAsync(
      './arenas/grid-void/screens/impostor-tower.png'
    );
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 1;
    return t;
  } catch {
    return null;
  }
}

function makeTrain(cars: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: true });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false, fog: true });
  const geo = new THREE.BoxGeometry(2.4, 0.42, 0.58);
  const win = new THREE.MeshBasicMaterial({
    color: 0xc8f6ff,
    toneMapped: false,
    fog: true,
    transparent: true,
    opacity: 0.75,
  });
  const winGeo = new THREE.BoxGeometry(1.7, 0.12, 0.6);
  for (let i = 0; i < cars; i++) {
    const x = (i - (cars - 1) * 0.5) * 2.45;
    const car = new THREE.Mesh(geo, body);
    car.position.x = x;
    g.add(car);
    const w = new THREE.Mesh(winGeo, win);
    w.position.set(x, 0.06, 0);
    g.add(w);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.36), lamp);
  head.position.set((cars - 1) * 1.22 + 1.35, 0.02, 0);
  g.add(head);
  return g;
}

/**
 * Dense neon canyon matching the main reference: gunmetal stepped towers,
 * magenta/cyan screens, edge trims, far impostors, metro.
 */
export async function addMegacitySkyline(root: THREE.Group): Promise<void> {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const n = o.name;
    if (
      n.startsWith('Proto_') ||
      n.startsWith('Tower') ||
      n.startsWith('Bldg') ||
      n.startsWith('Highrise') ||
      n.startsWith('Block_')
    ) {
      o.visible = false;
    }
  });

  const life = new THREE.Group();
  life.name = 'CityLife';

  const screens = await loadScreens();
  const impostorTex = await loadImpostor();
  const bodyTex = paintBody(96, 256);

  const bodyMat = new THREE.MeshBasicMaterial({
    map: bodyTex,
    toneMapped: false,
    fog: true,
    color: 0xc8d0dc,
  });
  const altMat = new THREE.MeshBasicMaterial({ color: 0x0a1018, toneMapped: false, fog: true });
  const cyanMat = new THREE.MeshBasicMaterial({
    color: 0x44f0ff,
    toneMapped: false,
    fog: true,
    transparent: true,
    opacity: 0.85,
  });
  const magMat = new THREE.MeshBasicMaterial({
    color: 0xff3aa8,
    toneMapped: false,
    fog: true,
    transparent: true,
    opacity: 0.8,
  });

  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const trimGeo = new THREE.BoxGeometry(1, 1, 1);
  const mastGeo = new THREE.BoxGeometry(0.08, 1, 0.08);
  const screenGeo = new THREE.PlaneGeometry(1, 1);

  const BODY_MAX = TOWER_N * 5;
  const TRIM_MAX = TOWER_N * 10;
  const MAST_MAX = TOWER_N * 4;
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, BODY_MAX);
  const plinthMesh = new THREE.InstancedMesh(bodyGeo, altMat, TOWER_N);
  const cyanMesh = new THREE.InstancedMesh(trimGeo, cyanMat, TRIM_MAX);
  const magMesh = new THREE.InstancedMesh(trimGeo, magMat, TRIM_MAX);
  const mastMesh = new THREE.InstancedMesh(mastGeo, cyanMat, MAST_MAX);
  bodyMesh.name = 'MegaBody';
  plinthMesh.name = 'MegaPlinth';
  cyanMesh.name = 'MegaCyanTrim';
  magMesh.name = 'MegaMagTrim';
  mastMesh.name = 'MegaMasts';
  for (const m of [bodyMesh, plinthMesh, cyanMesh, magMesh, mastMesh]) {
    m.frustumCulled = true;
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    life.add(m);
  }

  const screenMeshes = screens.map((tex, i) => {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      toneMapped: false,
      fog: true,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(screenGeo, mat, Math.ceil((TOWER_N * 2) / screens.length) + 8);
    mesh.name = `MegaScreen_${i}`;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    life.add(mesh);
    return mesh;
  });
  const screenCounts = screenMeshes.map(() => 0);

  const dummy = new THREE.Object3D();
  let bodyN = 0;
  let plinthN = 0;
  let cyanN = 0;
  let magN = 0;
  let mastN = 0;

  const place = (
    mesh: THREE.InstancedMesh,
    idx: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw: number
  ): number => {
    if (idx >= mesh.count) return idx;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    return idx + 1;
  };

  for (let i = 0; i < TOWER_N; i++) {
    const variant = VARIANTS[i % VARIANTS.length];
    const a = (i / TOWER_N) * Math.PI * 2 + hash(i, 2) * 0.22;
    const ring = hash(i, 3) > 0.38 ? 1 : 0;
    const r = (ring ? 52 : 34) + hash(i, 4) * (ring ? 18 : 10);
    const H = 14 + hash(i, 5) * (ring ? 28 : 18);
    const footprint = 2.4 + hash(i, 6) * 2.2;
    const yaw = a + Math.PI / 2 + (hash(i, 8) - 0.5) * 0.35;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const world = (lx: number, lz: number) => ({
      x: cx + lx * footprint * cos - lz * footprint * sin,
      z: cz + lx * footprint * sin + lz * footprint * cos,
    });

    for (let b = 0; b < variant.boxes.length; b++) {
      const box = variant.boxes[b];
      const p = world(box.ox ?? 0, box.oz ?? 0);
      const sy = box.sy * H;
      const y = box.y * H;
      if (b === 0) {
        plinthN = place(plinthMesh, plinthN, p.x, y, p.z, box.sx * footprint, sy, box.sz * footprint, yaw);
      } else {
        bodyN = place(bodyMesh, bodyN, p.x, y, p.z, box.sx * footprint, sy, box.sz * footprint, yaw);
      }
    }

    const top = variant.boxes[variant.boxes.length - 1];
    const roof = world(0, 0);
    const roofY = (top.y + top.sy * 0.5) * H + 0.4;
    mastN = place(mastMesh, mastN, roof.x, roofY + 1.4, roof.z, 1, 2.8 + hash(i, 9) * 2.2, 1, yaw);
    mastN = place(
      mastMesh,
      mastN,
      roof.x + cos * 0.35,
      roofY + 0.9,
      roof.z + sin * 0.35,
      1,
      1.6,
      1,
      yaw
    );

    // Corner neon
    const half = footprint * 0.48;
    const trimH = H * 0.72;
    for (const [sx, sz] of [
      [half, half],
      [half, -half],
      [-half, half],
      [-half, -half],
    ] as const) {
      const p = world(sx / footprint, sz / footprint);
      const mesh = hash(i + sx, 14) > 0.5 ? cyanMesh : magMesh;
      if (mesh === cyanMesh) {
        cyanN = place(cyanMesh, cyanN, p.x, trimH * 0.5, p.z, 0.08, trimH, 0.08, yaw);
      } else {
        magN = place(magMesh, magN, p.x, trimH * 0.5, p.z, 0.08, trimH, 0.08, yaw);
      }
    }

    for (let s = 0; s < variant.screens.length; s++) {
      const sc = variant.screens[s];
      const faceYaw = yaw + sc.yaw;
      const push = footprint * 0.52 + 0.04;
      const fx = Math.sin(faceYaw) * push;
      const fz = Math.cos(faceYaw) * push;
      const p = world(sc.ox ?? 0, sc.oz ?? 0);
      const bucket = (i * 3 + s) % screenMeshes.length;
      const mesh = screenMeshes[bucket];
      const idx = screenCounts[bucket];
      if (idx >= mesh.count) continue;
      dummy.position.set(p.x + fx, sc.y * H, p.z + fz);
      dummy.rotation.set(0, faceYaw, 0);
      dummy.scale.set(sc.w * footprint * 1.15, sc.h * H, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      screenCounts[bucket] = idx + 1;
    }
  }

  bodyMesh.count = bodyN;
  plinthMesh.count = plinthN;
  cyanMesh.count = cyanN;
  magMesh.count = magN;
  mastMesh.count = mastN;
  bodyMesh.instanceMatrix.needsUpdate = true;
  plinthMesh.instanceMatrix.needsUpdate = true;
  cyanMesh.instanceMatrix.needsUpdate = true;
  magMesh.instanceMatrix.needsUpdate = true;
  mastMesh.instanceMatrix.needsUpdate = true;
  screenMeshes.forEach((m, i) => {
    m.count = screenCounts[i];
    m.instanceMatrix.needsUpdate = true;
  });

  if (impostorTex) {
    const mat = new THREE.MeshBasicMaterial({
      map: impostorTex,
      transparent: true,
      toneMapped: false,
      fog: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, IMPOSTOR_N);
    mesh.name = 'MegaImpostors';
    mesh.frustumCulled = true;
    let n = 0;
    for (let i = 0; i < IMPOSTOR_N; i++) {
      const a = (i / IMPOSTOR_N) * Math.PI * 2 + hash(i, 21) * 0.3;
      const r = 78 + hash(i, 22) * 28;
      const h = 18 + hash(i, 23) * 22;
      dummy.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
      dummy.rotation.set(0, a + Math.PI / 2, 0);
      dummy.scale.set(4.2 + hash(i, 24) * 3.5, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    life.add(mesh);
  }

  const TRAIN_LINES = [
    { r: 46, y: 6.2, speed: 0.075, color: 0x66e8ff, cars: 5 },
    { r: 62, y: 8.4, speed: -0.058, color: 0xff66cc, cars: 4 },
  ];
  for (const line of TRAIN_LINES) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(line.r, 0.09, 6, 72),
      new THREE.MeshBasicMaterial({
        color: line.color,
        toneMapped: false,
        fog: true,
        transparent: true,
        opacity: 0.42,
      })
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = line.y - 0.32;
    rail.name = `MetroRail_${line.r}`;
    rail.matrixAutoUpdate = false;
    rail.updateMatrix();
    life.add(rail);
  }
  const trains = TRAIN_LINES.map((line) => {
    const obj = makeTrain(line.cars, line.color);
    life.add(obj);
    return { obj, ...line, phase: hash(line.r, 9) * Math.PI * 2 };
  });

  let acc = 0;
  const prev = root.userData.tick as ((t: number, dt: number) => void) | undefined;
  root.userData.tick = (t: number, dt: number) => {
    prev?.(t, dt);
    acc += dt;
    if (acc < 0.09) return;
    acc = 0;
    for (const tr of trains) {
      const a = t * tr.speed + tr.phase;
      tr.obj.position.set(Math.cos(a) * tr.r, tr.y, Math.sin(a) * tr.r);
      tr.obj.rotation.y = -a + Math.PI / 2;
    }
  };

  root.add(life);
}
