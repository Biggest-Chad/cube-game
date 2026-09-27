/**
 * WAVE45 — Critic FAIL remodel (63/100). METHOD CHANGE buff silhouettes + portal depth + rings.
 * DISCARD: gold/blue/lime ORBS; thin grid wallpaper as sole PLACE; pillar-only ring stills.
 * Buffs: face-on gold chevron / blue hex disc / lime armor plate (shape-readable at chase).
 * Portal: deep hangar/plaza/runway/city THROUGH aperture. Rings: aperture + 1/3→3/3 pips.
 * Sparse path-framed; clear-lane midDense stays false. Quiet HUD.
 */
import * as THREE from 'three';
import type { FlyerSceneId } from '../data/flyer';
import { pathDeckClearY } from './flyerWipeoutGrammar';
import {
  getFlyerCorridorLib,
  instantiateCorridorGlb,
  type CorridorGlbId,
} from './flyerCorridorGlb';

export type InteractKind =
  | 'speed'
  | 'shield'
  | 'hull'
  | 'obstruction'
  | 'enemy'
  | 'ring'
  | 'portal';

export const INTERACT_GOOD: ReadonlySet<InteractKind> = new Set(['speed', 'shield', 'hull', 'ring']);
export const RING_CHAIN_N = 3;
export const ENEMY_FRAG_REWARD = 4;
export const ENEMY_LATTICE_BONUS = 2;
export const RING_FRAG_REWARD = 3;
export const RING_LATTICE_BONUS = 2;
export const RING_BOOST_THRUST = 42; // WAVE46 ring-complete reward
export const SHIELD_RESTORE = 0.45;
export const HULL_RESTORE_FRAC = 0.28;

const _addMat = (hex: number, op: number) =>
  new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: op,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

/** Distinct color grammar — NOT cyan twin family for buffs/hazards/enemies. */
export function interactMarkColor(kind: InteractKind): number {
  switch (kind) {
    case 'speed':
      return 0xffcc33; // gold chevron
    case 'shield':
      return 0x3399ff; // electric blue hex
    case 'hull':
      return 0x55ee55; // lime armor plate
    case 'ring':
      return 0xff66dd;
    case 'enemy':
      return 0xff4422; // hostile orange/red
    case 'portal':
      return 0x66eeff;
    case 'obstruction':
    default:
      return 0xff5533;
  }
}

export function interactCorridorId(kind: InteractKind, sceneId: FlyerSceneId): CorridorGlbId | null {
  switch (kind) {
    case 'speed':
      return 'interact_buff_speed';
    case 'shield':
      return 'interact_buff_shield';
    case 'hull':
      return 'interact_buff_hull';
    case 'enemy':
      return 'interact_enemy_cube';
    case 'ring':
      return 'interact_acro_ring';
    case 'portal':
      return 'interact_end_portal';
    case 'obstruction':
      if (sceneId === 'canyon') return 'interact_hazard_canyon';
      if (sceneId === 'yard') return 'interact_hazard_yard';
      if (sceneId === 'rift') return 'interact_hazard_rift';
      return 'interact_hazard_pylon';
    default:
      return null;
  }
}

export function finishFrameId(sceneId: FlyerSceneId): CorridorGlbId | null {
  if (sceneId === 'canyon') return 'interact_finish_frame_canyon';
  if (sceneId === 'yard') return 'interact_finish_frame_yard';
  if (sceneId === 'rift') return 'interact_finish_frame_rift';
  return 'interact_finish_frame_canyon';
}

function lit(hex: number, emit = hex, intensity = 0.95): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: hex,
    emissive: emit,
    emissiveIntensity: intensity,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

/** Unlit chase-readable fill — buffs must stay shape-readable. */
function glow(hex: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: hex,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

/** WAVE45 procedural chase silhouettes — FACE-ON shapes (not orbs / not edge-on). */
export function makeInteractVisual(kind: InteractKind, sceneId: FlyerSceneId, stage = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = `FlyerInteract_${kind}`;
  g.userData.interact = kind;
  g.userData.mark =
    INTERACT_GOOD.has(kind) || kind === 'portal'
      ? kind === 'portal'
        ? 'portal'
        : 'boost'
      : kind === 'enemy'
        ? 'enemy'
        : 'hazard';
  g.userData.wave45 = true;
  g.userData.wave44 = true;
  const col = interactMarkColor(kind);
  // METHOD CHANGE: silhouettes live in XY (face chase cam). Thin in Z.
  if (kind === 'speed') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.45), glow(0xffcc33));
    shaft.position.set(0, 1.7, 0);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 0.45), glow(0xffaa22));
    wingL.position.set(-0.95, 1.95, 0);
    wingL.rotation.z = 0.55;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 0.45), glow(0xffaa22));
    wingR.position.set(0.95, 1.95, 0);
    wingR.rotation.z = -0.55;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.55, 4), glow(0xffee66));
    tip.position.set(0, 3.35, 0);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.5, 0.45), glow(0xffee66));
    notch.position.set(0, 0.45, 0);
    g.add(shaft, wingL, wingR, tip, notch);
    g.scale.setScalar(1.35);
  } else if (kind === 'shield') {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.35);
    shape.lineTo(-1.2, 0.72);
    shape.lineTo(-1.02, -0.28);
    shape.lineTo(0, -1.25);
    shape.lineTo(1.02, -0.28);
    shape.lineTo(1.2, 0.72);
    shape.closePath();
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow(0x3399ff));
    plate.position.set(0, 1.9, 0);
    const rim = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow(0x88ccff));
    rim.position.set(0, 1.9, -0.12);
    rim.scale.setScalar(1.12);
    g.add(plate, rim);
    g.scale.setScalar(1.35);
  } else if (kind === 'hull') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.35, 0.4), glow(0x55ee55));
    plate.position.set(0, 1.9, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.35, 2.55, 0.25), glow(0x336633));
    back.position.set(0, 1.9, -0.32);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.14), glow(0xccffaa));
    stripe.position.set(0, 1.9, 0.28);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.12), glow(0xccffaa));
    stripe2.position.set(0, 1.4, 0.28);
    for (const [sx, sy] of [
      [-1.05, 2.6],
      [1.05, 2.6],
      [-1.05, 1.2],
      [1.05, 1.2],
    ] as const) {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.16), glow(0xddffaa));
      bolt.position.set(sx, sy, 0.28);
      g.add(bolt);
    }
    g.add(plate, back, stripe, stripe2);
    g.scale.setScalar(1.25);
  } else if (kind === 'enemy') {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.55, 1.55), lit(0xaa1122, 0xff3311, 0.95));
    cube.position.y = 1.15;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.14), lit(0xffee44, 0xffcc22, 1.45));
    face.position.set(0, 1.15, 0.82);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), lit(0xffdd33, 0xffee55, 1.35));
    core.position.y = 1.15;
    const trimT = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), lit(0xff5500, 0xff6622, 1.05));
    trimT.position.set(0, 1.95, 0.75);
    g.add(cube, face, core, trimT);
    attachKillBonusPip(g);
  } else if (kind === 'ring') {
    const stageTint = [0xff66dd, 0x66ffee, 0xffee66][Math.max(0, Math.min(2, stage))]!;
    const tor = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.18, 10, 36), lit(stageTint, stageTint, 1.25));
    tor.position.y = 2.05;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.07, 8, 28), lit(0x88eeff, 0x66ddff, 0.95));
    inner.position.y = 2.05;
    g.add(tor, inner);
    attachRingStagePips(g, stage);
    if (stage >= RING_CHAIN_N - 1) attachRingCompletionFx(g);
  } else if (kind === 'portal') {
    const matFrame = lit(0x101418, 0x152028, 0.4);
    const matNeon = lit(0x66eeff, 0x66eeff, 1.3);
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.6, 0.7), matFrame);
    pillarL.position.set(-3.6, 2.8, 0);
    const pillarR = pillarL.clone();
    pillarR.position.x = 3.6;
    const lint = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.5, 0.75), matFrame);
    lint.position.set(0, 5.6, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.35, 1.0), matFrame);
    base.position.set(0, 0.18, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.14, 8, 28), matNeon);
    ring.position.y = 2.9;
    const neonL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 5.0, 0.1), matNeon);
    neonL.position.set(-3.6, 2.8, 0.42);
    const neonR = neonL.clone();
    neonR.position.x = 3.6;
    g.add(pillarL, pillarR, lint, base, ring, neonL, neonR);
    attachPortalVolumeGlow(g);
  } else {
    buildThemeHazard(g, sceneId);
  }
  if (kind === 'ring' || kind === 'portal' || kind === 'enemy' || kind === 'obstruction') {
    attachTelegraphRing(g, col, kind === 'ring' ? 2.7 : kind === 'portal' ? 3.4 : 1.55);
  } else if (kind === 'speed' || kind === 'shield' || kind === 'hull') {
    attachSquareMark(g, col);
  }
  if (kind === 'speed' || kind === 'shield' || kind === 'hull' || kind === 'ring') {
    const word =
      kind === 'speed' ? 'BOOST' : kind === 'shield' ? 'SHIELD' : kind === 'hull' ? 'REPAIR' : `RING ${stage + 1}/3`;
    const css =
      kind === 'speed' ? '#ffd15a' : kind === 'shield' ? '#7ec0ff' : kind === 'hull' ? '#8dff8a' : '#ff9aee';
    const label = pickupLabel(word, css);
    if (label) g.add(label);
    wrapPickupMotion(g);
  }
  return g;
}

function buildThemeHazard(g: THREE.Group, sceneId: FlyerSceneId): void {
  const wrap = new THREE.Group();
  wrap.name = 'ThemeHazard';
  wrap.scale.setScalar(1.05);
  g.add(wrap);
  const h = wrap;
  if (sceneId === 'yard') {
    const metal = lit(0x333840, 0x222428, 0.3);
    const paint = lit(0xdd7722, 0xff8833, 0.95);
    const warn = lit(0xff3311, 0xff4422, 1.2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.5), metal);
    base.position.y = 0.3;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.42), metal);
    post.position.y = 2.1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 0.35), paint);
    arm.geometry.translate(1.35, 0, 0);
    arm.position.set(-0.2, 3.5, 0);
    arm.name = 'ThemeHazardArm';
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.22), metal);
    arm2.geometry.translate(0.95, 0, 0);
    arm2.position.set(0, 2.7, 0);
    arm2.name = 'ThemeHazardArm';
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), warn);
    light.position.set(2.5, 0, 0);
    arm.add(light);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), paint);
    stripe.position.set(0, 1.4, 0.28);
    h.add(base, post, arm, arm2, stripe);
  } else if (sceneId === 'rift') {
    const shard = lit(0x7722aa, 0xaa44ff, 1.1);
    const tip = lit(0xff55aa, 0xff66cc, 1.3);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), lit(0x1a1520, 0x221828, 0.35));
    base.position.y = 0.25;
    const main = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.2, 0.4), shard);
    main.geometry.translate(0, 1.6, 0);
    main.position.y = 0.4;
    main.name = 'ThemeHazardShard';
    const lean = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.3), shard);
    lean.position.set(0.55, 2.4, 0.2);
    const lean2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.25), shard);
    lean2.position.set(-0.4, 1.8, -0.15);
    const tipM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.25), tip);
    tipM.position.set(0.15, 3.85, 0);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.1), tip);
    glow.position.set(0, 2.0, 0.28);
    h.add(base, main, lean, lean2, tipM, glow);
  } else {
    const rock = lit(0x774422, 0xaa4422, 0.6);
    const beam = lit(0xaa4422, 0xff6622, 1.0);
    const warn = lit(0xff6611, 0xff7722, 1.2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.8), rock);
    base.position.y = 0.7;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), rock);
    top.position.set(0.35, 1.85, -0.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.42), beam);
    arm.geometry.translate(1.6, 0, 0);
    arm.position.set(-1.4, 2.85, 0);
    arm.name = 'ThemeHazardArm';
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), beam);
    post.position.set(-1.3, 1.7, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), warn);
    tip.position.set(3.05, 0, 0);
    arm.add(tip);
    h.add(base, top, arm, post);
  }
}

function attachRingStagePips(parent: THREE.Object3D, stage: number): void {
  const row = new THREE.Group();
  row.name = 'RingStagePips';
  row.position.set(0, 4.55, 0.15);
  const colors = [0xff66dd, 0x66ffee, 0xffee66];
  for (let i = 0; i < RING_CHAIN_N; i++) {
    const on = i <= stage;
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.32, 0.24),
      lit(on ? colors[i]! : 0x2a2a38, on ? colors[i]! : 0x181820, on ? 1.45 : 0.18)
    );
    pip.position.x = (i - 1) * 0.72;
    pip.name = `RingPip_${i + 1}`;
    row.add(pip);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1), lit(0x333344, 0x222233, 0.35));
  rail.position.set(0, 0, -0.18);
  row.add(rail);
  const barW = 0.55 + stage * 0.55;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(barW, 0.38, 0.12),
    lit(colors[Math.max(0, Math.min(2, stage))]!, colors[Math.max(0, Math.min(2, stage))]!, 1.25)
  );
  plate.position.set(0, 0.55, 0);
  plate.name = 'RingStagePlate';
  row.add(plate);
  parent.add(row);
}

function attachRingCompletionFx(parent: THREE.Object3D): void {
  const fx = new THREE.Group();
  fx.name = 'RingCompletionFx';
  const bloom = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.12, 8, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffee66,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  bloom.position.set(0, 3.4, 0.4);
  const tickV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), lit(0xffee66, 0xffcc44, 1.6));
  tickV.position.set(0, 4.1, 0.5);
  const tickH = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 0.18), lit(0xffee66, 0xffcc44, 1.6));
  tickH.position.set(0, 4.1, 0.5);
  fx.add(bloom, tickV, tickH);
  parent.add(fx);
}

const _labelTex = new Map<string, THREE.CanvasTexture>();

/** One-word plate above a pickup. Face-on in XY, same as the silhouette. */
function pickupLabel(text: string, css: string): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  let tex = _labelTex.get(text + css);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, 256, 64);
    g.font = '700 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, 128, 34);
    g.fillStyle = css;
    g.fillText(text, 128, 34);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    _labelTex.set(text + css, tex);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 0.78),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  mesh.position.set(0, 4.35, 0.15);
  mesh.name = 'PickupLabel';
  return mesh;
}

function wrapPickupMotion(g: THREE.Group): void {
  const pivot = new THREE.Group();
  pivot.name = 'PickupMotion';
  for (const child of [...g.children]) pivot.add(child);
  g.add(pivot);
}

function attachSquareMark(parent: THREE.Object3D, hex: number): void {
  const mark = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.06), _addMat(hex, 0.22));
  mark.position.set(0, 1.7, -0.35);
  mark.name = 'markSquare';
  parent.add(mark);
}

function attachKillBonusPip(parent: THREE.Object3D): void {
  const pip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), lit(0xffee44, 0xffcc22, 1.55));
  pip.position.set(0, 2.35, 0);
  pip.name = 'EnemyKillBonusPip';
  parent.add(pip);
  const tickV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), lit(0xffee66, 0xffdd44, 1.5));
  tickV.position.set(0, 2.75, 0);
  const tickH = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), lit(0xffee66, 0xffdd44, 1.5));
  tickH.position.set(0, 2.75, 0);
  tickV.name = 'EnemyKillBonusPlusV';
  tickH.name = 'EnemyKillBonusPlusH';
  parent.add(tickV, tickH);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 16), _addMat(0xffaa33, 0.7));
  halo.rotation.x = Math.PI / 2;
  halo.position.copy(pip.position);
  halo.name = 'EnemyKillBonusHalo';
  parent.add(halo);
}

function attachPortalVolumeGlow(parent: THREE.Object3D): void {
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.18, 8, 28),
    new THREE.MeshBasicMaterial({
      color: 0xaa66ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    })
  );
  glow.position.y = 2.9;
  glow.name = 'PortalVolumeGlow';
  parent.add(glow);
}

function attachTelegraphRing(parent: THREE.Object3D, hex: number, r: number): void {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 6, 20), _addMat(hex, 0.55));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = kindLift(parent);
  ring.name = 'markRing';
  parent.add(ring);
}

function kindLift(parent: THREE.Object3D): number {
  const k = parent.userData?.interact as InteractKind | undefined;
  if (k === 'portal') return 2.9;
  if (k === 'ring') return 2.05;
  return 1.25;
}

export type InteractSpec = {
  kind: InteractKind;
  s: number;
  x: number;
  y: number;
  r: number;
  stage?: number;
};

/** Sparse path-framed interactive layout — NOT densify soup. */
export function layoutInteractives(courseLen: number, sceneId: FlyerSceneId): InteractSpec[] {
  const out: InteractSpec[] = [];
  const S = Math.max(80, courseLen);
  const used: InteractSpec[] = [];

  // Keep two gates from sitting in the same patch of lane.
  const commit = (spec: InteractSpec): void => {
    let s = spec.s;
    for (let guard = 0; guard < 6; guard++) {
      let blocked = false;
      for (const u of used) {
        if (Math.abs(u.s - s) > 18) continue;
        if (Math.hypot(u.x - spec.x, u.y - spec.y) < u.r + spec.r + 1.1) {
          s += 20;
          blocked = true;
          break;
        }
      }
      if (!blocked) break;
    }
    spec.s = Math.min(s, Math.max(48, S - 46));
    used.push(spec);
    out.push(spec);
  };

  const at = (frac: number): number => frac * S;

  // Three boost slaloms. The middle pad sits on a cruise; the wings do not.
  for (const frac of [0.12, 0.5, 0.78]) {
    for (let i = 0; i < 3; i++) {
      commit({
        kind: 'speed',
        s: at(frac) + i * 20,
        x: (i - 1) * 2.85,
        y: 0.95,
        r: 1.15,
      });
    }
  }

  commit({ kind: 'shield', s: at(0.34), x: 0, y: 1.05, r: 1.35 });
  commit({ kind: 'shield', s: at(0.7), x: 0, y: 1.05, r: 1.35 });
  commit({ kind: 'hull', s: at(0.46), x: 0, y: 1.1, r: 1.4 });
  commit({ kind: 'hull', s: at(0.9), x: 0, y: 1.1, r: 1.4 });

  const nObs = sceneId === 'wormhole' ? 5 : 8;
  for (let i = 0; i < nObs; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    commit({
      kind: 'obstruction',
      s: at(0.16 + (i / nObs) * 0.7),
      x: side * 3.7,
      y: 0.9,
      r: 1.35,
    });
  }

  const enemyFrac = [0.1, 0.18, 0.27, 0.4, 0.52, 0.63, 0.74, 0.84, 0.94];
  for (let i = 0; i < enemyFrac.length; i++) {
    const blocker = i === 1 || i === 4 || i === 6 || i === 8;
    const side = i % 4 === 0 ? -1 : 1;
    commit({
      kind: 'enemy',
      s: at(enemyFrac[i]!),
      // Blockers sit on the nose line, including one after the last repair. Flankers are a steer-shot.
      x: blocker ? 0 : side * 2.7,
      y: 0.35,
      r: 1.25,
    });
  }

  // Rings alternate across the lane. A centered cruise misses the hoop.
  for (const frac of [0.28, 0.62]) {
    for (let i = 0; i < RING_CHAIN_N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      commit({
        kind: 'ring',
        s: at(frac) + i * 28,
        x: side * 3.25,
        y: 1.35,
        r: 2.05,
        stage: i,
      });
    }
  }

  out.push({
    kind: 'portal',
    s: Math.max(40, S - 22),
    x: 0,
    y: Math.max(0.2, pathDeckClearY(0.5, 0.05)),
    r: 3.6,
  });

  return out;
}

/**
 * Finish PLACE — hangar/plaza/runway THROUGH the gate (not void).
 * Prefer zone finish GLB; always add procedural depth layers beyond aperture.
 */
export function makeFinishScenery(sceneId: FlyerSceneId): THREE.Group {
  const g = new THREE.Group();
  g.name = 'FlyerFinishScenery';
  g.userData.wave44Place = true;
  g.userData.wave45Place = true;
  // WAVE45: procedural deep PLACE — hangar/plaza/runway/city THROUGH aperture.
  // Kit GLBs retained on disk (w45/) but not parented (axis swap → occlusion wall).
  addProceduralFinishPlace(g, sceneId);
  return g;
}

function addProceduralFinishPlace(g: THREE.Group, sceneId: FlyerSceneId): void {
  // WAVE45: deep PLACE through aperture — hangar volume + plaza + runway + layered city mass.
  // DISCARD flat lit window-grid wallpaper as the only finish read.
  g.userData.wave45Place = true;
  if (sceneId === 'wormhole') {
    g.userData.voidNoRoad = true;
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.6 + i * 0.28, 0.07, 8, 28),
        lit(0x66e8ff, 0xb44cff, 1.35)
      );
      ring.name = 'FlyerFinishEnergyRing';
      ring.position.set(0, 2.6, -0.8 - i * 2.4);
      g.add(ring);
    }
    return;
  }
  const zoneCol = sceneId === 'canyon' ? 0xff6633 : sceneId === 'yard' ? 0x44ccee : 0x88ddff;
  const massCol = sceneId === 'canyon' ? 0x663322 : sceneId === 'yard' ? 0x2a3340 : 0x334466;
  const runCol = 0xffee66;

  for (const side of [-1, 1] as const) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 8.0, 2.4), lit(zoneCol, zoneCol, 0.6));
    tower.position.set(side * 5.8, 4.0, -2.2);
    g.add(tower);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7.2, 0.18), lit(zoneCol, zoneCol, 1.3));
    neon.position.set(side * 5.8, 4.0, -3.4);
    g.add(neon);
  }
  const lint = new THREE.Mesh(new THREE.BoxGeometry(12, 0.7, 2.0), lit(0x15181c, zoneCol, 0.6));
  lint.position.set(0, 7.6, -2.2);
  g.add(lint);

  const slabMat = lit(0x243040, zoneCol, 0.65);
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(11.2, 0.3, 2.15), slabMat, 12);
  slabs.name = 'FlyerFinishSlabs';
  const lightMat = lit(runCol, runCol, 1.95);
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.2, 0.75), lightMat, 48);
  lights.name = 'FlyerFinishRunwayLights';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    dummy.position.set(0, 0.15, -(1.2 + i * 2.35));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    slabs.setMatrixAt(i, dummy.matrix);
  }
  let li = 0;
  for (let i = 0; i < 16; i++) {
    const z = -(1.0 + i * 1.75);
    for (const x of [-2.4, 0, 2.4]) {
      dummy.position.set(x, 0.42, z);
      dummy.scale.set(x === 0 ? 1.2 : 1, 1, 1);
      dummy.updateMatrix();
      lights.setMatrixAt(li++, dummy.matrix);
    }
  }
  slabs.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  g.add(slabs, lights);

  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.2, 18), lit(0x15181c, zoneCol, 0.55));
  wallL.position.set(-5.1, 4.1, -14);
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.2, 18), lit(0x15181c, zoneCol, 0.55));
  wallR.position.set(5.1, 4.1, -14);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.55, 18), lit(0x15181c, zoneCol, 0.5));
  ceil.position.set(0, 8.3, -14);
  g.add(wallL, wallR, ceil);
  for (const z of [-8, -14, -20, -26]) {
    const cg = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.22, 0.4), lit(zoneCol, zoneCol, 1.4));
    cg.position.set(0, 7.95, z);
    g.add(cg);
  }

  const masses: Array<[number, number, number, number, number, number]> = [
    [-8.2, 5.5, -10, 3.6, 11, 4],
    [8.2, 5.0, -11, 3.4, 10, 4.5],
    [-9.0, 6.0, -18, 4.0, 12, 5],
    [9.0, 5.5, -19, 3.8, 11, 5],
    [-5.5, 5.2, -28, 4.5, 10, 3],
    [5.5, 5.8, -29, 4.5, 11, 3],
    [0, 7.2, -34, 7.5, 14, 2.8],
  ];
  for (const [x, y, z, sx, sy, sz] of masses) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lit(massCol, zoneCol, 0.5));
    m.position.set(x, y, z);
    g.add(m);
  }

  for (const side of [-1, 1] as const) {
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.5, 1.4), lit(zoneCol, zoneCol, 0.8));
    pyl.position.set(side * 4.6, 3.2, -3.0);
    g.add(pyl);
    const ban = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 1.6), lit(zoneCol, zoneCol, 1.25));
    ban.position.set(side * 3.7, 6.3, -4.5);
    g.add(ban);
    const banFar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 1.2), lit(zoneCol, zoneCol, 1.1));
    banFar.position.set(side * 3.4, 5.9, -17);
    g.add(banFar);
  }
  const banC = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.4, 0.22), lit(zoneCol, zoneCol, 1.3));
  banC.position.set(0, 8.35, -6.2);
  g.add(banC);
  for (const z of [-7.5, -14.5]) {
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.38, 0.45), lit(0x15181c, zoneCol, 0.55));
    gantry.position.set(0, 7.15, z);
    g.add(gantry);
  }

  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 4.8),
    new THREE.MeshBasicMaterial({
      color: zoneCol,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    })
  );
  wash.position.set(0, 2.9, -4.0);
  wash.name = 'FinishPortalWash';
  g.add(wash);

  for (let i = 0; i < 7; i++) {
    const chev = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 3), lit(runCol, runCol, 1.75));
    chev.rotation.x = Math.PI / 2;
    chev.position.set(0, 0.55, -(2.0 + i * 2.0));
    g.add(chev);
  }
}
