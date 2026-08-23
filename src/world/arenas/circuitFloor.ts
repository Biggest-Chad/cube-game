/**
 * Arena ground: lived-in night city streets with a portal-blast crater
 * under the cube. One unique (non-tiled) canvas so the epicentre reads
 * from orbit. MeshBasic only — no custom shaders on Android WebView.
 */
import * as THREE from 'three';

const WORLD_R = 92;

function n2(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function paintCityGround(size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const px = (worldR: number) => (worldR / WORLD_R) * (size / 2);

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, size, size);

  // ── City blocks (lots between streets) ──────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  for (let ring = 4; ring <= 18; ring++) {
    const r0 = px(ring * 4.6);
    const r1 = px(ring * 4.6 + 3.2);
    const segs = Math.max(8, Math.floor(ring * 3.2));
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2 + n2(ring, i) * 0.08;
      const a1 = ((i + 0.72) / segs) * Math.PI * 2;
      const h = n2(i, ring + 9);
      if (h < 0.12) continue;
      ctx.beginPath();
      ctx.arc(0, 0, r1, a0, a1);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      const ruined = r0 < px(28);
      ctx.fillStyle = ruined
        ? `rgb(${28 + h * 18},${22 + h * 10},${16})`
        : `rgb(${10 + h * 8},${14 + h * 10},${20 + h * 14})`;
      ctx.fill();
      if (!ruined && h > 0.35) {
        ctx.save();
        ctx.clip();
        const midR = (r0 + r1) * 0.5;
        const midA = (a0 + a1) * 0.5;
        const bx = Math.cos(midA) * midR;
        const by = Math.sin(midA) * midR;
        ctx.globalAlpha = 0.55;
        for (let k = 0; k < 7; k++) {
          const j = n2(i * 3 + k, ring);
          ctx.fillStyle = j > 0.72 ? '#ffb060' : j > 0.45 ? '#5ad8ff' : '#ff4ab8';
          ctx.fillRect(bx + (j - 0.5) * 10, by + (n2(k, i) - 0.5) * 10, 1.4, 1.4);
        }
        ctx.restore();
      }
    }
  }
  ctx.restore();

  // ── Concentric arterial roads ───────────────────────────────────
  const roads = [32, 40, 48, 56, 64, 74, 84];
  for (const wr of roads) {
    const r = px(wr);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#141c26';
    ctx.lineWidth = px(2.6) * 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(40, 230, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 230, 140, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // ── Radial avenues ──────────────────────────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.04;
    ctx.rotate(a);
    ctx.fillStyle = '#121820';
    const w = i % 4 === 0 ? 7 : 4.5;
    ctx.fillRect(px(26), -w * 0.5, px(66), w);
    ctx.fillStyle = 'rgba(40, 230, 255, 0.16)';
    ctx.fillRect(px(26), -0.6, px(66), 1.2);
    ctx.setTransform(1, 0, 0, 1, cx, cy);
  }
  ctx.restore();

  // Magenta accent radials
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255, 50, 170, 0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * px(30), Math.sin(a) * px(30));
    ctx.lineTo(Math.cos(a) * px(88), Math.sin(a) * px(88));
    ctx.stroke();
  }
  ctx.restore();

  // ── Blast crater (portal / nuclear aftermath) ───────────────────
  const blast = ctx.createRadialGradient(cx, cy, 2, cx, cy, px(26));
  blast.addColorStop(0, 'rgba(255, 210, 255, 0.55)');
  blast.addColorStop(0.06, 'rgba(255, 70, 200, 0.45)');
  blast.addColorStop(0.14, 'rgba(90, 30, 50, 0.7)');
  blast.addColorStop(0.28, 'rgba(28, 18, 12, 0.92)');
  blast.addColorStop(0.48, 'rgba(42, 36, 28, 0.75)');
  blast.addColorStop(0.72, 'rgba(24, 20, 16, 0.35)');
  blast.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = blast;
  ctx.beginPath();
  ctx.arc(cx, cy, px(26), 0, Math.PI * 2);
  ctx.fill();

  // Glassed / vitrified ring
  ctx.beginPath();
  ctx.arc(cx, cy, px(11.5), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(120, 180, 140, 0.35)';
  ctx.lineWidth = px(2.4) * 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, px(11.5), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(80, 230, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Radial scorch streaks
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + n2(i, 4) * 0.2;
    const len = px(8 + n2(i, 7) * 16);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(0.5, 'rgba(40, 22, 12, 0.35)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(px(3), -1.2 - n2(i, 2) * 2, len, 2.2 + n2(i, 3) * 3);
    ctx.setTransform(1, 0, 0, 1, cx, cy);
  }
  ctx.restore();

  // Shockwave rings
  ctx.strokeStyle = 'rgba(255, 80, 180, 0.22)';
  ctx.lineWidth = 2;
  for (const wr of [8, 14, 20, 25]) {
    ctx.beginPath();
    ctx.arc(cx, cy, px(wr), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cracks
  ctx.strokeStyle = 'rgba(8, 6, 4, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + n2(i, 11) * 0.4;
    let x = cx + Math.cos(a) * px(2);
    let y = cy + Math.sin(a) * px(2);
    ctx.moveTo(x, y);
    const steps = 6 + Math.floor(n2(i, 2) * 5);
    for (let s = 0; s < steps; s++) {
      const aa = a + (n2(i, s) - 0.5) * 0.7;
      x += Math.cos(aa) * px(1.4);
      y += Math.sin(aa) * px(1.4);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Ash speckle in blast zone
  for (let i = 0; i < 420; i++) {
    const rr = Math.sqrt(n2(i, 1)) * px(24);
    const a = n2(i, 2) * Math.PI * 2;
    ctx.fillStyle = n2(i, 3) > 0.5 ? 'rgba(70, 62, 52, 0.45)' : 'rgba(20, 16, 12, 0.5)';
    ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1 + n2(i, 4) * 2, 1);
  }

  // Hot portal core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, px(4.2));
  core.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  core.addColorStop(0.25, 'rgba(255, 120, 230, 0.7)');
  core.addColorStop(0.65, 'rgba(140, 40, 255, 0.28)');
  core.addColorStop(1, 'rgba(40, 0, 40, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, px(4.2), 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 2;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function addCircuitFloor(root: THREE.Group): void {
  const mat = new THREE.MeshBasicMaterial({
    map: paintCityGround(1024),
    toneMapped: false,
    fog: true,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(WORLD_R, 64), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.1;
  floor.name = 'CircuitFloor';
  floor.frustumCulled = true;
  floor.matrixAutoUpdate = false;
  floor.updateMatrix();
  root.add(floor);

  // Raised blast rim — reads as a crater lip from orbit.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(20.4, 0.72, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a2218, toneMapped: false, fog: true })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.38;
  rim.name = 'BlastRim';
  rim.matrixAutoUpdate = false;
  rim.updateMatrix();
  root.add(rim);

  const glass = new THREE.Mesh(
    new THREE.RingGeometry(10.2, 13.6, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6a9a78,
      toneMapped: false,
      fog: true,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.16;
  glass.name = 'BlastGlass';
  glass.matrixAutoUpdate = false;
  glass.updateMatrix();
  root.add(glass);
}
