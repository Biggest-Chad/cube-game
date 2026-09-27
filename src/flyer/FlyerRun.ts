/**
 * Auto-forward transit along a banked spline. Stick strafes in the path-local
 * (right, up) frame; hazards live in (s, x, y).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  FLYER_BASE_SPEED,
  FLYER_DEBUG_PATH,
  FLYER_PAR_CRUISE_FRACTION,
  FLYER_HIT_COOLDOWN,
  FLYER_LANE_HALF,
  FLYER_LOCK_AHEAD,
  FLYER_LOCK_XY,
  FLYER_SPEED_MUL_CAP,
  FLYER_SPEED_PICKUP_MUL,
  FLYER_THRUST_BASE,
  FLYER_THRUST_BOOST,
  FLYER_THRUST_HAZARD,
  FLYER_THRUST_MAX,
  FLYER_THRUST_MIN,
  FLYER_THRUST_RECOVER,
  FLYER_THRUST_RECOVER_BOOSTED,
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
import { bus } from '../core/EventBus';
import type { GraphicsQuality } from '../data/graphics';
import { PathFrame, SplinePath } from './SplinePath';
import {
  getFlyerSceneryLib,
  libHasCorridorPack,
  makeHazardProp,
  placeFlyerGlbScenery,
  placeFlyerMidgroundKits,
  preloadFlyerScenery,
  type FlyerSceneryLib,
} from './flyerScenery';
import { buildFlyerSky, brandFillColor, type FlyerSkyHandle } from './flyerSky';
import { texturedPhong } from './flyerSurfaceTex';
import { placeWipeoutGrammar, hideCompetingWipeoutFloors, cullClearLaneIntruders, pathDeckClearY, HIGHWAY_DECK_Y_TOP, pathFrameQuat, applyPathFramePose, hideVoidTravelRoads, streamWipeoutGrammarWindow, freezeFlightStatic, W54_STREAM_AHEAD_M, W54_STREAM_BEHIND_M, W54_FAR_FACADE_AHEAD_M, W54_LIVE_LIGHT_CAP } from './flyerWipeoutGrammar';
import { preloadFlyerCityGlb } from './flyerCityGlb';
import { preloadFlyerCorridorNear, preloadFlyerCorridorFar, getFlyerCorridorLib } from './flyerCorridorGlb';
import { flyerPlayfeel } from './flyerPlayfeel';
import { releaseFlyerLife, tickFlyerLife } from './flyerLife';
import {
  enrichSceneryTextures,
  placeWipeoutTrackDress,
  texturePickupMesh,
} from './flyerTextures';
import {
  flyerDynamics,
  FZERO_WALL_EDGE,
  FZERO_WALL_BOUNCE,
  FZERO_WALL_COOLDOWN,
} from './flyerDynamics';
import { loadHeroVisual } from '../player/heroGlb';
import {
  layoutInteractives,
  makeInteractVisual,
  makeFinishScenery,
  RING_CHAIN_N,
  RING_BOOST_THRUST,
  ENEMY_FRAG_REWARD,
  ENEMY_LATTICE_BONUS,
  RING_FRAG_REWARD,
  RING_LATTICE_BONUS,
  type InteractKind,
} from './flyerInteractives';

type Kind = 'solid' | 'emp' | 'mine' | 'gate' | 'speed' | 'shield' | 'hull' | 'obstruction' | 'enemy' | 'ring' | 'portal';

interface Node {
  kind: Kind;
  s: number;
  x: number;
  y: number;
  r: number;
  mesh: THREE.Object3D;
  alive: boolean;
  stage?: number;
  /** Enemy rest lane. Drift is applied around this so a cruise does not ram them. */
  homeX?: number;
}

export interface FlyerResult {
  stars: 1 | 2 | 3;
  lattice: number;
  time: number;
  hullRatio: number;
  hits: number;
  scene: FlyerSceneId;
  bonusFrag: number;
  bonusLattice: number;
  ringChains: number;
  enemiesKilled: number;
}

export type FlyerFxEvent =
  | { type: 'lockKill'; x: number; y: number; z: number }
  | { type: 'gatePass'; x: number; y: number; z: number }
  | { type: 'speedPickup'; x: number; y: number; z: number; chain: number }
  | { type: 'shieldPickup'; x: number; y: number; z: number }
  | { type: 'hullPickup'; x: number; y: number; z: number }
  | { type: 'enemyKill'; x: number; y: number; z: number; frag: number; lattice: number; combo: number }
  | { type: 'laneClear'; x: number; y: number; z: number }
  | { type: 'ringPass'; x: number; y: number; z: number; stage: number; total: number }
  | { type: 'ringComplete'; x: number; y: number; z: number; frag: number; lattice: number }
  | { type: 'portalEnter'; x: number; y: number; z: number }
  | { type: 'hit'; kind: FlyerHitKind; x: number; y: number; z: number }
  | { type: 'scrape'; x: number; y: number; z: number };

export type FlyerRunOptions = {
  /** Path ribbon for capture / debug. Overrides FLYER_DEBUG_PATH when set. */
  debugRibbon?: boolean;
  /**
   * 3/4 chase used by stills: ship sits mid-frame with a readable nose/bank.
   * Playable transit keeps a coaxial chase (hero mesh).
   */
  captureCamera?: boolean;
  /** Sky-establish stills: more lift, look up, less side so the equirect dome is in frame. */
  captureSky?: boolean;
  /** Graphics tier â€” scales caps, walls, fog, sky tessellation. */
  quality?: GraphicsQuality;
};

const PALETTE: Record<FlyerSceneId, { fog: number; accent: number; fill: number; glow: number }> = {
  canyon: { fog: 0x0c101c, accent: 0x44f0ff, fill: 0x12141c, glow: 0xff3aa8 }, // WAVE37 night
  wormhole: { fog: 0x0a0814, accent: 0xb44cff, fill: 0x1a0828, glow: 0x66e8ff },
  yard: { fog: 0x0a141c, accent: 0x44f0ff, fill: 0x0c1820, glow: 0xff6622 }, // WAVE37 night
  rift: { fog: 0x080e18, accent: 0x9ef2ff, fill: 0x0a1018, glow: 0xaa88cc }, // WAVE37 night
};

const STREAK_COUNT = 40;
const BOLT_POOL = 14;
const WAKE_SEGS = 16;
const STREAK_WINDOW = 52;
const FLASH_POOL = 4;
/** Playable chase (coaxial). Capture stills use the 3/4 offsets below. */
/** WAVE40 F-Zero Blue Falcon chase: FULL craft silhouette — never inside hull. */
const CAM_BACK = 8.6;
const CAM_UP = 2.35;
const CAM_SIDE = 0.15;
const CAM_STRAFE_FOLLOW = 0.42;
const LOOK_AHEAD = 17;
const CAP_CAM_BACK = 10.4;
const CAP_CAM_UP = 3.15;
const CAP_CAM_SIDE = 1.65;
const CAP_LOOK_AHEAD = 9.5;
const CAP_SKY_BACK = 10.4;
const CAP_SKY_UP = 3.1;
const CAP_SKY_SIDE = 1.85;
const CAP_SKY_LOOK = 9.4;
const CAP_SKY_AIM_UP = 6.2;
const CAP_LANE_LIMIT = 5.8;
const CAM_SMOOTH_TAU = 0.05;
const DRAW_WINDOW = 100;
const LANE_Y_MIN = -3.4;
const LANE_Y_MAX = 4.2;
const RING_SPACING = 14;
/** Strafe lean rolls around path tangent only â€” no look-ahead yaw (crab-walk fix). */
const STRAFE_LEAN = 0.14;
const STRAFE_RATE_LEAN = 0.06;

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
  readonly parTime: number;
  s = 0;
  x = 0;
  y = 0;
  speedMul = 1;
  /** Thrust percent - base 100; boost >100; hazard <100; recovers to 100. */
  thrust = FLYER_THRUST_BASE;
  /** BOOST pickups collected inside the chain window. */
  private boostChain = 0;
  private boostChainAt = -10;
  /** False until cube->flyer countdown finishes. */
  armed = false;
  t = 0;
  hits = 0;
  finished = false;
  ringStage = 0;
  ringChains = 0;
  enemiesKilled = 0;
  bonusFrag = 0;
  bonusLattice = 0;
  private endPortal: THREE.Object3D | null = null;
  private finishScenery: THREE.Object3D | null = null;
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
  private readonly _pathZ = new THREE.Vector3();
  private readonly _F = new PathFrame();
  private readonly _Fnode = new PathFrame();
  private readonly _shipPos = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _scratch = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _camUp = new THREE.Vector3(0, 1, 0);
  private readonly _camPosSmooth = new THREE.Vector3();
  private readonly _camUpSmooth = new THREE.Vector3(0, 1, 0);
  private readonly _camUpBlend = new THREE.Vector3(0, 1, 0);
  private readonly _world = new THREE.Vector3();
  private readonly _craftR = new THREE.Vector3();
  private readonly _craftU = new THREE.Vector3();
  private readonly _craftT = new THREE.Vector3();
  private readonly _qLean = new THREE.Quaternion();
  private camInited = false;
  private lastX = 0;
  private lastY = 0;
  private stickX = 0;
  /** WAVE42: lateral velocity (inertia) — not instant stick snap. */
  private strafeVel = 0;
  /** WAVE42: wall-slap cooldown. */
  private wallCd = 0;
  /** Last wall slap this frame (for dynamics juice). */
  private wallSlapPulse = false;
  /** Last arc-length the corridor stream was rebuilt at. */
  private streamAt = -999;
  /** WAVE46: side-lane cyan pad spans that grant thrust when woven. */
  private boostPadTriggers: Array<{ s: number; x: number; halfS: number; halfX: number; used: boolean }> = [];
  private boostPadHoldCd = 0;
  private disposed = false;
  /** WAVE52 wormhole spacetime pulse clock. */
  private _wormPulseT = 0;
  private wormPulseObjs: THREE.Object3D[] | null = null;
  private readonly fxQueue: FlyerFxEvent[] = [];

  private streaks!: THREE.InstancedMesh;
  private streakSlot = new Float32Array(STREAK_COUNT);
  private streakXY = new Float32Array(STREAK_COUNT * 2);
  /** WAVE39 Blue-Falcon thruster plumes (additive) — scale with speed/boost. */
  private thrusterPlumes: THREE.Mesh[] = [];
  private thrusterMats: THREE.MeshBasicMaterial[] = [];
  private thrusterNodes: THREE.Object3D[] = [];
  private flashes: THREE.Mesh[] = [];
  private flashLife: number[] = [];
  private tracer!: THREE.Line;
  private tracerPos!: Float32Array;
  private tracerLife = 0;
  private shotCd = 0;
  private gunWasDown = false;
  private lastFovKickS = -100;
  private killChain = 0;
  private killChainAt = -10;
  private readonly bolts: Array<{
    mesh: THREE.Mesh;
    active: boolean;
    life: number;
    pos: THREE.Vector3;
    prev: THREE.Vector3;
    vel: THREE.Vector3;
  }> = [];
  private wakeMesh!: THREE.InstancedMesh;
  private readonly wakePts: THREE.Vector3[] = [];
  private readonly _boltFwd = new THREE.Vector3(0, 0, -1);
  private readonly _boltQ = new THREE.Quaternion();
  private lockRing!: THREE.Mesh;
  readonly craft: THREE.Group;
  private ribbon: THREE.Object3D;
  /** Fog color after bass envelope â€” Game copies onto scene.fog only, never the HDRI. */
  readonly fogPulseColor = new THREE.Color();
  private readonly fogBaseColor = new THREE.Color();
  private readonly fogHitColor = new THREE.Color();
  private bassEnv = 0;
  private sky: FlyerSkyHandle | null = null;
  private readyP: Promise<void> = Promise.resolve();
  private craftReady: Promise<void> = Promise.resolve();
  private ringMesh: THREE.InstancedMesh | null = null;
  private cardMesh: THREE.InstancedMesh | null = null;
  private glbPack: THREE.Object3D | null = null;
  private builtWalls = false;
  private ringBaseOp = 0.22;
  private cardBaseOp = 0.11;
  private readonly ringBaseColor = new THREE.Color();
  private readonly captureCamera: boolean;
  private readonly captureSky: boolean;
  private readonly quality: GraphicsQuality;
  private readonly camBack: number;
  private readonly camLift: number;
  private readonly camSide: number;
  private readonly lookAhead: number;
  /** Equirect JPEG â€” Game assigns as scene.background; dome also maps it. */
  get skyTexture(): THREE.Texture | null {
    return this.sky?.texture ?? null;
  }

  /** WAVE14: Color floor for scene.background - never pure black on grounded scenes. */
  get brandBackground(): THREE.Color {
    return brandFillColor(this.sceneId);
  }

  /** Sky JPEG + kitbash scenery + hero craft (capture waits on this). */
  whenReady(): Promise<void> {
    return this.readyP;
  }

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
    this.captureSky = !!opts.captureSky;
    this.quality = opts.quality ?? 'medium';
    this.camBack = this.captureSky ? CAP_SKY_BACK : this.captureCamera ? CAP_CAM_BACK : CAM_BACK;
    this.camLift = this.captureSky ? CAP_SKY_UP : this.captureCamera ? CAP_CAM_UP : CAM_UP;
    this.camSide = this.captureSky ? CAP_SKY_SIDE : this.captureCamera ? CAP_CAM_SIDE : CAM_SIDE;
    this.lookAhead = this.captureSky ? CAP_SKY_LOOK : this.captureCamera ? CAP_LOOK_AHEAD : LOOK_AHEAD;
    // WAVE28: fog matches sky dome hue; denser far blend so megaShell meets horizon (no teal/black void)
    const groundedFog = this.sceneId !== 'wormhole';
    // WAVE32: nearer fog so megaShell dissolves into bright dusk (sky reads, not purple void wall)
    this.fogNear = groundedFog ? (this.captureCamera || this.captureSky ? 35 : 28) : (this.captureCamera || this.captureSky ? 58 : 42);
    this.fogFar =
      groundedFog
        ? this.captureCamera || this.captureSky
          ? 220
          : this.quality === 'low'
            ? 160
            : this.quality === 'medium'
              ? 190
              : 210
        : this.captureCamera || this.captureSky
          ? 520
          : this.quality === 'low'
            ? 260
            : this.quality === 'medium'
              ? 380
              : 460;
    if (groundedFog) {
      this.fogColor = this.sceneId === 'canyon' ? 0x0c101c : this.sceneId === 'yard' ? 0x0a141c : 0x080e18; // WAVE37 night
      this.fogBaseColor.setHex(this.fogColor);
      this.fogPulseColor.copy(this.fogBaseColor);
    }
    this.path = new SplinePath(flyerTrackPoints(sceneId));
    this.courseLen = this.path.length;
    this.parTime = Math.max(40, Math.round((this.courseLen / FLYER_BASE_SPEED) * FLYER_PAR_CRUISE_FRACTION));
    this.root.name = 'FlyerRun';
    // WAVE13 playfeel hooks (thrust/transition) â€” HUD chrome may be wired by parallel agent.
    this.root.userData.flyerPlayfeel = flyerPlayfeel;
    this.craft = this.buildCraft();
    this.root.add(this.craft);
    // WAVE4 T-W4-04: local lights so craft+kits cohere (no PointLights).
    // WAVE5b: cooler/darker hemi ground so canyon/yard floors don't crush craft.
    const hemi = new THREE.HemisphereLight(0x6a88b0, 0x05060a, this.sceneId === 'yard' || this.sceneId === 'canyon' ? 0.48 : 0.85);
    hemi.name = 'FlyerLocalHemi';
    this.root.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2e0, this.sceneId === 'yard' || this.sceneId === 'canyon' ? 1.15 : 1.7);
    key.position.set(5, 12, 4);
    key.name = 'FlyerLocalKeyLight';
    this.root.add(key);
    // One hemisphere + one key. Extra directionals multiplied every lit fragment.
    this.ribbon = this.path.makeDebugRibbon(this.pal.accent);
    // WAVE20: hide cyan debug ribbon â€” highway asphalt deck owns chase
    this.ribbon.visible = false;
    this.root.add(this.ribbon);
    this.buildDecor();
    this.buildJuice();
    this.scatter();
    // WAVE20: skip candy midground â€” industrial kits from grammar
    // placeFlyerMidgroundKits(this.root, this.path, this.sceneId, this.pal, this.quality);
    // WAVE20: skip dress ribbons â€” checker boosts only
    // placeWipeoutTrackDress(this.root, this.path, this.sceneId, this.pal, this.quality);
    // WAVE54: critical path = craft + path ribbon + near grammar window ONLY.
    // Full corridor/city/scenery GLB preload at t=0 is forbidden.
    enrichSceneryTextures(this.root, this.sceneId, this.quality);
    placeWipeoutGrammar(this.root, this.path, this.sceneId, this.pal, this.quality);
    if (this.sceneId === 'wormhole') hideVoidTravelRoads(this.root);
    this.ribbon.visible = false;
    hideCompetingWipeoutFloors(this.root);
    cullClearLaneIntruders(this.root, this.path);
    this.ensureCraftVisible();

    const nearReady = preloadFlyerCorridorNear().then(() => {
      if (this.disposed) return;
      this.rebuildInteractivesFromKit();
      // Re-place ONLY after near kit arrives — still windowed (no full-course instantiate).
      placeWipeoutGrammar(this.root, this.path, this.sceneId, this.pal, this.quality);
      if (this.sceneId === 'wormhole') hideVoidTravelRoads(this.root);
      this.ribbon.visible = false;
      hideCompetingWipeoutFloors(this.root);
      cullClearLaneIntruders(this.root, this.path);
      this.ensureCraftVisible();
    });

    // WAVE54: first paint waits sky + craft + near corridor module only.
    this.readyP = Promise.all([
      this.sky?.ready ?? Promise.resolve(),
      this.craftReady,
      nearReady,
    ]).then(() => undefined);

    // Defer city / scenery / far façades until after first frames (or when approaching).
    void Promise.resolve().then(() => {
      if (this.disposed) return;
      const deferFar = () => {
        if (this.disposed) return;
        void preloadFlyerCorridorFar().then(() => {
          if (this.disposed) return;
          placeWipeoutGrammar(this.root, this.path, this.sceneId, this.pal, this.quality);
          if (this.sceneId === 'wormhole') hideVoidTravelRoads(this.root);
          this.ribbon.visible = false;
          hideCompetingWipeoutFloors(this.root);
          cullClearLaneIntruders(this.root, this.path);
          this.ensureCraftVisible();
        });
        // GLB scenery instances were hidden every run and still walked the scene graph.
        this.glbPack = null;
        void Promise.all([
          Promise.resolve(),
          preloadFlyerScenery().then((lib) => {
            if (this.disposed) return;
            this.upgradeHazardVisuals(lib);
            enrichSceneryTextures(this.root, this.sceneId, this.quality);
            if (this.sceneId === 'wormhole') hideVoidTravelRoads(this.root);
            this.ribbon.visible = false;
            hideCompetingWipeoutFloors(this.root);
            cullClearLaneIntruders(this.root, this.path);
            this.ensureCraftVisible();
          }),
          preloadFlyerCityGlb().then(() => {
            if (this.disposed) return;
            enrichSceneryTextures(this.root, this.sceneId, this.quality);
            if (this.sceneId === 'wormhole') hideVoidTravelRoads(this.root);
            hideCompetingWipeoutFloors(this.root);
            cullClearLaneIntruders(this.root, this.path);
            this.ensureCraftVisible();
          }),
        ]);
      };
      // Two rAFs ≈ after first presented frames
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(deferFar));
      } else {
        setTimeout(deferFar, 32);
      }
    });

    this.tightenSky();
    this.refreshPose(0);
    this.updateJuice(0, null);
    freezeFlightStatic(this.root);
  }

  /** Drop fullscreen transparent sky shells. The equirect dome and horizon band stay. */
  private tightenSky(): void {
    if (!this.sky || this.sceneId === 'wormhole') return;
    for (const name of ['FlyerDuskDome', 'FlyerGroundVeil', 'FlyerGroundVeilSoft', 'FlyerEquatorShade', 'FlyerBassSky']) {
      const o = this.sky.group.getObjectByName(name);
      if (o) o.visible = false;
    }
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


  /** WAVE42: telegraph ring/color only — no BOOST+/HAZARD/GATE lecture billboards. */
  private attachMarkTag(parent: THREE.Object3D, kind: Kind, r: number): void {
    const good = kind === 'speed' || kind === 'shield' || kind === 'hull' || kind === 'ring';
    const gate = kind === 'gate' || kind === 'portal';
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * (good ? 1.95 : 1.7), 0.045, 5, 18),
      _addMat(good ? 0x66ffaa : gate ? 0xff3aa8 : 0xff3355, good ? 0.55 : 0.42)
    );
    ring.rotation.x = Math.PI / 2;
    ring.name = 'markRing';
    parent.add(ring);
    parent.userData.mark = kind === 'enemy' ? 'enemy' : kind === 'portal' ? 'portal' : good ? 'boost' : gate ? 'gate' : 'hazard';
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
    pathFrameQuat(f, this.dummy.quaternion);
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
    this.sky = buildFlyerSky(this.sceneId, this.pal, this.quality);
    this.root.add(this.sky.group);

    // Full-course coherence boxes used to be built here and then hidden.
    // They never drew, but every mesh still recomposed its matrix each frame.

    const worm = this.sceneId === 'wormhole';
    // WAVE12: denser neon cards (wormhole helix void fill; bank framing).
    const cardN = worm ? (this.quality === 'low' ? 14 : 22) : this.quality === 'low' ? 10 : 18;
    const cardMat = _addMat(worm ? 0xff44dd : p.accent, worm ? 0.22 : 0.1);
    const cardGeo = new THREE.PlaneGeometry(worm ? 22 : 14, worm ? 14 : 9);
    const cards = new THREE.InstancedMesh(cardGeo, cardMat, cardN);
    for (let i = 0; i < cardN; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const s = Math.min(S - 1, 18 + i * Math.max(28, (S - 60) / cardN));
      this.path.sample(s, this._Fnode);
      this.orient(
        this._Fnode,
        side * (worm ? 13.5 : 15.5) + (i % 3) * 1.4,
        (worm ? 3.2 : 1.6) + (i % 4) * 0.7,
        1,
        1,
        1
      );
      this.dummy.rotateY(side * -0.55);
      this.dummy.updateMatrix();
      cards.setMatrixAt(i, this.dummy.matrix);
    }
    cards.instanceMatrix.needsUpdate = true;
    cards.computeBoundingSphere();
    cards.frustumCulled = true;
    cards.name = 'FlyerNeonCityCard';
    this.cardMesh = cards;
    this.cardBaseOp = worm ? 0.22 : 0.1;
    // WAVE21b HOTFIX: hide oversized accent brand plates on grounded chase
    if (!worm) {
      cards.visible = false;
      cards.userData.FlyerWipeoutHideCompeting = true;
    }
    this.root.add(cards);
  }

  /** Procedural torus fallback only â€” kitbash corridor/rings replace these. */
  private buildWireRings(): void {
    if (this.ringMesh) return;
    const p = this.pal;
    const S = this.courseLen;
    const ringSpacing =
      this.quality === 'low' ? RING_SPACING * 2 : this.quality === 'medium' ? RING_SPACING * 1.35 : RING_SPACING;
    const n = Math.max(this.quality === 'low' ? 10 : 16, Math.floor(S / ringSpacing));
    const rings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(this.sceneId === 'wormhole' ? 8.4 : 9.6, 0.16, 6, 20),
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
    rings.computeBoundingSphere();
    rings.frustumCulled = true;
    rings.name = 'FlyerWireRings';
    this.ringMesh = rings;
    this.ringBaseOp = this.sceneId === 'wormhole' ? 0.35 : 0.22;
    this.root.add(rings);
  }

  private buildWallsAndFloors(): void {
    if (this.builtWalls || this.sceneId === 'wormhole') return;
    this.builtWalls = true;
    const p = this.pal;
    const S = this.courseLen;
    const pack = new THREE.Group();
    pack.name = 'FlyerGroundHorizon';
    this.root.add(pack);

    // Layered fog cards (soft distance planes â€” kill flat bright floor slabs).
    const fogN = this.quality === 'low' ? 6 : 10;
    const fogGeo = new THREE.PlaneGeometry(28, 10);
    for (let i = 0; i < fogN; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: this.sceneId === 'yard' ? 0x060504 : this.sceneId === 'canyon' ? 0x040810 : p.fog,
        transparent: true,
        opacity: 0.38 + (i % 3) * 0.08,
        depthWrite: false,
        toneMapped: false,
        fog: true,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(fogGeo, mat);
      const sPos = Math.min(S - 1, 8 + i * ((S - 20) / fogN));
      this.path.sample(sPos, this._Fnode);
      this.orient(this._Fnode, (i % 2 === 0 ? 1 : -1) * (6 + i * 0.35), -0.4 + (i % 4) * 0.35, 1.1, 1, 1);
      this.dummy.rotateX(-0.55);
      this.dummy.updateMatrix();
      m.matrixAutoUpdate = false;
      m.matrix.copy(this.dummy.matrix);
      m.frustumCulled = true;
      pack.add(m);
    }

    // Parallax silhouette strips along corridor flanks.
    // T-LIVE-R1-03: denser distant flank silhouettes in chase.
    // WAVE12 denser flank silhouettes.
    const silN = this.quality === 'low' ? 22 : 40;
    const silGeo = new THREE.BoxGeometry(1, 1, 1);
    const silMat = new THREE.MeshPhongMaterial({
      color: this.sceneId === 'rift' ? 0x061018 : this.sceneId === 'yard' ? 0x100c08 : 0x080e14,
      emissive: new THREE.Color(p.glow).multiplyScalar(0.02),
      toneMapped: false,
      fog: true,
    });
    const sils = new THREE.InstancedMesh(silGeo, silMat, silN);
    for (let i = 0; i < silN; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const h = this.sceneId === 'rift' ? 5 + (i % 4) * 1.8 : 7 + (i % 6) * 2.4;
      const sPos = Math.min(S - 1, 10 + i * ((S - 24) / silN));
      this.path.sample(sPos, this._Fnode);
      this.orient(this._Fnode, side * (11.5 + (i % 5) * 1.6), h * 0.42 - 1.2, 1.8 + (i % 2), h * 1.15, 2.6);
      sils.setMatrixAt(i, this.dummy.matrix);
    }
    sils.instanceMatrix.needsUpdate = true;
    sils.computeBoundingSphere();
    sils.frustumCulled = true;
    sils.name = 'FlyerParallaxSilhouette';
    pack.add(sils);

    // WAVE13 neon megacity chase billboards â€” brighter, taller, fog:false so horizon reads in 3/4 chase.
    {
      const cityN = this.quality === 'low' ? 24 : 40;
      const cityGeo = new THREE.BoxGeometry(1, 1, 1);
      const cityMat = new THREE.MeshPhongMaterial({
        color: this.sceneId === 'rift' ? 0x081820 : this.sceneId === 'yard' ? 0x101820 : 0x0a1018,
        emissive: new THREE.Color(p.glow).multiplyScalar(0.22),
        toneMapped: false,
        fog: false,
      });
      const cities = new THREE.InstancedMesh(cityGeo, cityMat, cityN);
      for (let i = 0; i < cityN; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const h = 12 + (i % 7) * 3.2;
        const sPos = Math.min(S - 1, 6 + i * ((S - 16) / cityN));
        this.path.sample(sPos, this._Fnode);
        // Sit just outside coherence walls so skyline peeks above corridor dress.
        this.orient(
          this._Fnode,
          side * (7.8 + (i % 4) * 1.2),
          h * 0.55 - 0.2,
          2.8 + (i % 3) * 0.9,
          h,
          1.8 + (i % 2) * 0.8
        );
        cities.setMatrixAt(i, this.dummy.matrix);
      }
      cities.instanceMatrix.needsUpdate = true;
      cities.computeBoundingSphere();
      cities.frustumCulled = true;
      cities.name = 'FlyerNeonCityChase';
      pack.add(cities);
      const edgeN = this.quality === 'low' ? 18 : 30;
      const edgeGeo = new THREE.BoxGeometry(0.22, 1, 0.22);
      const edgeMat = new THREE.MeshPhongMaterial({
        color: p.accent,
        emissive: new THREE.Color(p.glow),
        emissiveIntensity: 1.35,
        toneMapped: false,
        fog: false,
      });
      const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, edgeN);
      for (let i = 0; i < edgeN; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const h = 10 + (i % 5) * 3.2;
        const sPos = Math.min(S - 1, 8 + i * ((S - 18) / edgeN));
        this.path.sample(sPos, this._Fnode);
        this.orient(this._Fnode, side * (8.2 + (i % 3) * 0.9), h * 0.55, 1, h, 1);
        edges.setMatrixAt(i, this.dummy.matrix);
      }
      edges.instanceMatrix.needsUpdate = true;
      edges.computeBoundingSphere();
      edges.frustumCulled = true;
      edges.name = 'FlyerNeonCityEdgeChase';
      pack.add(edges);
    }

    // WAVE14 WIPEOUT SHELL: continuous TEXTURED deck + dual wall ribbons fill chase L/R; sky fill above.
    {
      const grounded = true;
      const neon = this.pal.glow;
      const accent = this.pal.accent;
      const floorN = this.quality === 'low' ? 96 : 140;
      const floorGeo = new THREE.BoxGeometry(1, 1, 1);
      const floorKind = 'deck';
      const floorCol = 0xffffff;
      const floorMat = texturedPhong(floorCol, this.quality, floorKind as 'deck' | 'ice', accent);
      // WAVE14: raise graphite deck under craft so chase sees plated road (not floating ribbon-only).
      const floors = new THREE.InstancedMesh(floorGeo, floorMat, floorN);
      for (let i = 0; i < floorN; i++) {
        const sPos = Math.min(S - 1, 0.5 + i * ((S - 2) / floorN));
        const w = this.sceneId === 'yard' ? 26 : this.sceneId === 'rift' ? 22 : 24;
        this.path.sample(sPos, this._Fnode);
        this.orient(this._Fnode, 0, -0.85, w, 0.85, 6.2);
        floors.setMatrixAt(i, this.dummy.matrix);
      }
      floors.instanceMatrix.needsUpdate = true;
      floors.computeBoundingSphere();
      floors.frustumCulled = true;
      floors.name = 'FlyerHardCoherenceFloor';
      pack.add(floors);

      const wallN = this.quality === 'low' ? 120 : 180;
      const wallKind = this.sceneId === 'rift' ? 'ice' : 'wall';
      const wallCol = this.sceneId === 'yard' ? 0x5a6570 : this.sceneId === 'rift' ? 0x4a4860 : 0x5a6a78;
      const wallMat = texturedPhong(wallCol, this.quality, wallKind as 'wall' | 'ice', neon);
      const walls = new THREE.InstancedMesh(floorGeo, wallMat, wallN);
      for (let i = 0; i < wallN; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const sPos = Math.min(S - 1, 0.4 + i * ((S - 2) / wallN));
        const h = 14 + (i % 7) * 2.4;
        const x = side * (this.sceneId === 'rift' ? 4.2 : 4.5);
        this.path.sample(sPos, this._Fnode);
        this.orient(this._Fnode, x, h * 0.5 - 1.35, 1.8, h, 4.8);
        walls.setMatrixAt(i, this.dummy.matrix);
      }
      walls.instanceMatrix.needsUpdate = true;
      walls.computeBoundingSphere();
      walls.frustumCulled = true;
      walls.name = 'FlyerHardCoherenceWall';
      pack.add(walls);

      const wall2N = this.quality === 'low' ? 80 : 120;
      const wall2Mat = texturedPhong(wallCol, this.quality, 'wall', accent);
      const walls2 = new THREE.InstancedMesh(floorGeo, wall2Mat, wall2N);
      for (let i = 0; i < wall2N; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const sPos = Math.min(S - 1, 0.7 + i * ((S - 2) / wall2N));
        const h = 10 + (i % 5) * 2.0;
        this.path.sample(sPos, this._Fnode);
        this.orient(this._Fnode, side * 5.4, h * 0.5 - 1.2, 1.4, h, 4.2);
        walls2.setMatrixAt(i, this.dummy.matrix);
      }
      walls2.instanceMatrix.needsUpdate = true;
      walls2.computeBoundingSphere();
      walls2.frustumCulled = true;
      walls2.name = 'FlyerHardCoherenceWallB';
      pack.add(walls2);

      if (grounded) {
        const skyN = this.quality === 'low' ? 24 : 40;
        const skyMat = new THREE.MeshBasicMaterial({
          color: this.sceneId === 'yard' ? 0x2a4858 : this.sceneId === 'rift' ? 0x1a1830 : 0x3a2048,
          fog: false,
          toneMapped: false,
          depthWrite: false,
        });
        const skys = new THREE.InstancedMesh(floorGeo, skyMat, skyN);
        for (let i = 0; i < skyN; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const sPos = Math.min(S - 1, 1 + i * ((S - 4) / skyN));
          const h = 18 + (i % 4) * 4;
          this.path.sample(sPos, this._Fnode);
          this.orient(this._Fnode, side * (14 + (i % 3) * 2), h * 0.55, 5, h, 1.4);
          skys.setMatrixAt(i, this.dummy.matrix);
        }
        skys.instanceMatrix.needsUpdate = true;
        skys.computeBoundingSphere();
        skys.frustumCulled = true;
        skys.name = 'FlyerHardSkyFill';
        pack.add(skys);
      }
    }
    // WAVE14: black FlyerChaseFogDisk removed (voided mid-frame).
    // WAVE20: kill HardCoherence â€” highway deck + barriers own chase
    hideCompetingWipeoutFloors(this.root);
      cullClearLaneIntruders(this.root, this.path);
      this.ensureCraftVisible();

  }

  /**
   * Drive fog / sky / ring / nebula pulse from music bass 0â€“1.
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

    if (this.sky) this.sky.applyBass(this._shipPos, p, this.fogHitColor, this.ringBaseColor);
    if (this.ringMesh) {
      const rm = this.ringMesh.material as THREE.MeshBasicMaterial;
      rm.opacity = this.ringBaseOp + p * 0.26;
      rm.color.copy(this.ringBaseColor).lerp(this.fogHitColor, p * 0.4);
    }
    if (this.cardMesh) {
      const cm = this.cardMesh.material as THREE.MeshBasicMaterial;
      cm.opacity = this.cardBaseOp + p * 0.16;
    }
  }

  /** Prefer interceptor-v2 / nyx GLB (lit Lambert, cube-mode readable); procedural dagger is the fallback. */
  private buildCraft(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'FlyerCraft';
    const dagger = this.buildProceduralDagger();
    dagger.name = 'FlyerCraftFallback';
    // Procedural dagger is +Z nose; cube/lookAt basis is -Z forward.
    dagger.rotation.y = Math.PI;
    g.add(dagger);
    this.attachThrusterPlumes(g);
    this.craftReady = this.adoptHeroCraft(g).then(() => {
      this.collectThrusterNodes(g);
    });
    return g;
  }

  /** WAVE39: twin additive thruster plumes (Blue Falcon bloom) — parented to craft. */
  private attachThrusterPlumes(host: THREE.Group): void {
    const mk = (x: number) => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb8fff8,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.72, 7, 1, true), mat);
      mesh.rotation.x = Math.PI / 2; // tip along +Z aft (nose is -Z)
      mesh.position.set(x, -0.04, 2.05); // WAVE40 aft of hull
      mesh.name = 'FlyerThrusterPlume';
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      host.add(mesh);
      this.thrusterPlumes.push(mesh);
      this.thrusterMats.push(mat);
    };
    mk(-0.28);
    mk(0.28);
    // core white hot plume
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.55, 6, 1, true), coreMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, -0.03, 1.95);
    core.name = 'FlyerThrusterPlumeCore';
    core.renderOrder = 4;
    core.frustumCulled = false;
    host.add(core);
    this.thrusterPlumes.push(core);
    this.thrusterMats.push(coreMat);
  }

  private collectThrusterNodes(host: THREE.Object3D): void {
    this.thrusterNodes = [];
    host.traverse((o) => {
      const n = o.name || '';
      if (n.startsWith('EngineGlow') || n.includes('Nozzle') || n.startsWith('Plume') || n.startsWith('FlyerThrusterPlume')) {
        this.thrusterNodes.push(o);
      }
    });
  }

  private buildProceduralDagger(): THREE.Group {
    const g = new THREE.Group();
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

  private async adoptHeroCraft(host: THREE.Group): Promise<void> {
    try {
      const hero = await loadHeroVisual();
      if (this.disposed || !host.parent) {
        hero.group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else (m as THREE.Material).dispose();
          }
        });
        return;
      }
      mergeCraftHero(hero.group);
      // WAVE40: center hull on craft origin so chase cam never sits inside AABB
      {
        const box0 = new THREE.Box3().setFromObject(hero.group);
        const center = box0.getCenter(new THREE.Vector3());
        hero.group.position.sub(center);
      }
      hero.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(hero.group);
      const size = box.getSize(new THREE.Vector3());
      const len = Math.max(size.x, size.y, size.z);
      if (len > 1e-4) hero.group.scale.multiplyScalar(7.2 / len);
      // re-center after scale
      {
        const box1 = new THREE.Box3().setFromObject(hero.group);
        const center = box1.getCenter(new THREE.Vector3());
        hero.group.position.sub(center);
      }
      hero.group.name = 'FlyerCraftHero';
      hero.group.visible = true;
      hero.group.traverse((o) => {
        o.frustumCulled = false;
      });
      const fallback = host.getObjectByName('FlyerCraftFallback');
      if (fallback) {
        host.remove(fallback);
        fallback.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            if (!o.geometry.userData?.shared) o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => { if (!x.userData?.shared) x.dispose(); });
            else if (!(m as THREE.Material).userData?.shared) (m as THREE.Material).dispose();
          }
        });
      }
      host.add(hero.group);
      // WAVE22 T-W21b-02: guarantee hero Lit Phong hull is the only craft body (no boost-pad parenting)
      host.traverse((o) => {
        if (o.name === 'FlyerHazard_pads' || o.name === 'FlyerFlatBoostPad') {
          o.visible = false;
          if (o.parent) o.parent.remove(o);
        }
      });
      const heroMesh = host.getObjectByName('FlyerCraftHero');
      if (heroMesh) { heroMesh.visible = true; heroMesh.traverse((o) => { o.visible = true; }); }
    } catch (err) {
      console.warn('[flyer] hero GLB miss â€” procedural dagger', err);
    }
  }

  private buildJuice(): void {
    const p = this.pal;
    const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const streakMat = _addMat(p.accent, 0.58);
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
      m.name = 'FlyerFlash';
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
    this.tracer.name = 'FlyerTracer';
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.tracer.renderOrder = 5;
    this.root.add(this.tracer);

    const boltGeo = new THREE.BoxGeometry(0.08, 0.08, 2.35);
    const boltMat = _addMat(p.glow, 0.95);
    boltMat.fog = false;
    for (let i = 0; i < BOLT_POOL; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.name = 'FlyerGunBolt';
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.root.add(mesh);
      this.bolts.push({
        mesh,
        active: false,
        life: 0,
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }

    const wakeGeo = new THREE.BoxGeometry(0.16, 0.05, 1);
    const wakeMat = _addMat(p.accent, 0.45);
    wakeMat.fog = false;
    this.wakeMesh = new THREE.InstancedMesh(wakeGeo, wakeMat, WAKE_SEGS);
    this.wakeMesh.name = 'FlyerThrusterWake';
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 3;
    this.root.add(this.wakeMesh);
    for (let i = 0; i < WAKE_SEGS + 1; i++) this.wakePts.push(new THREE.Vector3());

    this.lockRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.07, 6, 20), _addMat(p.glow, 0.85));
    this.lockRing.name = 'FlyerLockRing';
    this.lockRing.visible = false;
    this.lockRing.frustumCulled = false;
    this.lockRing.renderOrder = 3;
    this.root.add(this.lockRing);
  }

  private scatter(): void {
    // WAVE43 visible interactives: sparse telegraphed props (NOT densify soup)
    const specs = layoutInteractives(this.courseLen, this.sceneId);
    for (const spec of specs) {
      const kind = spec.kind as Kind;
      const mesh = makeInteractVisual(spec.kind as InteractKind, this.sceneId, spec.stage ?? 0);
      mesh.visible = true;
      if (kind === 'portal') {
        mesh.name = 'FlyerEndPortal';
        this.endPortal = mesh;
      }
      this.root.add(mesh);
      this.nodes.push({
        kind,
        s: spec.s,
        x: spec.x,
        y: spec.y,
        r: spec.r,
        mesh,
        alive: true,
        stage: spec.stage,
        homeX: kind === 'enemy' ? spec.x : undefined,
      });
    }
    this.rebuildBoostPadTriggers();

    const fin = makeFinishScenery(this.sceneId);
    this.finishScenery = fin;
    this.root.add(fin);
  }

  /** WAVE44: rebuild interactive meshes after corridor GLB lib resolves (scatter may have run early). */
  private rebuildInteractivesFromKit(): void {
    const lib = getFlyerCorridorLib();
    if (!lib) return;
    for (const n of this.nodes) {
      if (
        n.kind !== 'speed' &&
        n.kind !== 'shield' &&
        n.kind !== 'hull' &&
        n.kind !== 'enemy' &&
        n.kind !== 'ring' &&
        n.kind !== 'portal' &&
        n.kind !== 'obstruction'
      ) {
        continue;
      }
      const next = makeInteractVisual(n.kind as InteractKind, this.sceneId, n.stage ?? 0);
      next.visible = n.alive;
      if (n.kind === 'portal') {
        next.name = 'FlyerEndPortal';
        this.endPortal = next;
      }
      this.root.remove(n.mesh);
      n.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (!o.geometry.userData?.shared) o.geometry.dispose();
        }
      });
      this.root.add(next);
      n.mesh = next;
    }
    if (this.finishScenery) {
      this.root.remove(this.finishScenery);
      this.finishScenery = null;
    }
    const fin = makeFinishScenery(this.sceneId);
    this.finishScenery = fin;
    this.root.add(fin);
    this.poseEndPortal();
  }


  /** WAVE46: mirror grammar BoostTiles clusters as drive-over speedups (side-lane weave). */
  private rebuildBoostPadTriggers(): void {
    const S = this.courseLen;
    const boostStep = 36;
    const nClusters = Math.max(1, Math.min(3, Math.floor(Math.min(S, 96) / 40)));
    const tilesPer = 8;
    const padW = FLYER_LANE_HALF * 0.28;
    const padL = 8 * 0.72;
    const out: Array<{ s: number; x: number; halfS: number; halfX: number; used: boolean }> = [];
    for (let c = 0; c < nClusters; c++) {
      const jitter = ((c * 17) % 9) - 4;
      const sBase = 48 + c * boostStep + jitter;
      const lane = c % 2 === 0 ? -1 : 1;
      const x = lane * (FLYER_LANE_HALF * 0.55);
      for (let t = 0; t < tilesPer; t++) {
        const sTile = Math.min(S - 6, sBase + t * 9.5);
        out.push({ s: sTile, x, halfS: padL * 0.55, halfX: padW * 0.85 + 0.55, used: false });
      }
    }
    this.boostPadTriggers = out;
  }

  private setBoostPadsVisible(on: boolean): void {
    this.root.traverse((o) => {
      if (
        o.name === 'FlyerWipeoutBoostTiles' ||
        o.name === 'FlyerHazard_pads' ||
        o.name === 'FlyerFlatBoostPad' ||
        o.name === 'CorridorBoostPad' ||
        /BoostTiles|BoostPad/i.test(o.name)
      ) {
        o.visible = on;
      }
    });
  }

  private upgradeHazardVisuals(lib: FlyerSceneryLib): void {
    for (const n of this.nodes) {
      if (n.kind === 'speed' || n.kind === 'shield' || n.kind === 'hull' || n.kind === 'enemy' || n.kind === 'ring' || n.kind === 'portal' || n.kind === 'obstruction') continue; // WAVE43 skip upgrade
      let prop: THREE.Group | null = null;
      if (n.kind === 'gate') prop = makeHazardProp(lib, 'gates', this.col('gate'), this.quality, 3.4);
      else if (n.kind === 'mine' || n.kind === 'emp') {
        prop = makeHazardProp(lib, 'buoys', this.col(n.kind), this.quality, 2.0);
      }
      if (!prop) continue;
      const keep: THREE.Object3D[] = [];
      for (const child of [...n.mesh.children]) {
        if (child.name === 'halo' || child.name === 'warn') {
          keep.push(child);
          continue;
        }
        n.mesh.remove(child);
        if (child instanceof THREE.Mesh) {
          if (!child.geometry.userData?.shared) child.geometry.dispose();
          const m = child.material;
          if (Array.isArray(m)) m.forEach((x) => { if (!x.userData?.shared) x.dispose(); });
          else if (!(m as THREE.Material).userData?.shared) (m as THREE.Material).dispose();
        }
      }
      n.mesh.add(prop);
      for (const k of keep) n.mesh.add(k);
      const mark = n.kind === 'gate' ? 'gate' : 'hazard';
      texturePickupMesh(n.mesh, mark, this.quality);
    }
  }

  /**
   * WAVE22 / T-W21b-01: flush cyan checker DECAL on deck only.
   * PlaneGeometry in path XZ â€” never Box mid-air / camera-tilt wedges.
   * Sized here (not via parent scale) so craft/group transforms cannot blow it up.
   */
  private makeFlatBoostPad(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'FlyerHazard_pads';
    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0x22f0ff).multiplyScalar(0.85),
      shininess: 70,
      specular: new THREE.Color(0x88dddd),
      toneMapped: false,
      fog: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    // local XY plane â†’ rotate to path XZ (right Ã— tangent), thin on deck
    const padW = FLYER_LANE_HALF * 0.5; // â‰¤ ~0.55 * lane half
    const padL = 10;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(padW, padL), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.name = 'FlyerFlatBoostPad';
    mesh.renderOrder = 3;
    g.add(mesh);
    g.userData.deckBoostDecal = true;
    return g;
  }

  private makeMesh(kind: Kind, r: number): THREE.Object3D {
    const c = this.col(kind);
    const lib = getFlyerSceneryLib();
    if (lib) {
      let prop: THREE.Group | null = null;
      if (kind === 'gate') prop = makeHazardProp(lib, 'gates', c, this.quality, 3.4);
      else if (kind === 'speed') {
        const g = new THREE.Group();
        g.name = 'FlyerSpeedPickup';
        g.visible = false;
        return g;
      } else if (kind === 'mine' || kind === 'emp') prop = makeHazardProp(lib, 'buoys', c, this.quality, 2.0);
      if (prop) {
        const g = new THREE.Group();
        g.add(prop);
        const warnGeo =
          kind === 'mine'
            ? new THREE.SphereGeometry(r * 1.75, 8, 8)
            : kind === 'emp'
              ? new THREE.OctahedronGeometry(r * 1.55, 0)
              : new THREE.BoxGeometry(3.15, 3.15, 0.1);
        const warn = new THREE.Mesh(warnGeo, _addMat(kind === 'mine' ? 0xff3355 : c, kind === 'gate' ? 0.35 : 0.16));
        warn.name = 'warn';
        g.add(warn);
        this.attachMarkTag(g, kind, r);
        return g;
      }
    }
    if (kind === 'speed') {
      // WAVE22: invisible speed pickup (grammar BoostTiles = visible cyan checkers)
      const g = new THREE.Group();
      g.name = 'FlyerSpeedPickup';
      g.visible = false;
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
      this.attachMarkTag(g, kind, r);
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
      this.attachMarkTag(g, kind, r);
      return g;
    }
    const g = new THREE.Group();
    // WAVE18: cone spikes not red orbs for mine marks
    const geo = kind === 'mine' ? new THREE.ConeGeometry(r * 0.9, r * 2.4, 5) : new THREE.BoxGeometry(r * 1.8, r * 1.8, r * 1.8);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
    const warnGeo =
      kind === 'mine' ? new THREE.ConeGeometry(r * 1.2, r * 3.0, 5) : new THREE.BoxGeometry(r * 2.4, r * 2.4, r * 2.4);
    const warn = new THREE.Mesh(warnGeo, _addMat(kind === 'mine' ? 0xff3355 : c, 0.14));
    warn.name = 'warn';
    g.add(warn);
    this.attachMarkTag(g, kind, r);
    return g;
  }

  private refreshPose(dt: number): void {
    const S = this.courseLen;
    const s = THREE.MathUtils.clamp(this.s, 0, Math.max(0, S - 0.05));
    this.path.sample(s, this._F);
    const F = this._F;
    // Lateral stick = offset along path binormal (F.r), never yaw.
    this._shipPos.copy(F.p).addScaledVector(F.r, this.x).addScaledVector(F.u, this.y);
    const rush = THREE.MathUtils.clamp(this.speedMul * (flyerDynamics.state.speedScale || 1), 0.75, 1.85);
    this._look.copy(this._shipPos).addScaledVector(F.t, this.lookAhead * (0.82 + rush * 0.28));
    if (this.captureSky) this._look.addScaledVector(F.u, CAP_SKY_AIM_UP);
    let side = this.camSide + this.x * CAM_STRAFE_FOLLOW;
    if (this.captureCamera) {
      const laneX = this.x + side;
      if (laneX > CAP_LANE_LIMIT) side -= laneX - CAP_LANE_LIMIT;
      if (laneX < -CAP_LANE_LIMIT) side -= laneX + CAP_LANE_LIMIT;
    }
    const back = this.camBack * (1 + Math.max(0, rush - 1) * 0.16);
    this._camPos
      .copy(this._shipPos)
      .addScaledVector(F.t, -back)
      .addScaledVector(F.u, this.camLift)
      .addScaledVector(F.r, side);
    this.keepChaseAboveDeck();
    this.craft.position.copy(this._shipPos);
    // WAVE13 COHERENCE: sky overlays (horizon cylinder / neon megacity) must follow craft every pose â€”
    // stills/interactive never call applyMusicBass, so without this chase BG stays at origin = void.
    if (this.sky) {
      this.sky.group.position.copy(this._shipPos);
    }
    // OWNER: nose = cube local -Z (Ship.getForward / placeManual). lookAt so -Z = path tangent.
    // Strafe bank = roll up around tangent only ï¿½ never yaw craft off F.t.
    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const xVel = (this.x - this.lastX) * invDt;
    this._craftT.copy(F.t);
    this._craftU.copy(F.u).addScaledVector(this._craftT, -F.u.dot(this._craftT));
    if (this._craftU.lengthSq() < 1e-8) this._craftU.copy(F.u);
    else this._craftU.normalize();
    const lean = flyerDynamics.state.visualBank;
    this._qLean.setFromAxisAngle(this._craftT, lean);
    this._craftU.applyQuaternion(this._qLean);
    // Same convention as Ship.placeManual: Matrix4.lookAt ? local -Z faces travel.
    this._craftR.copy(this._shipPos).addScaledVector(this._craftT, 8);
    this._mat.lookAt(this._shipPos, this._craftR, this._craftU);
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
      // WAVE52: camera must not roll hard with craft bank — tiny up-blend only.
      const bankFollow = THREE.MathUtils.clamp(Math.abs(flyerDynamics.state.visualBank) / 0.55, 0, 0.22);
      this._camUpBlend.copy(F.u).lerp(this._craftU, bankFollow);
      this._camUpSmooth.lerp(this._camUpBlend, Math.min(1, k * 1.35));
      if (this._camUpSmooth.lengthSq() < 1e-8) this._camUpSmooth.copy(F.u);
      else this._camUpSmooth.normalize();
    }
    this._camPos.copy(this._camPosSmooth);
    this.keepChaseAboveDeck();
    this._camUp.copy(this._camUpSmooth);
  
    this.poseEndPortal();
  }

  /** Pull chase toward the craft if it would pass through the highway deck. Wormhole has no road. */
  private keepChaseAboveDeck(): void {
    if (this.sceneId === 'wormhole') return;
    const F = this._F;
    const minAlong = HIGHWAY_DECK_Y_TOP + 0.42;
    const originUp = F.p.x * F.u.x + F.p.y * F.u.y + F.p.z * F.u.z;
    const camAlong =
      this._camPos.x * F.u.x + this._camPos.y * F.u.y + this._camPos.z * F.u.z - originUp;
    if (camAlong >= minAlong) return;
    const shipAlong =
      this._shipPos.x * F.u.x + this._shipPos.y * F.u.y + this._shipPos.z * F.u.z - originUp;
    const span = shipAlong - camAlong;
    if (span <= 0.05) return;
    const t = Math.min(0.92, (minAlong - camAlong) / span);
    this._camPos.lerp(this._shipPos, t);
    this._camPosSmooth.copy(this._camPos);
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
    // WAVE22b T-W21b-02: keep hull ABOVE deck boost tiles (deckTop~-0.18)
    if (this.sceneId !== 'wormhole' && this.y < 0.12) this.y = 0.12;
    this.lastX = this.x;
    this.lastY = this.y;
    this.strafeVel = 0;
    flyerDynamics.resetSettle();
    this.wallCd = 0;
    this.wallSlapPulse = false;
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

  /** Capture/playfeel: snap near first alive node of mark kind (boost|hazard|gate). */
  seekNearMark(mark: 'boost' | 'hazard' | 'gate', lookBack = 4): boolean {
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const m = (n.mesh.userData?.mark as string) || (n.kind === 'speed' ? 'boost' : n.kind === 'gate' ? 'gate' : 'hazard');
      if (m !== mark) continue;
      this.seek(Math.max(0, n.s - lookBack), n.x * 0.35, n.y * 0.35);
      this.updateJuice(0.016, null);
      return true;
    }
    return false;
  }

  craftNdc(camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._shipPos).project(camera);
  }

  /** Wipeout FOV punch / restore â€” call from Game transit loop. */
  /** WAVE40: clear-lane cull must never leave hero hull invisible. */
  private ensureCraftVisible(): void {
    if (!this.craft) return;
    this.craft.visible = true;
    this.craft.traverse((o) => {
      o.visible = true;
    });
  }

  applyCameraJuice(camera: THREE.PerspectiveCamera): void {
    flyerDynamics.applyFov(camera);
    if (camera.near > 0.08) { camera.near = 0.05; camera.updateProjectionMatrix(); }
  }

  resetCameraJuice(camera: THREE.PerspectiveCamera): void {
    // OrbitalCamera is constructed at fov 55. Do not leave the combat camera at flight FOV.
    flyerDynamics.resetFov(camera, 55);
  }

  consumePunch(): number {

    const p = this.punch;
    this.punch = 0;
    return p;
  }

  /** Begin lane motion after countdown / transfer buildup. */
  armTransit(): void {
    this.armed = true;
    for (const p of this.boostPadTriggers) p.used = false;
    this.boostPadHoldCd = 0;
  }

  setThrust(pct: number): void {
    this.thrust = Math.max(FLYER_THRUST_MIN, Math.min(FLYER_THRUST_MAX, pct));
    this.speedMul = this.thrust / FLYER_THRUST_BASE;
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
      if (!n.alive || (n.kind !== 'gate' && n.kind !== 'enemy')) continue;
      const ds = n.s - this.s;
      if (ds <= 0 || ds > FLYER_LOCK_AHEAD) continue;
      const xy = Math.hypot(n.x - this.x, this.nodeCenterY(n) - this.y);
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
    if (this.disposed || this.finished || this.failed) return;
    this.t += dt;
    this.stepEnemyDrift();
    this.hitCd = Math.max(0, this.hitCd - dt);
    if (this.armed && Math.abs(this.thrust - FLYER_THRUST_BASE) > 0.05) {
      const dir = Math.sign(FLYER_THRUST_BASE - this.thrust);
      // WAVE46: boost linger (slower bleed above base) so perfect pad/ring chains hold ~2x pace
      const recoverRate = this.thrust > FLYER_THRUST_BASE ? FLYER_THRUST_RECOVER_BOOSTED : FLYER_THRUST_RECOVER;
      const step = recoverRate * dt * (0.65 + Math.min(1.4, Math.abs(this.thrust - FLYER_THRUST_BASE) / 40));
      this.thrust += dir * step;
      if (dir > 0 && this.thrust > FLYER_THRUST_BASE) this.thrust = FLYER_THRUST_BASE;
      if (dir < 0 && this.thrust < FLYER_THRUST_BASE) this.thrust = FLYER_THRUST_BASE;
    }
    this.speedMul = this.thrust / FLYER_THRUST_BASE;
    this.wallCd = Math.max(0, this.wallCd - dt);
    this.wallSlapPulse = false;
    // Sample path roll early for bank-drift inertia (no autopilot ease to racing line)
    this.path.sample(THREE.MathUtils.clamp(this.s, 0, Math.max(0, this.courseLen - 0.05)), this._F);
    const pathRoll = this._F.roll;
    const aheadS = Math.min(Math.max(0, this.courseLen - 0.05), this.s + 10);
    this.path.sample(aheadS, this._Fnode);
    const dsK = Math.max(0.5, aheadS - this.s);
    this._pathZ.copy(this._Fnode.t).sub(this._F.t);
    const curveKappa = this._F.r.dot(this._pathZ) / dsK;
    flyerDynamics.update({
      dt,
      thrust: this.thrust,
      speedMul: this.speedMul,
      laneX: this.x,
      stickX: this.stickX,
      boosting: this.thrust > FLYER_THRUST_BASE + 1,
      hazardHit: this.thrust < FLYER_THRUST_BASE - 1,
      pathRoll,
      curveKappa,
      wallSlap: false,
    });
    if (this.armed) {
      this.thrust = flyerDynamics.scrubThrust(this.thrust, dt);
      this.speedMul = this.thrust / FLYER_THRUST_BASE;
    }
    if (!this.armed) {
      this.strafeVel = 0;
      flyerDynamics.stepVisualBank(0, 0, dt);
      this.refreshPose(dt);
      this.updateJuice(dt, null);
      return;
    }
    const turnAuth = flyerDynamics.state.turnAuthority;
    // WAVE42: weighty strafe — accel/decel + bank drift; no instant lane snap / no auto-correct
    this.strafeVel = flyerDynamics.integrateStrafe(
      this.strafeVel,
      axisX,
      curveKappa,
      this.speedMul,
      turnAuth,
      dt
    );
    this.x += this.strafeVel * dt;
    // Wall / curb / rail slap — lose speed, scrape, recovery (F-Zero wall slap)
    const edgeLim = FLYER_LANE_HALF * FZERO_WALL_EDGE;
    if (Math.abs(this.x) >= edgeLim) {
      const outward = Math.sign(this.x) || 1;
      const hittingOut = this.strafeVel * outward > 0.15 || Math.abs(this.x) > FLYER_LANE_HALF;
      this.x = THREE.MathUtils.clamp(this.x, -FLYER_LANE_HALF, FLYER_LANE_HALF);
      if (hittingOut && this.wallCd <= 0) {
        this.thrust = flyerDynamics.applyWallSlap(this.thrust);
        this.speedMul = this.thrust / FLYER_THRUST_BASE;
        this.strafeVel = -outward * Math.abs(this.strafeVel) * FZERO_WALL_BOUNCE;
        this.wallCd = FZERO_WALL_COOLDOWN;
        this.wallSlapPulse = true;
        this.punch = Math.max(this.punch, 0.18);
        this.worldAt(this.s, this.x, this.y, this._world);
        this.fxQueue.push({ type: 'scrape', x: this._world.x, y: this._world.y, z: this._world.z });
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0xff8844, 0.95);
        flyerPlayfeel.applyFail(18);
      } else if (hittingOut) {
        this.strafeVel = -outward * Math.abs(this.strafeVel) * FZERO_WALL_BOUNCE;
      }
    }
    if (this.wallSlapPulse) {
      flyerDynamics.update({
        dt: 0,
        thrust: this.thrust,
        speedMul: this.speedMul,
        laneX: this.x,
        stickX: axisX,
        boosting: this.thrust > FLYER_THRUST_BASE + 1,
        hazardHit: true,
        pathRoll,
        wallSlap: true,
      });
    }
    this.s += FLYER_BASE_SPEED * this.speedMul * flyerDynamics.state.speedScale * dt;
    // Vertical still stick-rate (secondary); lateral owns the weight feel
    this.y = THREE.MathUtils.clamp(
      this.y + FLYER_STICK_Y_SIGN * axisY * FLYER_STRAFE * 0.92 * turnAuth * dt,
      LANE_Y_MIN,
      LANE_Y_MAX
    );
    // WAVE22b: grounded scenes keep craft above highway deck checkers
    if (this.sceneId !== 'wormhole' && this.y < 0.12) this.y = 0.12;
    this.stickX = axisX;
    flyerDynamics.stepVisualBank(axisX, this.strafeVel, dt);
    this.refreshPose(dt);

    const lock = this.lockedNode();
    this.lockOn = !!lock;
    this.stepGuns(dt, fire);


    // WAVE46: drive-over cyan BoostTiles / corridor pads (side-lane weave = speed incentive)
    if (this.boostPadTriggers.length === 0) this.rebuildBoostPadTriggers();
    if (this.boostPadHoldCd > 0) this.boostPadHoldCd = Math.max(0, this.boostPadHoldCd - dt);
    let onPad = false;
    for (const pad of this.boostPadTriggers) {
      if (Math.abs(this.s - pad.s) > pad.halfS) continue;
      if (Math.abs(this.x - pad.x) > pad.halfX) continue;
      onPad = true;
      if (!pad.used) {
        pad.used = true;
        this.thrust = flyerDynamics.applyBoost(this.thrust);
        this.speedMul = this.thrust / FLYER_THRUST_BASE;
        if (this.s - this.lastFovKickS > 28) {
          flyerDynamics.kickFov(5);
          this.lastFovKickS = this.s;
        }
        flyerPlayfeel.applyBoost(16);
        this.punch = Math.max(this.punch, 0.08);
      }
    }
    if (onPad && this.boostPadHoldCd <= 0) {
      // linger while skating a tile sequence
      this.thrust = Math.min(FLYER_THRUST_MAX, this.thrust + 48 * dt);
      this.speedMul = this.thrust / FLYER_THRUST_BASE;
      this.boostPadHoldCd = 0.05;
    }

    for (const n of this.nodes) {
      if (!n.alive) continue;
      const ds = n.s - this.s;
      const reach = n.kind === 'portal' ? 14 : n.kind === 'ring' ? 10 : 8;
      if (ds < -2.5 || ds > reach) continue;
      const ny = this.nodeCenterY(n);
      const d = Math.hypot(n.x - this.x, ny - this.y, ds * (n.kind === 'portal' ? 0.55 : 1));
      if (d > n.r + 0.85) continue;
      this.worldAt(n.s, n.x, ny, this._world);

      if (n.kind === 'speed') {
        n.alive = false;
        n.mesh.visible = false;
        this.thrust = flyerDynamics.applyBoost(this.thrust);
        if (this.t - this.boostChainAt <= 2.6) this.boostChain += 1;
        else this.boostChain = 1;
        this.boostChainAt = this.t;
        if (this.boostChain >= 3) {
          this.thrust = Math.min(FLYER_THRUST_MAX, this.thrust + 22);
          this.boostChain = 0;
        }
        this.speedMul = this.thrust / FLYER_THRUST_BASE;
        this.fxQueue.push({
          type: 'speedPickup',
          x: this._world.x,
          y: this._world.y,
          z: this._world.z,
          chain: this.boostChain === 0 ? 3 : this.boostChain,
        });
        this.punch = Math.max(this.punch, this.boostChain === 0 ? 0.2 : 0.12);
        flyerPlayfeel.applyBoost(22);
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0xffcc44, 1.1);
        continue;
      }
      if (n.kind === 'shield') {
        n.alive = false;
        n.mesh.visible = false;
        this.fxQueue.push({ type: 'shieldPickup', x: this._world.x, y: this._world.y, z: this._world.z });
        this.punch = Math.max(this.punch, 0.1);
        flyerPlayfeel.applyBoost(14);
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0x4499ff, 1.05);
        continue;
      }
      if (n.kind === 'hull') {
        n.alive = false;
        n.mesh.visible = false;
        this.fxQueue.push({ type: 'hullPickup', x: this._world.x, y: this._world.y, z: this._world.z });
        this.punch = Math.max(this.punch, 0.1);
        flyerPlayfeel.applyBoost(14);
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0x55ff66, 1.05);
        continue;
      }
      if (n.kind === 'ring') {
        const need = n.stage ?? 0;
        n.alive = false;
        n.mesh.visible = false;
        if (need === this.ringStage) {
          this.ringStage++;
          this.fxQueue.push({
            type: 'ringPass',
            x: this._world.x,
            y: this._world.y,
            z: this._world.z,
            stage: this.ringStage,
            total: RING_CHAIN_N,
          });
          this.burstFlash(this._world.x, this._world.y, this._world.z, 0xff66dd, 1.2);
          this.punch = Math.max(this.punch, 0.14);
          if (this.ringStage >= RING_CHAIN_N) {
            this.ringChains++;
            this.ringStage = 0;
            this.thrust = Math.min(FLYER_THRUST_MAX, this.thrust + RING_BOOST_THRUST);
            this.speedMul = this.thrust / FLYER_THRUST_BASE;
            this.bonusFrag += RING_FRAG_REWARD;
            this.bonusLattice += RING_LATTICE_BONUS;
            this.fxQueue.push({
              type: 'ringComplete',
              x: this._world.x,
              y: this._world.y,
              z: this._world.z,
              frag: RING_FRAG_REWARD,
              lattice: RING_LATTICE_BONUS,
            });
            flyerPlayfeel.applyBoost(26);
            this.burstFlash(this._world.x, this._world.y, this._world.z, 0xffee66, 1.5);
          }
        } else {
          this.ringStage = 0;
          this.burstFlash(this._world.x, this._world.y, this._world.z, 0xaa6688, 0.7);
        }
        continue;
      }
      if (n.kind === 'portal') {
        n.alive = false;
        this.fxQueue.push({ type: 'portalEnter', x: this._world.x, y: this._world.y, z: this._world.z });
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0x66eeff, 1.8);
        this.punch = Math.max(this.punch, 0.22);
        this.finished = true;
        this.updateJuice(dt, null);
        return;
      }
      if (n.kind === 'enemy') {
        if (this.hitCd > 0) continue;
        n.alive = false;
        n.mesh.visible = false;
        this.thrust = flyerDynamics.applyHazard(this.thrust);
        this.speedMul = this.thrust / FLYER_THRUST_BASE;
        flyerPlayfeel.applyFail(22);
        this.hitCd = FLYER_HIT_COOLDOWN;
        this.hits++;
        const dmg = flyerHitProfile('solid');
        this.fxQueue.push({ type: 'hit', kind: 'solid', x: this._world.x, y: this._world.y, z: this._world.z });
        this.punch = Math.max(this.punch, 0.18);
        this.burstFlash(this._world.x, this._world.y, this._world.z, 0xff5533, 1.15);
        const died = onHit('solid', dmg.shield, dmg.hull);
        if (died) {
          this.failed = true;
          this.updateJuice(dt, null);
          return;
        }
        continue;
      }
      if (this.hitCd > 0) continue;
      const kind: FlyerHitKind =
        n.kind === 'emp' || n.kind === 'mine' || n.kind === 'gate'
          ? n.kind
          : n.kind === 'obstruction'
            ? 'obstruction'
            : 'solid';
      n.alive = false;
      n.mesh.visible = false;
      this.thrust = flyerDynamics.applyHazard(this.thrust);
      this.speedMul = this.thrust / FLYER_THRUST_BASE;
      flyerPlayfeel.applyFail(26);
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
    if (!this.finished && this.s >= this.courseLen - 2) {
      this.worldAt(this.s, this.x, this.y, this._world);
      this.fxQueue.push({ type: 'portalEnter', x: this._world.x, y: this._world.y, z: this._world.z });
      this.finished = true;
    }
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

  /** Forward pulse. The bolt keeps the ship's heading at the moment of fire. */
  private stepGuns(dt: number, fire: boolean): void {
    this.shotCd = Math.max(0, this.shotCd - dt);
    if (fire && !this.gunWasDown) flyerDynamics.kickFov(3.2);
    this.gunWasDown = fire;
    if (fire && this.armed && this.shotCd <= 0) {
      this.shotCd = 0.11;
      this.spawnBolt();
    }
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.active) continue;
      b.life -= dt;
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      const speed = b.vel.length();
      if (speed > 1e-4) {
        this._pathZ.copy(b.vel).multiplyScalar(1 / speed);
        this._boltQ.setFromUnitVectors(this._boltFwd, this._pathZ);
        b.mesh.quaternion.copy(this._boltQ);
      }
      b.mesh.updateMatrix();
      if (b.life <= 0 || this.boltStrike(b.prev, b.pos)) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
  }

  private spawnBolt(): void {
    let slot = this.bolts.find((b) => !b.active);
    if (!slot) slot = this.bolts[0];
    const dir = this._F.t;
    slot.active = true;
    slot.life = 0.85;
    slot.pos.copy(this._shipPos).addScaledVector(dir, 1.35);
    slot.prev.copy(slot.pos);
    slot.vel.copy(dir).multiplyScalar(96);
    slot.mesh.position.copy(slot.pos);
    slot.mesh.visible = true;
    this.burstFlash(slot.pos.x, slot.pos.y, slot.pos.z, this.pal.glow, 0.55);
    bus.emit('weapon-fire', { family: 'pulse', slot: -1 });
  }

  private boltStrike(prev: THREE.Vector3, pos: THREE.Vector3): boolean {
    let best: Node | null = null;
    let bestD = 2.4;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.alive || (n.kind !== 'enemy' && n.kind !== 'obstruction')) continue;
      const ds = n.s - this.s;
      if (ds < -6 || ds > 90) continue;
      this.worldAt(n.s, n.x, this.nodeCenterY(n), this._world);
      this._pathZ.copy(pos).sub(prev);
      const ab2 = this._pathZ.lengthSq();
      let u = 0;
      if (ab2 > 1e-6) {
        u = ((this._world.x - prev.x) * this._pathZ.x + (this._world.y - prev.y) * this._pathZ.y + (this._world.z - prev.z) * this._pathZ.z) / ab2;
        u = Math.max(0, Math.min(1, u));
      }
      this._scratch.copy(prev).addScaledVector(this._pathZ, u);
      const d = this._scratch.distanceTo(this._world);
      const reach = n.r + 0.7;
      if (d < reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (!best) return false;
    this.shatterTarget(best);
    return true;
  }

  private shatterTarget(n: Node): void {
    this.worldAt(n.s, n.x, this.nodeCenterY(n), this._world);
    n.alive = false;
    n.mesh.visible = false;
    if (n.kind === 'enemy') {
      if (this.t - this.killChainAt <= 2.5) this.killChain += 1;
      else this.killChain = 1;
      this.killChainAt = this.t;
      this.enemiesKilled++;
      this.bonusFrag += ENEMY_FRAG_REWARD;
      this.bonusLattice += ENEMY_LATTICE_BONUS;
      this.fxQueue.push({
        type: 'enemyKill',
        x: this._world.x,
        y: this._world.y,
        z: this._world.z,
        frag: ENEMY_FRAG_REWARD,
        lattice: ENEMY_LATTICE_BONUS,
        combo: this.killChain,
      });
      this.burstFlash(this._world.x, this._world.y, this._world.z, 0xff6633, 1.45);
      this.punch = Math.max(this.punch, 0.16);
      flyerDynamics.kickFov(2.2);
      return;
    }
    this.thrust = Math.min(FLYER_THRUST_MAX, this.thrust + 14);
    this.speedMul = this.thrust / FLYER_THRUST_BASE;
    flyerDynamics.kickFov(1.5);
    this.fxQueue.push({ type: 'laneClear', x: this._world.x, y: this._world.y, z: this._world.z });
    this.burstFlash(this._world.x, this._world.y, this._world.z, 0xffcc88, 0.9);
    this.punch = Math.max(this.punch, 0.1);
  }

  /** Cubes are built above the node origin. Shots and rams use that center. */
  private nodeCenterY(n: Node): number {
    return n.kind === 'enemy' ? n.y + 1.05 : n.y;
  }

  /** Slow lateral drift. Amplitude stays outside a centered hull. */
  private stepEnemyDrift(): void {
    const t = this.t;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.alive || n.homeX === undefined) continue;
      n.x = n.homeX + Math.sin(t * 1.15 + n.homeX * 1.7) * 0.32;
    }
  }

  private stepWake(): void {
    if (this.wakePts.length === 0) return;
    this._scratch.copy(this._shipPos).addScaledVector(this._F.t, -1.6);
    if (this.wakePts[this.wakePts.length - 1].lengthSq() < 1e-4) {
      for (let i = 0; i < this.wakePts.length; i++) this.wakePts[i].copy(this._scratch);
    } else if (this.wakePts[0].distanceToSquared(this._scratch) > 0.72 * 0.72) {
      for (let i = this.wakePts.length - 1; i > 0; i--) this.wakePts[i].copy(this.wakePts[i - 1]);
      this.wakePts[0].copy(this._scratch);
    } else {
      this.wakePts[0].copy(this._scratch);
    }
    const boost = flyerDynamics.state.boostState;
    const mat = this.wakeMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.min(0.7, 0.18 + boost * 0.4 + Math.max(0, this.speedMul - 1) * 0.2);
    mat.color.setHex(boost > 0.2 ? 0xfff2c4 : this.pal.accent);
    for (let i = 0; i < WAKE_SEGS; i++) {
      const a = this.wakePts[i];
      const b = this.wakePts[i + 1];
      this._pathZ.copy(a).sub(b);
      const len = this._pathZ.length();
      if (len < 0.05) {
        this.dummy.scale.set(0.001, 0.001, 0.001);
        this.dummy.updateMatrix();
        this.wakeMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      this.dummy.position.copy(a).add(b).multiplyScalar(0.5);
      this._pathZ.multiplyScalar(1 / len);
      this._craftR.crossVectors(this._F.u, this._pathZ);
      if (this._craftR.lengthSq() < 1e-6) this._craftR.copy(this._F.r);
      else this._craftR.normalize();
      this._craftU.crossVectors(this._pathZ, this._craftR).normalize();
      this._mat.makeBasis(this._craftR, this._craftU, this._pathZ);
      this.dummy.quaternion.setFromRotationMatrix(this._mat);
      const fade = 1 - i / WAKE_SEGS;
      this.dummy.scale.set(0.35 + fade * 0.8, 0.2 + fade * 0.35, len);
      this.dummy.updateMatrix();
      this.wakeMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.wakeMesh.instanceMatrix.needsUpdate = true;
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
    const dyn = flyerDynamics.state;
    const bloom = dyn.thrusterBloom;
    const scrape = dyn.scrapeFlash || 0;
    const boostLit = dyn.boostState > 0.12;
    for (let i = 0; i < this.thrusterPlumes.length; i++) {
      const m = this.thrusterPlumes[i];
      const mat = this.thrusterMats[i];
      const isCore = m.name === 'FlyerThrusterPlumeCore';
      const len = (isCore ? 0.55 : 0.7) * (0.7 + bloom * 0.45);
      const rad = (isCore ? 0.4 : 0.5) * (0.65 + bloom * 0.28);
      m.scale.set(rad, len, rad);
      mat.opacity = Math.min(0.55, (isCore ? 0.32 : 0.22) + bloom * (isCore ? 0.14 : 0.16) + scrape * 0.12);
      mat.color.setHex(scrape > 0.25 ? (isCore ? 0xffcc88 : 0xff8844) : boostLit ? (isCore ? 0xffffff : 0xa8fff6) : (isCore ? 0xe8ffff : 0x66e8ff));
      m.visible = true;
    }
    for (const o of this.thrusterNodes) {
      const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
      if (!mesh) continue;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const pm = raw as THREE.MeshPhongMaterial;
        if (pm && 'emissiveIntensity' in pm) {
          pm.emissiveIntensity = THREE.MathUtils.clamp(0.85 + bloom * 0.75, 0.7, 2.2);
        }
      }
    }
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      (this.tracer.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.tracerLife / 0.12) * 0.95;
      if (this.tracerLife <= 0) this.tracer.visible = false;
    }
    for (let i = 0; i < this.flashLife.length; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const m = this.flashes[i];
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, this.flashLife[i] / 0.2) * 0.95;
      m.scale.multiplyScalar(1 + dt * 3.5);
      if (this.flashLife[i] <= 0) m.visible = false;
    }
    this.punch = Math.max(0, this.punch - dt * 1.8);
    if (lock) {
      this.worldAt(lock.s, lock.x, this.nodeCenterY(lock), this._world);
      this.lockRing.position.copy(this._world);
      this.lockRing.visible = true;
      const sc = 1.05 + Math.sin(this.t * 14) * 0.08;
      this.lockRing.scale.setScalar(sc);
      (this.lockRing.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.t * 18) * 0.25;
    } else {
      this.lockRing.visible = false;
    }

    this.updateStreaks(dt);
    this.stepWake();
    tickFlyerLife(this.root, this.path, {
      t: this.t,
      dt,
      s: this.s,
      courseLen: this.courseLen,
      speed: this.armed ? this.speedMul : 0,
      sceneId: this.sceneId,
      quality: this.quality,
      craft: this.craft,
    });
    if (this.s - this.streamAt > 8 || this.streamAt < -100) {
      this.streamAt = this.s;
      streamWipeoutGrammarWindow(this.root, this.path, this.s, this.sceneId, this.pal, this.quality);
      this.streamCorridorWindow();
      this.cullCorridorWindow();
    }
    this.pulseWormholeTube(dt);
    const DRAW_WINDOW = 70;
    for (const n of this.nodes) {
      if (!n.mesh.userData.posed) this.poseNode(n);
      if (!n.alive) {
        if (n.mesh.visible) n.mesh.visible = false;
        continue;
      }
      const ds = n.s - this.s;
      const show = ds >= -8 && ds <= DRAW_WINDOW && !n.mesh.userData.forceHiddenClearLane && n.kind !== 'gate';
      if (n.mesh.visible !== show) n.mesh.visible = show;
      if (!show) continue;
      if (n.kind === 'enemy') this.poseNode(n);
      if (n.kind !== 'speed' && n.kind !== 'shield' && n.kind !== 'hull' && n.kind !== 'ring') continue;
      let motion = n.mesh.userData.motion as THREE.Object3D | null | undefined;
      if (motion === undefined) {
        motion = n.mesh.getObjectByName('PickupMotion');
        n.mesh.userData.motion = motion;
      }
      if (!motion) continue;
      const near = ds > 0 && ds < 26 ? 1.1 : 1;
      const pulse = near * (1 + Math.sin(this.t * 3.1 + n.s * 0.17) * 0.06);
      motion.scale.setScalar(pulse);
      motion.position.y = Math.sin(this.t * 2.3 + n.s * 0.2) * 0.26;
      motion.updateMatrix();
    }
  }

  /** Speed lines in the path frame. The mesh stays put; instances rush past the craft. */
  private updateStreaks(dt: number): void {
    const dyn = flyerDynamics.state;
    const speed = Math.max(0.4, this.speedMul * (dyn.speedScale || 1));
    const lenMul = dyn.streakLenMul || 1;
    const mat = this.streaks.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.min(0.72, 0.14 + speed * 0.18 * (dyn.streakOpMul || 1));
    const F = this._F;
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakSlot[i] = (this.streakSlot[i] + dt * (34 + (i % 5) * 7) * speed) % STREAK_WINDOW;
      const along = this.streakSlot[i] - 10;
      const fade = Math.sin((this.streakSlot[i] / STREAK_WINDOW) * Math.PI);
      const x = this.streakXY[i * 2];
      const y = this.streakXY[i * 2 + 1];
      this.dummy.position.copy(this._shipPos).addScaledVector(F.t, along).addScaledVector(F.r, x * 0.85).addScaledVector(F.u, y * 0.55 + 0.6);
      this.dummy.quaternion.copy(this.craft.quaternion);
      this.dummy.scale.set(fade, fade, Math.max(0.05, (1.4 + (i % 4) * 0.7) * lenMul * fade));
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  private poseNode(n: Node): void {
    this.path.sample(n.s, this._Fnode);
    applyPathFramePose(n.mesh, this._Fnode, n.x, n.y);
    n.mesh.userData.posed = 1;
    n.mesh.updateMatrix();
  }

  /** Nose is local -Z. Used by the flight probe, not the frame loop. */
  debugFlightFrame(): { laneX: number; s: number; noseDotTangent: number; bank: number; fov: number } {
    // _F is reused by the end-portal pose, so sample the craft's own station.
    this.path.sample(THREE.MathUtils.clamp(this.s, 0, Math.max(0, this.courseLen - 0.05)), this._Fnode);
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(this.craft.quaternion);
    return {
      laneX: this.x,
      s: this.s,
      noseDotTangent: nose.dot(this._Fnode.t),
      bank: flyerDynamics.state.visualBank,
      fov: flyerDynamics.state.fov,
    };
  }

  private poseEndPortal(): void {
    const portalNode = this.nodes.find((n) => n.kind === 'portal');
    const sPortal = portalNode ? portalNode.s : Math.max(40, this.courseLen - 22);
    if (this.endPortal) {
      this.path.sample(THREE.MathUtils.clamp(sPortal, 0, Math.max(0, this.courseLen - 0.05)), this._Fnode);
      applyPathFramePose(this.endPortal, this._Fnode, 0, Math.max(0.2, pathDeckClearY(0.5, 0.05)));
      this.endPortal.visible = true;
    }
    if (this.finishScenery) {
      // WAVE44: seat finish PLACE at portal plane so +localZ continues THROUGH the open aperture
      this.path.sample(THREE.MathUtils.clamp(sPortal, 0, Math.max(0, this.courseLen - 0.05)), this._Fnode);
      applyPathFramePose(this.finishScenery, this._Fnode, 0, 0);
      this.finishScenery.visible = true;
    }
  }

  focusInteractive(mark: string): { s: number; x: number; y: number; kind: string } | null {
    const alias: Record<string, Kind[]> = {
      boost: ['speed'],
      speed: ['speed'],
      shield: ['shield'],
      hull: ['hull'],
      hazard: ['obstruction', 'mine', 'emp', 'solid'],
      enemy: ['enemy'],
      ring: ['ring'],
      portal: ['portal'],
      gate: ['gate'],
    };
    const kinds = alias[mark] || [mark as Kind];
    let best: Node | null = null;
    let bestD = 1e9;
    for (const n of this.nodes) {
      if (!n.alive && n.kind !== 'portal') continue;
      if (!kinds.includes(n.kind)) continue;
      const d = Math.abs(n.s - this.s);
      const score = n.s >= this.s - 5 ? d : d + 500;
      if (score < bestD) {
        bestD = score;
        best = n;
      }
    }
    if (!best) return null;
    // WAVE45: dim cyan deck pads; closer buff framing; NO orb burstFlash on buffs
    this.setBoostPadsVisible(false);
    const back =
      best.kind === 'portal'
        ? 18
        : best.kind === 'enemy'
          ? 9
          : best.kind === 'obstruction'
            ? 14
            : best.kind === 'speed' || best.kind === 'shield' || best.kind === 'hull'
              ? 10
              : 8;
    const xBias = best.kind === 'obstruction' ? 0 : best.x * 0.15;
    const yBias =
      best.kind === 'obstruction'
        ? Math.max(0.6, pathDeckClearY(1.0, 0.08))
        : best.kind === 'speed' || best.kind === 'shield' || best.kind === 'hull'
          ? Math.max(0.45, pathDeckClearY(1.05, 0.08))
          : Math.max(0.35, best.y * 0.4);
    this.seek(best.s - back, xBias, yBias);
    if (best.kind === 'portal') {
      this.poseEndPortal();
    }
    if (best.kind === 'enemy') {
      this.worldAt(best.s, best.x, best.y, this._world);
      this.burstFlash(this._world.x, this._world.y + 1.6, this._world.z, 0xffee66, 0.55);
      this.burstFlash(this._world.x, this._world.y + 2.4, this._world.z, 0xffcc33, 0.4);
    }
    return { s: best.s, x: best.x, y: best.y, kind: best.kind };
  }

  focusRingStage(stage: number): { s: number; stage: number } | null {
    const n = this.nodes.find((x) => x.kind === 'ring' && (x.stage ?? 0) === stage);
    if (!n) return null;
        this.setBoostPadsVisible(false);
    this.ringStage = stage;
    // WAVE45: closer framing so 1of3 shows ring aperture (not pillar-only)
    const back = stage === 0 ? 11 : stage === 1 ? 12 : 11;
    this.seek(n.s - back, n.x * 0.12, Math.max(0.55, n.y * 0.45));
    if (stage >= RING_CHAIN_N - 1) {
      this.worldAt(n.s, n.x, n.y, this._world);
      this.burstFlash(this._world.x, this._world.y + 2.2, this._world.z, 0xffee66, 1.15);
      this.burstFlash(this._world.x, this._world.y + 3.4, this._world.z, 0xffcc44, 0.7);
      this.thrust = Math.min(FLYER_THRUST_MAX, this.thrust + RING_BOOST_THRUST * 0.35);
      this.speedMul = this.thrust / FLYER_THRUST_BASE;
    }
    return { s: n.s, stage };
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
      bonusFrag: this.bonusFrag,
      bonusLattice: this.bonusLattice,
      ringChains: this.ringChains,
      enemiesKilled: this.enemiesKilled,
    };
  }

  dispose(): void {
    this.disposed = true;
    releaseFlyerLife(this.root);
    if (this.sky) {
      this.sky.group.userData.skyLive = false;
      this.sky.texture.dispose();
      this.sky = null;
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh || o instanceof THREE.Line || o instanceof THREE.Points) {
        if (!o.geometry.userData?.shared) o.geometry.dispose();
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => { if (!x.userData?.shared) x.dispose(); });
        else if (m && !(m as THREE.Material).userData?.shared) (m as THREE.Material).dispose();
      }
    });
    this.root.clear();
    this.nodes = [];
    this.fxQueue.length = 0;
    this.flashes = [];
    this.flashLife = [];
    this.glbPack = null;
  }


  /** WAVE54: segment stream recycle — pool kits that fall behind; only near-ahead live. */
  private streamCorridorWindow(): void {
    if (this.sceneId === "wormhole") return;
    const kit = this.root.getObjectByName("FlyerWipeoutCorridorKit");
    // The kit stays in the graph for stills, but play hides the whole group.
    if (!kit || !kit.visible) return;
    const names = ["FlyerWipeoutCorridorFarFacade", "FlyerWipeoutCorridorMassKit", "FlyerWipeoutCorridorDeckPlate"];
    const behindKeep = W54_STREAM_BEHIND_M;
    const aheadCap = this.s + W54_STREAM_AHEAD_M;
    for (const name of names) {
      const arr = kit.children.filter((c) => c.name === name && typeof c.userData.laneS === "number");
      if (arr.length < 2) continue;
      let minObj = arr[0];
      let maxS = -1;
      for (const o of arr) {
        const ls = o.userData.laneS as number;
        if (ls < (minObj.userData.laneS as number)) minObj = o;
        if (ls > maxS) maxS = ls;
        // Far façades: skip until closer (impostor/LOD gate)
        if (name === "FlyerWipeoutCorridorFarFacade") {
          o.visible = ls >= this.s - behindKeep && ls <= this.s + W54_FAR_FACADE_AHEAD_M;
        }
      }
      const minS = minObj.userData.laneS as number;
      if (minS > this.s - behindKeep) continue;
      const step = name === "FlyerWipeoutCorridorDeckPlate" ? 8 : name === "FlyerWipeoutCorridorFarFacade" ? 34 : 22;
      let nextS = Math.min(this.courseLen - 2, maxS + step);
      if (nextS > aheadCap) continue;
      if (nextS <= maxS + 0.5 || nextS < this.s) continue;
      this.path.sample(nextS, this._Fnode);
      const side = (minObj.userData.side as number) || (minObj.scale.x < 0 ? -1 : 1);
      const lat = Math.abs((minObj.userData.lat as number) || 0);
      if (name === "FlyerWipeoutCorridorDeckPlate") {
        minObj.position.copy(this._Fnode.p).addScaledVector(this._Fnode.u, pathDeckClearY(0, 0.01));
      } else {
        minObj.position
          .copy(this._Fnode.p)
          .addScaledVector(this._Fnode.r, side * (lat || 48))
          .addScaledVector(this._Fnode.u, pathDeckClearY(0, 0.02));
      }
      pathFrameQuat(this._Fnode, minObj.quaternion);
      minObj.userData.laneS = nextS;
      minObj.visible = true;
      minObj.updateMatrix();
    }
  }

  private cullCorridorWindow(): void {
    const kit = this.root.getObjectByName("FlyerWipeoutCorridorKit");
    if (!kit || !kit.visible) return;
    this.worldAt(this.s, this.x, this.y, this._world);
    const ax = this._world.x, ay = this._world.y, az = this._world.z;
    // WAVE54: tighter live radius — far kits culled until closer
    const liveR2 = 72 * 72;
    const farFacadeR2 = 48 * 48;
    for (const ch of kit.children) {
      const dx = ch.position.x - ax;
      const dy = ch.position.y - ay;
      const dz = ch.position.z - az;
      const d2 = dx * dx + dy * dy + dz * dz;
      const isFarFacade = ch.name === "FlyerWipeoutCorridorFarFacade";
      ch.visible = d2 <= (isFarFacade ? farFacadeR2 : liveR2);
      ch.castShadow = false;
      ch.receiveShadow = false;
    }
  }

  /** WAVE52: rhythmic spacetime pulse on wormhole tube glow (no road). */
  private pulseWormholeTube(dt: number): void {
    if (this.sceneId !== "wormhole") return;
    this._wormPulseT += dt;
    const objs = this.wormPulseTargets();
    if (!objs) return;
    const pulse = 0.72 + 0.38 * Math.sin(this._wormPulseT * 2.35) + 0.12 * Math.sin(this._wormPulseT * 5.1);
    for (let i = 0; i < objs.length; i++) {
      const mat = (objs[i] as THREE.Mesh).material as THREE.Material | THREE.Material[];
      const list = Array.isArray(mat) ? mat : [mat];
      for (let k = 0; k < list.length; k++) {
        const m = list[k];
        if (!m) continue;
        const ud = m.userData;
        if ("emissiveIntensity" in m && typeof (m as THREE.MeshPhongMaterial).emissiveIntensity === "number") {
          const phong = m as THREE.MeshPhongMaterial;
          const base = (ud.wave52PulseBase as number) ?? (phong.emissiveIntensity || 0.5);
          ud.wave52PulseBase = base;
          phong.emissiveIntensity = Math.min(2.8, Math.max(0.35, base * pulse * 1.35));
        }
        if ("opacity" in m && m.transparent) {
          const basic = m as THREE.MeshBasicMaterial;
          const ob = (ud.wave52PulseOp as number) ?? basic.opacity;
          ud.wave52PulseOp = ob;
          basic.opacity = Math.min(0.98, Math.max(0.45, ob * (0.85 + 0.22 * pulse)));
        }
      }
    }
  }

  private wormPulseTargets(): THREE.Object3D[] | null {
    const cached = this.wormPulseObjs;
    if (cached && cached.length > 0 && cached[0].parent) return cached;
    const names = [
      "FlyerWipeoutTunnelRib",
      "FlyerWipeoutTunnelRibInner",
      "FlyerWipeoutTunnelRibOuter",
      "FlyerWipeoutTunnelRibbon",
      "FlyerWipeoutTunnelScaffoldRing",
      "FlyerWipeoutTunnelLamp",
      "FlyerWipeoutTunnelArch",
    ];
    const found: THREE.Object3D[] = [];
    for (let i = 0; i < names.length; i++) {
      const o = this.root.getObjectByName(names[i]);
      if (o) found.push(o);
    }
    this.wormPulseObjs = found.length ? found : null;
    return this.wormPulseObjs;
  }
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The hero GLB is ~170 separate draws. Bake it to hull / glass / engines.
 * Hull keeps each part's color as vertex colors so panels still read.
 */
function mergeCraftHero(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets: Record<'hull' | 'glass' | 'glow', THREE.BufferGeometry[]> = {
    hull: [],
    glass: [],
    glow: [],
  };
  const doomed: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const n = mesh.name || '';
    const key: 'hull' | 'glass' | 'glow' =
      n.startsWith('EngineGlow') || n.includes('Nozzle') || n.startsWith('Plume')
        ? 'glow'
        : n.includes('Canopy') || n.includes('Glass') || n.includes('Lens')
          ? 'glass'
          : 'hull';
    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    const col = srcMat?.color?.clone() ?? new THREE.Color(0xd5dee8);
    const baked = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    baked.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    if (!baked.getAttribute('normal')) baked.computeVertexNormals();
    const pos = baked.getAttribute('position');
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos.clone());
    const nrm = baked.getAttribute('normal');
    out.setAttribute('normal', nrm ? nrm.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    const uv = baked.getAttribute('uv');
    out.setAttribute('uv', uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    if (key === 'hull') {
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
      out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    baked.dispose();
    buckets[key].push(out);
    doomed.push(mesh);
  });
  for (const mesh of doomed) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  }
  const materials = {
    hull: new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: 0x1a3040,
      emissiveIntensity: 0.55,
      toneMapped: true,
      fog: false,
    }),
    glass: new THREE.MeshLambertMaterial({
      color: 0xbff6ff,
      emissive: 0x1a90b0,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.9,
      toneMapped: true,
      fog: false,
    }),
    glow: new THREE.MeshBasicMaterial({
      color: 0xf4ffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  };
  for (const key of ['hull', 'glass', 'glow'] as const) {
    const geos = buckets[key];
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.name = key === 'hull' ? 'FlyerCraftHull' : key === 'glass' ? 'FlyerCraftGlass' : 'FlyerCraftGlow';
    mesh.frustumCulled = false;
    root.add(mesh);
  }
}

/** Convert hero GLB PBR to lit MeshLambert (cube-mode readable on medium; no PointLights). */
function toLitMobile(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh) return;
    const srcList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = srcList.map((src) => {
      if (!src) return src;
      const std = src as THREE.MeshStandardMaterial;
      const lit = new THREE.MeshPhongMaterial({
        color: std.color ? std.color.clone() : new THREE.Color(0xc8d8e8),
        map: std.map ?? null,
        transparent: !!std.transparent,
        opacity: std.opacity ?? 1,
        side: std.side ?? THREE.FrontSide,
        depthWrite: std.depthWrite !== false,
        toneMapped: true,
        fog: false,
        emissive: std.emissive ? std.emissive.clone() : new THREE.Color(0x102028),
        emissiveMap: std.emissiveMap ?? null,
        emissiveIntensity: Math.max(0.55, Math.min(2.0, (std.emissiveIntensity ?? 0.55) * 1.35)),
        shininess: 28,
        specular: new THREE.Color(0xaaccee),
      });
      // WAVE5b: rim-readable hull + stronger engine FX vs neon corridors.
      if (lit.color.getHex() < 0x404040) {
        lit.color.offsetHSL(0, 0.02, 0.22);
      }
      lit.color.multiplyScalar(1.55);
      if (!std.emissive || std.emissive.getHex() === 0) {
        lit.emissive.setHex(0x3a6078);
        lit.emissiveIntensity = Math.max(lit.emissiveIntensity, 0.95);
      }
      // Cheap rim: lift emissive toward cool rim so craft separates from bright floors.
      lit.emissive.offsetHSL(0.02, 0.05, 0.04);
      lit.emissiveIntensity = Math.min(2.2, lit.emissiveIntensity * 1.12);
      const n = mesh.name;
      if (n.startsWith('EngineGlow') || n.includes('Nozzle') || n.startsWith('Plume')) {
        lit.emissive.setHex(0x88fff8);
        lit.emissiveIntensity = 1.85;
        lit.transparent = true;
        lit.depthWrite = false;
      }
      if (n.includes('Canopy') || n.includes('Glass') || n.includes('Lens')) {
        lit.emissive.setHex(0x28b8d8);
        lit.emissiveIntensity = Math.max(lit.emissiveIntensity, 1.05);
      }
      return lit;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}


