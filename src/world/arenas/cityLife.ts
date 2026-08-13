import * as THREE from 'three';

const METRO = [
  { r: 74, y: 3.95, speed: 0.085, cars: 4, consists: 2, color: 0x66e8ff },
  { r: 96, y: 5.65, speed: -0.062, cars: 3, consists: 2, color: 0xff66cc },
];

const FLOOR_DIM = new Set([
  'SquareGrid',
  'SquareGridMid',
  'SquareGridFar',
  'HexLines',
  'HexPads',
  'Ground',
  'GroundApron',
  'HorizonCore',
  'HorizonGlow',
  'CityStreets',
  'CityLots',
  'DebrisNeon',
]);

function emitMat(color: number, intensity = 1.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x0a1014,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.35,
    roughness: 0.4,
    toneMapped: false,
  });
}

function makeTrain(cars: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = emitMat(color, 0.85);
  const glass = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false, fog: false });
  for (let i = 0; i < cars; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.58, 0.78), body);
    car.position.x = (i - (cars - 1) * 0.5) * 2.2;
    g.add(car);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.8), glass);
    win.position.set(car.position.x, 0.08, 0);
    g.add(win);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), lamp);
  head.position.set((cars - 1) * 1.1 + 1.15, 0.02, 0);
  g.add(head);
  return g;
}

export function addCityLife(root: THREE.Group, quality: 0 | 1 | 2): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!FLOOR_DIM.has(o.name)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !('emissive' in m)) continue;
      const em = m as THREE.MeshStandardMaterial;
      em.emissiveIntensity *= o.name.startsWith('SquareGrid') || o.name === 'HexLines' ? 0.55 : 0.7;
    }
  });

  const fade = new THREE.Mesh(
    new THREE.CircleGeometry(320, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uInner: { value: 80 }, uOuter: { value: 220 } },
      vertexShader: `
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying vec3 vW;
        uniform float uInner;
        uniform float uOuter;
        void main(){
          float d = length(vW.xz);
          float a = smoothstep(uInner, uOuter, d);
          gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.94);
        }`,
    })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.y = 0.09;
  fade.name = 'DistanceFade';
  fade.renderOrder = 2;
  root.add(fade);

  const life = new THREE.Group();
  life.name = 'CityLife';

  const trains: { obj: THREE.Group; r: number; y: number; speed: number; phase: number }[] = [];
  const consistN = quality === 0 ? 1 : 2;
  for (const line of METRO) {
    for (let c = 0; c < consistN; c++) {
      const train = makeTrain(line.cars, line.color);
      life.add(train);
      trains.push({
        obj: train,
        r: line.r,
        y: line.y,
        speed: line.speed,
        phase: (c / consistN) * Math.PI * 2,
      });
    }
  }

  const flyerN = quality === 0 ? 0 : quality === 1 ? 14 : 28;
  const flyers =
    flyerN > 0
      ? new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.16, 0.32), emitMat(0x88f0ff, 0.9), flyerN)
      : null;
  const flyerDummy = new THREE.Object3D();
  const flyerMeta = Array.from({ length: flyerN }, (_, i) => ({
    r: 52 + (i % 9) * 9,
    y: 7 + (i % 7) * 1.35,
    speed: 0.11 + (i % 5) * 0.025,
    phase: (i / Math.max(1, flyerN)) * Math.PI * 2,
    bank: i % 2 === 0 ? 1 : -1,
  }));
  if (flyers) life.add(flyers);

  const carN = quality === 0 ? 0 : quality === 1 ? 22 : 42;
  const cars =
    carN > 0
      ? new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.32), emitMat(0xffc878, 0.7), carN)
      : null;
  const carDummy = new THREE.Object3D();
  const carMeta = Array.from({ length: carN }, (_, i) => ({
    r: [58, 66, 78, 90, 104][i % 5],
    speed: 0.16 + (i % 4) * 0.03,
    phase: (i / Math.max(1, carN)) * Math.PI * 2,
    dir: i % 3 === 0 ? -1 : 1,
  }));
  if (cars) life.add(cars);

  const glitterN = quality === 0 ? 60 : quality === 1 ? 140 : 220;
  const gPos = new Float32Array(glitterN * 3);
  const gCol = new Float32Array(glitterN * 3);
  const gPhase = new Float32Array(glitterN);
  const cTmp = new THREE.Color();
  for (let i = 0; i < glitterN; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 62 + Math.random() * 58;
    gPos[i * 3] = Math.cos(a) * r;
    gPos[i * 3 + 1] = 1.2 + Math.random() * 14;
    gPos[i * 3 + 2] = Math.sin(a) * r;
    cTmp.setHSL(0.48 + Math.random() * 0.22, 0.7, 0.62);
    gCol[i * 3] = cTmp.r;
    gCol[i * 3 + 1] = cTmp.g;
    gCol[i * 3 + 2] = cTmp.b;
    gPhase[i] = Math.random() * Math.PI * 2;
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const glitter = new THREE.Points(
    gGeo,
    new THREE.PointsMaterial({
      size: 0.38,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glitter.name = 'CityGlitter';
  life.add(glitter);

  const windowMats: THREE.MeshStandardMaterial[] = [];
  const wireMats: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !('emissive' in m)) continue;
      const em = m as THREE.MeshStandardMaterial;
      if (o.name.startsWith('Bld_') && o.name.includes('wire') && !wireMats.includes(em)) wireMats.push(em);
      if (o.name.startsWith('Bld_') && !o.name.includes('wire') && !windowMats.includes(em)) windowMats.push(em);
    }
  });
  const winBase = windowMats.map((m) => m.emissiveIntensity);
  const wireBase = wireMats.map((m) => m.emissiveIntensity);

  const prev = root.userData.tick as ((t: number, dt: number) => void) | undefined;
  root.userData.tick = (t: number, dt: number) => {
    prev?.(t, dt);
    for (const tr of trains) {
      const a = t * tr.speed + tr.phase;
      tr.obj.position.set(Math.cos(a) * tr.r, tr.y, Math.sin(a) * tr.r);
      tr.obj.rotation.y = -a + Math.PI / 2;
    }
    if (flyers) {
      for (let i = 0; i < flyerN; i++) {
        const f = flyerMeta[i];
        const a = t * f.speed * f.bank + f.phase;
        flyerDummy.position.set(Math.cos(a) * f.r, f.y + Math.sin(t * 0.7 + f.phase) * 0.35, Math.sin(a) * f.r);
        flyerDummy.rotation.set(0, -a + Math.PI / 2, Math.sin(t + f.phase) * 0.12);
        flyerDummy.updateMatrix();
        flyers.setMatrixAt(i, flyerDummy.matrix);
      }
      flyers.instanceMatrix.needsUpdate = true;
    }
    if (cars) {
      for (let i = 0; i < carN; i++) {
        const c = carMeta[i];
        const a = t * c.speed * c.dir + c.phase;
        carDummy.position.set(Math.cos(a) * c.r, 0.22, Math.sin(a) * c.r);
        carDummy.rotation.y = -a + Math.PI / 2;
        carDummy.updateMatrix();
        cars.setMatrixAt(i, carDummy.matrix);
      }
      cars.instanceMatrix.needsUpdate = true;
    }
    const col = glitter.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < glitterN; i++) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 3.1 + gPhase[i]));
      const flicker = Math.sin(t * 17 + gPhase[i] * 4) > 0.72 ? 0.15 : 1;
      const k = tw * flicker;
      col.setXYZ(i, gCol[i * 3] * k, gCol[i * 3 + 1] * k, gCol[i * 3 + 2] * k);
    }
    col.needsUpdate = true;
    for (let i = 0; i < windowMats.length; i++) {
      const pulse = 0.72 + 0.38 * Math.sin(t * 1.7 + i * 1.3);
      const blink = Math.sin(t * 8.5 + i * 4.2) > 0.93 ? 0.35 : 1;
      windowMats[i].emissiveIntensity = winBase[i] * pulse * blink;
    }
    for (let i = 0; i < wireMats.length; i++) {
      wireMats[i].emissiveIntensity = wireBase[i] * (0.88 + 0.18 * Math.sin(t * 0.9 + i));
    }
  };

  life.visible = quality > 0;
  root.add(life);
}
