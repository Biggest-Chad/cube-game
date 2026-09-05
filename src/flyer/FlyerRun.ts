/**
 * Auto-forward transit along a banked spline. Stick strafes in the path-local
 * (right, up) frame; hazards live in (s, x, y).
 */
import * as THREE from 'three';
import {
  FLYER_BASE_SPEED,
  FLYER_DEBUG_PATH,
  FLYER_DURATION_SECONDS,
  FLYER_HIT_COOLDOWN,
  FLYER_LANE_HALF,
  FLYER_LOCK_AHEAD,
  FLYER_LOCK_XY,
  FLYER_SPEED_MUL_CAP,
  FLYER_SPEED_PICKUP_MUL,
  FLYER_STICK_Y_SIGN,
  FLYER_STRAFE,
  flyerHitProfile,
  flyerLatticeReward,
  flyerSceneTitle,
  flyerStars,
  type FlyerHitKind,
  type FlyerSceneId,
} from '../data/flyer';
import { flyerTrackPoints } from '../data/flyerTracks';
import { PathFrame, SplinePath } from './SplinePath';
import { placeFlyerGlbScenery, preloadFlyerScenery } from './flyerScenery';

type Kind = 'solid' | 'emp' | 'mine' | 'gate' | 'speed';

interface Node {
  kind: Kind;
  s: number;
  x: number;
  y: number;
  r: number;
  mesh: THREE.Object3D;
  alive: boolean;
}

export interface FlyerResult {
  stars: 1 | 2 | 3;
  lattice: number;
  time: number;
  hullRatio: number;
  hits: number;
  scene: FlyerSceneId;
}

export type FlyerFxEvent =
  | { type: 'lockKill'; x: number; y: number; z: number }
  | { type: 'speedPickup'; x: number; y: number; z: number }
  | { type: 'hit'; kind: FlyerHitKind; x: number; y: number; z: number };

export type FlyerRunOptions = {
  /** Path ribbon for capture / debug. Overrides FLYER_DEBUG_PATH when set. */
  debugRibbon?: boolean;
  /**
   * 3/4 chase used by stills: ship sits mid-frame with a readable nose/bank.
   * Playable transit keeps a coaxial chase (hero mesh).
   */
  captureCamera?: boolean;
};

const PALETTE: Record<FlyerSceneId, { fog: number; accent: number; fill: number; glow: number }> = {
  canyon: { fog: 0x160820, accent: 0x44f0ff, fill: 0x121820, glow: 0xff3aa8 },
  wormhole: { fog: 0x120018, accent: 0xb44cff, fill: 0x1a0828, glow: 0x66e8ff },
  yard: { fog: 0x1a1008, accent: 0xffb020, fill: 0x2a1c10, glow: 0xff6622 },
  rift: { fog: 0x07141c, accent: 0x9ef2ff, fill: 0x102028, glow: 0x7ad8ff },
};

const STREAK_COUNT = 28;
const STREAK_WINDOW = 58;
const FLASH_POOL = 4;
/** Playable chase (coaxial). Capture stills use the 3/4 offsets below. */
const CAM_BACK = 10.2;
const CAM_UP = 2.8;
const CAM_SIDE = 0.2;
const CAM_STRAFE_FOLLOW = 0.45;
const LOOK_AHEAD = 11;
const CAP_CAM_BACK = 12.8;
const CAP_CAM_UP = 4.4;
const CAP_CAM_SIDE = 3.35;
const CAP_LOOK_AHEAD = 5.2;
const CAP_LANE_LIMIT = 5.8;
const CAM_SMOOTH_TAU = 0.1;
const DRAW_WINDOW = 100;
const LANE_Y_MIN = -3.4;
const LANE_Y_MAX = 4.2;
const RING_SPACING = 14;
/** Look-ahead used only for craft bank (camera stays on the current frame). */
const BANK_LOOK = 8.5;
const LOOK_BLEND = 0.42;
const STRAFE_LEAN = 0.085;
const STRAFE_RATE_LEAN = 0.035;
const Y_LEAN = 0.05;

const _addMat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: true,
  });

export class FlyerRun {
  readonly root = new THREE.Group();
  readonly sceneId: FlyerSceneId;
  readonly title: string;
  readonly parTime = FLYER_DURATION_SECONDS;
  s = 0;
  x = 0;
  y = 0;
  speedMul = 1;
  t = 0;
  hits = 0;
  finished = false;
  failed = false;
  lockOn = false;
  fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;

  private nodes: Node[] = [];
  private hitCd = 0;
  private punch = 0;
  private readonly courseLen: number;
  private readonly pal: (typeof PALETTE)[FlyerSceneId];
  private readonly path: SplinePath;
  private readonly dummy = new THREE.Object3D();
  private readonly _mat = new THREE.Matrix4();
  private readonly _F = new PathFrame();
  private readonly _Flook = new PathFrame();
  private readonly _Fnode = new PathFrame();
  private readonly _shipPos = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _camUp = new THREE.Vector3(0, 1, 0);
  private readonly _camPosSmooth = new THREE.Vector3();
  private readonly _camUpSmooth = new THREE.Vector3(0, 1, 0);
  private readonly _world = new THREE.Vector3();
  private readonly _craftR = new THREE.Vector3();
  private readonly _craftU = new THREE.Vector3();
  private readonly _craftT = new THREE.Vector3();
  private readonly _qLean = new THREE.Quaternion();
  private camInited = false;
  private lastX = 0;
  private lastY = 0;
  private stickX = 0;
  private disposed = false;
  private readonly fxQueue: FlyerFxEvent[] = [];

  private streaks!: THREE.InstancedMesh;
  private streakSlot = new Float32Array(STREAK_COUNT);
  private streakXY = new Float32Array(STREAK_COUNT * 2);
  private flashes: THREE.Mesh[] = [];
  private flashLife: number[] = [];
  private tracer!: THREE.Line;
  private tracerPos!: Float32Array;
  private tracerLife = 0;
  private lockRing!: THREE.Mesh;
  readonly craft: THREE.Group;
  private ribbon: THREE.Object3D;
  /** Fog/sky color after bass envelope — Game copies onto scene.fog / background. */
  readonly fogPulseColor = new THREE.Color();
  private readonly fogBaseColor = new THREE.Color();
  private readonly fogHitColor = new THREE.Color();
  private bassEnv = 0;
  private skyMesh: THREE.Mesh | null = null;
  private ringMesh: THREE.InstancedMesh | null = null;
  private cardMesh: THREE.InstancedMesh | null = null;
  private ringBaseOp = 0.22;
  private cardBaseOp = 0.11;
  private readonly ringBaseColor = new THREE.Color();
  private readonly captureCamera: boolean;
  private readonly camBack: number;
  private readonly camLift: number;
  private readonly camSide: number;
  private readonly lookAhead: number;

  get accent(): number {
    return this.pal.accent;
  }
  get glow(): number {
    return this.pal.glow;
  }

  constructor(sceneId: FlyerSceneId, opts: FlyerRunOptions = {}) {
    this.sceneId = sceneId;
    this.title = flyerSceneTitle(sceneId);
    this.pal = PALETTE[sceneId];
    this.fogColor = this.pal.fog;
    this.fogBaseColor.setHex(this.pal.fog);
    this.fogHitColor.setHex(this.pal.glow);
    this.fogPulseColor.copy(this.fogBaseColor);
    this.ringBaseColor.setHex(this.pal.accent);
    this.captureCamera = !!opts.captureCamera;
    this.camBack = this.captureCamera ? CAP_CAM_BACK : CAM_BACK;
    this.camLift = this.captureCamera ? CAP_CAM_UP : CAM_UP;
    this.camSide = this.captureCamera ? CAP_CAM_SIDE : CAM_SIDE;
    this.lookAhead = this.captureCamera ? CAP_LOOK_AHEAD : LOOK_AHEAD;
    this.fogNear = this.captureCamera ? 14 : 10;
    this.fogFar = this.captureCamera ? 280 : 110;
    this.path = new SplinePath(flyerTrackPoints(sceneId));
    this.courseLen = this.path.length;
    this.root.name = 'FlyerRun';
    this.craft = this.buildCraft();
    this.root.add(this.craft);
    this.ribbon = this.path.makeDebugRibbon(this.pal.accent);
    this.ribbon.visible = opts.debugRibbon ?? (this.captureCamera || FLYER_DEBUG_PATH);
    this.root.add(this.ribbon);
    this.buildDecor();
    this.buildJuice();
    this.scatter();
    preloadFlyerScenery();
    placeFlyerGlbScenery(this.root, this.path, this.pal.accent, this.pal.glow, this.pal.fill);
    this.refreshPose(0);
    this.updateJuice(0, null);
  }

  get length(): number {
    return this.courseLen;
  }

  get roll(): number {
    return this._F.roll;
  }

  setDebugRibbon(on: boolean): void {
    this.ribbon.visible = on;
  }

  private col(kind: Kind): number {
    if (kind === 'emp') return this.pal.accent;
    if (kind === 'mine') return 0xff3355;
    if (kind === 'gate') return this.pal.glow;
    if (kind === 'speed') return 0x66ffaa;
    return this.pal.fill;
  }

  private orient(f: PathFrame, x: number, y: number, sx: number, sy: number, sz: number): void {
    this.dummy.position.copy(f.p).addScaledVector(f.r, x).addScaledVector(f.u, y);
    this._mat.makeBasis(f.r, f.u, f.t);
    this.dummy.quaternion.setFromRotationMatrix(this._mat);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
  }

  private worldAt(s: number, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    this.path.sample(s, this._Fnode);
    return out.copy(this._Fnode.p).addScaledVector(this._Fnode.r, x).addScaledVector(this._Fnode.u, y);
  }

  private buildDecor(): void {
    const p = this.pal;
    const S = this.courseLen;
    {
      const n = Math.max(22, Math.floor(S / RING_SPACING));
      const rings = new THREE.InstancedMesh(
        new THREE.TorusGeometry(this.sceneId === 'wormhole' ? 8.4 : 9.6, 0.16, 6, 28),
        new THREE.MeshBasicMaterial({
          color: p.accent,
          transparent: true,
          opacity: this.sceneId === 'wormhole' ? 0.35 : 0.22,
          toneMapped: false,
        }),
        n
      );
      for (let i = 0; i < n; i++) {
        const s = Math.min(S - 1, (i + 0.5) * (S / n));
        this.path.sample(s, this._Fnode);
        this.orient(this._Fnode, 0, 0, 1, 1, 1);
        rings.setMatrixAt(i, this.dummy.matrix);
      }
      rings.instanceMatrix.needsUpdate = true;
      rings.frustumCulled = false;
      this.ringMesh = rings;
      this.ringBaseOp = this.sceneId === 'wormhole' ? 0.35 : 0.22;
      this.root.add(rings);
    }
    this.buildSky();
    if (this.sceneId !== 'wormhole') {
      const wallMat = new THREE.MeshBasicMaterial({
        color: p.fill,
        toneMapped: false,
        fog: true,
      });
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const n = this.sceneId === 'canyon' ? 140 : 110;
      const walls = new THREE.InstancedMesh(geo, wallMat, n);
      const step = Math.max(5.5, (S - 28) / n);
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const h = this.sceneId === 'rift' ? 4 + (i % 5) * 1.4 : 8 + (i % 7) * 2.2;
        const s = Math.min(S - 1, 12 + i * step);
        this.path.sample(s, this._Fnode);
        const x = side * (9.2 + (i % 3));
        const y = h * 0.5 - 1.2;
        this.orient(this._Fnode, x, y, 2.4 + (i % 3), h, 3.2);
        walls.setMatrixAt(i, this.dummy.matrix);
      }
      walls.instanceMatrix.needsUpdate = true;
      walls.frustumCulled = false;
      this.root.add(walls);

      const floorN = Math.max(18, Math.floor(S / 12));
      const floors = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ color: p.fill, toneMapped: false, fog: true }),
        floorN
      );
      const fStep = S / floorN;
      for (let i = 0; i < floorN; i++) {
        const s = Math.min(S - 1, (i + 0.5) * fStep);
        this.path.sample(s, this._Fnode);
        this.orient(this._Fnode, 0, LANE_Y_MIN, 16, 0.18, fStep * 0.96);
        floors.setMatrixAt(i, this.dummy.matrix);
      }
      floors.instanceMatrix.needsUpdate = true;
      floors.frustumCulled = false;
      this.root.add(floors);
    }

    const cardN = 16;
    const cardMat = _addMat(p.accent, 0.11);
    const cardGeo = new THREE.PlaneGeometry(14, 9);
    const cards = new THREE.InstancedMesh(cardGeo, cardMat, cardN);
    for (let i = 0; i < cardN; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const s = Math.min(S - 1, 18 + i * Math.max(28, (S - 60) / cardN));
      this.path.sample(s, this._Fnode);
      this.orient(this._Fnode, side * (15.5 + (i % 3) * 1.4), 1.6 + (i % 4) * 0.7, 1, 1, 1);
      this.dummy.rotateY(side * -0.55);
      this.dummy.updateMatrix();
      cards.setMatrixAt(i, this.dummy.matrix);
    }
    cards.instanceMatrix.needsUpdate = true;
    cards.frustumCulled = false;
    this.cardMesh = cards;
    this.cardBaseOp = 0.11;
    this.root.add(cards);
  }

  private buildSky(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: this.pal.glow,
      transparent: true,
      opacity: 0.055,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(92, 20, 14), mat);
    mesh.name = 'FlyerBassSky';
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    this.skyMesh = mesh;
    this.root.add(mesh);
  }

  /**
   * Drive fog / sky / ring / nebula pulse from music bass 0–1.
   * Fast attack, medium decay. No-op visual rest when bass is 0.
   */
  applyMusicBass(raw: number, dt: number): void {
    const target = Math.max(0, Math.min(1, raw));
    const attack = 1 - Math.exp(-dt * 16);
    const decay = 1 - Math.exp(-dt * 5.5);
    if (target >= this.bassEnv) this.bassEnv += (target - this.bassEnv) * attack;
    else this.bassEnv += (target - this.bassEnv) * decay;
    const p = this.bassEnv;
    this.fogPulseColor.copy(this.fogBaseColor).lerp(this.fogHitColor, p * 0.34);

    if (this.skyMesh) {
      this.skyMesh.position.copy(this._shipPos);
      this.skyMesh.scale.setScalar(1 + p * 0.055);
      const sm = this.skyMesh.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.05 + p * 0.14;
      sm.color.copy(this.fogHitColor).lerp(this.ringBaseColor, 0.35 + p * 0.25);
    }
    if (this.ringMesh) {
      const rm = this.ringMesh.material as THREE.MeshBasicMaterial;
      rm.opacity = this.ringBaseOp + p * 0.26;
      rm.color.copy(this.ringBaseColor).lerp(this.fogHitColor, p * 0.4);
    }
    if (this.cardMesh) {
      const cm = this.cardMesh.material as THREE.MeshBasicMaterial;
      cm.opacity = this.cardBaseOp + p * 0.16;
    }
    const pack = this.root.getObjectByName('FlyerGlbScenery');
    if (!pack) return;
    pack.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const raw = mesh.material;
      const mat = (Array.isArray(raw) ? raw[0] : raw) as THREE.MeshBasicMaterial | undefined;
      if (!mat?.color) return;
      if (mat.userData.bassBaseOp === undefined) {
        mat.userData.bassBaseOp = mat.opacity;
        mat.userData.bassBaseHex = mat.color.getHex();
      }
      mat.opacity = Math.min(1, (mat.userData.bassBaseOp as number) + p * 0.2);
      mat.color.setHex(mat.userData.bassBaseHex as number).lerp(this.fogHitColor, p * 0.3);
    });
  }

  /** Unlit dagger — readable in headless stills (no lights) and when banked. */
  private buildCraft(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'FlyerCraft';
    const hull = new THREE.MeshBasicMaterial({ color: 0xe8f2ff, toneMapped: false, fog: false });
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a2838, toneMapped: false, fog: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0x3cf0ff, toneMapped: false, fog: false });
    const glow = new THREE.MeshBasicMaterial({
      color: 0x66f8ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const accent = new THREE.MeshBasicMaterial({
      color: this.pal.glow,
      toneMapped: false,
      fog: false,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.26, 2.85), hull);
    body.position.z = 0.15;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.25, 7), hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.85;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.62), edge);
    canopy.position.set(0, 0.18, 0.42);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 0.95), dark);
    wing.position.set(0, -0.02, -0.15);
    const wingEdge = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.03, 0.12), edge);
    wingEdge.position.set(0, 0.03, -0.52);
    const lTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.7), accent);
    lTip.position.set(-1.62, 0.02, -0.05);
    const rTip = lTip.clone();
    rTip.position.x = 1.62;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.55), dark);
    fin.position.set(0, 0.38, -1.05);
    const finEdge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.64, 0.08), edge);
    finEdge.position.set(0, 0.38, -1.28);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.38, 8), glow);
    engine.rotation.x = Math.PI / 2;
    engine.position.z = -1.45;
    const lEng = engine.clone();
    lEng.position.set(-0.28, -0.04, -1.38);
    const rEng = engine.clone();
    rEng.position.set(0.28, -0.04, -1.38);
    const halo = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.7, 3.2), glow);
    halo.material = glow.clone();
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.12;
    halo.position.z = 0.05;

    g.add(body, nose, canopy, wing, wingEdge, lTip, rTip, fin, finEdge, engine, lEng, rEng, halo);
    g.traverse((o) => {
      o.frustumCulled = false;
    });
    g.scale.setScalar(1.55);
    return g;
  }

  private buildJuice(): void {
    const p = this.pal;
    const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const streakMat = _addMat(p.accent, 0.42);
    streakMat.fog = false;
    this.streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_COUNT);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 2;
    this.root.add(this.streaks);
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakSlot[i] = hash(i, 41);
      let x = (hash(i, 17) - 0.5) * 16;
      let y = (hash(i, 29) - 0.5) * 9;
      if (Math.hypot(x, y) < 2.4) {
        x += Math.sign(x || 1) * 3.2;
        y += Math.sign(y || 1) * 1.8;
      }
      this.streakXY[i * 2] = x;
      this.streakXY[i * 2 + 1] = y;
    }

    const flashGeo = new THREE.SphereGeometry(0.55, 8, 8);
    for (let i = 0; i < FLASH_POOL; i++) {
      const m = new THREE.Mesh(flashGeo, _addMat(0xffffff, 0));
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      this.root.add(m);
      this.flashes.push(m);
      this.flashLife.push(0);
    }

    this.tracerPos = new Float32Array(6);
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracer = new THREE.Line(
      tGeo,
      new THREE.LineBasicMaterial({
        color: p.glow,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.tracer.renderOrder = 5;
    this.root.add(this.tracer);

    this.lockRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.07, 6, 20), _addMat(p.glow, 0.85));
    this.lockRing.visible = false;
    this.lockRing.frustumCulled = false;
    this.lockRing.renderOrder = 3;
    this.root.add(this.lockRing);
  }

  private scatter(): void {
    const S = this.courseLen;
    let s = 22;
    let i = 0;
    while (s < S - 18) {
      const roll = hash(i, 3);
      let kind: Kind = 'solid';
      if (roll > 0.86) kind = 'speed';
      else if (roll > 0.72) kind = 'gate';
      else if (roll > 0.55) kind = 'emp';
      else if (roll > 0.38) kind = 'mine';
      let x = (hash(i, 7) - 0.5) * FLYER_LANE_HALF * 1.7;
      let y = (hash(i, 11) - 0.5) * 3.6;
      if (kind === 'gate') {
        x *= 0.45;
        y *= 0.22;
      } else if (kind === 'speed') {
        x *= 0.22;
        y *= 0.22;
      } else if (kind === 'mine' || kind === 'emp') {
        x = Math.sign(x || 1) * (FLYER_LANE_HALF * 0.55 + Math.abs(x) * 0.28);
      }
      const r = kind === 'gate' ? 1.5 : kind === 'speed' ? 1.1 : 1.05;
      const mesh = this.makeMesh(kind, r);
      mesh.visible = false;
      this.root.add(mesh);
      this.nodes.push({ kind, s, x, y, r, mesh, alive: true });
      i++;
      s += 9 + hash(i, 13) * 8;
    }
  }

  private makeMesh(kind: Kind, r: number): THREE.Object3D {
    const c = this.col(kind);
    if (kind === 'speed') {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.12, 6, 16),
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.88,
          toneMapped: false,
        })
      );
      ring.rotation.x = Math.PI / 2;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.65, 0.055, 5, 16), _addMat(c, 0.5));
      halo.rotation.x = Math.PI / 2;
      halo.name = 'halo';
      g.add(ring, halo);
      return g;
    }
    if (kind === 'emp') {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(
          new THREE.OctahedronGeometry(r, 0),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.8,
            toneMapped: false,
          })
        )
      );
      const warn = new THREE.Mesh(new THREE.OctahedronGeometry(r * 1.55, 0), _addMat(c, 0.16));
      warn.name = 'warn';
      g.add(warn);
      return g;
    }
    if (kind === 'gate') {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 2.8, 0.28),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.55,
            toneMapped: false,
          })
        )
      );
      const rim = new THREE.Mesh(new THREE.BoxGeometry(3.15, 3.15, 0.1), _addMat(c, 0.35));
      rim.name = 'warn';
      g.add(rim);
      return g;
    }
    const g = new THREE.Group();
    const geo = kind === 'mine' ? new THREE.SphereGeometry(r, 8, 8) : new THREE.BoxGeometry(r * 1.8, r * 1.8, r * 1.8);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
    const warnGeo =
      kind === 'mine' ? new THREE.SphereGeometry(r * 1.75, 8, 8) : new THREE.BoxGeometry(r * 2.4, r * 2.4, r * 2.4);
    const warn = new THREE.Mesh(warnGeo, _addMat(kind === 'mine' ? 0xff3355 : c, 0.14));
    warn.name = 'warn';
    g.add(warn);
    return g;
  }

  private refreshPose(dt: number): void {
    const S = this.courseLen;
    const s = THREE.MathUtils.clamp(this.s, 0, Math.max(0, S - 0.05));
    this.path.sample(s, this._F);
    this.path.sample(Math.min(s + BANK_LOOK, S - 0.05), this._Flook);
    const F = this._F;
    this._shipPos.copy(F.p).addScaledVector(F.r, this.x).addScaledVector(F.u, this.y);
    this._look.copy(this._shipPos).addScaledVector(F.t, this.lookAhead);
    let side = this.camSide + this.x * CAM_STRAFE_FOLLOW;
    if (this.captureCamera) {
      const laneX = this.x + side;
      if (laneX > CAP_LANE_LIMIT) side -= laneX - CAP_LANE_LIMIT;
      if (laneX < -CAP_LANE_LIMIT) side -= laneX + CAP_LANE_LIMIT;
    }
    this._camPos
      .copy(this._shipPos)
      .addScaledVector(F.t, -this.camBack)
      .addScaledVector(F.u, this.camLift)
      .addScaledVector(F.r, side);
    this.craft.position.copy(this._shipPos);
    // Camera stays on the current path frame. Craft looks into the turn and leans
    // into lane strafe so banks / loops / stick read against the coaxial chase.
    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const xVel = (this.x - this.lastX) * invDt;
    const yVel = (this.y - this.lastY) * invDt;
    this._craftT.copy(F.t).lerp(this._Flook.t, LOOK_BLEND);
    if (this._craftT.lengthSq() < 1e-8) this._craftT.copy(F.t);
    else this._craftT.normalize();
    this._craftU.copy(F.u).lerp(this._Flook.u, LOOK_BLEND);
    this._craftU.addScaledVector(this._craftT, -this._craftU.dot(this._craftT));
    if (this._craftU.lengthSq() < 1e-8) this._craftU.copy(F.u);
    else this._craftU.normalize();
    this._craftR.crossVectors(this._craftT, this._craftU);
    if (this._craftR.lengthSq() < 1e-8) this._craftR.copy(F.r);
    else this._craftR.normalize();
    this._craftU.crossVectors(this._craftR, this._craftT).normalize();
    const lean = THREE.MathUtils.clamp(
      -this.x * STRAFE_LEAN - xVel * STRAFE_RATE_LEAN - this.stickX * 0.12,
      -0.55,
      0.55
    );
    const pitch = THREE.MathUtils.clamp(-this.y * Y_LEAN - yVel * 0.02, -0.28, 0.28);
    this._qLean.setFromAxisAngle(this._craftT, lean);
    this._craftR.applyQuaternion(this._qLean);
    this._craftU.applyQuaternion(this._qLean);
    this._qLean.setFromAxisAngle(this._craftR, pitch);
    this._craftT.applyQuaternion(this._qLean);
    this._craftU.applyQuaternion(this._qLean);
    this._craftR.crossVectors(this._craftT, this._craftU).normalize();
    this._craftU.crossVectors(this._craftR, this._craftT).normalize();
    this._mat.makeBasis(this._craftR, this._craftU, this._craftT);
    this.craft.quaternion.setFromRotationMatrix(this._mat);
    this.lastX = this.x;
    this.lastY = this.y;
    if (this.captureCamera || !this.camInited) {
      this._camPosSmooth.copy(this._camPos);
      this._camUpSmooth.copy(F.u);
      this.camInited = true;
    } else {
      const k = 1 - Math.exp(-dt / CAM_SMOOTH_TAU);
      this._camPosSmooth.lerp(this._camPos, k);
      this._camUpSmooth.lerp(F.u, k);
      if (this._camUpSmooth.lengthSq() < 1e-8) this._camUpSmooth.copy(F.u);
      else this._camUpSmooth.normalize();
    }
    this._camPos.copy(this._camPosSmooth);
    this._camUp.copy(this._camUpSmooth);
  }

  shipPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._shipPos);
  }

  lookTarget(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._look);
  }

  camPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._camPos);
  }

  camUp(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._camUp);
  }

  /** Point ahead of the ship along the path tangent (manual ship look). */
  shipAhead(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._shipPos).addScaledVector(this._F.t, 8);
  }

  /**
   * Snap to an arc-length + lane pose (capture stills). Camera unsmoothed.
   */
  seek(s: number, x = 0, y = 0): void {
    this.s = THREE.MathUtils.clamp(s, 0, Math.max(0, this.courseLen - 0.05));
    this.x = THREE.MathUtils.clamp(x, -FLYER_LANE_HALF, FLYER_LANE_HALF);
    this.y = THREE.MathUtils.clamp(y, LANE_Y_MIN, LANE_Y_MAX);
    this.lastX = this.x;
    this.lastY = this.y;
    this.stickX = THREE.MathUtils.clamp(this.x / Math.max(0.1, FLYER_LANE_HALF), -1, 1);
    this.camInited = false;
    this.refreshPose(0);
    this.updateJuice(0, this.lockedNode());
    for (const n of this.nodes) {
      const ds = n.s - this.s;
      if (ds > -2 && ds < 10 && Math.hypot(n.x - this.x, n.y - this.y) < 5.2) {
        n.mesh.visible = false;
      }
    }
  }

  /** Arc-length of highest centerline point (rift hill / loop apex). */
  apexS(): number {
    let bestS = this.courseLen * 0.5;
    let bestY = -Infinity;
    const f = this._Fnode;
    for (let s = 0; s < this.courseLen; s += 3) {
      this.path.sample(s, f);
      if (f.p.y > bestY) {
        bestY = f.p.y;
        bestS = s;
      }
    }
    return bestS;
  }

  craftNdc(camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._shipPos).project(camera);
  }

  consumePunch(): number {
    const p = this.punch;
    this.punch = 0;
    return p;
  }

  consumeFx(): FlyerFxEvent[] {
    if (this.fxQueue.length === 0) return this.fxQueue;
    const q = this.fxQueue.splice(0, this.fxQueue.length);
    return q;
  }

  lockedNode(): Node | null {
    let best: Node | null = null;
    let bestD = FLYER_LOCK_AHEAD;
    for (const n of this.nodes) {
      if (!n.alive || n.kind !== 'gate') continue;
      const ds = n.s - this.s;
      if (ds <= 0 || ds > FLYER_LOCK_AHEAD) continue;
      const xy = Math.hypot(n.x - this.x, n.y - this.y);
      if (xy > FLYER_LOCK_XY) continue;
      if (ds < bestD) {
        bestD = ds;
        best = n;
      }
    }
    return best;
  }

  update(
    dt: number,
    axisX: number,
    axisY: number,
    fire: boolean,
    onHit: (kind: FlyerHitKind, shield: number, hull: number) => boolean
  ): void {
    if (this.finished || this.failed) return;
    this.t += dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.s += FLYER_BASE_SPEED * this.speedMul * dt;
    this.x = THREE.MathUtils.clamp(this.x + axisX * FLYER_STRAFE * dt, -FLYER_LANE_HALF, FLYER_LANE_HALF);
    this.y = THREE.MathUtils.clamp(
      this.y + FLYER_STICK_Y_SIGN * axisY * FLYER_STRAFE * dt,
      LANE_Y_MIN,
      LANE_Y_MAX
    );
    this.stickX = axisX;
    this.refreshPose(dt);

    const lock = this.lockedNode();
    this.lockOn = !!lock;
    if (fire && lock) {
      this.worldAt(lock.s, lock.x, lock.y, this._world);
      this.fxQueue.push({ type: 'lockKill', x: this._world.x, y: this._world.y, z: this._world.z });
      this.punch = Math.max(this.punch, 0.16);
      this.burstFlash(this._world.x, this._world.y, this._world.z, this.pal.glow, 1.35);
      this.fireTracer(this._world.x, this._world.y, this._world.z);
      lock.alive = false;
      lock.mesh.visible = false;
    }

    for (const n of this.nodes) {
      if (!n.alive) continue;
      const ds = n.s - this.s;
      if (ds < -2.5 || ds > 8) continue;
      const d = Math.hypot(n.x - this.x, n.y - this.y, ds);
      if (d > n.r + 0.85) continue;
      this.worldAt(n.s, n.x, n.y, this._world);
      if (n.kind === 'speed') {
        n.alive = false;
        n.mesh.visible = false;
        this.speedMul = Math.min(FLYER_SPEED_MUL_CAP, this.speedMul * FLYER_SPEED_PICKUP_MUL);
        this.fxQueue.push({ type: 'speedPickup', x: this._world.x, y: this._world.y, z: this._world.z });
        this.punch = Math.max(this.punch, 0.07);
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0x66ffaa, 1.1);
        continue;
      }
      if (this.hitCd > 0) continue;
      const kind: FlyerHitKind = n.kind === 'emp' || n.kind === 'mine' || n.kind === 'gate' ? n.kind : 'solid';
      n.alive = false;
      n.mesh.visible = false;
      this.speedMul = 1;
      this.hitCd = FLYER_HIT_COOLDOWN;
      this.hits++;
      const dmg = flyerHitProfile(kind);
      this.fxQueue.push({ type: 'hit', kind, x: this._world.x, y: this._world.y, z: this._world.z });
      this.punch = Math.max(this.punch, 0.2);
      this.burstFlash(this._world.x, this._world.y, this._world.z, 0xff5533, 1.2);
      const died = onHit(kind, dmg.shield, dmg.hull);
      if (died) {
        this.failed = true;
        this.updateJuice(dt, null);
        return;
      }
    }

    this.updateJuice(dt, lock);
    if (this.s >= this.courseLen) this.finished = true;
  }

  private burstFlash(x: number, y: number, z: number, color: number, scale: number): void {
    let idx = this.flashLife.findIndex((life) => life <= 0);
    if (idx < 0) idx = 0;
    const m = this.flashes[idx];
    m.position.set(x, y, z);
    m.scale.setScalar(0.35 * scale);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.95;
    m.visible = true;
    this.flashLife[idx] = 0.2;
  }

  private fireTracer(tx: number, ty: number, tz: number): void {
    this.tracerPos[0] = this._shipPos.x;
    this.tracerPos[1] = this._shipPos.y;
    this.tracerPos[2] = this._shipPos.z;
    this.tracerPos[3] = tx;
    this.tracerPos[4] = ty;
    this.tracerPos[5] = tz;
    const attr = this.tracer.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    (this.tracer.material as THREE.LineBasicMaterial).opacity = 0.95;
    (this.tracer.material as THREE.LineBasicMaterial).color.setHex(this.pal.glow);
    this.tracer.visible = true;
    this.tracerLife = 0.12;
  }

  private updateJuice(dt: number, lock: Node | null): void {
    const len = 1.15 + (this.speedMul - 1) * 4.2;
    const S = this.courseLen;
    for (let i = 0; i < STREAK_COUNT; i++) {
      const slot = ((this.streakSlot[i] - this.s / STREAK_WINDOW) % 1 + 1) % 1;
      const ss = THREE.MathUtils.clamp(this.s - 5 + slot * STREAK_WINDOW, 0, Math.max(0, S - 0.05));
      this.path.sample(ss, this._Fnode);
      this.orient(
        this._Fnode,
        this.streakXY[i * 2],
        this.streakXY[i * 2 + 1],
        1,
        1,
        len
      );
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    const streakMat = this.streaks.material as THREE.MeshBasicMaterial;
    streakMat.opacity = 0.28 + Math.min(0.4, (this.speedMul - 1) * 0.9);

    for (let i = 0; i < FLASH_POOL; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const u = Math.max(0, this.flashLife[i] / 0.2);
      const m = this.flashes[i];
      m.scale.multiplyScalar(1 + dt * 10);
      (m.material as THREE.MeshBasicMaterial).opacity = u * 0.9;
      if (this.flashLife[i] <= 0) m.visible = false;
    }

    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      (this.tracer.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.tracerLife / 0.12);
      if (this.tracerLife <= 0) this.tracer.visible = false;
    }

    if (lock) {
      this.worldAt(lock.s, lock.x, lock.y, this._world);
      this.lockRing.visible = true;
      this.lockRing.position.copy(this._world);
      this._mat.makeBasis(this._Fnode.r, this._Fnode.u, this._Fnode.t);
      this.lockRing.quaternion.setFromRotationMatrix(this._mat);
      this.lockRing.rotateZ(this.t * 6);
      const sc = 1 + Math.sin(this.t * 14) * 0.08;
      this.lockRing.scale.setScalar(sc);
      (this.lockRing.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.t * 18) * 0.25;
    } else {
      this.lockRing.visible = false;
    }

    for (const n of this.nodes) {
      if (!n.alive) {
        n.mesh.visible = false;
        continue;
      }
      const ds = n.s - this.s;
      if (ds < -8 || ds > DRAW_WINDOW) {
        n.mesh.visible = false;
        continue;
      }
      n.mesh.visible = true;
      this.path.sample(n.s, this._Fnode);
      n.mesh.position.copy(this._Fnode.p).addScaledVector(this._Fnode.r, n.x).addScaledVector(this._Fnode.u, n.y);
      this._mat.makeBasis(this._Fnode.r, this._Fnode.u, this._Fnode.t);
      n.mesh.quaternion.setFromRotationMatrix(this._mat);
      const near = THREE.MathUtils.clamp(1 - (ds - 3) / 16, 0, 1);
      if (n.kind === 'speed') {
        n.mesh.rotateZ(this.t * (2.8 + near * 4));
        const pulse = 1 + 0.12 * Math.sin(this.t * 9) + near * 0.28;
        n.mesh.scale.setScalar(pulse);
        const halo = n.mesh.getObjectByName('halo') as THREE.Mesh | undefined;
        if (halo) {
          const hm = halo.material as THREE.MeshBasicMaterial;
          hm.opacity = 0.35 + near * 0.5 + Math.sin(this.t * 11) * 0.12;
        }
      } else {
        const danger = n.kind === 'mine' || n.kind === 'emp' || n.kind === 'solid';
        const pulse = danger ? 1 + near * (0.1 + 0.12 * Math.abs(Math.sin(this.t * 11))) : 1 + near * 0.06;
        n.mesh.scale.setScalar(pulse);
        const warn = n.mesh.getObjectByName('warn') as THREE.Mesh | undefined;
        if (warn) {
          const wm = warn.material as THREE.MeshBasicMaterial;
          wm.opacity = 0.08 + near * (danger ? 0.42 : 0.28) + (danger ? Math.sin(this.t * 16) * 0.08 * near : 0);
        }
      }
    }
  }

  result(levelId: number, hullRatio: number): FlyerResult {
    const stars = flyerStars(hullRatio, this.t, this.parTime);
    return {
      stars,
      lattice: flyerLatticeReward(stars, levelId),
      time: this.t,
      hullRatio,
      hits: this.hits,
      scene: this.sceneId,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh || o instanceof THREE.Line) {
        if (!o.geometry.userData?.shared) o.geometry.dispose();
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => { if (!x.userData?.shared) x.dispose(); });
        else if (!(m as THREE.Material).userData?.shared) (m as THREE.Material).dispose();
      }
    });
    this.root.clear();
    this.nodes = [];
    this.fxQueue.length = 0;
    this.flashes = [];
    this.flashLife = [];
  }
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
