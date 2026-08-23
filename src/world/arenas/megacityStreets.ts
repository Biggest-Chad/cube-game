/**
 * Street-level megacity dressing reconstructed from the tileset plate:
 * low-rises in the canyons, elevated cyan highways + trains, lamps,
 * floating ads, canyon drones — and a ruined inner ring around the
 * cube's portal blast. Instanced MeshBasic, mobile budget.
 */
import * as THREE from 'three';

function hash(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type XZ = { x: number; z: number; foot: number };

function towerFootprints(): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * Math.PI * 2 + hash(i, 2) * 0.22;
    const ring = hash(i, 3) > 0.38 ? 1 : 0;
    const r = (ring ? 52 : 34) + hash(i, 4) * (ring ? 18 : 10);
    const footprint = 2.4 + hash(i, 6) * 2.2;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, foot: footprint * 0.62 });
  }
  return out;
}

function clearOfTowers(x: number, z: number, rad: number, towers: XZ[]): boolean {
  for (let i = 0; i < towers.length; i++) {
    const dx = x - towers[i].x;
    const dz = z - towers[i].z;
    const m = towers[i].foot + rad;
    if (dx * dx + dz * dz < m * m) return false;
  }
  return true;
}

function paintLowRise(w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c121a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#161e2a';
  ctx.fillRect(1, 1, w - 2, h - 2);
  const cols = 5;
  const rows = 8;
  const padX = 4;
  const padY = 6;
  const gap = 2;
  const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
  const ch = (h - padY * 2 - gap * (rows - 1)) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = hash(x + 1, y + 17 + w);
      if (n < 0.18) continue;
      ctx.globalAlpha = 0.4 + n * 0.55;
      ctx.fillStyle = n > 0.78 ? '#ffc070' : n > 0.5 ? '#6ae0ff' : '#ff5ec8';
      ctx.fillRect(padX + x * (cw + gap), padY + y * (ch + gap), cw * 0.8, ch * 0.65);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 220, 255, 0.3)';
  ctx.fillRect(0, 0, w, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paintRuin(w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(2, 2, w - 4, h - 4);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = hash(i, 3) > 0.5 ? 'rgba(8,6,4,0.55)' : 'rgba(60,40,28,0.35)';
    ctx.fillRect(hash(i, 1) * w, hash(i, 2) * h, 3 + hash(i, 4) * 8, 2 + hash(i, 5) * 6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.3);
  ctx.lineTo(w, h * 0.55);
  ctx.moveTo(w * 0.2, 0);
  ctx.lineTo(w * 0.7, h);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function asphaltMat(color = 0x1a222c): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: true });
}

function neonMat(color: number, opacity = 0.85): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    fog: true,
    transparent: opacity < 1,
    opacity,
  });
}

function makeHighwayShape(half = 1.15, thick = 0.09): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-half, -thick);
  s.lineTo(half, -thick);
  s.lineTo(half, thick);
  s.lineTo(-half, thick);
  s.closePath();
  return s;
}

function weaveCurve(rMid: number, amp: number, y: number, yAmp: number, phase: number, pts = 16): THREE.CatmullRomCurve3 {
  const v: THREE.Vector3[] = [];
  for (let i = 0; i < pts; i++) {
    const t = i / pts;
    const a = t * Math.PI * 2 + phase;
    const r = rMid + amp * Math.sin(t * Math.PI * 4 + phase);
    v.push(new THREE.Vector3(Math.cos(a) * r, y + yAmp * Math.sin(t * Math.PI * 2 + phase * 0.7), Math.sin(a) * r));
  }
  return new THREE.CatmullRomCurve3(v, true, 'catmullrom', 0.18);
}

function makeMetro(cars: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: true });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false, fog: true });
  const win = new THREE.MeshBasicMaterial({
    color: 0xc8f6ff,
    toneMapped: false,
    fog: true,
    transparent: true,
    opacity: 0.75,
  });
  const geo = new THREE.BoxGeometry(2.2, 0.38, 0.52);
  const winGeo = new THREE.BoxGeometry(1.5, 0.11, 0.54);
  for (let i = 0; i < cars; i++) {
    const x = (i - (cars - 1) * 0.5) * 2.3;
    const car = new THREE.Mesh(geo, body);
    car.position.x = x;
    g.add(car);
    const w = new THREE.Mesh(winGeo, win);
    w.position.set(x, 0.05, 0);
    g.add(w);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.32), lamp);
  head.position.set((cars - 1) * 1.15 + 1.25, 0.02, 0);
  g.add(head);
  return g;
}

async function loadAdTextures(): Promise<THREE.Texture[]> {
  const loader = new THREE.TextureLoader();
  const out: THREE.Texture[] = [];
  for (let i = 0; i < 11; i++) {
    try {
      const t = await loader.loadAsync(
        `./arenas/grid-void/screens/screen-${String(i).padStart(2, '0')}.png`
      );
      t.colorSpace = THREE.SRGBColorSpace;
      out.push(t);
    } catch {
      /* skip */
    }
  }
  return out;
}

function place(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  idx: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  pitch = 0,
  roll = 0
): number {
  if (idx >= mesh.count) return idx;
  dummy.position.set(x, y, z);
  dummy.rotation.set(pitch, yaw, roll);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(idx, dummy.matrix);
  return idx + 1;
}

export async function addMegacityStreets(root: THREE.Group): Promise<void> {
  let life = root.getObjectByName('CityLife') as THREE.Group | undefined;
  if (!life) {
    life = new THREE.Group();
    life.name = 'CityLife';
    root.add(life);
  }

  const towers = towerFootprints();
  const dummy = new THREE.Object3D();
  const lowTex = paintLowRise(64, 96);
  const ruinTex = paintRuin(48, 64);
  const ads = await loadAdTextures();

  const lowMat = new THREE.MeshBasicMaterial({
    map: lowTex,
    toneMapped: false,
    fog: true,
    color: 0xc8d0dc,
  });
  const ruinMat = new THREE.MeshBasicMaterial({ map: ruinTex, toneMapped: false, fog: true });
  const rubbleMat = new THREE.MeshBasicMaterial({ color: 0x2c241c, toneMapped: false, fog: true });
  const wreckMat = new THREE.MeshBasicMaterial({ color: 0x1a1210, toneMapped: false, fog: true });
  const lampMat = neonMat(0x88f4ff, 0.9);
  const lampPostMat = asphaltMat(0x151820);
  const droneCyan = neonMat(0x44e8ff, 0.95);
  const droneMag = neonMat(0xff4ab8, 0.9);
  const carMat = asphaltMat(0x2a3340);
  const carGlow = neonMat(0xffeeaa, 1);
  const spikeMat = new THREE.MeshBasicMaterial({ color: 0x3a3228, toneMapped: false, fog: true });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const planeGeo = new THREE.PlaneGeometry(1, 1);

  const LOW_MAX = 220;
  const RUIN_MAX = 70;
  const RUBBLE_MAX = 110;
  const LAMP_MAX = 110;
  const POST_MAX = 110;
  const PILLAR_MAX = 80;
  const AD_MAX = 40;
  const DRONE_N = 56;
  const CAR_N = 48;
  const WRECK_MAX = 36;
  const SPIKE_MAX = 28;

  const lowMesh = new THREE.InstancedMesh(boxGeo, lowMat, LOW_MAX);
  const ruinMesh = new THREE.InstancedMesh(boxGeo, ruinMat, RUIN_MAX);
  const rubbleMesh = new THREE.InstancedMesh(boxGeo, rubbleMat, RUBBLE_MAX);
  const wreckMesh = new THREE.InstancedMesh(boxGeo, wreckMat, WRECK_MAX);
  const spikeMesh = new THREE.InstancedMesh(boxGeo, spikeMat, SPIKE_MAX);
  const lampMesh = new THREE.InstancedMesh(boxGeo, lampMat, LAMP_MAX);
  const postMesh = new THREE.InstancedMesh(boxGeo, lampPostMat, POST_MAX);
  const pillarMesh = new THREE.InstancedMesh(boxGeo, asphaltMat(0x1a2228), PILLAR_MAX);
  const droneMeshA = new THREE.InstancedMesh(boxGeo, droneCyan, DRONE_N);
  const droneMeshB = new THREE.InstancedMesh(boxGeo, droneMag, DRONE_N);
  const carMesh = new THREE.InstancedMesh(boxGeo, carMat, CAR_N);
  const carLite = new THREE.InstancedMesh(boxGeo, carGlow, CAR_N);

  lowMesh.name = 'StreetLowRise';
  ruinMesh.name = 'StreetRuins';
  rubbleMesh.name = 'StreetRubble';
  wreckMesh.name = 'StreetWrecks';
  spikeMesh.name = 'BlastSpikes';
  lampMesh.name = 'StreetLamps';
  postMesh.name = 'StreetPosts';
  pillarMesh.name = 'HighwayPillars';
  droneMeshA.name = 'CanyonDronesA';
  droneMeshB.name = 'CanyonDronesB';
  carMesh.name = 'HighwayCars';
  carLite.name = 'HighwayCarLites';

  let lowN = 0;
  let ruinN = 0;
  let rubbleN = 0;
  let wreckN = 0;
  let spikeN = 0;
  let lampN = 0;
  let postN = 0;
  let pillarN = 0;

  // Low-rises + mid fillers packed between towers (lived-in canyon).
  for (let ring = 0; ring < 14; ring++) {
    const r = 22 + ring * 4.15;
    const segs = Math.max(10, Math.floor((Math.PI * 2 * r) / 4.6));
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2 + hash(ring * 17 + i, 5) * 0.2;
      const rr = r + (hash(i, ring + 3) - 0.5) * 1.6;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const yaw = a + Math.PI / 2 + (hash(i, 8) - 0.5) * 0.4;
      const footprint = 1.5 + hash(i, 6) * 1.8;
      if (!clearOfTowers(x, z, footprint * 0.55, towers)) continue;

      if (rr < 29) {
        const h = 1.1 + hash(i, 9) * 3.4;
        const tilt = (hash(i, 12) - 0.5) * 0.45;
        ruinN = place(dummy, ruinMesh, ruinN, x, h * 0.5, z, footprint, h, footprint * 0.85, yaw, 0, tilt);
        if (hash(i, 14) > 0.55) {
          ruinN = place(
            dummy,
            ruinMesh,
            ruinN,
            x + Math.cos(yaw) * 0.4,
            h * 0.25,
            z + Math.sin(yaw) * 0.4,
            footprint * 0.55,
            h * 0.4,
            footprint * 0.5,
            yaw,
            0.2,
            -tilt
          );
        }
      } else {
        const h = 2.4 + hash(i, 9) * (rr > 50 ? 10 : 6.5);
        lowN = place(dummy, lowMesh, lowN, x, h * 0.5, z, footprint, h, footprint * 0.9, yaw);
        if (hash(i, 11) > 0.62 && lowN < LOW_MAX) {
          const h2 = h * (0.45 + hash(i, 13) * 0.3);
          lowN = place(
            dummy,
            lowMesh,
            lowN,
            x + Math.cos(yaw) * footprint * 0.28,
            h + h2 * 0.5,
            z + Math.sin(yaw) * footprint * 0.28,
            footprint * 0.62,
            h2,
            footprint * 0.55,
            yaw
          );
        }
      }
    }
  }

  // Blast rubble ring + inner wrecks + rebar spikes.
  for (let i = 0; i < RUBBLE_MAX; i++) {
    const a = (i / RUBBLE_MAX) * Math.PI * 2 + hash(i, 21) * 0.4;
    const r = 16.5 + hash(i, 22) * 8.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.5 + hash(i, 23) * 1.8;
    rubbleN = place(
      dummy,
      rubbleMesh,
      rubbleN,
      x,
      s * 0.28,
      z,
      s,
      s * (0.3 + hash(i, 24) * 0.7),
      s * 0.7,
      a,
      (hash(i, 25) - 0.5) * 0.6,
      (hash(i, 26) - 0.5) * 0.5
    );
  }
  for (let i = 0; i < WRECK_MAX; i++) {
    const a = hash(i, 31) * Math.PI * 2;
    const r = 4 + hash(i, 32) * 16;
    wreckN = place(
      dummy,
      wreckMesh,
      wreckN,
      Math.cos(a) * r,
      0.22,
      Math.sin(a) * r,
      0.9 + hash(i, 33) * 1.4,
      0.18 + hash(i, 34) * 0.28,
      0.4 + hash(i, 35) * 0.5,
      a + 0.7,
      (hash(i, 36) - 0.5) * 0.8,
      (hash(i, 37) - 0.5) * 1.2
    );
  }
  for (let i = 0; i < SPIKE_MAX; i++) {
    const a = (i / SPIKE_MAX) * Math.PI * 2 + hash(i, 41) * 0.3;
    const r = 5 + hash(i, 42) * 13;
    const h = 1.4 + hash(i, 43) * 3.2;
    spikeN = place(
      dummy,
      spikeMesh,
      spikeN,
      Math.cos(a) * r,
      h * 0.45,
      Math.sin(a) * r,
      0.12 + hash(i, 44) * 0.12,
      h,
      0.12,
      a,
      0.35 + hash(i, 45) * 0.5,
      0
    );
  }

  // Street lamps along ring roads.
  const lampRings = [32, 40, 48, 56, 64, 74];
  for (const r of lampRings) {
    const n = Math.max(8, Math.floor((Math.PI * 2 * r) / 14));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.07;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!clearOfTowers(x, z, 0.6, towers)) continue;
      postN = place(dummy, postMesh, postN, x, 1.15, z, 0.08, 2.3, 0.08, a);
      lampN = place(dummy, lampMesh, lampN, x, 2.35, z, 0.16, 0.14, 0.16, a);
    }
  }

  // Elevated highways (tileset: cyan-edged decks weaving between towers).
  const asphalt = asphaltMat(0x1c2430);
  const edgeCyan = neonMat(0x3ce8ff, 0.7);
  const hw1 = weaveCurve(44, 9.5, 5.7, 0.85, 0.2, 18);
  const hw2 = weaveCurve(56, 8.2, 8.15, 0.7, 1.1, 18);
  const hwShape = makeHighwayShape(1.2, 0.08);
  const edgeShape = makeHighwayShape(1.32, 0.03);
  const hwGeos = [hw1, hw2].map((curve) => {
    const deck = new THREE.ExtrudeGeometry(hwShape, {
      extrudePath: curve,
      steps: 90,
      bevelEnabled: false,
    });
    const edge = new THREE.ExtrudeGeometry(edgeShape, {
      extrudePath: curve,
      steps: 90,
      bevelEnabled: false,
    });
    return { deck, edge, curve };
  });
  hwGeos.forEach((g, i) => {
    const deck = new THREE.Mesh(g.deck, asphalt);
    deck.name = `HighwayDeck_${i}`;
    const edge = new THREE.Mesh(g.edge, edgeCyan);
    edge.name = `HighwayEdge_${i}`;
    life!.add(deck);
    life!.add(edge);
  });

  // Circular inner highway — sheared by the blast, leftover arcs.
  const brokenMat = asphaltMat(0x242018);
  const brokenEdge = neonMat(0xff5aa0, 0.45);
  for (let i = 0; i < 6; i++) {
    const start = i * 1.05 + hash(i, 50) * 0.15;
    const len = 0.42 + hash(i, 51) * 0.22;
    const geo = new THREE.RingGeometry(23.2, 25.6, 20, 1, start, len);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, i < 3 ? brokenMat : asphalt);
    m.position.y = i % 2 === 0 ? 2.4 : 0.42;
    if (i % 2 === 0) {
      m.rotation.z = (hash(i, 52) - 0.5) * 0.35;
      m.rotation.x += (hash(i, 53) - 0.5) * 0.2;
    }
    m.name = `BrokenHighway_${i}`;
    life.add(m);
    const e = new THREE.Mesh(
      new THREE.RingGeometry(25.5, 25.85, 20, 1, start, len).rotateX(-Math.PI / 2),
      brokenEdge
    );
    e.position.copy(m.position);
    e.rotation.copy(m.rotation);
    e.position.y += 0.04;
    life.add(e);
  }

  // Outer circular elevated ring (intact).
  const ringDeck = new THREE.Mesh(
    new THREE.RingGeometry(35.1, 37.5, 80, 1).rotateX(-Math.PI / 2),
    asphalt
  );
  ringDeck.position.y = 4.15;
  ringDeck.name = 'HighwayRingDeck';
  life.add(ringDeck);
  const ringEdge = new THREE.Mesh(
    new THREE.RingGeometry(37.45, 37.75, 80, 1).rotateX(-Math.PI / 2),
    edgeCyan
  );
  ringEdge.position.y = 4.2;
  ringEdge.name = 'HighwayRingEdge';
  life.add(ringEdge);

  // Pillars under the circular ring + weave samples.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 36.3;
    const z = Math.sin(a) * 36.3;
    pillarN = place(dummy, pillarMesh, pillarN, x, 2.05, z, 0.28, 4.1, 0.28, a);
  }
  for (let i = 0; i < 20; i++) {
    const u = i / 20;
    const p = hw1.getPointAt(u);
    pillarN = place(dummy, pillarMesh, pillarN, p.x, p.y * 0.5, p.z, 0.22, Math.max(0.4, p.y), 0.22, 0);
  }
  for (let i = 0; i < 18; i++) {
    const u = i / 18;
    const p = hw2.getPointAt(u);
    pillarN = place(dummy, pillarMesh, pillarN, p.x, p.y * 0.5, p.z, 0.22, Math.max(0.4, p.y), 0.22, 0);
  }

  // Floating advertisements (vertical screens + a few overhead banners).
  const adMeshes = ads.length
    ? ads.map((tex, i) => {
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          toneMapped: false,
          fog: true,
          transparent: true,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.InstancedMesh(planeGeo, mat, Math.ceil(AD_MAX / ads.length) + 2);
        mesh.name = `FloatAd_${i}`;
        life!.add(mesh);
        return mesh;
      })
    : [];
  const adCounts = adMeshes.map(() => 0);
  const adN = Math.min(AD_MAX, 36);
  for (let i = 0; i < adN; i++) {
    if (adMeshes.length === 0) break;
    const a = (i / adN) * Math.PI * 2 + hash(i, 61) * 0.4;
    const r = 30 + hash(i, 62) * 34;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 6.5 + hash(i, 63) * 14;
    const yaw = a + Math.PI / 2 + (hash(i, 64) - 0.5) * 0.5;
    const bucket = i % adMeshes.length;
    const mesh = adMeshes[bucket];
    const idx = adCounts[bucket];
    if (idx >= mesh.count) continue;
    const banner = hash(i, 65) > 0.78;
    dummy.position.set(x, y, z);
    dummy.rotation.set(banner ? -0.55 : 0, yaw, 0);
    dummy.scale.set(banner ? 3.2 + hash(i, 66) * 2 : 1.6 + hash(i, 66), banner ? 1.1 : 2.4 + hash(i, 67) * 1.8, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    adCounts[bucket] = idx + 1;
  }
  adMeshes.forEach((m, i) => {
    m.count = adCounts[i];
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = true;
  });

  // Portal residual — stays near the ground so it doesn't hide the cube.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.2, 'rgba(255,80,210,0.45)');
    grd.addColorStop(0.55, 'rgba(120,30,255,0.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  })();
  const portalGlow = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 32),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: true,
      blending: THREE.AdditiveBlending,
    })
  );
  portalGlow.rotation.x = -Math.PI / 2;
  portalGlow.position.y = 0.55;
  portalGlow.name = 'PortalScar';
  life.add(portalGlow);

  // Extra metro on the weaving highway (tileset trains).
  const metroA = makeMetro(5, 0x9aa8b8);
  const metroB = makeMetro(4, 0x88c8e0);
  life.add(metroA);
  life.add(metroB);

  const drones: Array<{ r: number; y: number; speed: number; phase: number; mag: boolean }> = [];
  for (let i = 0; i < DRONE_N; i++) {
    drones.push({
      r: 28 + hash(i, 71) * 40,
      y: 3.2 + hash(i, 72) * 16,
      speed: 0.12 + hash(i, 73) * 0.28,
      phase: hash(i, 74) * Math.PI * 2,
      mag: hash(i, 75) > 0.5,
    });
  }
  const cars: Array<{ u: number; speed: number; lane: 0 | 1 | 2; offset: number }> = [];
  for (let i = 0; i < CAR_N; i++) {
    cars.push({
      u: hash(i, 81),
      speed: 0.018 + hash(i, 82) * 0.03,
      lane: (i % 3) as 0 | 1 | 2,
      offset: (hash(i, 83) - 0.5) * 1.4,
    });
  }

  const meshes = [
    lowMesh,
    ruinMesh,
    rubbleMesh,
    wreckMesh,
    spikeMesh,
    lampMesh,
    postMesh,
    pillarMesh,
    droneMeshA,
    droneMeshB,
    carMesh,
    carLite,
  ];
  lowMesh.count = lowN;
  ruinMesh.count = ruinN;
  rubbleMesh.count = rubbleN;
  wreckMesh.count = wreckN;
  spikeMesh.count = spikeN;
  lampMesh.count = lampN;
  postMesh.count = postN;
  pillarMesh.count = pillarN;
  droneMeshA.count = 0;
  droneMeshB.count = 0;
  carMesh.count = 0;
  carLite.count = 0;
  for (const m of meshes) {
    m.frustumCulled = true;
    m.instanceMatrix.needsUpdate = true;
    life.add(m);
  }

  let acc = 0;
  const prev = root.userData.tick as ((t: number, dt: number) => void) | undefined;
  root.userData.tick = (t: number, dt: number) => {
    prev?.(t, dt);
    const pulse = 0.65 + Math.sin(t * 1.6) * 0.25;
    portalGlow.scale.setScalar(pulse);
    (portalGlow.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2.1) * 0.2;

    acc += dt;
    if (acc < 0.09) return;
    acc = 0;

    const pa = (t * 0.055) % 1;
    const pb = (1 - t * 0.042) % 1;
    const p1 = hw1.getPointAt((pa + 1) % 1);
    const t1 = hw1.getTangentAt((pa + 1) % 1);
    metroA.position.copy(p1);
    metroA.position.y += 0.42;
    metroA.lookAt(p1.x + t1.x, p1.y + t1.y, p1.z + t1.z);
    const p2 = hw2.getPointAt((pb + 1) % 1);
    const t2 = hw2.getTangentAt((pb + 1) % 1);
    metroB.position.copy(p2);
    metroB.position.y += 0.42;
    metroB.lookAt(p2.x + t2.x, p2.y + t2.y, p2.z + t2.z);

    let da = 0;
    let db = 0;
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const a = t * d.speed + d.phase;
      const x = Math.cos(a) * d.r;
      const z = Math.sin(a) * d.r;
      const y = d.y + Math.sin(t * 1.3 + d.phase) * 0.35;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, a + Math.PI / 2, 0);
      dummy.scale.set(0.38, 0.07, 0.38);
      dummy.updateMatrix();
      if (d.mag) droneMeshB.setMatrixAt(db++, dummy.matrix);
      else droneMeshA.setMatrixAt(da++, dummy.matrix);
    }
    droneMeshA.count = da;
    droneMeshB.count = db;
    droneMeshA.instanceMatrix.needsUpdate = true;
    droneMeshB.instanceMatrix.needsUpdate = true;

    const curves = [hw1, hw2, null] as const;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.u = (c.u + c.speed * 0.09) % 1;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.85, 0.22, 0.42);
      if (c.lane === 2) {
        const a = c.u * Math.PI * 2;
        dummy.position.set(Math.cos(a) * 36.3, 4.38, Math.sin(a) * 36.3);
        dummy.rotation.y = -a + Math.PI / 2;
      } else {
        const curve = curves[c.lane]!;
        const p = curve.getPointAt(c.u);
        const tan = curve.getTangentAt(c.u);
        dummy.position.set(p.x, p.y + 0.22, p.z);
        dummy.lookAt(p.x + tan.x, p.y + tan.y, p.z + tan.z);
      }
      dummy.updateMatrix();
      carMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.02;
      dummy.scale.set(0.2, 0.08, 0.16);
      dummy.updateMatrix();
      carLite.setMatrixAt(i, dummy.matrix);
    }
    carMesh.count = cars.length;
    carLite.count = cars.length;
    carMesh.instanceMatrix.needsUpdate = true;
    carLite.instanceMatrix.needsUpdate = true;
  };

  // Seed moving instances off the origin before the first frame.
  (root.userData.tick as (t: number, dt: number) => void)(0, 1);
}
