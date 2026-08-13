/**
 * Distant skyline: instanced windowed towers + a light metro/traffic loop.
 * MeshBasic + 3 draw calls for buildings. Animation is ~8–12 Hz, not every frame.
 */
import * as THREE from 'three';

const BUILDING_N = 96;
const CAR_N = 18;
const TRAIN_LINES = [
  { r: 74, y: 4.1, speed: 0.07, color: 0x66e8ff, cars: 4 },
  { r: 96, y: 5.8, speed: -0.055, color: 0xff66cc, cars: 3 },
];

function hash(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintFacade(w: number, h: number, lit: string, dark: string, body: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, w, h);
  const cols = 8;
  const rows = 18;
  const padX = 4;
  const padY = 10;
  const gap = 2;
  const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
  const ch = (h - padY * 2 - gap * (rows - 1)) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = hash(x + 1, y + 3 + w);
      const on = n > 0.28;
      if (!on) {
        ctx.fillStyle = dark;
      } else if (n > 0.92) {
        ctx.fillStyle = n > 0.97 ? '#fff4c8' : lit;
      } else {
        ctx.fillStyle = lit;
      }
      ctx.globalAlpha = on ? 0.55 + n * 0.45 : 1;
      ctx.fillRect(padX + x * (cw + gap), padY + y * (ch + gap), cw, ch);
    }
  }
  ctx.globalAlpha = 1;
  // Roof band
  ctx.fillStyle = 'rgba(0, 220, 255, 0.25)';
  ctx.fillRect(0, 0, w, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function makeTrain(cars: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: true });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false, fog: true });
  const geo = new THREE.BoxGeometry(2.1, 0.52, 0.7);
  const winGeo = new THREE.BoxGeometry(1.5, 0.14, 0.72);
  const win = new THREE.MeshBasicMaterial({
    color: 0xc8f6ff,
    toneMapped: false,
    fog: true,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < cars; i++) {
    const x = (i - (cars - 1) * 0.5) * 2.15;
    const car = new THREE.Mesh(geo, body);
    car.position.x = x;
    g.add(car);
    const w = new THREE.Mesh(winGeo, win);
    w.position.set(x, 0.08, 0);
    g.add(w);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), lamp);
  head.position.set((cars - 1) * 1.08 + 1.2, 0.02, 0);
  g.add(head);
  return g;
}

export function addCitySkyline(root: THREE.Group): void {
  // Hide the leftover untextured proto towers — they read as black slabs
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name.startsWith('Proto_')) o.visible = false;
  });

  const life = new THREE.Group();
  life.name = 'CityLife';

  const palettes = [
    { lit: '#7ae9ff', dark: '#0a1520', body: '#101820' },
    { lit: '#ff9ad4', dark: '#140814', body: '#161018' },
    { lit: '#ffe08a', dark: '#141008', body: '#16140e' },
  ];
  const geos = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.BoxGeometry(1, 1, 1),
  ];
  const buckets: THREE.InstancedMesh[] = palettes.map((p, i) => {
    const mat = new THREE.MeshBasicMaterial({
      map: paintFacade(128, 256, p.lit, p.dark, p.body),
      toneMapped: false,
      fog: true,
    });
    const mesh = new THREE.InstancedMesh(geos[i], mat, Math.ceil(BUILDING_N / palettes.length) + 4);
    mesh.name = `Skyline_${i}`;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    life.add(mesh);
    return mesh;
  });

  const dummy = new THREE.Object3D();
  const counts = [0, 0, 0];
  for (let i = 0; i < BUILDING_N; i++) {
    const bucket = i % palettes.length;
    const a = (i / BUILDING_N) * Math.PI * 2 + hash(i, 2) * 0.35;
    const ring = hash(i, 3) > 0.45 ? 1 : 0;
    const r = (ring ? 84 : 60) + hash(i, 4) * (ring ? 26 : 16);
    const h = 5 + hash(i, 5) * (ring ? 22 : 14);
    const sx = 1.15 + hash(i, 6) * 1.9;
    const sz = 1.15 + hash(i, 7) * 1.7;
    dummy.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
    dummy.rotation.set(0, a + Math.PI / 2 + (hash(i, 8) - 0.5) * 0.4, 0);
    dummy.scale.set(sx, h, sz);
    dummy.updateMatrix();
    const mesh = buckets[bucket];
    const idx = counts[bucket]++;
    if (idx < mesh.count) mesh.setMatrixAt(idx, dummy.matrix);
  }
  buckets.forEach((m, i) => {
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
  });

  // Metro rails — thin unlit rings (2 draws)
  for (const line of TRAIN_LINES) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(line.r, 0.07, 6, 64),
      new THREE.MeshBasicMaterial({
        color: line.color,
        toneMapped: false,
        fog: true,
        transparent: true,
        opacity: 0.35,
      })
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = line.y - 0.28;
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

  const carGeo = new THREE.BoxGeometry(0.85, 0.18, 0.38);
  const carMat = new THREE.MeshBasicMaterial({ color: 0xffc878, toneMapped: false, fog: true });
  const cars = new THREE.InstancedMesh(carGeo, carMat, CAR_N);
  cars.frustumCulled = true;
  life.add(cars);
  const carMeta = Array.from({ length: CAR_N }, (_, i) => ({
    r: [62, 70, 88, 100][i % 4],
    speed: 0.14 + (i % 5) * 0.025,
    phase: (i / CAR_N) * Math.PI * 2,
    dir: i % 3 === 0 ? -1 : 1,
  }));

  // Sparse ground lamps — flicker a few instance colors
  const lampN = 28;
  const lampMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0, toneMapped: false, fog: true }),
    lampN
  );
  life.add(lampMesh);
  const lampCol = new THREE.Color();
  for (let i = 0; i < lampN; i++) {
    const a = (i / lampN) * Math.PI * 2 + hash(i, 11);
    const r = 56 + (i % 5) * 10;
    dummy.position.set(Math.cos(a) * r, 0.28, Math.sin(a) * r);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampMesh.setMatrixAt(i, dummy.matrix);
    lampCol.setHSL(0.08 + hash(i, 12) * 0.08, 0.7, 0.55);
    lampMesh.setColorAt(i, lampCol);
  }
  if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;

  const carDummy = new THREE.Object3D();
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
    for (let i = 0; i < CAR_N; i++) {
      const c = carMeta[i];
      const a = t * c.speed * c.dir + c.phase;
      carDummy.position.set(Math.cos(a) * c.r, 0.22, Math.sin(a) * c.r);
      carDummy.rotation.y = -a + Math.PI / 2;
      carDummy.updateMatrix();
      cars.setMatrixAt(i, carDummy.matrix);
    }
    cars.instanceMatrix.needsUpdate = true;
    // Traffic / window flicker
    for (let k = 0; k < 6; k++) {
      const i = (Math.random() * lampN) | 0;
      const on = Math.random() > 0.25;
      lampCol.setRGB(on ? 1 : 0.15, on ? 0.88 : 0.12, on ? 0.55 : 0.08);
      lampMesh.setColorAt(i, lampCol);
    }
    if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
  };

  root.add(life);
}
