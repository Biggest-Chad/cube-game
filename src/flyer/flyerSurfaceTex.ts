/**
 * WAVE14 procedural surface maps - metal panels, emissive neon strips, roughness.
 * Canvas textures (no art pack). Cached per key.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  return { c, ctx };
}

function toTex(c: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Steel panel albedo: riveted plates + seam grid + subtle wear. */
export function metalPanelMap(seed = 1, neonHex = 0x44f0ff): THREE.CanvasTexture {
  const key = `metal:${seed}:${neonHex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const packed = canvas(256);
  if (!packed) {
    const stub = new THREE.DataTexture(new Uint8Array([90, 100, 110, 255]), 1, 1);
    stub.needsUpdate = true;
    return stub as unknown as THREE.CanvasTexture;
  }
  const { c, ctx } = packed;
  const nr = (neonHex >> 16) & 0xff;
  const ng = (neonHex >> 8) & 0xff;
  const nb = neonHex & 0xff;
  ctx.fillStyle = `rgb(${70 + (seed % 20)},${78 + (seed % 18)},${88 + (seed % 22)})`;
  ctx.fillRect(0, 0, 256, 256);
  const cols = 4 + (seed % 3);
  const rows = 4 + ((seed + 1) % 3);
  const cw = 256 / cols;
  const rh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const shade = 55 + ((x * 17 + y * 29 + seed * 13) % 40);
      ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
      ctx.fillRect(x * cw + 2, y * rh + 2, cw - 4, rh - 4);
      ctx.fillStyle = 'rgb(160,170,180)';
      for (let r = 0; r < 4; r++) {
        const rx = x * cw + 8 + (r % 2) * (cw - 16);
        const ry = y * rh + 8 + Math.floor(r / 2) * (rh - 16);
        ctx.beginPath();
        ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if ((x + y + seed) % 5 === 0) {
        ctx.fillStyle = `rgba(${nr},${ng},${nb},0.18)`;
        ctx.fillRect(x * cw + 6, y * rh + rh * 0.35, cw - 12, 3);
      }
    }
  }
  ctx.strokeStyle = 'rgba(20,24,30,0.85)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cw, 0);
    ctx.lineTo(x * cw, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * rh);
    ctx.lineTo(256, y * rh);
    ctx.stroke();
  }
  // REF graphite vents / drain slots / grime
  ctx.fillStyle = 'rgba(8,10,12,0.75)';
  for (let v = 0; v < 6; v++) {
    const vx = 24 + v * 40;
    ctx.fillRect(vx, 40, 14, 4);
    ctx.fillRect(vx, 200, 14, 4);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let g = 0; g < 70; g++) {
    ctx.fillRect((g * 47) % 256, (g * 31) % 256, 3 + (g % 4), 2 + (g % 2));
  }
  ctx.fillStyle = `rgba(${nr},${ng},${nb},0.55)`;
  ctx.fillRect(0, 118, 256, 5);
  ctx.fillRect(122, 0, 4, 256);
  const tex = toTex(c, 2.5, 2.5);
  cache.set(key, tex);
  return tex;
}

/** Emissive-only strip map (additive neon windows / trim). */
export function emissiveStripMap(neonHex = 0xff3aa8): THREE.CanvasTexture {
  const key = `emis:${neonHex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const packed = canvas(128);
  if (!packed) {
    const stub = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    stub.needsUpdate = true;
    return stub as unknown as THREE.CanvasTexture;
  }
  const { c, ctx } = packed;
  const nr = (neonHex >> 16) & 0xff;
  const ng = (neonHex >> 8) & 0xff;
  const nb = neonHex & 0xff;
  ctx.fillStyle = 'rgb(0,0,0)';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = 8 + row * 14;
    ctx.fillStyle = `rgb(${nr},${ng},${nb})`;
    ctx.fillRect(6, y, 116, 3);
    for (let col = 0; col < 6; col++) {
      if ((row + col) % 3 === 0) continue;
      ctx.fillStyle = `rgba(${nr},${ng},${nb},0.7)`;
      ctx.fillRect(10 + col * 18, y + 4, 10, 6);
    }
  }
  const tex = toTex(c, 1.5, 3);
  cache.set(key, tex);
  return tex;
}

/** Deck plate with chevron hazard / lane paint. */
export function deckPlateMap(accentHex = 0x44f0ff): THREE.CanvasTexture {
  const key = `deck:${accentHex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const packed = canvas(256);
  if (!packed) {
    const stub = new THREE.DataTexture(new Uint8Array([50, 55, 60, 255]), 1, 1);
    stub.needsUpdate = true;
    return stub as unknown as THREE.CanvasTexture;
  }
  const { c, ctx } = packed;
  const ar = (accentHex >> 16) & 0xff;
  const ag = (accentHex >> 8) & 0xff;
  const ab = accentHex & 0xff;
  // WAVE15_LARGE_SEAM: huge high-contrast plates readable at chase distance
  ctx.fillStyle = 'rgb(14,16,20)'
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    ctx.fillStyle = y % 2 === 0 ? 'rgb(42,46,52)' : 'rgb(28,30,34)';
    ctx.fillRect(0, y * 64, 256, 58);
    ctx.strokeStyle = 'rgba(8,10,12,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, y * 64 + 1, 254, 56);
    // bevel highlight
    ctx.strokeStyle = 'rgba(160,170,180,0.35)';
    ctx.beginPath();
    ctx.moveTo(2, y * 64 + 2);
    ctx.lineTo(254, y * 64 + 2);
    ctx.stroke();
    // drain slot
    ctx.fillStyle = 'rgba(6,8,10,0.8)';
    ctx.fillRect(18, y * 64 + 22, 40, 6);
    ctx.fillRect(198, y * 64 + 22, 40, 6);
  }
  ctx.fillStyle = `rgba(${ar},${ag},${ab},0.65)`;
  ctx.fillRect(118, 0, 6, 256);
  ctx.fillRect(132, 0, 6, 256);
  ctx.fillStyle = `rgba(${ar},${ag},${ab},0.35)`;
  for (let i = 0; i < 6; i++) {
    const y = 20 + i * 40;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(70, y + 12);
    ctx.lineTo(40, y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(216, y);
    ctx.lineTo(186, y + 12);
    ctx.lineTo(216, y + 24);
    ctx.closePath();
    ctx.fill();
  }
  const tex = toTex(c, 1.25, 0.7);
  cache.set(key, tex);
  return tex;
}

/** Ice/neon rift wall albedo. */
export function iceNeonMap(neonHex = 0x9ef2ff): THREE.CanvasTexture {
  const key = `ice:${neonHex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const packed = canvas(256);
  if (!packed) {
    const stub = new THREE.DataTexture(new Uint8Array([40, 70, 80, 255]), 1, 1);
    stub.needsUpdate = true;
    return stub as unknown as THREE.CanvasTexture;
  }
  const { c, ctx } = packed;
  const nr = (neonHex >> 16) & 0xff;
  const ng = (neonHex >> 8) & 0xff;
  const nb = neonHex & 0xff;
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgb(30,55,70)');
  g.addColorStop(0.5, 'rgb(50,80,95)');
  g.addColorStop(1, 'rgb(25,45,60)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(${nr},${ng},${nb},${0.15 + (i % 4) * 0.08})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(i * 14, 0);
    ctx.lineTo(i * 14 + 40, 256);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(${nr},${ng},${nb},0.45)`;
  ctx.fillRect(0, 90, 256, 4);
  ctx.fillRect(0, 160, 256, 3);
  const tex = toTex(c, 2, 3);
  cache.set(key, tex);
  return tex;
}

export function texturedPhong(
  color: number,
  quality: 'low' | 'medium' | 'high',
  kind: 'wall' | 'deck' | 'ice' | 'prop',
  neonHex: number
): THREE.MeshPhongMaterial {
  const map =
    kind === 'deck' ? deckPlateMap(neonHex) :
    kind === 'ice' ? iceNeonMap(neonHex) :
    metalPanelMap(kind === 'prop' ? 3 : 1, neonHex);
  // WAVE16: no emissiveStrip window-grid on walls
  const emisMap = null;
  const tint = kind === 'deck' ? 0xffffff : kind === 'ice' ? 0xd8eef8 : 0xe8eef4;
  return new THREE.MeshPhongMaterial({
    color: tint,
    map,
    emissiveMap: emisMap ?? undefined,
    emissive: new THREE.Color(neonHex).multiplyScalar(kind === 'deck' ? 0.04 : kind === 'wall' ? 0.04 : 0.12),
    emissiveIntensity: 1,
    shininess: quality === 'high' ? (kind === 'deck' ? 36 : 68) : (kind === 'deck' ? 22 : 48),
    specular: new THREE.Color(kind === 'deck' ? 0x606870 : 0xb0c0d0),
    toneMapped: false,
    fog: true,
    depthWrite: true,
    flatShading: false,
  });
}
