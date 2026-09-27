/**
 * Per-scene flyer skies: on-disk equirect JPEG dome + overlay shells/stars/horizon.
 * Bass pulse tints overlay opacity/color only â€” the JPEG dome is never discarded.
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';
import type { GraphicsQuality } from '../data/graphics';

export type FlyerSkyPalette = {
  fog: number;
  accent: number;
  fill: number;
  glow: number;
};

export interface FlyerSkyHandle {
  group: THREE.Group;
  /** Equirect JPEG (placeholder until load). Safe as scene.background. */
  texture: THREE.Texture;
  /** Resolves when the per-scene JPEG is on the dome (or after a miss). */
  ready: Promise<void>;
  applyBass(shipPos: THREE.Vector3, pulse: number, glow: THREE.Color, accent: THREE.Color): void;
}

/** Bump when brand JPGs change so TextureLoader bypasses stale cache. */
const SKY_CACHE_BUST = '20260907w37b';

const SKY_URL: Record<FlyerSceneId, string> = {
  canyon: './flyer/sky/canyon.jpg',
  wormhole: './flyer/sky/wormhole.jpg',
  yard: './flyer/sky/yard.jpg',
  rift: './flyer/sky/rift.jpg',
};

type OverlayPaint = {
  nebulaA: number;
  nebulaB: number;
  /** Bright photographic skies (canyon/yard) keep overlays thin so the JPEG reads. */
  overlayMul: number;
};

const OVERLAY: Record<FlyerSceneId, OverlayPaint> = {
  // WAVE28: thin overlays so JPEG sky dome + horizon band READ (discard void-lean dusk wash)
  canyon: { nebulaA: 0xb08050, nebulaB: 0x5a4830, overlayMul: 0.05 },
  wormhole: { nebulaA: 0xff44dd, nebulaB: 0x7a22ff, overlayMul: 1 },
  yard: { nebulaA: 0x5aa0b8, nebulaB: 0x3a6070, overlayMul: 0.05 },
  rift: { nebulaA: 0x68a0b8, nebulaB: 0x3a6478, overlayMul: 0.02 },
};

const _col = new THREE.Color();
const _col2 = new THREE.Color();

/** WAVE7: crush bright JPG floor/equator so scene.background cannot hero a white plane. */
function darkenEquirectFloor(tex: THREE.Texture, sceneId: FlyerSceneId): THREE.Texture {
  if (sceneId !== 'canyon' && sceneId !== 'yard' && sceneId !== 'rift') return tex;
  const img = tex.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | undefined;
  if (!img || typeof document === 'undefined') return tex;
  const w = ('width' in img ? (img as { width: number }).width : 0) || 0;
  const h = ('height' in img ? (img as { height: number }).height : 0) || 0;
  if (w < 8 || h < 8) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return tex;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // WAVE14 VOID-KILL: crush ONLY deep nadir â€” NEVER darken mid/upper sky (chase horizon must stay bright).
  const floorStart = Math.floor(h * 0.82);
  for (let y = floorStart; y < h; y++) {
    const t = (y - floorStart) / Math.max(1, h - floorStart);
    const mul = 0.22 + (1 - t) * 0.35;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = Math.min(255, px[i] * mul);
      px[i + 1] = Math.min(255, px[i + 1] * mul * 0.95);
      px[i + 2] = Math.min(255, px[i + 2] * mul * 1.1);
    }
  }
  // BOOST upper hemisphere saturation toward brand dusk (cyan/magenta) so mid/upper frame never reads #000.
  const skyEnd = Math.floor(h * 0.55);
  for (let y = 0; y < skyEnd; y++) {
    const t = 1 - y / Math.max(1, skyEnd);
    const boost = 0.92 + t * 0.18; // WAVE37 night
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // WAVE32: warm/steel lift — do NOT push magenta/purple void
      if (sceneId === 'canyon') {
        px[i] = Math.min(255, px[i] * boost * 0.55 + 2);
        px[i + 1] = Math.min(255, px[i + 1] * boost * 0.60 + 3);
        px[i + 2] = Math.min(255, px[i + 2] * boost * 0.85 + 10); // WAVE37b darker canyon night
      } else if (sceneId === 'yard') {
        px[i] = Math.min(255, px[i] * boost * 0.65 + 2);
        px[i + 1] = Math.min(255, px[i + 1] * boost * 0.85 + 8);
        px[i + 2] = Math.min(255, px[i + 2] * boost * 1.05 + 16); // WAVE37 night yard
      } else {
        // rift: steel/cyan dusk, not purple
        px[i] = Math.min(255, px[i] * boost * 0.68 + 3);
        px[i + 1] = Math.min(255, px[i + 1] * boost * 0.82 + 7);
        px[i + 2] = Math.min(255, px[i + 2] * boost * 1.02 + 14); // WAVE37 night rift
      }
    }
  }
  // WAVE28: crush rift teal flat void â†’ dusk steel/magenta industrial sky (readable, not wormhole void)
  if (sceneId === 'rift') {
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(1, h - 1); // 0=zenith, 1=nadir
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        // detect teal/cyan dominance and pull toward dusk steel
        const teal = b > r + 25 && g > r + 10;
        if (teal || t < 0.55) {
          // mix toward dusk steel/magenta (not flat cyan)
          const dr = 28 + (1 - t) * 18;
          const dg = 36 + (1 - t) * 22;
          const db = 55 + (1 - t) * 30; // WAVE37 night steel
          const mix = teal ? 0.72 : 0.45;
          r = Math.min(255, r * (1 - mix) + dr * mix);
          g = Math.min(255, g * (1 - mix) + dg * mix);
          b = Math.min(255, b * (1 - mix) + db * mix);
        }
        // keep upper sky slightly brighter than void-black
        if (t < 0.4) {
          r = Math.min(255, r + 18);
          g = Math.min(255, g + 10);
          b = Math.min(255, b + 14);
        }
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.mapping = THREE.EquirectangularReflectionMapping;
  out.needsUpdate = true;
  tex.dispose();
  return configureEquirect(out);
}

function configureEquirect(tex: THREE.Texture): THREE.Texture {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function placeholderEquirect(): THREE.Texture {
  const data = new Uint8Array([8, 10, 14, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  return configureEquirect(tex);
}

function addMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
  });
}


/** WAVE14: bright brand Color floor so scene.background never shows pure black void. */
export function brandFillColor(sceneId: FlyerSceneId): THREE.Color {
  // WAVE28: sky-matching brand floor (no teal/black void on grounded chase)
  const hex =
    sceneId === 'canyon' ? 0x0c1018 :
    sceneId === 'yard' ? 0x0a141c :
    sceneId === 'rift' ? 0x0c1824 :
    0x1a0828; // wormhole digital void OK
  return new THREE.Color(hex);
}

export function buildFlyerSky(
  sceneId: FlyerSceneId,
  pal: FlyerSkyPalette,
  quality: GraphicsQuality
): FlyerSkyHandle {
  const group = new THREE.Group();
  group.name = 'FlyerSky';
  group.userData.skyLive = true;
  const paint = OVERLAY[sceneId];
  const mul = paint.overlayMul;

  const handle: FlyerSkyHandle = {
    group,
    texture: placeholderEquirect(),
    ready: Promise.resolve(),
    applyBass() {
      /* replaced below */
    },
  };

  const segsW = quality === 'high' ? 32 : quality === 'medium' ? 24 : 16;
  const segsH = quality === 'high' ? 20 : quality === 'medium' ? 16 : 10;
  // WAVE29_OPAQUE_SKY: force opaque equirect dome â€” chase BG never void-primary (wormhole keeps void wash)
  const domeMat = new THREE.MeshBasicMaterial({
    map: handle.texture,
    // Magenta multiply on wormhole only â€” JPEG stays; rogland desert is washed toward void.
    color: sceneId === 'wormhole' ? 0xb090ff : sceneId === 'canyon' ? 0xe8d8e0 : sceneId === 'yard' ? 0xd8e8f0 : sceneId === 'rift' ? 0xd0d4e0 : 0xffffff,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  if (sceneId !== 'wormhole') {
    domeMat.transparent = false;
    domeMat.opacity = 1;
    domeMat.depthWrite = false;
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(280, segsW, segsH), domeMat);

  dome.name = 'FlyerSkyDome';
  dome.scale.x = -1;
  if (sceneId === 'wormhole') dome.rotation.x = 0.42;
  dome.frustumCulled = false;
  dome.renderOrder = -12;
  group.add(dome);

  handle.ready = (async () => {
    try {
      THREE.Cache.clear();
      const skyUrl = `${SKY_URL[sceneId]}?v=${SKY_CACHE_BUST}`;
      const loaded = await new THREE.TextureLoader().loadAsync(skyUrl);
      if (!group.userData.skyLive) {
        loaded.dispose();
        return;
      }
      let readyTex = configureEquirect(loaded);
      readyTex = darkenEquirectFloor(readyTex, sceneId);
      const prev = handle.texture;
      handle.texture = readyTex;
      domeMat.map = readyTex;
      domeMat.needsUpdate = true;
      if (prev && prev !== loaded) prev.dispose();
    } catch (err) {
      console.warn('[flyer-sky] HDRI miss', `${SKY_URL[sceneId]}?v=${SKY_CACHE_BUST}`, err);
    }
  })();

  const shellSeg = quality === 'low' ? 8 : 10;
  const shells: THREE.Mesh[] = [];
  // WAVE40 T-W39-02/03: nebula shells only for wormhole — grounded canyon/yard/rift must not show void sphere trash
  const shellSpecs: Array<[number, number, number]> = sceneId === 'wormhole' ? [
    [paint.nebulaA, 0.88, 0.38 * mul],
    [paint.nebulaB, 0.72, 0.28 * mul],
  ] : [];
  if (sceneId === 'wormhole' && quality !== 'low') {
    shellSpecs.push([pal.glow, 0.58, 0.16 * mul]);
  }
  for (const [col, scale, op] of shellSpecs) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(118 * scale, shellSeg, Math.max(6, shellSeg - 2)),
      addMat(col, op)
    );
    shell.name = 'FlyerSkyNebula';
    shell.frustumCulled = false;
    shell.renderOrder = -11;
    shells.push(shell);
    group.add(shell);
  }

  if (sceneId === 'wormhole') {
    const wash = new THREE.Mesh(
      new THREE.SphereGeometry(119.2, shellSeg, Math.max(6, shellSeg - 2)),
      new THREE.MeshBasicMaterial({
        color: 0x2a0840,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    wash.name = 'FlyerWormholeWash';
    wash.frustumCulled = false;
    wash.renderOrder = -11.2;
    group.add(wash);
  }

  const bass = new THREE.Mesh(
    new THREE.SphereGeometry(92, 12, 8),
    addMat(sceneId === 'wormhole' ? 0xff33cc : pal.glow, (sceneId === 'wormhole' ? 0.12 : 0.05) * mul)
  );
  bass.name = 'FlyerBassSky';
  bass.frustumCulled = false;
  bass.renderOrder = -10;
  // WAVE40: hide bass void-orb on grounded scenes (reads as hollow sphere / float trash)
  bass.visible = sceneId === 'wormhole';
  group.add(bass);

  const overlayLines: THREE.Material[] = [];

  if (sceneId === 'wormhole' || sceneId === 'canyon' || sceneId === 'yard') {
    // WAVE7: dark industrial ground veil â€” kill white/yellow scanline floor hero.
    // WAVE9: opaque veil covers more lower hemisphere (kill pale floor / lower pale band).
    // WAVE14: veil only wormhole; canyon/yard use soft tint (opaque black veil voided chase).
    const veilCol = sceneId === 'wormhole' ? 0x14051f : sceneId === 'yard' ? 0x1a2830 : 0x1a1828;
    const veilOp = sceneId === 'wormhole' ? 0.92 : 0.12;
    const veil = new THREE.Mesh(
      new THREE.SphereGeometry(270, 24, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
      new THREE.MeshBasicMaterial({
        color: veilCol,
        side: THREE.BackSide,
        transparent: true,
        opacity: veilOp,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    veil.name = sceneId === 'wormhole' ? 'FlyerWormholeGroundVeil' : 'FlyerGroundVeil';
    veil.frustumCulled = false;
    veil.renderOrder = -11.5;
    group.add(veil);
    if (sceneId === 'canyon' || sceneId === 'yard') {
      const eq = new THREE.Mesh(
        new THREE.SphereGeometry(118.5, 24, 10, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.28),
        new THREE.MeshBasicMaterial({
          color: sceneId === 'yard' ? 0x050403 : 0x030810,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        })
      );
      // WAVE28: skip opaque equator shade â€” was voiding chase sky
      eq.name = 'FlyerEquatorShade';
      eq.visible = false;
      eq.frustumCulled = false;
      eq.renderOrder = -11.4;
      group.add(eq);
    }

    // WAVE7: heavier equator soft veil + industrial fog band (floor not the establish hero).
    const soft = new THREE.Mesh(
      new THREE.SphereGeometry(118, 20, 12, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.48),
      new THREE.MeshBasicMaterial({
        color: sceneId === 'yard' ? 0x050403 : 0x030810,
        side: THREE.BackSide,
        transparent: true,
        // WAVE13 COHERENCE: soft veil must NOT hide horizon neon city / industrial dusk.
        opacity: sceneId === 'wormhole' ? 0.18 : 0.06,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    soft.name = 'FlyerGroundVeilSoft';
    soft.frustumCulled = false;
    soft.renderOrder = -11.2;
    group.add(soft);

    // Extra near-floor fog disk so sky-establish frames read corridor not glowing plane.
    // WAVE14_SKIP_BLACK_FOGDISK: black fog disks voided chase mid/upper frame â€” removed.
    if (false && (sceneId === 'canyon' || sceneId === 'yard')) { /* removed black fog disks */ }

    // WAVE41: nebula cards wormhole-only — grounded chase must not show floating cyan/purple void trash
    if (sceneId === 'wormhole') {
      const nebGeo = new THREE.PlaneGeometry(52, 30);
      const nNeb = quality === 'low' ? 2 : 3;
      for (let i = 0; i < nNeb; i++) {
        const mat = addMat(i % 2 === 0 ? 0x4a3860 : 0x2a3048, 0.22);
        const card = new THREE.Mesh(nebGeo, mat);
        const a = (i / nNeb) * Math.PI * 2 + 0.4;
        const elev = (i % 3) * 14 - 6;
        card.position.set(Math.cos(a) * 44, elev, Math.sin(a) * 44);
        card.lookAt(0, 4, 0);
        card.frustumCulled = false;
        card.renderOrder = -7;
        overlayLines.push(mat);
        group.add(card);
      }
    }
  }


  // WAVE5: deeper multi-layer parallax atmosphere for ALL scenes (waste/industrial read).
  {
    const stripPal: Record<FlyerSceneId, { col: number; y0: number; h0: number }> = {
      canyon: { col: 0x0c1520, y0: -4, h0: 9 },
      wormhole: { col: 0x1a0628, y0: 1, h0: 11 },
      yard: { col: 0x121820, y0: -2, h0: 10 },
      rift: { col: 0x061820, y0: -3, h0: 10 },
    };
    const sp = stripPal[sceneId];
    // T-LIVE-R1-03: more distant parallax strips so live chase BG is not empty void.
    // WAVE12 denser parallax strips â€” stay framed during banks.
    // WAVE41 grounded depth strips: sparse low horizon silhouettes only (no floating cube litter)
    const nStrip = sceneId === 'wormhole' ? (quality === 'low' ? 3 : 5) : 0; // WAVE41 purge floating strip litter
    for (let i = 0; i < nStrip; i++) {
      const far = sceneId === 'wormhole' ? 36 + i * 8 : 70 + i * 14;
      const h = sceneId === 'wormhole' ? sp.h0 + i * 2.4 : Math.min(8, sp.h0 * 0.55 + i * 0.8);
      const stripMat = new THREE.MeshBasicMaterial({
        color: sp.col,
        transparent: true,
        opacity: sceneId === 'wormhole' ? Math.max(0.08, 0.48 - i * 0.05) : Math.max(0.12, 0.38 - i * 0.05),
        depthWrite: false,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(far * 2.1, h), stripMat);
      strip.name = 'FlyerSkyDepthStrip';
      const a = (i / nStrip) * Math.PI * 2 + 0.28;
      const y = sceneId === 'wormhole' ? sp.y0 + i * 0.85 : -1.5 + i * 0.35; // WAVE41 grounded horizon only
      strip.position.set(Math.cos(a) * far * 0.58, y, Math.sin(a) * far * 0.58);
      strip.lookAt(0, y * 0.15, 0);
      strip.frustumCulled = false;
      strip.renderOrder = -8.5;
      overlayLines.push(stripMat);
      group.add(strip);
      if (sceneId === 'wormhole') {
        const strip2 = strip.clone();
        strip2.material = stripMat.clone();
        overlayLines.push(strip2.material as THREE.Material);
        const a2 = a + Math.PI * 0.92;
        strip2.position.set(Math.cos(a2) * far * 0.58, y + 0.4, Math.sin(a2) * far * 0.58);
        strip2.lookAt(0, y * 0.15, 0);
        group.add(strip2);
      }
    }
    // WAVE12 neon city cards â€” silhouette + neon edge planes follow ship (framed during banks).
    {
      const cityCols: Record<FlyerSceneId, { fill: number; neon: number }> = {
        canyon: { fill: 0x0c1410, neon: 0xff8844 },
        wormhole: { fill: 0x140820, neon: 0xff44dd },
        yard: { fill: 0x0c1418, neon: 0x44e0ff },
        rift: { fill: 0x061820, neon: 0x9ef2ff },
      };
      const cc = cityCols[sceneId];
  
    // WAVE13 VOID EXCEPTION: only wormhole may keep digital void BG.
    // Canyon/yard/rift get opaque horizon cylinder + dusk dome (grounded worlds).
    if (sceneId !== 'wormhole') {
      // WAVE28 T-W27-01: thin horizon BAND only â€” do NOT occlude JPEG sky dome with tall opaque cylinder/dusk
      const hzCols: Record<FlyerSceneId, number> = {
        canyon: 0x141820, // WAVE37 night
        wormhole: 0x1a0828,
        yard: 0x101820, // WAVE37 night
        rift: 0x0c1420, // WAVE37 night
      };
      const hzNeon: Record<FlyerSceneId, number> = {
        canyon: 0xcc8844,
        wormhole: 0xff44dd,
        yard: 0x48c0d8,
        rift: 0x66aacc,
      };
      const hz = new THREE.Mesh(
        new THREE.CylinderGeometry(95, 118, 14, quality === 'low' ? 28 : 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: hzCols[sceneId],
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.BackSide,
        })
      );
      hz.name = 'FlyerHorizonCylinder';
      hz.position.y = -2;
      hz.frustumCulled = false;
      hz.renderOrder = -9.5;
      group.add(hz);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(94, 117, 6, quality === 'low' ? 28 : 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: hzNeon[sceneId],
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
        })
      );
      band.name = 'FlyerHorizonNeonBand';
      band.position.y = 2;
      band.frustumCulled = false;
      band.renderOrder = -9.4;
      group.add(band);
      // Soft upper tint ONLY â€” JPEG dome remains primary opaque sky
      const dusk = new THREE.Mesh(
        new THREE.SphereGeometry(268, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshBasicMaterial({
          color: sceneId === 'yard' ? 0x183040 : sceneId === 'canyon' ? 0x1a2030 : sceneId === 'rift' ? 0x142030 : 0x200830, // WAVE37 night
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.BackSide,
        })
      );
      dusk.name = 'FlyerDuskDome';
      dusk.frustumCulled = false;
      dusk.renderOrder = -11.8;
      group.add(dusk);
    }


    // WAVE21b HOTFIX: kill neon megacity brand planes on grounded chase (cyan clippers)
      const nCity = sceneId === 'wormhole' ? (quality === 'low' ? 4 : 6) : 0;
      for (let i = 0; i < nCity; i++) {
        const far = 22 + (i % 6) * 5.5;
        const h = 9 + (i % 5) * 3.4;
        const w = 5.5 + (i % 4) * 2.6;
        const fillMat = new THREE.MeshBasicMaterial({
          color: cc.fill,
          transparent: true,
          opacity: 0.88 + (i % 3) * 0.04,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        });
        const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fillMat);
        card.name = 'FlyerNeonCityCard';
        const a = (i / nCity) * Math.PI * 2 + 0.15;
        const y = 5.5 + (i % 4) * 3.2;
        card.position.set(Math.cos(a) * far * 0.55, y, Math.sin(a) * far * 0.55);
        card.lookAt(0, y * 0.25, 0);
        card.frustumCulled = false;
        card.renderOrder = -8.2;
        overlayLines.push(fillMat);
        group.add(card);
        const neonMat = new THREE.MeshBasicMaterial({
          color: cc.neon,
          transparent: true,
          opacity: 0.72 + (i % 3) * 0.08,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.02, 0.28), neonMat);
        edge.name = 'FlyerNeonCityEdge';
        edge.position.copy(card.position);
        edge.position.y += h * 0.48;
        edge.quaternion.copy(card.quaternion);
        edge.frustumCulled = false;
        edge.renderOrder = -8.1;
        overlayLines.push(neonMat);
        group.add(edge);
        // Window grid glow strips
        const winMat = new THREE.MeshBasicMaterial({
          color: cc.neon,
          transparent: true,
          opacity: 0.35 + (i % 3) * 0.06,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, h * 0.55), winMat);
        win.name = 'FlyerNeonCityWindows';
        win.position.copy(card.position);
        win.position.y -= h * 0.05;
        win.quaternion.copy(card.quaternion);
        win.frustumCulled = false;
        win.renderOrder = -8.05;
        overlayLines.push(winMat);
        group.add(win);
        if (i % 2 === 0) {
          const twin = card.clone();
          twin.material = fillMat.clone();
          overlayLines.push(twin.material as THREE.Material);
          const a2 = a + Math.PI * 0.88;
          twin.position.set(Math.cos(a2) * far * 0.55, y + 1.2, Math.sin(a2) * far * 0.55);
          twin.lookAt(0, y * 0.25, 0);
          group.add(twin);
        }
      }
    }

    // WAVE41 haze wormhole-only — grounded night = horizon cylinder only (no additive sphere trash)
    // Far haze bands (atmosphere shells) â€” layered depth beyond flat color bands.
    if (quality !== 'low' && sceneId === 'wormhole') {
      const hazeCols: Record<FlyerSceneId, number[]> = {
        canyon: [0xcc8840, 0x1a2830, 0x0a100c],
        wormhole: [0xff44dd, 0x5a18aa, 0x180428],
        yard: [0x2a4858, 0x142028, 0x060a10],
        rift: [0x9ef2ff, 0x2a90a0, 0x041820],
      };
      const cols = hazeCols[sceneId];
      for (let i = 0; i < cols.length; i++) {
        const haze = new THREE.Mesh(
          new THREE.SphereGeometry(105 - i * 8, 12, 8, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.42),
          new THREE.MeshBasicMaterial({
            color: cols[i],
            transparent: true,
            opacity: (0.14 - i * 0.03) * Math.max(0.55, mul),
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
            blending: i === 0 ? THREE.AdditiveBlending : THREE.NormalBlending,
          })
        );
        haze.name = 'FlyerSkyHazeBand';
        haze.frustumCulled = false;
        haze.renderOrder = -10.5 + i * 0.1;
        overlayLines.push(haze.material as THREE.Material);
        group.add(haze);
      }
    }
  }

  // WAVE41 T-W40-02: NO star field on grounded canyon/yard/rift — reads as floating cube void trash
  const starN = sceneId === 'wormhole'
    ? Math.round((quality === 'low' ? 18 : quality === 'high' ? 40 : 28) * mul)
    : 0;
  const spos = new Float32Array(Math.max(1, starN) * 3);
  const scol = new Float32Array(Math.max(1, starN) * 3);
  _col.setHex(pal.accent);
  _col2.setHex(pal.glow);
  for (let i = 0; i < starN; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const rad = 95 + Math.random() * 28;
    spos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    spos[i * 3 + 1] = rad * Math.cos(phi) * 0.62;
    spos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
    const mix = Math.random();
    scol[i * 3] = _col.r * mix + _col2.r * (1 - mix);
    scol[i * 3 + 1] = _col.g * mix + _col2.g * (1 - mix);
    scol[i * 3 + 2] = _col.b * mix + _col2.b * (1 - mix);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      size: sceneId === 'rift' ? 0.7 : sceneId === 'wormhole' ? 0.72 : 0.48,
      vertexColors: true,
      transparent: true,
      opacity: (sceneId === 'wormhole' ? 0.82 : 0.55) * Math.min(1, mul),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
      toneMapped: false,
    })
  );
  if (starN > 0) {
    stars.name = 'FlyerSkyStars';
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    group.add(stars);
  }

  const horizonR = 78;
  if (sceneId === 'wormhole') {
    const nSkyRings = quality === 'low' ? 3 : 4;
    for (let i = 0; i < nSkyRings; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff44dd : 0x66e8ff,
        transparent: true,
        opacity: 0.28 - i * 0.022,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(horizonR - i * 7.5, 0.2 + i * 0.03, 6, 40),
        ringMat
      );
      ring.name = 'FlyerHorizon';
      ring.rotation.x = Math.PI / 2 + (i % 3) * 0.12;
      ring.rotation.z = i * 0.18;
      ring.position.y = -4 + i * 1.6;
      ring.frustumCulled = false;
      ring.renderOrder = -8;
      overlayLines.push(ringMat);
      group.add(ring);
    }
  } else {
    const pts: THREE.Vector3[] = [];
    const segs = sceneId === 'canyon' ? 48 : 40;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      let y = sceneId === 'rift' ? -4 + Math.sin(a * 5) * 1.6 : -8;
      if (sceneId === 'canyon') y = -10 + Math.abs(Math.sin(a * 4)) * 6;
      if (sceneId === 'yard') y = -7 + (i % 5 === 0 ? 4 : 0);
      pts.push(new THREE.Vector3(Math.cos(a) * horizonR, y, Math.sin(a) * horizonR));
    }
    const hGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const horizonMat = new THREE.LineBasicMaterial({
      color: pal.glow,
      transparent: true,
      opacity: 0.22 * mul,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
    const horizon = new THREE.LineLoop(hGeo, horizonMat);
    horizon.name = 'FlyerHorizon';
    horizon.frustumCulled = false;
    horizon.renderOrder = -8;
    overlayLines.push(horizonMat);
    group.add(horizon);
  }

  const bassMat = bass.material as THREE.MeshBasicMaterial;
  const shellMats = shells.map((s) => s.material as THREE.MeshBasicMaterial);
  const shellBaseOp = shellMats.map((m) => m.opacity);
  const starMat = stars.material as THREE.PointsMaterial;
  const starBaseOp = starMat.opacity;
  const lineBaseOp = overlayLines.map((m) => ('opacity' in m ? m.opacity : 0.2));
  const bassBaseOp = bassMat.opacity;

  handle.applyBass = (shipPos, pulse, glow, accent) => {
    group.position.copy(shipPos);
    bass.scale.setScalar(1 + pulse * 0.055);
    bassMat.opacity = bassBaseOp + pulse * 0.14 * mul;
    bassMat.color.copy(glow).lerp(accent, 0.35 + pulse * 0.25);
    for (let i = 0; i < shellMats.length; i++) {
      shellMats[i].opacity = shellBaseOp[i] + pulse * 0.1 * mul;
    }
    starMat.opacity = starBaseOp + pulse * 0.2 * mul;
    stars.rotation.y += 0.0004;
    for (let i = 0; i < overlayLines.length; i++) {
      overlayLines[i].opacity = lineBaseOp[i] + pulse * 0.08 * mul;
    }
  };

  return handle;
}


