import * as THREE from 'three';
import { COLORS, ORBIT, PERF, SAVE_KEY } from '../data/constants';
import { getLevel } from '../data/levels';
import type { UpgradeNodeDef } from '../data/upgrades';
import {
  DEFAULT_GRAPHICS_QUALITY,
  getGraphicsPreset,
  peekSavedGraphicsQuality,
  type GraphicsQuality,
} from '../data/graphics';
import { bus } from './EventBus';
import { Time } from './Time';
import { SaveSystem } from './SaveSystem';
import { sessionCleaner } from './SessionCleaner';
import { CubeManager } from '../cube/CubeManager';
import { BlockType, colorForType } from '../cube/BlockTypes';
import { CubeAnimator } from '../cube/CubeAnimator';
import { CubeDefense } from '../cube/CubeDefense';
import { Ship } from '../player/Ship';
import { ShipVitals } from '../player/ShipVitals';
import { OrbitalCamera } from '../player/OrbitalCamera';
import { InputController } from '../player/InputController';
import { Weapon } from '../player/Weapon';
import { HardpointSystem } from '../combat/HardpointSystem';
import { LoadoutState } from '../loadout/LoadoutState';
import { DroneBayController } from '../loadout/DroneBayState';
import { DroneManager } from '../drones/DroneManager';
import {
  DRONE_ROLES,
  FIRST_DRONE_COST,
  canAffordSecondDrone,
  type DroneRole,
} from '../data/drones';
import { Currency } from '../progression/Currency';
import { TechTree } from '../progression/TechTree';
import { ResearchTree } from '../progression/ResearchTree';
import { IdleSimulator } from '../progression/IdleSimulator';
import { ParticlePool } from '../vfx/ParticlePool';
import { ShatterSystem } from '../vfx/ShatterSystem';
import { ImpactRings } from '../vfx/ImpactRings';
import { AimReticle } from '../vfx/AimReticle';
import { CinematicIntro } from '../vfx/CinematicIntro';
import { PostProcessing } from '../vfx/PostProcessing';
import { ArenaDirector } from '../world/ArenaDirector';
import { AudioEngine } from '../audio/AudioEngine';
import { MusicPlayer } from '../audio/MusicPlayer';
import { AdService } from '../ads/AdService';
import { DummyAdProvider } from '../ads/DummyAdProvider';
import { IapService } from '../platform/IapService';
import { HUD } from '../ui/HUD';
import { MenuUI } from '../ui/MenuUI';
import { MusicRadioUI } from '../ui/MusicRadioUI';
import { ShopUI } from '../ui/ShopUI';
import { ResearchUI } from '../ui/ResearchUI';
import { LevelSelectUI } from '../ui/LevelSelectUI';
import { LoadoutUI } from '../ui/LoadoutUI';
import { SettingsUI } from '../ui/SettingsUI';
import { PauseUI } from '../ui/PauseUI';
import { AdsOfferUI } from '../ui/AdsOfferUI';
import { TutorialDirector } from '../ui/TutorialDirector';
import { EvolveReadyUI } from '../ui/EvolveReadyUI';
import { EvolveConfirmUI } from '../ui/EvolveConfirmUI';
import { ScreenTransition } from '../ui/ScreenTransition';
import {
  UI_CLICK_LOCK_MS,
  assertNavPolicyInvariants,
  canOpenOverlay,
  isFromCombatSeat,
  resolveOverlayClose,
  shouldPauseInsteadOfExtract,
  shouldReloadMenuDemo,
} from './NavPolicy';
import { cheapestPurchasableWeapon, weaponUnlockCost } from '../data/weapons';
import {
  baselineFromTier,
  canEvolve,
  EVOLVE_RESET_LEVEL,
  evolveCoreGrant,
  evolveCost,
  furthestCompletedBeacon,
  isChronobeacon,
  nextStageAfterClear,
  repeatableUpgradeCap,
} from '../data/evolve';
import { EVOLVE_FRAG_PER_CORE, getResearchNode } from '../data/research';
import {
  ARENA_FLOOR_WORLD_Y,
  LIGHTING_AMBIENT_COLOR,
  LIGHTING_AMBIENT_INTENSITY,
  LIGHTING_HEMI_GROUND_COLOR,
  LIGHTING_HEMI_INTENSITY,
  LIGHTING_HEMI_SKY_COLOR,
  LIGHTING_KEY_COLOR,
  LIGHTING_KEY_INTENSITY,
  LIGHTING_RIM_COLOR,
  LIGHTING_RIM_INTENSITY,
  PERFORMANCE_COMBAT_BLOOM_GRACE_SECONDS,
  PERFORMANCE_FRAME_CAP_HZ,
  PERFORMANCE_MENU_FRAME_CAP_HZ,
  SHIP_FLOOR_CLEARANCE,
} from '../data/constraints';
import { GroundStationController } from '../loadout/GroundStationState';
import { GroundStationField } from '../world/GroundStationField';
import {
  GROUND_WEAPONS,
  type GroundWeaponId,
} from '../data/groundStations';
import {
  MAIN_GUN_AMMO,
  nextMainGunAmmo,
  normalizeMainGunAmmo,
  type MainGunAmmoId,
} from '../data/ammo';
import { coreAttributeForLevel } from '../data/core';
import { getPilot } from '../data/pilots';
import { PilotRuntime } from '../combat/PilotRuntime';
import { PilotState, type PilotUnlockContext } from '../progression/PilotState';
import { PilotSplashUI } from '../ui/PilotSplashUI';
import { FlyerRun } from '../flyer/FlyerRun';
import {
  FLYER_DEBUG_PATH,
  flyerLevelForScene,
  flyerSceneFromQuery,
  flyerSceneTitle,
  pickFlyerScene,
  shouldRunTransit,
  type FlyerSceneId,
} from '../data/flyer';

type Mode =
  | 'menu'
  | 'intro'
  | 'cinematic'
  | 'playing'
  | 'core_death'
  | 'levelclear'
  | 'tech'
  | 'research'
  | 'levels'
  | 'loadout'
  | 'settings'
  | 'paused'
  | 'dying'
  | 'dead'
  | 'transit';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private time = new Time();
  private save = new SaveSystem();
  private cameraCtrl: OrbitalCamera;
  private post: PostProcessing;
  private arena = new ArenaDirector();
  private cube = new CubeManager();
  /** Separate lattice used only during the intro cinematic (real cube stays pristine). */
  private cinematicCube = new CubeManager();
  private cubeAnimator = new CubeAnimator();
  private cubeDefense = new CubeDefense();
  private ship = new Ship();
  private vitals = new ShipVitals();
  private weapon = new Weapon();
  private mainGunAmmo: MainGunAmmoId = 'standard';
  private hardpoints = new HardpointSystem();
  private loadout = new LoadoutState();
  private droneBays = new DroneBayController();
  private drones = new DroneManager();
  private groundBays = new GroundStationController();
  private groundStations = new GroundStationField();
  private input = new InputController();
  private currency = new Currency();
  private tech = new TechTree();
  private research = new ResearchTree();
  private idle = new IdleSimulator();
  private readonly pilotRuntime = new PilotRuntime();
  private readonly pilots = new PilotState(this.pilotRuntime);
  private particles: ParticlePool;
  private shatter: ShatterSystem;
  private rings: ImpactRings;
  private reticle = new AimReticle();
  private cinematic: CinematicIntro | null = null;
  private audio = new AudioEngine();
  private music = new MusicPlayer();
  private radio: MusicRadioUI | null = null;
  private ads = new AdService(new DummyAdProvider());
  private iap = new IapService();
  private readonly _muzzle = new THREE.Vector3();
  private readonly _aimDir = new THREE.Vector3();

  private hud: HUD;
  private menu: MenuUI;
  private shopUI: ShopUI;
  private researchUI: ResearchUI;
  private levelUI: LevelSelectUI;
  private loadoutUI: LoadoutUI;
  private settingsUI: SettingsUI;
  private pauseUI: PauseUI;
  private adsUI: AdsOfferUI;
  private tutorial!: TutorialDirector;
  private evolveReady!: EvolveReadyUI;
  private evolveConfirm!: EvolveConfirmUI;
  private pilotSplash!: PilotSplashUI;
  private screenFx!: ScreenTransition;
  private overlay: HTMLElement;
  private toastRoot: HTMLElement;
  private cinematicRoot: HTMLElement;
  private orientLock: HTMLElement | null = null;

  private mode: Mode = 'menu';
  private currentLevelId = 1;
  /** Next sector after a clear (Chronobeacon skip or sequential). */
  private pendingNextLevelId = 2;
  private raf = 0;
  private hidden = false;
  private lastPresentMs = 0;
  private combatBloomElapsed = 0;
  private bloomThermallyCut = false;
  private lowFpsTimer = 0;
  /** User-selected graphics tier (persisted). Default medium. */
  private graphicsQuality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  /** Runtime quality after optional FPS demotion (never above user selection). */
  private effectiveQuality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  private levelClearHandled = false;
  /** Nucleus death FX before LEVEL CLEAR card (seconds elapsed). */
  private coreDeathT = 0;
  private readonly CORE_DEATH_SEC = 2.55;
  private unsubs: Array<() => void> = [];
  private introTimer = 0;
  private introDuration = ORBIT.introDuration;
  private shopHintShown = false;
  private pendingIdle = 0;
  private menuDemoActive = false;
  private forceCinematicNext = false;
  private hasSeenCinematic = false;
  private saveAccum = 0;
  private clearRewardMul = 1;
  private pendingReturnMode: Mode = 'menu';
  /** After closing settings/shop from HUD pause, land on pause — not a new stage. */
  private returnToPause = false;
  /** Ignore START / RESUME for a few hundred ms after remounting chrome. */
  private uiClickLockUntil = 0;
  /** Mode to restore when leaving pause (playing or intro). */
  private prePauseMode: Mode = 'playing';
  /** Restore LEVEL CLEAR card after shop/loadout opened from that card. */
  private returnToClear = false;
  private clearCard: {
    name: string;
    frag: number;
    core: number;
    doubled: boolean;
    transitStars?: 1 | 2 | 3;
    transitLattice?: number;
    transitScene?: FlyerSceneId;
  } | null = null;
  private flyer: FlyerRun | null = null;
  private readonly _flyerPos = new THREE.Vector3();
  private readonly _flyerLook = new THREE.Vector3();
  private readonly _flyerCam = new THREE.Vector3();
  private readonly _flyerUp = new THREE.Vector3(0, 1, 0);
  private readonly _flyerAhead = new THREE.Vector3();
  private prevCamFar = 500;
  private prevCubeVisible = true;
  private sessionBlocksDestroyed = 0;
  private sessionPurchased = false;
  private shopOpen = false;
  /** Monotonic token so overlapping startLevelImmediate calls cannot corrupt UI/ship. */
  private levelLoadGen = 0;
  /** True while a sector load is in progress (fade or immediate setup). */
  private levelLoadBusy = false;
  /** Seconds remaining before weapons may fire (3s level warm-up). */
  private combatWarmup = 0;
  /** Tutorial: fire blocked until welcome ack or movement. */
  private tutorialFireUnlocked = false;
  /** Ship death sequence timer (seconds). */
  private deathTimer = 0;
  private deathFadeStarted = false;
  private deathOrigin = new THREE.Vector3();
  /** Seconds of post-repair IFF immunity (ad revive grace). */
  private reviveImmunity = 0;
  /** Runtime VFX scale 0.35–1 from graphics tier + adaptive FPS. */
  private vfxScale = 1;
  /** Mutex for async Core ad / IAP claims. */
  private corePurchaseLock = false;
  /** Once-per-clear Lattice overshield available. */
  private overshieldReady = false;
  /** Warden OVERSHIELD pulse bonus currently on ShipVitals.maxShield. */
  private wardenPulseBonus = 0;
  /** Scan-pulse damage buff timer (seconds remaining). */
  private scanPulseTimer = 0;
  private readonly _aimPoint = new THREE.Vector3();
  private readonly _ndc = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Boot from saved preference (default medium) so first frame uses correct DPR/AA
    this.graphicsQuality = peekSavedGraphicsQuality(SAVE_KEY);
    this.effectiveQuality = this.graphicsQuality;
    const bootPreset = getGraphicsPreset(this.graphicsQuality);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: bootPreset.antialias,
      powerPreference: 'default',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, bootPreset.dprCap)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    console.info(
      '[perf] buffer',
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      'dpr',
      this.renderer.getPixelRatio()
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = bootPreset.exposure;
    this.renderer.setClearColor(0x050b12, 1);
    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        console.error('[webgl] context lost');
      },
      false
    );

    this.cameraCtrl = new OrbitalCamera(window.innerWidth / window.innerHeight);
    this.post = new PostProcessing(this.renderer, this.scene, this.cameraCtrl.camera);

    this.arena.bind(this.scene, this.cameraCtrl.camera);
    this.scene.add(this.cube.group);
    this.scene.add(this.cinematicCube.group);
    this.cinematicCube.group.visible = false;
    this.cinematicCube.group.name = 'CinematicCube';
    this.scene.add(this.cubeAnimator.group);
    this.scene.add(this.cubeDefense.group);
    this.scene.add(this.ship.group);
    this.scene.add(this.weapon.group);
    this.scene.add(this.hardpoints.worldGroup);
    this.hardpoints.attachToShip(this.ship.group);
    this.scene.add(this.drones.group);
    this.scene.add(this.groundStations.group);
    this.groundStations.bind(this.cube);
    this.cameraCtrl.setFloorLimit(ARENA_FLOOR_WORLD_Y, SHIP_FLOOR_CLEARANCE);

    this.particles = new ParticlePool(PERF.maxParticles);
    this.shatter = new ShatterSystem(this.particles);
    this.rings = new ImpactRings(bootPreset.impactRingCount);
    this.scene.add(this.particles.points);
    this.scene.add(this.shatter.group);
    this.scene.add(this.rings.group);
    this.scene.add(this.reticle.group);
    this.cinematicRoot = document.getElementById('cinematic-root')!;
    this.cinematic = new CinematicIntro(this.cinematicRoot);
    this.scene.add(this.cinematic.group);
    this.orientLock = document.getElementById('orientation-lock');

    // Sky wash + key/rim. Combat PointLights stay gone.
    const amb = new THREE.AmbientLight(LIGHTING_AMBIENT_COLOR, LIGHTING_AMBIENT_INTENSITY);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(
      LIGHTING_HEMI_SKY_COLOR,
      LIGHTING_HEMI_GROUND_COLOR,
      LIGHTING_HEMI_INTENSITY
    );
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(LIGHTING_KEY_COLOR, LIGHTING_KEY_INTENSITY);
    key.position.set(6, 42, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(LIGHTING_RIM_COLOR, LIGHTING_RIM_INTENSITY);
    rim.position.set(-18, -4, -14);
    this.scene.add(rim);
    // Arena sits on layer 1 so city StandardMaterials are not point-lit.
    amb.layers.enable(1);
    hemi.layers.enable(1);
    key.layers.enable(1);
    rim.layers.enable(1);
    this.cameraCtrl.camera.layers.enable(1);

    this.cubeAnimator.bind(this.cube);
    this.cubeDefense.bind(this.cube);
    // Nucleus damage passes through regenerating core shield bubble first
    (this.cube as { defenseAbsorb?: (n: number) => number }).defenseAbsorb = (n) =>
      this.cubeDefense.absorbCoreDamage(n);
    this.cubeDefense.setHooks({
      onPlayerDamage: (amount) => this.onPlayerDamaged(amount),
      getPlayerPosition: () => this.ship.position.clone(),
      getPlayerDronePositions: () => this.drones.getAlivePositions(),
      onPlayerDroneDamage: (aim, dmg) => this.drones.damageNear(aim, dmg),
    });

    this.registerSessionCleaners();

    this.hud = new HUD(document.getElementById('hud-root')!);
    this.menu = new MenuUI(document.getElementById('menu-root')!);
    // Radio widget lives on ui-root so menu re-renders don't destroy it
    const uiHost = document.getElementById('ui-root') ?? document.body;
    this.radio = new MusicRadioUI(uiHost, this.music);
    this.shopUI = new ShopUI(document.getElementById('tech-tree-root')!);
    this.researchUI = new ResearchUI(document.getElementById('research-root')!);
    this.levelUI = new LevelSelectUI(document.getElementById('level-select-root')!);
    this.loadoutUI = new LoadoutUI(document.getElementById('loadout-root')!);
    this.settingsUI = new SettingsUI(document.getElementById('settings-root')!);
    this.pauseUI = new PauseUI(document.getElementById('overlay-root')!);
    this.adsUI = new AdsOfferUI(document.getElementById('ads-root')!);
    this.overlay = document.getElementById('overlay-root')!;
    this.toastRoot =
      document.getElementById('toast-root') ?? this.overlay;
    // Mount on ui-root (not hud-root) so shop open (HUD hidden) still shows briefing
    this.tutorial = new TutorialDirector(document.getElementById('ui-root')!, {
      stage1Done: false,
      loadoutDone: false,
      fleetDone: false,
      gunDone: false,
      flyerDone: false,
    });
    this.evolveReady = new EvolveReadyUI(document.getElementById('ui-root')!);
    this.evolveReady.onOpenShop = () => this.openTech();
    this.evolveReady.onDismiss = () => undefined;
    this.evolveConfirm = new EvolveConfirmUI(document.getElementById('ui-root')!);
    this.evolveConfirm.onConfirm = () => this.performEvolve();
    this.evolveConfirm.onCancel = () => undefined;
    this.pilotSplash = new PilotSplashUI(document.getElementById('ui-root')!);
    this.pilotSplash.onContinue = () => undefined;
    this.screenFx = new ScreenTransition(document.getElementById('app') ?? document.body);

    const els = this.hud.elements;
    this.input.bind(els.joyZone, els.stickEl, els.aimZone, els.aimStickEl);
    this.input.autoFire = true;

    this.wireUI();
    this.wireEvents();
    this.loadProgress();
    this.applyGraphics(this.graphicsQuality, false);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('beforeunload', () => {
      this.silenceAudio();
      this.persist();
    });
    window.addEventListener('keydown', this.onOverlayKey);
    this.lockLandscape();

    assertNavPolicyInvariants();
    this.showMenu();
    this.maybeDebugFlyer();
    this.loop();
  }

  private lockLandscape(): void {
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void o.lock?.('landscape')?.catch(() => undefined);
    } catch {
      /* browser may ignore */
    }
    this.updateOrientationGate();
  }

  private updateOrientationGate(): void {
    if (!this.orientLock) return;
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    this.orientLock.classList.toggle('panel-hidden', !portrait);
  }

  private registerSessionCleaners(): void {
    sessionCleaner.register(() => this.weapon.reset());
    sessionCleaner.register(() => this.hardpoints.reset());
    sessionCleaner.register(() => this.cubeAnimator.reset());
    sessionCleaner.register(() => this.cubeDefense.reset());
    sessionCleaner.register(() => {
      // Soft particle clear: hide active by draining
      for (let i = 0; i < 3; i++) this.particles.update(1);
    });
  }

  private wipeCombatSession(): void {
    sessionCleaner.resetCombatWorld();
  }

  private armUiClickLock(ms = UI_CLICK_LOCK_MS): void {
    this.uiClickLockUntil = performance.now() + ms;
  }

  private isUiClickLocked(): boolean {
    return performance.now() < this.uiClickLockUntil;
  }

  private hidePauseCard(): void {
    this.pauseUI.hide();
  }

  private onOverlayKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.isUiClickLocked()) return;
    if (this.mode === 'settings') {
      e.preventDefault();
      this.closeActiveOverlay();
      return;
    }
    if (this.mode === 'tech') {
      e.preventDefault();
      // Same path as ✕ so tutorial notifyShopClosed still fires
      if (this.shopUI.onClose) this.shopUI.onClose();
      else this.closeActiveOverlay();
      return;
    }
    if (this.mode === 'research' || this.mode === 'levels') {
      e.preventDefault();
      this.closeActiveOverlay();
      return;
    }
    if (this.mode === 'paused') {
      e.preventDefault();
      this.resumeFromPause();
      return;
    }
    if (shouldPauseInsteadOfExtract(this.mode)) {
      e.preventDefault();
      this.showPause();
    }
  };

  private wireUI(): void {
    this.menu.onPlay = () => {
      if (this.isUiClickLocked()) return;
      void this.audio.resume();
      void this.music.unlock();
      this.startLevel(this.currentLevelId);
    };
    this.menu.onTech = () => {
      if (this.isUiClickLocked()) return;
      this.openTech();
    };
    this.menu.onLevels = () => {
      if (this.isUiClickLocked()) return;
      this.openLevels();
    };
    this.menu.onSettings = () => {
      if (this.isUiClickLocked()) return;
      this.openSettings();
    };
    this.menu.onResearch = () => {
      if (this.isUiClickLocked()) return;
      this.openResearch();
    };

    this.pauseUI.onResume = () => {
      if (this.isUiClickLocked()) return;
      this.resumeFromPause();
    };
    this.pauseUI.onSettings = () => {
      if (this.isUiClickLocked()) return;
      this.returnToPause = true;
      this.openSettings();
    };
    this.pauseUI.onShop = () => {
      if (this.isUiClickLocked()) return;
      this.returnToPause = true;
      this.openTech();
    };
    this.pauseUI.onExtract = () => {
      if (this.isUiClickLocked()) return;
      this.extractFromPause();
    };

    const els = this.hud.elements;
    els.btnTech.addEventListener('click', () => this.openTech());
    els.btnLevels.addEventListener('click', () => this.openLevels());
    els.btnMenu.addEventListener('click', () => {
      this.persist();
      if (shouldPauseInsteadOfExtract(this.mode)) {
        this.showPause();
      } else {
        this.showMenu({ forceReloadDemo: this.mode !== 'menu' });
      }
    });
    els.btnMute.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      this.music.setMuted(this.audio.muted);
      this.save.data.muted = this.audio.muted;
      this.hud.setMuted(this.audio.muted);
      this.persist();
    });
    els.shopHintOpen.addEventListener('click', () => {
      this.hud.hideShopHint();
      this.shopHintShown = true;
      this.openTech();
    });
    els.btnAmmo?.addEventListener('click', () => this.cycleMainGunAmmo());

    this.shopUI.onClose = () => {
      this.shopUI.hide();
      this.shopOpen = false;
      this.hud.hideShopHint();
      // Reveal next tutorial step only after shop is closed
      this.tutorial.notifyShopClosed({
        ownsDrone:
          this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked,
        ownsArcBeam: this.loadout.isOwned('rocket_pod'),
        hasEquippedWeapon: this.loadout.allDerived().length > 0,
        fleetExpanded: this.droneBays.equippedCount() >= 2,
        ownsSplitBeam: this.tech.owned.has('off_multi_1'),
      });
      this.closeActiveOverlay();
    };
    this.shopUI.onPurchase = (node) => this.buyUpgrade(node);
    this.shopUI.onBuyWeapon = (defId) => this.buyWeapon(defId);
    this.shopUI.onEquipWeapon = (slot, defId) => {
      if (!this.loadout.equip(slot, defId)) {
        if (defId && slot >= this.loadout.hardpointUnlocks) {
          this.toast('HARDPOINT LOCKED');
        }
        return;
      }
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
      if (defId) this.tutorial.notifyWeaponEquipped();
    };
    this.shopUI.onUpgradeBranch = (slot, branchId) => {
      const check = this.loadout.canUpgradeBranch(slot, branchId, this.currency.dataFragments);
      if (!check.ok) return false;
      if (!this.currency.spendFragments(check.cost)) return false;
      this.loadout.upgradeBranch(slot, branchId);
      this.sessionPurchased = true;
      this.tutorial.notifyPurchase();
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
      this.audio.playPurchase();
      return true;
    };
    this.shopUI.onUnlockHardpoint = (slot) => {
      const asc = this.save.data.ascensionTier;
      const minAsc = this.loadout.hardpointMinAscension(slot);
      if (asc < minAsc) {
        this.toast(`EVOLVE TO ASCENSION ${minAsc}`);
        return false;
      }
      const cost = this.loadout.hardpointCost(slot);
      // Peek discount; only consume after successful unlock
      const discount = this.ads.pendingHardpointDiscount;
      const finalCost = Math.round(cost * (1 - discount));
      if (this.currency.coreEnergy < finalCost) return false;
      if (!this.currency.spendCoreEnergy(finalCost)) return false;
      if (
        this.loadout.unlockHardpoint(slot, this.shopGateLevel(), asc) < 0
      ) {
        this.currency.addCoreEnergy(finalCost, 1);
        return false;
      }
      this.ads.consumeHardpointDiscount();
      this.sessionPurchased = true;
      this.tutorial.notifyPurchase();
      this.hardpoints.celebrateUnlock(slot);
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
      this.audio.playPurchase();
      return true;
    };
    this.shopUI.onRequestEvolveModal = () => this.openEvolveConfirm();
    this.shopUI.onUnlockDroneBay = () => {
      if (!this.tech.stats.dronesUnlocked && !this.tech.owned.has('drone_unlock')) {
        this.toast('BUY ALLY PROTOCOL FIRST');
        return false;
      }
      const cost = this.droneBays.nextBayCost();
      if (!this.droneBays.canUnlockBay()) return false;
      if (!this.currency.spendFragments(cost)) return false;
      if (!this.droneBays.unlockBay()) {
        this.currency.addFragments(cost, 1);
        return false;
      }
      // Auto-fill first empty bay from free inventory if possible
      const empty = this.droneBays.state.slots.findIndex((s) => s == null);
      if (empty >= 0) {
        for (const role of ['fighter', 'bomber', 'defender'] as DroneRole[]) {
          const free =
            (this.droneBays.state.owned[role] ?? 0) -
            this.droneBays.state.slots.filter((s) => s === role).length;
          if (free > 0) {
            this.droneBays.assignSlot(empty, role);
            break;
          }
        }
      }
      this.syncDronesFromBays();
      this.persist();
      this.audio.playPurchase();
      this.toast(`DRONE BAY ${this.droneBays.state.bays} ONLINE`);
      if (this.droneBays.equippedCount() >= 2) this.tutorial.notifyFleetExpanded();
      return true;
    };
    this.shopUI.onUnlockDroneType = (role) => {
      const def = DRONE_ROLES[role];
      if (this.shopGateLevel() < def.unlockLevel) {
        this.toast(`REQUIRES SECTOR ${def.unlockLevel}+`);
        return false;
      }
      if (this.droneBays.isTypeUnlocked(role)) return false;
      if (!this.currency.spendFragments(def.unlockCost)) return false;
      this.droneBays.unlockType(role);
      this.persist();
      this.audio.playPurchase();
      this.toast(`${def.name.toUpperCase()} UNLOCKED`);
      return true;
    };
    this.shopUI.onBuyDroneUnit = (role) => {
      if (!this.droneBays.isTypeUnlocked(role)) return false;
      const cost = this.droneBays.unitCost(role);
      if (!this.currency.spendFragments(cost)) return false;
      this.droneBays.buyUnit(role);
      // Auto-assign into first empty bay
      const empty = this.droneBays.state.slots.findIndex((s) => s == null);
      if (empty >= 0) this.droneBays.assignSlot(empty, role);
      this.syncDronesFromBays();
      this.persist();
      this.audio.playPurchase();
      if (this.droneBays.equippedCount() >= 2) this.tutorial.notifyFleetExpanded();
      return true;
    };
    this.shopUI.onAssignDroneSlot = (slot, role) => {
      const ok = this.droneBays.assignSlot(slot, role);
      if (ok) {
        this.syncDronesFromBays();
        this.persist();
        if (this.droneBays.equippedCount() >= 2) this.tutorial.notifyFleetExpanded();
      }
      return ok;
    };
    this.shopUI.onMoveDroneSlot = (from, to) => {
      const ok = this.droneBays.moveSlot(from, to);
      if (ok) {
        this.syncDronesFromBays();
        this.persist();
      }
      return ok;
    };
    this.shopUI.onUnlockBaseType = (id) => {
      const def = GROUND_WEAPONS[id];
      if (this.shopGateLevel() < def.unlockLevel) {
        this.toast(`REQUIRES SECTOR ${def.unlockLevel}+`);
        return false;
      }
      if (this.groundBays.isTypeUnlocked(id)) return false;
      if (!this.currency.spendFragments(def.unlockCost)) return false;
      this.groundBays.unlockType(id);
      this.persist();
      this.audio.playPurchase();
      this.toast(`${def.name.toUpperCase()} UNLOCKED`);
      return true;
    };
    this.shopUI.onBuyBaseUnit = (id) => {
      if (!this.groundBays.isTypeUnlocked(id)) return false;
      const cost = this.groundBays.unitCost(id);
      if (!this.currency.spendFragments(cost)) return false;
      this.groundBays.buyUnit(id);
      const empty = this.groundBays.state.slots.findIndex((s) => s == null);
      if (empty >= 0) this.groundBays.assignSlot(empty, id);
      this.syncGroundStations();
      this.persist();
      this.audio.playPurchase();
      return true;
    };
    this.shopUI.onAssignBaseSlot = (slot, id) => {
      const ok = this.groundBays.assignSlot(slot, id);
      if (ok) {
        this.syncGroundStations();
        this.persist();
      }
      return ok;
    };
    this.shopUI.onMoveBaseSlot = (from, to) => {
      const ok = this.groundBays.moveSlot(from, to);
      if (ok) {
        this.syncGroundStations();
        this.persist();
      }
      return ok;
    };
    this.shopUI.onUpgradeBaseType = (id) => {
      if (!this.groundBays.canUpgrade(id)) return false;
      const cost = this.groundBays.nextUpgradeCost(id);
      if (!this.currency.spendFragments(cost)) return false;
      this.groundBays.upgrade(id);
      this.syncGroundStations();
      this.persist();
      this.audio.playPurchase();
      this.toast(`${GROUND_WEAPONS[id].name.toUpperCase()} RANK ${this.groundBays.state.ranks[id]}`);
      return true;
    };

    this.researchUI.onClose = () => {
      this.researchUI.hide();
      this.closeActiveOverlay();
    };
    this.researchUI.onPurchase = (nodeId) => {
      const node = getResearchNode(nodeId);
      if (!node) return false;
      if (
        !this.research.purchase(node, this.currency, this.save.data.ascensionTier)
      ) {
        return false;
      }
      this.tech.setResearch(this.research.bonuses);
      if (this.research.bonuses.cosmeticTrail) {
        this.save.data.cosmeticTrail = true;
        this.applyCosmeticTrail();
      }
      this.applyStatsToSystems();
      this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
      this.audio.playPurchase();
      this.persist();
      this.toast(`RESEARCH: ${node.name}`);
      return true;
    };
    this.researchUI.onBuyIap = async (packId) => {
      if (this.corePurchaseLock) return false;
      this.corePurchaseLock = true;
      try {
        const { result, coreGranted, pack } = await this.iap.buyCorePack(packId);
        if (result.status !== 'purchased' || !pack) {
          this.toast('PURCHASE CANCELLED');
          return false;
        }
        this.currency.addCoreEnergy(coreGranted, 1);
        if (pack.bonusTrail) {
          this.save.data.cosmeticTrail = true;
          this.research.setExternalCosmeticTrail(true);
          this.tech.setResearch(this.research.bonuses);
          this.applyCosmeticTrail();
        }
        this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
        this.audio.playPurchase();
        this.persist();
        this.toast(`+${coreGranted} CORE`);
        return true;
      } finally {
        this.corePurchaseLock = false;
      }
    };
    this.researchUI.onWatchAdCore = async () => {
      if (this.corePurchaseLock) return false;
      this.corePurchaseLock = true;
      try {
        const { reward } = await this.ads.offer('core_energy');
        if (!reward?.coreEnergy) {
          this.toast('AD NOT AVAILABLE');
          return false;
        }
        this.currency.addCoreEnergy(reward.coreEnergy, 1);
        this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
        this.researchUI.setAdRemaining(this.ads.remaining('core_energy'));
        this.persist();
        this.toast(`+${reward.coreEnergy} CORE`);
        return true;
      } finally {
        this.corePurchaseLock = false;
      }
    };

    this.tutorial.onRequestShop = () => {
      const step = this.tutorial.currentStep;
      if (step?.id === 'loadout_buy' || step?.advance === 'weapon_owned') {
        this.openTech('loadouts');
      } else if (step?.id === 'fleet_hint' || step?.id === 'fleet_expand') {
        this.shopUI.setDroneSubTab('stock');
        this.openTech('drone_bays');
      } else if (step?.id === 'gun_hint' || step?.id === 'gun_buy') {
        this.openTech('main_gun');
      } else if (
        step?.id === 'shop_drone' ||
        step?.id === 'shop_hint' ||
        step?.advance === 'drone_owned'
      ) {
        // Ally Protocol lives under DRONES → UPGRADES
        this.shopUI.setDroneSubTab('upgrades');
        this.openTech('drone_bays');
      } else {
        this.openTech();
      }
    };
    this.tutorial.onComplete = (id) => {
      if (id === 'stage1') this.save.data.tutorialStage1Done = true;
      if (id === 'loadout') this.save.data.tutorialLoadoutDone = true;
      if (id === 'fleet') this.save.data.tutorialFleetDone = true;
      if (id === 'gun') this.save.data.tutorialGunDone = true;
      if (id === 'flyer') this.save.data.tutorialFlyerDone = true;
      this.persist();
    };

    this.levelUI.onClose = () => {
      this.levelUI.hide();
      this.closeActiveOverlay();
    };
    this.levelUI.onSelect = (id) => {
      this.levelUI.hide();
      void this.audio.resume();
      this.startLevel(id);
    };
    this.levelUI.onSelectTransit = (afterId) => {
      this.levelUI.hide();
      void this.audio.resume();
      this.startTransitReplay(afterId);
    };
    this.levelUI.onSelectFlyerTest = (scene) => {
      this.levelUI.hide();
      void this.audio.resume();
      void this.music.unlock();
      this.startFlyerTest(scene);
    };
    this.levelUI.onReplayIntro = () => {
      this.levelUI.hide();
      void this.audio.resume();
      this.forceCinematicNext = true;
      this.startLevel(1);
    };

    // Legacy standalone loadout still redirects into shop tab
    this.loadoutUI.onClose = () => {
      this.loadoutUI.hide();
      this.openTech('loadouts');
    };
    this.loadoutUI.onChanged = () => {
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
    };
    this.loadoutUI.onUnlockHardpoint = (slot, cost) => {
      const asc = this.save.data.ascensionTier;
      if (asc < this.loadout.hardpointMinAscension(slot)) {
        this.toast(`EVOLVE TO ASCENSION ${this.loadout.hardpointMinAscension(slot)}`);
        return false;
      }
      const discount = this.ads.pendingHardpointDiscount;
      const finalCost = Math.round(cost * (1 - discount));
      if (!this.currency.spendCoreEnergy(finalCost)) return false;
      if (this.loadout.unlockHardpoint(slot, this.shopGateLevel(), asc) < 0) {
        this.currency.addCoreEnergy(finalCost, 1);
        return false;
      }
      this.ads.consumeHardpointDiscount();
      this.hardpoints.celebrateUnlock(slot);
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
      this.audio.playPurchase();
      return true;
    };
    this.loadoutUI.onSpendFragments = (n) => this.currency.spendFragments(n);

    this.settingsUI.onClose = () => {
      this.settingsUI.hide();
      this.closeActiveOverlay();
    };
    this.settingsUI.onGraphicsChange = (q) => {
      this.graphicsQuality = q;
      this.save.data.graphicsQuality = q;
      this.applyGraphics(q, false);
      this.persist();
      this.audio.playUi();
      // Stay on settings screen — do not change mode / camera
    };
    this.settingsUI.onMuteChange = (m) => {
      this.audio.setMuted(m);
      this.music.setMuted(m);
      this.save.data.muted = m;
      this.hud.setMuted(m);
      this.persist();
    };
    this.settingsUI.onVolumeChange = (v) => {
      this.audio.setVolume(v);
      this.music.setMasterVolume(Math.min(1, v * 0.85));
      this.save.data.masterVolume = v;
      this.persist();
    };
    this.settingsUI.onReset = () => {
      this.save.reset();
      this.shopHintShown = false;
      this.hasSeenCinematic = false;
      this.settingsUI.hide();
      this.hidePauseCard();
      this.returnToPause = false;
      this.loadProgress();
      this.applyGraphics(this.graphicsQuality, false);
      this.showMenu({ forceReloadDemo: true });
      this.toast('PROGRESS RESET');
    };

    this.adsUI.onAccepted = (placement) => {
      void this.handleAdReward(placement);
    };
  }

  /**
   * Apply graphics tier to renderer / post / particles / ambient.
   * @param demoted if true, runtime-only (FPS safety) — does not change user preference.
   */
  private applyGraphics(quality: GraphicsQuality, demoted: boolean): void {
    this.effectiveQuality = quality;
    if (!demoted) this.graphicsQuality = quality;

    const preset = getGraphicsPreset(quality);
    const dpr = Math.min(window.devicePixelRatio || 1, preset.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMappingExposure = preset.exposure;
    this.post.setSize(window.innerWidth, window.innerHeight);
    this.post.setQuality(quality);
    this.particles.setBudget(Math.min(PERF.maxParticles, preset.particleBudget));
    this.arena.setQuality(preset.ambientTier);
    this.cameraCtrl.resize(window.innerWidth / window.innerHeight);
    // Base VFX density from tier (adaptive FPS may pull this down further)
    this.vfxScale =
      quality === 'high' ? 1 : quality === 'medium' ? 0.72 : 0.42;
    if (!demoted) {
      this.combatBloomElapsed = 0;
      this.bloomThermallyCut = false;
      this.post.setThermalBloomCut(false);
    } else if (this.bloomThermallyCut) {
      this.post.setThermalBloomCut(true);
    }
  }

  private openSettings(): void {
    if (!canOpenOverlay(this.mode) && this.mode !== 'paused') return;
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.researchUI.hide();
    // Hide pause card so overlay-root cannot steal settings clicks
    const keepPauseReturn = this.returnToPause || this.mode === 'paused';
    this.hidePauseCard();
    const fromCombat = isFromCombatSeat({
      mode: this.mode,
      menuDemoActive: this.menuDemoActive,
      pendingReturnPlaying: this.pendingReturnMode === 'playing',
    });
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
    this.returnToPause = keepPauseReturn && fromCombat;
    this.mode = 'settings';
    this.hud.setVisible(false);
    this.settingsUI.show({
      graphics: this.graphicsQuality,
      muted: this.audio.muted,
      volume: this.audio.volume,
    });
    this.syncMusicToMode();
  }

  private async handleAdReward(placement: import('../ads/AdProvider').AdPlacement): Promise<void> {
    const { reward } = await this.ads.offer(placement);
    if (!reward) return;
    if (reward.fragments) this.currency.addFragments(reward.fragments, 1);
    if (reward.coreEnergy) this.currency.addCoreEnergy(reward.coreEnergy, 1);
    if (reward.fragmentMul) this.clearRewardMul = Math.max(this.clearRewardMul, reward.fragmentMul);
    if (reward.hullRestore) this.vitals.heal(this.vitals.maxHull * reward.hullRestore);
    if (reward.shieldFull) this.vitals.restoreShield(this.vitals.maxShield);
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.persist();
    this.toast('AD REWARD APPLIED');
  }

  /** Shop / arsenal gates stay on lifetime progress so Evolve does not re-lock weapons. */
  private shopGateLevel(): number {
    return Math.max(this.save.data.highestLevel, this.save.data.lifetimeHighestLevel ?? 1);
  }

  private openEvolveConfirm(): void {
    const tier = this.save.data.ascensionTier;
    const check = canEvolve(
      this.currency.dataFragments,
      this.save.data.highestLevel,
      tier
    );
    const cost = check.cost;
    const leftover = Math.max(0, this.currency.dataFragments - cost);
    this.evolveConfirm.show({
      cost,
      nextTier: tier + 1,
      grant: evolveCoreGrant(tier + 1),
      leftover,
      convertCores: Math.floor(leftover / EVOLVE_FRAG_PER_CORE),
      fragPerCore: EVOLVE_FRAG_PER_CORE,
      resetSector: EVOLVE_RESET_LEVEL,
      furthestBeacon: furthestCompletedBeacon(this.save.data.lifetimeHighestLevel ?? 1),
      canConfirm: check.ok,
      reason: check.reason,
    });
  }

  /** Evolve hull: spend FRAG, reset combat shop, permanent baseline, Core grant. */
  private performEvolve(): boolean {
    const tier = this.save.data.ascensionTier;
    const check = canEvolve(
      this.currency.dataFragments,
      this.save.data.highestLevel,
      tier
    );
    if (!check.ok) {
      this.toast(check.reason?.toUpperCase() ?? 'CANNOT EVOLVE');
      return false;
    }
    const cost = evolveCost(tier);
    if (!this.currency.spendFragments(cost)) return false;

    const newTier = tier + 1;
    this.save.data.ascensionTier = newTier;
    this.save.data.lifetimeEvolves = (this.save.data.lifetimeEvolves ?? 0) + 1;
    this.save.data.baseline = baselineFromTier(newTier);
    this.currency.prestigeTokens = newTier;

    this.save.data.lifetimeHighestLevel = Math.max(
      this.save.data.lifetimeHighestLevel ?? 1,
      this.save.data.highestLevel,
      this.currentLevelId
    );
    this.save.data.highestLevel = EVOLVE_RESET_LEVEL;
    this.currentLevelId = EVOLVE_RESET_LEVEL;
    this.save.data.currentLevel = EVOLVE_RESET_LEVEL;
    this.pendingNextLevelId = EVOLVE_RESET_LEVEL;

    // Run-layer shop reset. KEEP: ownedWeapons, pilots (if present).
    // RESET: upgrades, drones, bases, hardpoint buys.
    // Research / Ascension baseline stay (meta).
    this.tech.resetCombatUpgrades();
    this.tech.setAscensionTier(newTier);
    this.tech.setBaseline(this.save.data.baseline);
    this.tech.setResearch(this.research.bonuses);
    this.loadout.resetForEvolve();
    this.droneBays.resetToDefault();
    this.groundBays.resetToDefault();
    this.groundBays.setRankCap(repeatableUpgradeCap(newTier));
    this.mainGunAmmo = 'standard';
    this.hardpoints.rebuildFromLoadout();
    this.syncGroundStations();
    this.syncDronesFromBays();
    this.clampMainGunAmmo();

    const grant = evolveCoreGrant(newTier);
    this.currency.addCoreEnergy(grant, 1);

    // Convert leftover FRAG → CORE at 1000:1 (remainder FRAG kept)
    const leftover = this.currency.dataFragments;
    const converted = Math.floor(leftover / EVOLVE_FRAG_PER_CORE);
    if (converted > 0) {
      this.currency.spendFragments(converted * EVOLVE_FRAG_PER_CORE);
      this.currency.addCoreEnergy(converted, 1);
    }

    this.applyStatsToSystems();
    this.vitals.fullRestore();
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.shopUI.setLoadoutContext(this.loadout, this.shopGateLevel(), newTier);
    this.persist();
    this.audio.playPurchase();
    const convertMsg = converted > 0 ? ` · +${converted} CORE FROM FRAG` : '';
    this.toast(
      `ASCENSION ${newTier} · SECTOR ${EVOLVE_RESET_LEVEL} · SKIP BEACONS · +${grant} CORE${convertMsg}`
    );
    bus.emit('evolved', {
      tier: newTier,
      coreGrant: grant,
      fragConverted: converted,
    });
    if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'intro') {
      this.startLevel(EVOLVE_RESET_LEVEL);
    }
    return true;
  }

  private openResearch(): void {
    if (!canOpenOverlay(this.mode) && this.mode !== 'paused') return;
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    const keepPauseReturn = this.returnToPause || this.mode === 'paused';
    this.hidePauseCard();
    const fromCombat = isFromCombatSeat({
      mode: this.mode,
      menuDemoActive: this.menuDemoActive,
      pendingReturnPlaying: this.pendingReturnMode === 'playing',
    });
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
    this.returnToPause = keepPauseReturn && fromCombat;
    this.mode = 'research';
    this.hud.setVisible(false);
    this.researchUI.show(
      this.research,
      this.currency,
      this.save.data.ascensionTier,
      this.ads.remaining('core_energy')
    );
    this.syncMusicToMode();
  }

  private wireEvents(): void {
    this.unsubs.push(
      bus.on(
        'beam-hit',
        (r: {
          destroyed: boolean;
          type: BlockType;
          x: number;
          y: number;
          z: number;
          fragments: number;
          crit?: boolean;
          style?: 'beam' | 'bolt' | 'splash' | 'explosive' | 'default';
          impactNx?: number;
          impactNy?: number;
          impactNz?: number;
        }) => {
          const len = Math.hypot(r.x, r.y, r.z) || 1;
          // Outward from cube center as default impact bias
          const nx = r.impactNx ?? r.x / len;
          const ny = r.impactNy ?? r.y / len;
          const nz = r.impactNz ?? r.z / len;
          this.cubeAnimator.notifyDamage(r.destroyed ? 18 : 5);

          if (r.destroyed) {
            const style =
              r.style ??
              (r.type === BlockType.Explosive
                ? 'explosive'
                : 'bolt');
            // Scale mesh debris / particles for GPU budget
            this.shatter.shatter(
              r.x,
              r.y,
              r.z,
              r.type,
              style,
              nx,
              ny,
              nz,
              this.vfxScale
            );
            if (this.vfxScale > 0.45 || r.type === BlockType.Core || r.crit) {
              this.rings.spawn(
                r.x,
                r.y,
                r.z,
                colorForType(r.type),
                (r.type === BlockType.Core ? 2.0 : 1.35) * this.vfxScale
              );
            }
            if (r.type === BlockType.Core || r.crit || Math.random() < this.vfxScale) {
              this.cameraCtrl.shake(
                (r.type === BlockType.Core ? 0.24 : r.crit ? 0.16 : 0.1) * this.vfxScale
              );
            }
            this.audio.playDestroy(
              r.type === BlockType.Core || r.type === BlockType.Explosive
            );
            const gained = this.currency.addFragments(r.fragments, this.tech.stats.fragmentMul);
            this.save.data.totalBlocksDestroyed++;
            this.sessionBlocksDestroyed++;
            if (gained > 0) {
              this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
            }
            this.refreshShopPrompt();
          } else {
            // Non-destroy hits: skip most rings on low VFX to cut draw calls
            if (r.crit || this.vfxScale > 0.7) {
              this.shatter.impact(r.x, r.y, r.z, nx, ny, nz, !!r.crit);
            }
            if (r.crit || Math.random() < this.vfxScale * 0.55) {
              this.rings.spawn(
                r.x,
                r.y,
                r.z,
                r.crit ? COLORS.magenta : COLORS.cyan,
                (r.crit ? 0.85 : 0.55) * this.vfxScale
              );
            }
            this.audio.playHit(!!r.crit);
          }
        }
      ),
      bus.on('weapon-fire', (p: { family?: string }) => {
        this.audio.playFire(p?.family ?? 'beam');
      }),
      bus.on('player-leech', (p: { amount?: number }) => {
        const amt = p?.amount ?? 0;
        if (amt > 0) this.vitals.restoreShield(amt);
      }),
      bus.on(
        'explosion',
        (p: { x: number; y: number; z: number; radius?: number; family?: string }) => {
          const r = p.radius ?? 2;
          const s = this.vfxScale;
          this.rings.spawn(p.x, p.y, p.z, COLORS.magenta, (1.0 + r * 0.3) * s);
          if (s > 0.55) {
            this.rings.spawn(p.x, p.y, p.z, COLORS.gold, (0.7 + r * 0.2) * s);
          }
          const n = Math.max(3, Math.floor(14 * s));
          this.particles.spawn(p.x, p.y, p.z, 0xff6622, n, 12 * s, 'ember');
          this.particles.spawn(p.x, p.y, p.z, 0xffffff, Math.floor(n * 0.5), 7 * s, 'glow');
          if (s > 0.6) {
            this.particles.spawn(p.x, p.y, p.z, COLORS.gold, Math.floor(n * 0.6), 10 * s, 'spark');
          }
          this.cameraCtrl.shake((0.08 + Math.min(0.18, r * 0.035)) * s);
          this.audio.playExplosion(r, p.family);
        }
      ),
      bus.on('upgrade-purchased', () => {
        this.audio.playPurchase();
        this.sessionPurchased = true;
        this.tutorial.notifyPurchase();
        this.applyStatsToSystems();
        this.shopHintShown = true;
        this.hud.hideShopHint();
        this.persist();
        this.refreshShopPrompt();
      }),
      bus.on('crit', () => this.audio.playCrit()),
      bus.on('cube-rotation-start', () => this.audio.playCubeShift()),
      bus.on('turret-fire', () => this.audio.playFire('flak')),
      bus.on('enemy-drone-fire', () => this.audio.playFire('drone')),
      bus.on('enemy-drone-telegraph', () => this.audio.playFire('drone_warn')),
      bus.on(
        'enemy-drone-hit',
        (p: { x: number; y: number; z: number; killed?: boolean }) => {
          if (p.killed) return;
          this.particles.spawn(p.x, p.y, p.z, 0xff5533, 12, 6, 'spark');
          this.particles.spawn(p.x, p.y, p.z, 0xffee88, 6, 4, 'glow');
          this.audio.playHit(false);
        }
      ),
      bus.on('core-rage-laser-charge', () => this.audio.playFire('rail')),
      bus.on('core-rage-laser-fire', () => this.audio.playFire('beam')),
      bus.on('core-spike-telegraph', () => this.audio.playFire('rail')),
      bus.on('core-spike-fire', () => this.audio.playFire('flak')),
      // Single shake path only (animator emits camera-shake-request on complete)
      bus.on('camera-shake-request', (p: { amount?: number }) => {
        if (this.mode === 'playing' || this.mode === 'cinematic') {
          this.cameraCtrl.shake(Math.min(0.12, p?.amount ?? 0.08));
        }
      }),
      bus.on(
        'core-notify',
        (p: { title?: string; body?: string; kind?: string }) => {
          // Purely informational — no shake / SFX / gameplay interrupt
          this.showPhaseChip(p.title ?? 'NUCLEUS', p.kind ?? '', p.body);
        }
      ),
      bus.on('core-destroyed', () => {
        // Full sequence owned by beginCoreDeathSequence (shake + lattice shatter)
        if (this.mode === 'playing') this.beginCoreDeathSequence();
      }),
      bus.on(
        'enemy-drone-destroyed',
        (p: { x?: number; y?: number; z?: number }) => {
          this.currency.addFragments(3, this.tech.stats.fragmentMul);
          this.audio.playDestroy(false);
          if (typeof p?.x === 'number') {
            this.particles.spawn(p.x, p.y ?? 0, p.z ?? 0, 0xff2244, 16, 8, 'ember');
          }
        }
      )
    );
  }

  /** Small non-blocking phase label (does not steal focus or block input). */
  private showPhaseChip(title: string, kind: string, body?: string): void {
    // Host on toast-root — never #overlay-root (that dims + blocks input)
    this.toastRoot.querySelectorAll('.phase-chip').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = `phase-chip phase-${kind || 'info'}`;
    if (body) {
      const head = document.createElement('b');
      head.textContent = title;
      const sub = document.createElement('span');
      sub.textContent = body;
      el.append(head, sub);
    } else {
      el.textContent = title;
    }
    el.setAttribute('aria-live', 'polite');
    this.toastRoot.appendChild(el);
    setTimeout(() => el.remove(), body ? 2800 : 1600);
  }

  private onPlayerDamaged(amount: number): void {
    if (this.mode !== 'playing') return;
    // Post-ad repair grace — ignore all combat damage
    if (this.reviveImmunity > 0) return;
    // Defender escort bubbles absorb only when a defender is near the ship
    const afterShield = this.drones.absorbFrontalDamage(amount, this.ship.position);
    if (afterShield <= 0) {
      this.cameraCtrl.shake(0.04);
      return;
    }
    const hit = this.vitals.takeDamage(afterShield);
    this.cameraCtrl.shake(0.1);
    this.audio.playPlayerHit();
    this.updateHudVitals();
    if (hit.died) this.beginShipDeath();
  }

  /** Combat immunity after emergency repair revive (base 5s + research IFF). */
  private grantReviveImmunity(seconds = 5): void {
    const bonus = this.research.bonuses.reviveImmunityBonus ?? 0;
    const total = seconds + bonus;
    this.reviveImmunity = Math.max(this.reviveImmunity, total);
    this.toast(`IFF REBOOT · ${total.toFixed(1)}s IMMUNITY`);
  }

  /** Explosive ship death → black fade → game-over card. */
  private beginShipDeath(): void {
    if (this.mode === 'dying' || this.mode === 'dead') return;
    this.mode = 'dying';
    this.deathTimer = 0;
    this.deathFadeStarted = false;
    this.deathOrigin.copy(this.ship.position);
    this.hud.setVisible(false);
    this.hud.setCrosshairVisible(false);
    this.reticle.setVisible(false);
    this.hardpoints.reset();
    this.weapon.reset();
    this.teardownTransitVisuals();
    this.persist();

    // Initial detonation
    this.spawnShipExplosion(this.deathOrigin, 1.4);
    this.cameraCtrl.shake(0.55);
    try {
      this.audio.playShipDeath();
    } catch {
      /* ignore */
    }
  }

  private spawnShipExplosion(at: THREE.Vector3, intensity = 1): void {
    const s = Math.max(0.5, intensity);
    this.particles.spawn(at.x, at.y, at.z, COLORS.magenta, Math.floor(28 * s), 14 * s, 'glow');
    this.particles.spawn(at.x, at.y, at.z, COLORS.cyan, Math.floor(22 * s), 12 * s, 'spark');
    this.particles.spawn(at.x, at.y, at.z, 0xffaa44, Math.floor(18 * s), 10 * s, 'ember');
    this.particles.spawn(at.x, at.y, at.z, 0xffffff, Math.floor(12 * s), 8 * s, 'debris');
    this.rings.spawn(at.x, at.y, at.z, COLORS.magenta, 1.8 * s);
    this.rings.spawn(at.x, at.y, at.z, COLORS.cyan, 1.2 * s);
  }

  private updateDying(dt: number): void {
    this.deathTimer += dt;
    // Secondary blasts while wreck is visible
    if (this.deathTimer < 0.9 && Math.random() < dt * 8) {
      const j = 0.35 + Math.random() * 0.9;
      this.spawnShipExplosion(
        this.tmpDeathOffset(this.deathOrigin, j),
        0.55 + Math.random() * 0.7
      );
      this.cameraCtrl.shake(0.12 + Math.random() * 0.15);
    }
    // Collapse ship scale / hide mid-sequence
    if (this.deathTimer < 0.55) {
      const u = this.deathTimer / 0.55;
      const sc = Math.max(0.05, 1 - u * u);
      this.ship.group.scale.setScalar(sc);
      this.ship.group.rotation.z += dt * (2 + u * 6);
      this.ship.group.rotation.x += dt * 1.5;
    } else {
      this.ship.group.visible = false;
      this.ship.group.scale.setScalar(1);
      this.hardpoints.group.visible = false;
    }

    this.cameraCtrl.update(dt);

    // Fade to black then show game-over (once)
    if (this.deathTimer >= 1.05 && !this.deathFadeStarted) {
      this.deathFadeStarted = true;
      const started = this.screenFx.play({
        fadeOut: 0.55,
        hold: 0.35,
        fadeIn: 0.65,
        onBlack: () => this.showDeathOverlay(),
      });
      if (!started) this.showDeathOverlay();
    }
  }

  private tmpDeathOffset(origin: THREE.Vector3, spread: number): THREE.Vector3 {
    return new THREE.Vector3(
      origin.x + (Math.random() - 0.5) * spread,
      origin.y + (Math.random() - 0.5) * spread,
      origin.z + (Math.random() - 0.5) * spread
    );
  }

  private showDeathOverlay(): void {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.ship.group.visible = false;
    this.hardpoints.group.visible = false;
    this.wipeCombatSession();

    this.overlay.innerHTML = `
      <div class="overlay-card interactive docked-actions-card">
        <div class="card-body overlay-body">
          <h2>SYSTEMS CRITICAL</h2>
          <p>Hull integrity failure. Extracting with partial salvage.</p>
          <div class="reward">Emergency extract</div>
        </div>
        <div class="overlay-actions card-actions">
          <button class="menu-btn primary" id="dead-repair" type="button">WATCH AD · REPAIR</button>
          <button class="menu-btn" id="dead-extract" type="button">EXTRACT</button>
        </div>
      </div>
    `;
    this.overlay.querySelector('#dead-repair')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      const shown = this.adsUI.show(this.ads, {
        placement: 'death_repair',
        rewardText: 'Restore shield + 30% hull',
      });
      if (!shown) {
        this.vitals.fullRestore();
        this.ship.group.visible = true;
        this.ship.group.scale.setScalar(1);
        this.hardpoints.group.visible = true;
        this.mode = 'playing';
        this.hud.setVisible(true);
        this.grantReviveImmunity(5);
        this.toast('REPAIR UNAVAILABLE — FULL RESTORE');
      } else {
        this.adsUI.onAccepted = (p) => {
          void this.handleAdReward(p).then(() => {
            if (this.vitals.isAlive) {
              this.ship.group.visible = true;
              this.ship.group.scale.setScalar(1);
              this.hardpoints.group.visible = true;
              this.mode = 'playing';
              this.hud.setVisible(true);
              this.grantReviveImmunity(5);
            }
          });
        };
        this.adsUI.onDeclined = () => {
          this.extractToMenu();
        };
      }
    });
    this.overlay.querySelector('#dead-extract')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.extractToMenu();
    });
  }

  /** Ensure ship/hardpoints are renderable (clears cinematic scale-0 / death hide). */
  private restoreShipVisual(): void {
    this.ship.group.visible = true;
    this.ship.group.scale.setScalar(1);
    this.hardpoints.group.visible = true;
  }

  /** Restore combat camera/ship after closing the shop mid-stage. */
  private resumeGameplayFromShop(): void {
    this.hidePauseCard();
    this.returnToPause = false;
    this.mode = 'playing';
    this.menuDemoActive = false;
    this.shopOpen = false;
    this.levelLoadBusy = false;
    // Force gameplay chase camera (shop must never leave us in cinematic/blend)
    this.cameraCtrl.endCinematic();
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);
    this.cube.group.visible = true;
    this.cinematicCube.group.visible = false;
    this.restoreShipVisual();
    this.hud.setIntro(false);
    // Snap ship onto current orbit seat so chase camera is coherent
    for (let i = 0; i < 12; i++) this.ship.update(this.cameraCtrl, 0.05);
    this.hud.setVisible(true);
    this.hud.setCrosshairVisible(true);
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    // Re-evaluate shop/loadout HUD buttons (buy while in shop may have hidden them)
    this.refreshShopPrompt();
    // Tutorial card already refreshed in shop onClose → notifyShopClosed
    if (!this.shopOpen) this.tutorial.showIfActive();
    this.syncMusicToMode();
  }

  /** Drive BGM context from current game mode. */
  private syncMusicToMode(): void {
    const m = this.mode;
    if (m === 'menu') {
      this.music.setContext('menu');
      this.radio?.show();
      return;
    }
    this.radio?.hide();
    if (m === 'cinematic') {
      this.music.setContext('intro');
      return;
    }
    if (m === 'intro' || m === 'playing' || m === 'levelclear') {
      if (this.currentLevelId <= 1) this.music.setContext('stage1');
      else this.music.setContext('stage', { levelId: this.currentLevelId });
      return;
    }
    // Sector select / settings / combat pause: keep current bed — no restart
    if (m === 'levels' || m === 'settings' || m === 'paused') {
      this.music.setContext('preserve');
      return;
    }
    // Shop / research / loadout: duck + muffle, never stop the bed
    if (m === 'tech' || m === 'research' || m === 'loadout') {
      this.music.setContext('ui');
      return;
    }
    // dying / dead — keep whatever is playing
    this.music.ensurePlaying();
  }

  private extractToMenu(): void {
    this.vitals.fullRestore();
    this.showMenu({ forceReloadDemo: true });
  }

  private applyStatsToSystems(): void {
    this.vitals.syncFromStats(this.tech.stats);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);
    // Hardpoints are Ascension + Core unlocks only (not combat shop).
    this.hardpoints.bindLoadout(this.loadout);
    this.syncDronesFromBays();
    this.updateHudVitals();
    this.clampMainGunAmmo();
  }

  private ammoFlags(): { ammoAp: boolean; ammoHe: boolean } {
    return { ammoAp: this.tech.stats.ammoAp, ammoHe: this.tech.stats.ammoHe };
  }

  private clampMainGunAmmo(): void {
    this.mainGunAmmo = normalizeMainGunAmmo(this.mainGunAmmo, this.ammoFlags());
    this.refreshAmmoHud();
  }

  private cycleMainGunAmmo(): void {
    const next = nextMainGunAmmo(this.mainGunAmmo, this.ammoFlags());
    if (next === this.mainGunAmmo) {
      this.toast('UNLOCK AP / HE IN THE GUN SHOP');
      return;
    }
    this.mainGunAmmo = next;
    const p = MAIN_GUN_AMMO[next];
    this.toast(`${p.short} · ${p.name.toUpperCase()}`);
    this.refreshAmmoHud();
    this.persist();
  }

  private refreshAmmoHud(): void {
    const p = MAIN_GUN_AMMO[this.mainGunAmmo];
    const flags = this.ammoFlags();
    this.hud.updateAmmo({
      short: p.short,
      name: p.name,
      hint: p.hint,
      id: p.id,
      canCycle: flags.ammoAp || flags.ammoHe,
    });
  }

  private syncDronesFromBays(): void {
    this.drones.bindBayController(this.droneBays);
    // Reflect equipped count into tech-facing droneCount for idle/stats
    this.tech.stats.droneCount = this.droneBays.equippedCount();
    if (this.droneBays.equippedCount() > 0 || this.droneBays.state.bays > 0) {
      this.tech.stats.dronesUnlocked = true;
    }
    this.drones.syncFromBays(this.tech.stats);
  }

  private syncGroundStations(): void {
    this.groundStations.applyLoadout(this.groundBays.state);
  }

  private updateHudVitals(): void {
    const snap = this.vitals.snapshot();
    this.shopUI.setVitals(snap);
    this.hud.updateVitals(snap);
    this.hud.updateDrones(this.drones.getHudEntries());
  }

  private cheapestAffordable(): UpgradeNodeDef | null {
    let best: UpgradeNodeDef | null = null;
    for (const n of this.tech.nodes) {
      if (!this.tech.canPurchase(n)) continue;
      if (!this.tech.canAfford(n, this.currency)) continue;
      if (!best || n.cost < best.cost) best = n;
    }
    return best;
  }

  private refreshShopPrompt(): void {
    if (this.mode !== 'playing' && this.mode !== 'intro') {
      this.hud.setShopAffordable(false, false, '', false);
      return;
    }
    const ownsDrone = this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked;
    const droneCost = FIRST_DRONE_COST;
    const canAffordDrone =
      !ownsDrone && this.currency.dataFragments >= droneCost;
    // Shop hidden until first drone is affordable OR already owned
    const shopVisible = ownsDrone || canAffordDrone;

    const rec = this.cheapestAffordable();
    const weapon = cheapestPurchasableWeapon(
      this.loadout.ownedWeapons,
      this.currency.dataFragments,
      this.shopGateLevel()
    );
    const canBuy = shopVisible && (!!rec || !!weapon);
    const firstDrone =
      canAffordDrone && !this.shopHintShown && !this.tutorial.isActive;
    const firstWeapon =
      !!weapon &&
      weapon.id === 'rocket_pod' &&
      !this.loadout.isOwned('rocket_pod') &&
      !this.save.data.tutorialLoadoutDone &&
      this.shopGateLevel() >= 3;

    let hint = '';
    if (firstDrone) {
      hint =
        `Ally Protocol ready — ${FIRST_DRONE_COST} FRAG. Open SHOP and buy your first AI drone.`;
    } else if (firstWeapon && weapon) {
      const c = weaponUnlockCost(weapon);
      hint = `Rocket Pod ready — ${c.fragments} FRAG. Open SHOP → LOADOUTS for your first hardpoint weapon.`;
      this.tutorial.tryStartLoadout();
    } else if (rec && shopVisible) {
      hint = `You can buy “${rec.name}” (${rec.cost} ${
        rec.costCurrency === 'coreEnergy' ? 'CORE' : 'FRAG'
      }) — ${rec.description}`;
    } else if (weapon && shopVisible) {
      const c = weaponUnlockCost(weapon);
      hint = `Weapon available: ${weapon.name} · ${c.fragments} FRAG in LOADOUTS`;
    }
    this.hud.setShopAffordable(
      canBuy,
      firstDrone || firstWeapon,
      hint,
      shopVisible,
      rec?.name ?? weapon?.name ?? ''
    );
  }

  private loadProgress(): void {
    const data = this.save.load();
    this.currency.load(data.dataFragments, data.coreEnergy, data.prestigeTokens);
    // Drop legacy hardpoint shop nodes (now Ascension-gated Core unlocks)
    const combatOwned = (data.ownedUpgrades ?? []).filter(
      (id) => id !== 'hardpoint_2' && id !== 'hardpoint_3'
    );
    this.tech.load(combatOwned);

    const tier = data.ascensionTier ?? 0;
    const baseline = baselineFromTier(tier);
    this.save.data.baseline = baseline;
    this.save.data.ascensionTier = tier;
    this.save.data.lifetimeEvolves = data.lifetimeEvolves ?? tier;
    this.tech.setBaseline(baseline);

    this.research.load(
      data.researchOwned ?? [],
      !!data.cosmeticTrail,
      data.researchRanks
    );
    this.tech.setResearch(this.research.bonuses);
    this.applyCosmeticTrail();

    this.currentLevelId = data.currentLevel;
    this.audio.setMuted(data.muted);
    this.audio.setVolume(data.masterVolume);
    this.music.setMuted(data.muted);
    this.music.setMasterVolume(Math.min(1, data.masterVolume * 0.85));
    this.hud.setMuted(data.muted);
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.mainGunAmmo = normalizeMainGunAmmo(data.mainGunAmmo, {
      ammoAp: this.tech.stats.ammoAp,
      ammoHe: this.tech.stats.ammoHe,
    });
    this.refreshAmmoHud();
    this.graphicsQuality = data.graphicsQuality ?? DEFAULT_GRAPHICS_QUALITY;
    this.effectiveQuality = this.graphicsQuality;

    this.loadout.load({
      hardpointUnlocks: data.hardpointsUnlocked,
      slots: data.loadout.map((s) =>
        s ? { defId: s.defId, branchRanks: s.ranks ?? {} } : null
      ),
      ownedWeapons: data.ownedWeapons,
    });
    this.tech.setAscensionTier(data.ascensionTier ?? 0);
    this.loadout.syncLevelUnlocks(Math.max(data.highestLevel, data.lifetimeHighestLevel ?? 1));
    this.hardpoints.bindLoadout(this.loadout);

    // Drone bays — migrate legacy droneCount if empty
    this.droneBays.load({
      bays: data.droneBays,
      owned: data.droneOwned as never,
      slots: data.droneSlots as never,
      unlockedTypes: data.droneUnlockedTypes as never,
    });
    if (
      this.droneBays.state.bays === 0 &&
      this.tech.stats.dronesUnlocked &&
      this.tech.stats.droneCount > 0
    ) {
      // Migrate old all-miner fleets → fighter bays
      const n = Math.min(12, this.tech.stats.droneCount);
      this.droneBays.state.bays = n;
      this.droneBays.state.owned.fighter = n;
      this.droneBays.state.slots = Array.from({ length: n }, () => 'fighter' as DroneRole);
      this.droneBays.state.unlockedTypes = ['fighter'];
    }
    this.syncDronesFromBays();
    this.groundBays.load({
      owned: data.baseOwned as never,
      slots: data.baseSlots as never,
      unlockedTypes: data.baseUnlockedTypes as never,
      ranks: data.baseRanks as never,
    });
    this.groundBays.setRankCap(tier);
    this.syncGroundStations();

    this.tutorial.setFlags(
      !!data.tutorialStage1Done,
      !!data.tutorialLoadoutDone,
      !!data.tutorialFleetDone,
      !!data.tutorialGunDone,
      !!data.tutorialFlyerDone
    );

    this.vitals.syncFromStats(this.tech.stats);
    // Restore fill from save if present
    if (data.hullHp > 0) {
      this.vitals.hull = Math.min(this.vitals.maxHull, data.hullHp);
      this.vitals.shield = Math.min(this.vitals.maxShield, data.shield);
    }
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);

    this.ads.loadCaps({
      day: data.adsDayKey,
      counts: data.adsWatchedToday as never,
    });

    this.shopHintShown = this.tech.owned.size > 0;
    this.hasSeenCinematic = data.highestLevel > 1;
    this.syncDronesFromBays();

    const offlineSec = this.idle.computeOffline(data.lastSaveTime, this.tech.stats);
    if (offlineSec > 30) {
      // Pure currency — never mutates the live stage cube
      this.pendingIdle = offlineSec;
      if (this.research.bonuses.unlockAutoIdle) {
        const result = this.idle.claimOffline(
          offlineSec,
          this.tech.stats,
          this.currency
        );
        this.pendingIdle = 0;
        if (result.fragments > 0 || result.coreEnergy > 0) {
          this.toast(
            `AUTO-COLLECT · +${result.fragments} FRAG` +
              (result.coreEnergy > 0 ? ` · +${result.coreEnergy} CORE` : '')
          );
        }
      }
    }
  }

  /** Cyan thruster trail when Lattice/IAP cosmetic is owned. */
  private applyCosmeticTrail(): void {
    if (!this.research.bonuses.cosmeticTrail) return;
    this.ship.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material;
      if (mat instanceof THREE.MeshBasicMaterial && mat.color) {
        // Brighten plume-like materials toward cyan
        if (mat.transparent && (mat.opacity ?? 1) < 0.95) {
          mat.color.setHex(0x00f0ff);
        }
      }
      if (mat instanceof THREE.MeshStandardMaterial && mat.emissive) {
        const e = mat.emissive.getHex();
        if (e === 0x1488aa || e === 0xfff2c8) {
          mat.emissive.setHex(0x00e8ff);
        }
      }
    });
  }

  /** Lattice: once-per-clear overshield + optional scan pulse buff. */
  private applyLatticeCombatBuffs(): void {
    this.overshieldReady = this.research.bonuses.unlockOvershield;
    this.scanPulseTimer = 0;
    if (this.research.bonuses.unlockOvershield) {
      const bonus = Math.max(25, this.vitals.maxShield * 0.35);
      this.vitals.shield = Math.min(
        this.vitals.maxShield + bonus,
        this.vitals.shield + bonus
      );
      // Temporarily raise max so bonus isn't clipped next sync
      this.vitals.maxShield += bonus;
      this.toast('OVERSHIELD ONLINE');
    }
    if (this.research.bonuses.unlockScanPulse) {
      this.scanPulseTimer = 12;
      this.toast('SCAN PULSE · +25% DMG 12s');
    }
  }

  private syncLoadoutToSave(): void {
    const snap = this.loadout.toJSON();
    this.save.data.hardpointsUnlocked = snap.hardpointUnlocks;
    this.save.data.loadout = snap.slots.map((s) =>
      s ? { defId: s.defId, ranks: s.branchRanks } : null
    );
    this.save.data.ownedWeapons = snap.ownedWeapons;
  }

  private persist(): void {
    this.save.data.dataFragments = this.currency.dataFragments;
    this.save.data.coreEnergy = this.currency.coreEnergy;
    this.save.data.prestigeTokens = this.currency.prestigeTokens;
    this.save.data.ownedUpgrades = Array.from(this.tech.owned);
    this.save.data.currentLevel = this.currentLevelId;
    this.save.data.levelProgress = this.cube.progress;
    this.save.data.muted = this.audio.muted;
    this.save.data.masterVolume = this.audio.volume;
    this.save.data.graphicsQuality = this.graphicsQuality;
    this.save.data.hullHp = this.vitals.hull;
    this.save.data.maxHull = this.vitals.maxHull;
    this.save.data.shield = this.vitals.shield;
    this.save.data.maxShield = this.vitals.maxShield;
    this.save.data.armorRating = this.vitals.armorRating;
    this.save.data.ascensionTier = this.save.data.ascensionTier ?? 0;
    this.save.data.lifetimeEvolves = this.save.data.lifetimeEvolves ?? 0;
    this.save.data.baseline = baselineFromTier(this.save.data.ascensionTier);
    const snapR = this.research.toJSON();
    this.save.data.researchOwned = snapR.owned;
    this.save.data.researchRanks = snapR.ranks;
    this.save.data.cosmeticTrail =
      !!this.save.data.cosmeticTrail || this.research.bonuses.cosmeticTrail;
    this.save.data.mainGunAmmo = this.mainGunAmmo;
    const db = this.droneBays.toJSON();
    this.save.data.droneBays = db.bays;
    this.save.data.droneOwned = db.owned;
    this.save.data.droneSlots = db.slots;
    this.save.data.droneUnlockedTypes = db.unlockedTypes;
    const gb = this.groundBays.toJSON();
    this.save.data.baseOwned = gb.owned;
    this.save.data.baseSlots = gb.slots;
    this.save.data.baseUnlockedTypes = gb.unlockedTypes;
    this.save.data.baseRanks = gb.ranks;
    this.syncLoadoutToSave();
    // KEEP `pilots` as loaded — do not wipe or synthesize a blob.
    const adSnap = this.ads.toJSON();
    this.save.data.adsDayKey = adSnap.day;
    this.save.data.adsWatchedToday = adSnap.counts as Record<string, number>;
    if (this.currentLevelId > this.save.data.highestLevel) {
      this.save.data.highestLevel = this.currentLevelId;
    }
    this.save.data.lifetimeHighestLevel = Math.max(
      this.save.data.lifetimeHighestLevel ?? 1,
      this.save.data.highestLevel,
      this.currentLevelId
    );
    this.save.save();
    this.maybeOfferEvolveReady();
  }

  /** Tutorial-style reminder once evolve goals are met for this ascension. */
  private maybeOfferEvolveReady(): void {
    if (this.hidden) return;
    if (this.evolveReady.visible) return;
    if (this.tutorial.isStage1Active()) return;
    if (
      this.mode === 'core_death' ||
      this.mode === 'dying' ||
      this.mode === 'dead' ||
      this.mode === 'cinematic'
    ) {
      return;
    }
    const check = canEvolve(
      this.currency.dataFragments,
      this.save.data.highestLevel,
      this.save.data.ascensionTier
    );
    if (!check.ok) return;
    if (this.save.data.evolveReadySeenTier === this.save.data.ascensionTier) return;
    this.save.data.evolveReadySeenTier = this.save.data.ascensionTier;
    this.save.save();
    this.evolveReady.show({
      cost: check.cost,
      nextTier: this.save.data.ascensionTier + 1,
      fragPerCore: EVOLVE_FRAG_PER_CORE,
    });
  }

  /**
   * Return to the title screen.
   * Closing settings / shop / sectors from the menu MUST NOT call loadLevel —
   * that rebuild looks like a new stage starting.
   */
  private showMenu(opts?: { preserveDemo?: boolean; forceReloadDemo?: boolean }): void {
    const leavingCombat =
      !this.menuDemoActive &&
      (this.mode === 'playing' ||
        this.mode === 'intro' ||
        this.mode === 'cinematic' ||
        this.mode === 'core_death' ||
        this.mode === 'dying' ||
        this.mode === 'dead' ||
        this.mode === 'levelclear' ||
        this.mode === 'paused' ||
        (this.pendingReturnMode === 'playing' && !opts?.preserveDemo));

    const reloadDemo = shouldReloadMenuDemo({
      forceReload: !!opts?.forceReloadDemo,
      leavingCombat,
      menuDemoActive: this.menuDemoActive,
      preserveDemo: opts?.preserveDemo !== false,
      hasDemoCube: this.menuDemoActive && this.cube.aliveBlocks > 0,
    });

    this.arena.setContext({
      levelId: this.currentLevelId || 1,
      ascensionTier: this.save.data.ascensionTier ?? 0,
      highestLevel: this.shopGateLevel(),
    });
    this.mode = 'menu';
    this.shopOpen = false;
    this.returnToPause = false;
    this.returnToClear = false;
    this.pendingReturnMode = 'menu';
    this.levelLoadBusy = false;
    this.screenFx?.cancel();
    this.hud.setVisible(false);
    this.hud.setIntro(false);
    this.reticle.setVisible(false);
    this.shopUI.hide();
    this.researchUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.adsUI.hide?.();
    this.hidePauseCard();
    this.cinematicRoot?.classList.add('panel-hidden');
    this.cinematicCube.group.visible = false;
    this.cube.group.visible = true;
    this.cubeAnimator.bind(this.cube);
    this.cameraCtrl.endCinematic();
    this.input.releaseAll();
    // Restore user graphics preference if FPS demotion was active
    if (this.effectiveQuality !== this.graphicsQuality) {
      this.applyGraphics(this.graphicsQuality, false);
    }
    this.armUiClickLock();
    const ownsDrone =
      this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked;
    this.menu.setChrome({
      showShop: ownsDrone || this.currency.dataFragments >= FIRST_DRONE_COST,
      showLattice:
        this.currency.coreEnergy > 0 ||
        this.save.data.ascensionTier > 0 ||
        this.save.data.researchOwned.length > 0,
      missionLabel: `START · SECTOR ${this.currentLevelId}`,
    });
    this.menu.setMeta(this.save.data.ascensionTier, this.currency.coreEnergy);
    this.menu.show();
    if (reloadDemo) {
      this.startMenuDemo();
    } else {
      this.presentMenuDemo();
    }
    void this.music.unlock().then(() => this.syncMusicToMode());
    this.syncMusicToMode();
  }

  /** Shared title-screen cube motion so settings/shop don't snap the lattice. */
  private updateMenuPresentation(dt: number, now: number): void {
    this.post.setPresentation(true);
    this.cameraCtrl.yaw += dt * 0.1;
    this.cameraCtrl.pitch = 0.3 + Math.sin(now * 0.18) * 0.06;
    this.cameraCtrl.update(dt);
    this.cube.update(dt, now);
    this.cubeAnimator.update(dt);
    this.cube.group.scale.setScalar(1);
    this.cube.group.position.y = 0.35;
    this.cube.group.rotation.x = 0.12;
    this.cube.group.rotation.z = 0.06;
    if (!this.cubeAnimator.isRotating) {
      this.cube.group.rotation.y += dt * 0.045;
    }
  }

  /** Pose the existing demo cube — no wipe, no loadLevel. */
  private presentMenuDemo(): void {
    this.menuDemoActive = true;
    this.ship.group.visible = false;
    this.hardpoints.group.visible = false;
    this.cube.group.visible = true;
    this.cinematicCube.group.visible = false;
    this.cubeAnimator.bind(this.cube);
    this.cubeAnimator.setDemoMode(true);
    this.cubeAnimator.setEnabled(true);
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent * 1.15);
    this.cameraCtrl.setFloorLimit(ARENA_FLOOR_WORLD_Y, SHIP_FLOOR_CLEARANCE);
  }

  /** Passive demo cube on main menu — rubik slices + slow orbit. */
  private startMenuDemo(): void {
    this.wipeCombatSession();
    this.menuDemoActive = true;
    const level = getLevel(Math.min(5, Math.max(1, this.save.data.highestLevel)));
    this.cube.loadLevel(level);
    this.cube.group.position.set(0, 0.4, 0);
    this.cube.group.rotation.set(0.15, 0, 0.08);
    this.cube.group.scale.setScalar(1);
    this.cubeAnimator.setLevel(level.id);
    this.cubeAnimator.setDemoMode(true);
    this.cubeAnimator.setEnabled(true);
    this.cubeDefense.reset();
    this.ship.group.visible = false;
    this.hardpoints.group.visible = false;
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent * 1.15);
    this.cameraCtrl.setFloorLimit(ARENA_FLOOR_WORLD_Y, SHIP_FLOOR_CLEARANCE);
    this.cameraCtrl.yaw = 0.95;
    this.cameraCtrl.pitch = 0.32;
  }

  /** Close settings / shop / lattice / sectors to the correct seat. */
  private closeActiveOverlay(): void {
    this.shopUI.hide();
    this.shopOpen = false;
    this.settingsUI.hide();
    this.researchUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.armUiClickLock();
    const dest = resolveOverlayClose({
      pendingReturnPlaying: this.pendingReturnMode === 'playing',
      menuDemoActive: this.menuDemoActive,
      returnToPause: this.returnToPause,
      returnToClear: this.returnToClear,
    });
    if (dest === 'clear') {
      this.returnToClear = false;
      this.presentLevelClearCard();
      return;
    }
    if (dest === 'pause') {
      this.showPause();
      return;
    }
    if (dest === 'resume') {
      this.returnToPause = false;
      this.resumeGameplayFromShop();
      return;
    }
    this.showMenu({ preserveDemo: true });
  }

  private showPause(): void {
    if (this.mode === 'core_death' || this.mode === 'dying' || this.mode === 'dead') {
      return;
    }
    if (this.mode === 'cinematic') return;
    if (this.mode === 'levelclear') {
      // Clear card owns this moment — extract via its MENU
      return;
    }
    if (this.mode !== 'paused') {
      this.prePauseMode =
        this.mode === 'transit'
          ? 'transit'
          : this.mode === 'settings' || this.mode === 'tech' || this.mode === 'levels' || this.mode === 'research'
            ? this.prePauseMode || 'playing'
            : this.mode === 'intro'
              ? 'intro'
              : 'playing';
    }
    this.pendingReturnMode = 'playing';
    this.returnToPause = true;
    this.menuDemoActive = false;
    this.shopOpen = false;
    this.mode = 'paused';
    this.menu.hide();
    this.shopUI.hide();
    this.settingsUI.hide();
    this.researchUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.hud.setVisible(false);
    this.reticle.setVisible(false);
    this.tutorial.hide();
    this.input.releaseAll();
    this.armUiClickLock();
    const level = getLevel(this.currentLevelId);
    this.pauseUI.show({ sectorName: level.name, sectorId: level.id });
    this.syncMusicToMode();
  }

  private resumeFromPause(): void {
    this.hidePauseCard();
    this.returnToPause = false;
    this.input.releaseAll();
    this.tutorial.showIfActive();
    if (this.prePauseMode === 'intro') {
      this.mode = 'intro';
      this.shopOpen = false;
      this.restoreShipVisual();
      this.hud.setVisible(true);
      const level = getLevel(this.currentLevelId);
      this.hud.setIntro(true, `${level.name} · ${level.size}³ lattice`);
      this.syncMusicToMode();
      return;
    }
    if (this.prePauseMode === 'transit' && this.flyer) {
      this.mode = 'transit';
      this.shopOpen = false;
      this.hud.setVisible(true);
      this.hud.setFlyerVisible(true);
      this.syncMusicToMode();
      return;
    }
    this.resumeGameplayFromShop();
  }

  private extractFromPause(): void {
    this.hidePauseCard();
    this.returnToPause = false;
    this.teardownTransitVisuals();
    this.persist();
    this.showMenu({ forceReloadDemo: true });
  }

  private stopMenuDemo(): void {
    this.menuDemoActive = false;
    this.cubeAnimator.setDemoMode(false);
    this.cube.group.position.set(0, 0, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.scale.setScalar(1);
    this.ship.group.visible = true;
    this.hardpoints.group.visible = true;
  }

  private openTech(
    tab?:
      | 'ship'
      | 'main_gun'
      | 'loadouts'
      | 'drone_bays'
      | 'bases'
      | 'other'
      | 'drones'
      | 'economy'
      | 'global'
  ): void {
    // Gate shop until first drone is affordable or already owned
    const ownsDrone =
      this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked;
    const canAffordDrone = this.currency.dataFragments >= FIRST_DRONE_COST;
    if (!ownsDrone && !canAffordDrone) {
      this.toast(`SHOP LOCKED — EARN ${FIRST_DRONE_COST} FRAG FOR YOUR FIRST DRONE`);
      return;
    }

    if (this.mode === 'core_death' || this.mode === 'dying' || this.mode === 'dead' || this.mode === 'transit') {
      return;
    }
    // Block shop during black cut — opening mid-fade left tech-tree empty + ship at scale 0
    if (this.screenFx.isActive || this.levelLoadBusy) {
      this.toast('STAND BY — SECTOR LOADING');
      return;
    }

    // Opening during intro/cinematic must complete the combat seat handoff first,
    // otherwise ship stays hidden/scaled-0 and HUD buttons never rebind cleanly.
    if (this.mode === 'intro' || this.mode === 'cinematic') {
      this.finishIntroImmediate();
    }
    if (this.mode === 'levelclear') this.returnToClear = true;
    this.evolveReady.hide();
    this.evolveConfirm.hide();

    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.researchUI.hide();
    this.overlay.innerHTML = '';
    // Resume combat only from live stage — not the menu demo cube
    const keepPauseReturn = this.returnToPause || this.mode === 'paused';
    this.hidePauseCard();
    const fromCombat = isFromCombatSeat({
      mode: this.mode,
      menuDemoActive: this.menuDemoActive,
      pendingReturnPlaying: this.pendingReturnMode === 'playing',
    });
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
    this.returnToPause = keepPauseReturn && fromCombat;
    this.mode = 'tech';
    this.shopOpen = true;
    this.hud.setVisible(false);
    this.hud.setIntro(false);
    this.hud.hideShopHint();
    this.shopHintShown = true;
    // Keep orbit camera frozen on ship (no auto-spin that desyncs chase)
    this.cameraCtrl.endCinematic();
    this.restoreShipVisual();
    this.cube.group.visible = true;
    this.cinematicCube.group.visible = false;
    // Seat ship on orbit so backdrop is coherent behind the shop
    for (let i = 0; i < 8; i++) this.ship.update(this.cameraCtrl, 0.05);
    this.shopUI.setVitals(this.vitals.snapshot());
    this.shopUI.setLoadoutContext(
      this.loadout,
      this.shopGateLevel(),
      this.save.data.ascensionTier
    );
    this.shopUI.setDroneBay(this.droneBays);
    this.shopUI.setGroundStations(this.groundBays);
    // Default to DRONES until Ally Protocol / first bay; 'drones' deep-link opens UPGRADES
    const openTab =
      tab ??
      (!ownsDrone || this.droneBays.state.bays === 0 ? 'drone_bays' : undefined);
    this.shopUI.show(
      this.tech,
      this.currency,
      !ownsDrone && (!tab || tab === 'drones' || tab === 'drone_bays')
        ? 'drones'
        : openTab
    );
    // Open shop = complete "open shop" tutorial stage; hide briefing until close
    this.tutorial.notifyShopOpened();
    this.syncMusicToMode();
  }

  private openLevels(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    const keepPauseReturn = this.returnToPause || this.mode === 'paused';
    this.hidePauseCard();
    const fromCombat = isFromCombatSeat({
      mode: this.mode,
      menuDemoActive: this.menuDemoActive,
      pendingReturnPlaying: this.pendingReturnMode === 'playing',
    });
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
    this.returnToPause = keepPauseReturn && fromCombat;
    const transitAfter =
      this.mode === 'transit' || this.prePauseMode === 'transit' ? this.currentLevelId : 0;
    this.mode = 'levels';
    this.hud.setVisible(false);
    this.levelUI.show(this.save.data.highestLevel, this.currentLevelId, transitAfter);
    this.syncMusicToMode();
  }

  private buyUpgrade(node: UpgradeNodeDef): void {
    // Stage-1 tutorial: only Ally Protocol counts until the drone is owned
    if (
      this.tutorial.isStage1Active() &&
      this.tutorial.currentStep?.id === 'shop_drone' &&
      node.id !== 'drone_unlock'
    ) {
      this.toast('BUY ALLY PROTOCOL FIRST — YOUR FIRST DRONE');
      return;
    }
    if (this.tech.purchase(node, this.currency)) {
      this.sessionPurchased = true;
      this.tutorial.notifyPurchase(node.id);
      if (node.id === 'drone_unlock' || node.effects.unlockDrones) {
        this.tutorial.notifyDroneOwned();
        // First bay unlock path: ensure player can open bays
        if (this.droneBays.state.bays === 0) {
          // Grant free first bay + fighter so tutorial has a unit
          this.droneBays.state.bays = 1;
          this.droneBays.state.owned.fighter = Math.max(1, this.droneBays.state.owned.fighter);
          this.droneBays.state.unlockedTypes = ['fighter'];
          this.droneBays.state.slots = ['fighter'];
        }
      }
      this.applyStatsToSystems();
      this.shopUI.setVitals(this.vitals.snapshot());
      this.shopUI.setLoadoutContext(
        this.loadout,
        this.shopGateLevel(),
        this.save.data.ascensionTier
      );
      this.shopUI.setDroneBay(this.droneBays);
      this.shopUI.setGroundStations(this.groundBays);
      this.shopUI.render(this.tech, this.currency);
      this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
      this.audio.playPurchase();
      this.refreshShopPrompt();
      this.persist();
    }
  }

  private buyWeapon(defId: string): boolean {
    const cost = this.loadout.weaponBuyCost(defId, this.shopGateLevel());
    if (!cost) {
      this.toast('WEAPON LOCKED — CLEAR MORE SECTORS');
      return false;
    }
    if (cost.fragments > 0 && !this.currency.spendFragments(cost.fragments)) return false;
    if (cost.core > 0 && !this.currency.spendCoreEnergy(cost.core)) {
      if (cost.fragments > 0) this.currency.dataFragments += cost.fragments;
      return false;
    }
    if (!this.loadout.unlockWeapon(defId)) {
      if (cost.fragments > 0) this.currency.dataFragments += cost.fragments;
      if (cost.core > 0) this.currency.coreEnergy += cost.core;
      return false;
    }
    // Auto-equip to first empty hardpoint
    const empty = this.loadout.firstEmptySlot();
    if (empty >= 0) this.loadout.equip(empty, defId);
    else if (this.loadout.hardpointUnlocks > 0 && !this.loadout.slots[0]) {
      this.loadout.equip(0, defId);
    }
    this.sessionPurchased = true;
    this.tutorial.notifyPurchase(defId);
    this.hardpoints.rebuildFromLoadout();
    this.syncLoadoutToSave();
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.audio.playPurchase();
    this.toast(
      defId === 'rocket_pod'
        ? 'ROCKET POD ACQUIRED'
        : defId === 'pulse_laser'
          ? 'ARC BEAM ACQUIRED'
          : 'WEAPON ACQUIRED'
    );
    this.refreshShopPrompt();
    this.persist();
    return true;
  }

  /**
   * Start a sector with cinematic letterbox fade (menu → level, level → level).
   */
  private startLevel(id: number): void {
    // Always supersede an in-flight cut — never stack two onBlack handlers
    // (double-tap Next / Play + early shop used to corrupt ship + HUD state).
    const gen = ++this.levelLoadGen;
    this.levelLoadBusy = true;
    this.screenFx.play({
      fadeOut: 0.55,
      hold: 0.4,
      fadeIn: 0.8,
      onBlack: () => {
        if (gen !== this.levelLoadGen) return;
        this.startLevelImmediate(id);
      },
      onComplete: () => {
        if (gen === this.levelLoadGen) this.levelLoadBusy = false;
      },
    });
  }

  private startLevelImmediate(id: number): void {
    const level = getLevel(id);
    this.currentLevelId = id;
    this.levelClearHandled = false;
    this.clearRewardMul = 1;
    // Close any mid-load UI so shop/settings cannot sit on top of a half-started sector
    this.shopOpen = false;
    this.stopMenuDemo();
    this.menu.hide();
    this.shopUI.hide();
    this.researchUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.adsUI.hide?.();
    this.hidePauseCard();
    this.returnToPause = false;
    this.overlay.innerHTML = '';
    this.hud.setIntro(false);
    // Never inherit scale 0 / off-map pose from cinematic or death
    this.restoreShipVisual();

    this.wipeCombatSession();

    this.arena.setContext({
      levelId: id,
      ascensionTier: this.save.data.ascensionTier ?? 0,
      highestLevel: this.shopGateLevel(),
      preferred: level.arena,
    });
    this.cube.loadLevel(level);
    this.cubeAnimator.setDemoMode(false);
    this.cubeAnimator.setLevel(id);
    this.cubeDefense.startLevel(id);
    if (isChronobeacon(id)) {
      this.toast(`CHRONOBEACON ${id}`);
    }
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent);
    this.cameraCtrl.setFloorLimit(ARENA_FLOOR_WORLD_Y, SHIP_FLOOR_CLEARANCE);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);

    this.loadout.syncLevelUnlocks(this.shopGateLevel());
    this.hardpoints.rebuildFromLoadout();
    this.syncDronesFromBays();
    this.syncGroundStations();
    this.vitals.fullRestore();
    this.vitals.syncFromStats(this.tech.stats);
    this.vitals.fullRestore();
    this.applyLatticeCombatBuffs();
    this.applyCosmeticTrail();

    if (this.pendingIdle > 0) {
      let seconds = this.pendingIdle;
      const boost = this.ads.consumeOfflineBoost();
      seconds *= boost;
      // Numerical rewards only — does not damage / clear the stage
      const result = this.idle.claimOffline(seconds, this.tech.stats, this.currency);
      this.pendingIdle = 0;
      if (result.fragments > 0 || result.coreEnergy > 0) {
        this.toast(
          `OFFLINE +${result.fragments} FRAG` +
            (result.coreEnergy > 0 ? ` · +${result.coreEnergy} CORE` : '')
        );
      }
    }

    this.hud.updateLevel(
      level.id,
      level.name,
      this.cube.progress,
      this.cube.aliveBlocks,
      this.cube.totalBlocks
    );
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.refreshShopPrompt();
    this.persist();

    const playCinematic =
      (id === 1 && !this.hasSeenCinematic) || this.forceCinematicNext;
    this.forceCinematicNext = false;

    if (playCinematic && this.cinematic) {
      this.mode = 'cinematic';
      this.hud.setVisible(false);
      this.reticle.setVisible(false);
      this.ship.group.visible = false;
      this.ship.group.scale.setScalar(0);
      this.ship.group.position.set(0, -500, 0);
      this.hardpoints.group.visible = false;
      this.hasSeenCinematic = true;
      // Instanced cinematic cube — real gameplay cube stays at origin, hidden & pristine
      this.cinematicCube.loadLevel(level);
      this.cinematicCube.group.visible = true;
      this.cube.group.visible = false;
      this.cubeAnimator.bind(this.cinematicCube);
      this.cubeAnimator.setLevel(id);
      this.cinematic.start({
        cube: this.cinematicCube,
        animator: this.cubeAnimator,
        camera: this.cameraCtrl,
        ship: this.ship,
        particles: this.particles,
        audio: this.audio,
      });
      try {
        void this.audio.resume();
        void this.music.unlock();
      } catch {
        /* audio may be locked until gesture */
      }
      this.syncMusicToMode(); // Final Protocol through cinematic → stage 1
    } else {
      this.mode = 'intro';
      this.introTimer = 0;
      this.hud.setVisible(true);
      this.hud.setIntro(true, `${level.name} · ${level.size}³ lattice`);
      this.reticle.setVisible(false);
      this.ship.group.visible = true;
      this.hardpoints.group.visible = true;
      // Orbit sweep ends in third-person combat seat — no second black fade after
      this.cameraCtrl.beginLevelIntro(this.cameraCtrl.yaw);
      // Seat ship on the intro orbit immediately so chase framing is coherent
      for (let i = 0; i < 8; i++) this.ship.update(this.cameraCtrl, 0.05);
      void this.music.unlock();
      this.syncMusicToMode();
    }
  }

  /**
   * Exit cinematic / short intro into gameplay.
   * No second fade-to-black — the intro camera (or story cinematic) already
   * presented the sector; countdown starts in-place from the combat seat.
   */
  private finishIntro(): void {
    this.finishIntroImmediate();
  }

  private finishIntroImmediate(): void {
    // Abort scripted cinematic if still running (shop/skip mid-cut)
    this.cinematic?.skip();
    this.mode = 'playing';
    this.levelLoadBusy = false;
    // Keep Final Protocol rolling if already active (no restart)
    this.syncMusicToMode();
    // Tear down cinematic instance; restore pristine gameplay cube
    this.cinematicCube.group.visible = false;
    this.cinematicCube.group.position.set(0, 0, 0);
    this.cinematicCube.group.rotation.set(0, 0, 0);
    this.cinematicCube.group.scale.setScalar(1);

    this.cube.group.visible = true;
    this.cube.group.position.set(0, 0, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.quaternion.identity();
    this.cube.group.scale.setScalar(1);

    this.cubeAnimator.endCinematicBurst();
    this.cubeAnimator.reset();
    this.cubeAnimator.bind(this.cube);
    this.cubeAnimator.setLevel(this.currentLevelId);
    this.cubeAnimator.setEnabled(true);

    // Soft orbit limits — keep the pose the intro / cinematic already docked to
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent, false);
    const seat = this.cameraCtrl.getDefaultCombatPose();
    // Prefer current yaw/pitch if intro already settled near combat seat
    const nearSeat =
      Math.abs(this.cameraCtrl.pitch - seat.pitch) < 0.12 &&
      Math.abs(this.cameraCtrl.radius - seat.radius) < seat.radius * 0.2;
    this.cameraCtrl.endCinematic(
      nearSeat
        ? {
            yaw: this.cameraCtrl.yaw,
            pitch: this.cameraCtrl.pitch,
            radius: THREE.MathUtils.clamp(
              this.cameraCtrl.radius,
              seat.radius * 0.9,
              seat.radius * 1.1
            ),
          }
        : seat
    );

    // Place ship on orbit seat BEFORE unhiding (never spawn inside cube)
    this.ship.group.scale.setScalar(1);
    this.ship.group.visible = false;
    for (let i = 0; i < 12; i++) this.ship.update(this.cameraCtrl, 0.08);
    this.restoreShipVisual();

    this.mode = 'playing';
    this.levelLoadBusy = false;
    this.sessionBlocksDestroyed = 0;
    this.sessionPurchased = false;
    // Keep remaining warmup if re-entering; otherwise arm standard countdown
    if (this.combatWarmup <= 0) this.combatWarmup = 3;
    this.tutorialFireUnlocked = false;
    this.hud.setVisible(true);
    this.hud.setIntro(false);
    this.hud.setCrosshairVisible(true);
    this.hud.setWarmupVisible(true, 3);
    this.reticle.setVisible(false);
    this.cinematicRoot.classList.add('panel-hidden');
    this.cinematicRoot.style.display = '';
    this.cinematicRoot.innerHTML = '';
    document.getElementById('cin-overlay-live')?.remove();
    this.refreshShopPrompt();
    // Stage-1 guided briefing after first combat seat
    if (this.currentLevelId === 1) {
      this.tutorial.setFlags(
        this.save.data.tutorialStage1Done,
        this.save.data.tutorialLoadoutDone,
        this.save.data.tutorialFleetDone,
        this.save.data.tutorialGunDone,
        this.save.data.tutorialFlyerDone
      );
      this.tutorial.tryStartStage1();
      // Tutorial: hold fire until welcome is acknowledged or player moves
      if (this.tutorial.isStage1Active()) {
        this.tutorialFireUnlocked = false;
      } else {
        this.tutorialFireUnlocked = true;
      }
    } else {
      this.tutorialFireUnlocked = true;
    }
  }

  /** Whether main gun / hardpoints may fire this frame. */
  private canFireWeapons(): boolean {
    if (this.combatWarmup > 0) return false;
    if (this.currentLevelId === 1 && this.tutorial.isStage1Active()) {
      if (!this.tutorialFireUnlocked) return false;
    }
    return true;
  }

  private updateCombatWarmup(dt: number): void {
    if (this.combatWarmup > 0) {
      this.combatWarmup = Math.max(0, this.combatWarmup - dt);
    }
    // Tutorial unlock via movement / aim before or during warmup
    if (!this.tutorialFireUnlocked) {
      if (!this.tutorial.isAwaitingWelcomeAck()) {
        this.tutorialFireUnlocked = true;
      }
      const moved =
        Math.hypot(this.input.axisX, this.input.axisY) > 0.12 ||
        Math.hypot(this.input.aimX, this.input.aimY) > 0.12;
      if (moved) this.tutorialFireUnlocked = true;
    }
    const hold =
      this.combatWarmup > 0 ||
      (this.currentLevelId === 1 &&
        this.tutorial.isStage1Active() &&
        !this.tutorialFireUnlocked);
    if (hold) {
      this.hud.setWarmupVisible(
        true,
        this.combatWarmup > 0 ? this.combatWarmup : 0
      );
    } else {
      this.hud.setWarmupVisible(false);
    }
  }

  /** Project main-gun locked aim target to HUD (same point bolts fly toward). */
  private updateAimCrosshair(firing: boolean): void {
    this.weapon.getMuzzle(this._muzzle);
    this.weapon.getAimDirection(this._aimDir);
    this.weapon.getAimTarget(this._aimPoint);
    const locked = this.weapon.isAimLocked();

    this._ndc.copy(this._aimPoint).project(this.cameraCtrl.camera);
    if (this._ndc.z > 1) {
      this.hud.updateCrosshairScreen(
        window.innerWidth * 0.5,
        window.innerHeight * 0.5,
        firing,
        false
      );
      return;
    }
    const sx = (this._ndc.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._ndc.y * 0.5 + 0.5) * window.innerHeight;
    const root = document.getElementById('hud-root');
    const rect = root?.getBoundingClientRect();
    const x = rect ? sx - rect.left : sx;
    const y = rect ? sy - rect.top : sy;
    this.hud.updateCrosshairScreen(x, y, firing, locked);
  }

  /**
   * Violent nucleus detonation + residual lattice float/fade (&lt; 3s),
   * then normal LEVEL CLEAR UI.
   */
  private beginCoreDeathSequence(): void {
    if (this.mode === 'core_death' || this.levelClearHandled) return;
    this.mode = 'core_death';
    this.coreDeathT = 0;
    this.shopUI.hide();
    this.shopOpen = false;
    this.hidePauseCard();
    this.returnToPause = false;
    this.hud.setVisible(false);
    this.hud.setCrosshairVisible(false);
    this.reticle.setVisible(false);
    this.weapon.reset();
    this.hardpoints.reset();
    this.cubeDefense.reset();

    // Center blast
    this.cameraCtrl.shake(0.62);
    try {
      this.audio.playCrit();
      this.audio.playExplosion(3.2, 'missile');
    } catch {
      /* audio optional */
    }
    this.cube.nucleus.beginDeath();
    this.particles.spawn(0, 0, 0, 0x8a1020, 90, 28, 'ember');
    this.particles.spawn(0, 0, 0, 0x2a4a08, 50, 20, 'debris');
    this.particles.spawn(0, 0, 0, 0xff2244, 70, 24, 'spark');
    this.particles.spawn(0, 0, 0, 0x4a0010, 55, 18, 'glow');
    this.particles.spawn(0, 0, 0, 0xaa6622, 40, 16, 'debris');
    this.rings.spawn(0, 0, 0, 0x6a0818, 3.4);
    this.rings.spawn(0, 0, 0, 0xff2040, 2.6);
    this.rings.spawn(0, 0, 0, 0x335508, 1.8);

    // Disconnect remaining shell — shatter outward, float away
    const remaining = this.cube.ejectAllRemainingBlocks(this.time.elapsed);
    // Cap mesh shatter to the 96-piece pool; rest get cheap sparks
    const budget = Math.max(8, Math.min(28, Math.floor(24 * this.vfxScale)));
    const step = Math.max(1, Math.ceil(remaining.length / budget));
    for (let i = 0; i < remaining.length; i += step) {
      const b = remaining[i];
      const len = Math.hypot(b.x, b.y, b.z) || 1;
      this.shatter.shatter(
        b.x,
        b.y,
        b.z,
        b.type,
        'explosive',
        b.x / len,
        b.y / len,
        b.z / len,
        Math.min(0.7, this.vfxScale * 0.65)
      );
    }
    for (let i = 1; i < remaining.length && i < budget * 3; i += step + 1) {
      const b = remaining[i];
      this.particles.spawn(b.x, b.y, b.z, COLORS.cyan, 3, 8, 'debris');
    }

    this.showPhaseChip('NUCLEUS DESTROYED', 'destroyed');
  }

  private updateCoreDeath(dt: number): void {
    this.coreDeathT += dt;
    this.cube.nucleus.updateDeath(dt);
    // Secondary viscera bursts
    if (this.coreDeathT < 1.8 && Math.random() < dt * 14) {
      const r = 0.3 + Math.random() * 3.1;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2.4;
      const gore = Math.random() > 0.55 ? 0x8a1020 : Math.random() > 0.5 ? 0x4a6610 : 0xff3355;
      this.particles.spawn(
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        gore,
        10,
        16,
        Math.random() > 0.4 ? 'ember' : 'debris'
      );
      if (Math.random() > 0.6) this.cameraCtrl.shake(0.1);
    }
    this.cameraCtrl.update(dt);
    this.ship.update(this.cameraCtrl, dt, this.particles);
    // Slow orbit drift for drama
    this.cameraCtrl.yaw += dt * 0.12;

    if (this.coreDeathT >= this.CORE_DEATH_SEC) {
      this.onLevelClear();
    }
  }

  private onLevelClear(): void {
    if (this.levelClearHandled) return;
    this.levelClearHandled = true;
    this.hidePauseCard();
    this.returnToPause = false;
    this.audio.playLevelClear();
    this.hud.setShopAffordable(false, false);

    // Wipe combat world before UI / next cube
    this.wipeCombatSession();

    const level = getLevel(this.currentLevelId);
    const fragGain = Math.round(
      level.rewardFragments * this.tech.stats.fragmentMul * this.clearRewardMul
    );
    const coreGain = Math.round(
      level.rewardCoreEnergy * this.tech.stats.coreEnergyMul * this.clearRewardMul
    );
    this.currency.addFragments(fragGain, 1);
    this.currency.addCoreEnergy(coreGain, 1);

    this.particles.spawn(0, 0, 0, COLORS.cyan, 40, 12, 'spark');
    this.particles.spawn(0, 0, 0, COLORS.magenta, 30, 10, 'glow');
    this.rings.spawn(0, 0, 0, COLORS.white, 2.5);

    const nextId = nextStageAfterClear(
      this.currentLevelId,
      this.save.data.lifetimeHighestLevel
    );
    this.pendingNextLevelId = nextId;
    this.save.data.highestLevel = Math.max(this.save.data.highestLevel, nextId);
    this.save.data.lifetimeHighestLevel = Math.max(
      this.save.data.lifetimeHighestLevel ?? 1,
      this.currentLevelId + 1,
      nextId
    );
    this.loadout.syncLevelUnlocks(this.shopGateLevel());
    this.persist();

    this.clearCard = {
      name: level.name,
      frag: fragGain,
      core: coreGain,
      doubled: this.clearRewardMul >= 2,
    };
    if (shouldRunTransit(this.currentLevelId)) {
      this.queueTransitCinematic();
      return;
    }
    this.presentLevelClearCard();
  }

  /** Dev/test: fly any FLYER_SCENES entry with no sector-clear gate. */
  private startFlyerTest(scene: FlyerSceneId): void {
    this.hidePauseCard();
    this.returnToPause = false;
    this.returnToClear = false;
    this.menu.hide();
    this.shopUI.hide();
    this.overlay.innerHTML = '';
    this.wipeCombatSession();
    this.currentLevelId = flyerLevelForScene(scene);
    this.pendingNextLevelId = this.currentLevelId + 1;
    this.clearCard = {
      name: flyerSceneTitle(scene),
      frag: 0,
      core: 0,
      doubled: true,
    };
    this.levelClearHandled = true;
    this.queueTransitCinematic(scene);
  }

  /** Jump to a transfer flight from the sector browser (no cube payout). */
  private startTransitReplay(afterId: number): void {
    if (!shouldRunTransit(afterId)) return;
    this.hidePauseCard();
    this.returnToPause = false;
    this.returnToClear = false;
    this.menu.hide();
    this.shopUI.hide();
    this.overlay.innerHTML = '';
    this.wipeCombatSession();
    this.currentLevelId = afterId;
    this.pendingNextLevelId = nextStageAfterClear(
      afterId,
      this.save.data.lifetimeHighestLevel
    );
    this.clearCard = {
      name: flyerSceneTitle(pickFlyerScene(afterId)),
      frag: 0,
      core: 0,
      doubled: true,
    };
    this.levelClearHandled = true;
    this.queueTransitCinematic();
  }

  /** Web playtest: `?flyer=canyon` | `wormhole` | `yard` | `rift`. */
  private maybeDebugFlyer(): void {
    let q = '';
    try {
      q = new URLSearchParams(window.location.search).get('flyer')?.toLowerCase() ?? '';
    } catch {
      return;
    }
    if (q !== 'canyon' && q !== 'wormhole' && q !== 'yard' && q !== 'rift') return;
    const scene = flyerSceneFromQuery(q);
    if (!scene) return;
    this.currentLevelId = flyerLevelForScene(scene);
    this.pendingNextLevelId = this.currentLevelId + 1;
    this.clearCard = {
      name: flyerSceneTitle(scene),
      frag: 0,
      core: 0,
      doubled: true,
    };
    this.levelClearHandled = true;
    this.menu.hide();
    this.overlay.innerHTML = '';
    this.queueTransitCinematic(scene);
  }

  /** Letterbox fade + transfer chip between cube shoot and flyer. */
  private queueTransitCinematic(sceneId?: FlyerSceneId): void {
    this.showPhaseChip('GRID TRANSFER', 'transit');
    this.toast('Relocating defense grid');
    this.screenFx.play({
      fadeOut: 0.45,
      hold: 0.22,
      fadeIn: 0.6,
      onBlack: () => this.beginTransit(sceneId),
    });
  }

  private beginTransit(sceneId?: FlyerSceneId): void {
    const id = sceneId ?? pickFlyerScene(this.currentLevelId);
    this.flyer?.dispose();
    let ribbon = FLYER_DEBUG_PATH;
    try {
      ribbon = ribbon || new URLSearchParams(window.location.search).get('ribbon') === '1';
    } catch {
      /* ignore */
    }
    this.flyer = new FlyerRun(id, { debugRibbon: ribbon });
    this.scene.add(this.flyer.root);
    this.mode = 'transit';
    this.vitals.fullRestore();
    this.ship.beginManualFlight();
    this.ship.group.visible = false;
    this.ship.group.scale.setScalar(1);
    this.hud.setVisible(true);
    this.hud.setFlyerVisible(true);
    this.hud.setCrosshairVisible(false);
    this.reticle.setVisible(false);
    this.prevCubeVisible = this.cube.group.visible;
    this.cube.group.visible = false;
    this.cubeAnimator.group.visible = false;
    this.cubeDefense.group.visible = false;
    this.drones.group.visible = false;
    this.groundStations.group.visible = false;
    this.hardpoints.worldGroup.visible = false;
    this.weapon.group.visible = false;
    this.prevCamFar = this.cameraCtrl.camera.far;
    this.cameraCtrl.camera.far = 480;
    this.cameraCtrl.camera.layers.disable(1);
    this.cameraCtrl.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(this.flyer.fogColor, this.flyer.fogNear, this.flyer.fogFar);
    this.scene.background = new THREE.Color(this.flyer.fogColor);
    this.input.releaseAll();
    this.toast(`${this.flyer.title} · relocating defense grid`);
    if (!this.save.data.tutorialFlyerDone) this.tutorial.tryStartFlyer();
  }

  private teardownTransitVisuals(): void {
    this.tutorial.completeIf('flyer');
    if (this.flyer) {
      this.scene.remove(this.flyer.root);
      this.flyer.dispose();
      this.flyer = null;
    }
    this.ship.endManualFlight();
    this.ship.group.visible = true;
    this.hud.setFlyerVisible(false);
    this.cube.group.visible = this.prevCubeVisible;
    this.cubeAnimator.group.visible = true;
    this.cubeDefense.group.visible = true;
    this.drones.group.visible = true;
    this.groundStations.group.visible = true;
    this.hardpoints.worldGroup.visible = true;
    this.weapon.group.visible = true;
    this.cameraCtrl.camera.up.set(0, 1, 0);
    this.cameraCtrl.camera.layers.enable(1);
    this.cameraCtrl.camera.far = this.prevCamFar;
    this.cameraCtrl.camera.updateProjectionMatrix();
    this.scene.fog = null;
    this.scene.background = null;
  }

  private updateTransit(dt: number): void {
    const run = this.flyer;
    if (!run) {
      this.presentLevelClearCard();
      return;
    }
    this.input.update(dt);
    const fire = this.input.consumeFirePulse();
    run.update(dt, this.input.axisX, this.input.axisY, fire, (_kind, sh, hullPlus) => {
      const died = this.vitals.takeSplitDamage(sh, hullPlus).died;
      this.cameraCtrl.shake(0.22);
      this.updateHudVitals();
      return died;
    });
    run.shipPos(this._flyerPos);
    run.lookTarget(this._flyerLook);
    run.camPos(this._flyerCam);
    run.camUp(this._flyerUp);
    run.shipAhead(this._flyerAhead);
    this.ship.placeManual(this._flyerPos, this._flyerAhead, this._flyerUp);
    this.ship.update(this.cameraCtrl, dt, this.particles);
    this.cameraCtrl.camera.up.copy(this._flyerUp);
    this.cameraCtrl.camera.position.copy(this._flyerCam);
    this.cameraCtrl.camera.lookAt(this._flyerLook);
    run.applyMusicBass(this.music.getBassLevel(), dt);
    const fogCol = run.fogPulseColor;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(fogCol);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fogCol);
    this.hud.updateFlyer({
      title: run.title,
      time: run.t,
      speed: run.speedMul,
      lock: run.lockOn,
    });
    this.tutorial.update(dt, {
      orbitMag: Math.hypot(this.input.axisX, this.input.axisY),
      aimMag: 0,
      blocksDestroyedSession: 0,
      shopOpen: false,
      purchasedThisSession: false,
      ownsArcBeam: false,
      hasEquippedWeapon: false,
      canAffordShop: false,
      canAffordArcBeam: false,
      canAffordDrone: false,
      ownsDrone: false,
      fragments: this.currency.dataFragments,
      canAffordSecondDrone: false,
      fleetExpanded: false,
      ownsSplitBeam: false,
      flyerStrafe: Math.hypot(this.input.axisX, this.input.axisY),
      flyerLock: run.lockOn,
      flyerFire: fire,
    });
    this.updateHudVitals();
    if (run.failed) {
      this.endTransit(true);
      return;
    }
    if (run.finished) this.endTransit(false);
  }

  private endTransit(failed: boolean): void {
    const run = this.flyer;
    const snap = this.vitals.snapshot();
    const hullRatio = snap.hull / Math.max(1, snap.maxHull);
    if (run && !failed) {
      const res = run.result(this.currentLevelId, hullRatio);
      this.currency.addCoreEnergy(res.lattice, 1);
      if (this.clearCard) {
        this.clearCard.transitStars = res.stars;
        this.clearCard.transitLattice = res.lattice;
        this.clearCard.transitScene = res.scene;
        this.clearCard.core += res.lattice;
      }
      this.toast(`${res.stars}★ TRANSFER · +${res.lattice} CORE`);
    }
    this.teardownTransitVisuals();
    this.persist();
    if (failed) {
      this.beginShipDeath();
      return;
    }
    this.presentLevelClearCard();
  }

  /** Re-show the LEVEL CLEAR card (first time or after shop/loadout). Does not re-pay. */
  private presentLevelClearCard(): void {
    const card = this.clearCard;
    if (!card) {
      this.showMenu({ forceReloadDemo: true });
      return;
    }
    this.mode = 'levelclear';
    this.returnToClear = false;
    this.shopOpen = false;
    this.hidePauseCard();
    this.hud.setVisible(false);
    this.shopUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.menu.hide();
    this.armUiClickLock();

    const rewardText = card.doubled
      ? `+${card.frag} FRAG · +${card.core} CORE (×2)`
      : `+${card.frag} FRAG · +${card.core} CORE`;

    this.overlay.innerHTML = `
      <div class="overlay-card interactive docked-actions-card" role="dialog" aria-modal="true" aria-labelledby="clear-title">
        <div class="card-body overlay-body">
          <h2 id="clear-title">LEVEL CLEAR</h2>
          <p>${card.name}</p>
          ${
            card.transitStars
              ? `<div class="reward">TRANSFER ${'★'.repeat(card.transitStars)}${'☆'.repeat(3 - card.transitStars)} · +${card.transitLattice ?? 0} CORE</div>`
              : ''
          }
          <div class="reward">${rewardText}</div>
        </div>
        <div class="overlay-actions card-actions">
          <button class="menu-btn primary" id="next-level" type="button">NEXT SECTOR</button>
          <button class="menu-btn" id="clear-tech" type="button">SHOP</button>
          <button class="menu-btn magenta" id="clear-ad" type="button"${
            card.doubled ? ' disabled' : ''
          }>${card.doubled ? 'REWARD DOUBLED' : 'WATCH AD · ×2 REWARD'}</button>
          <button class="menu-btn" id="clear-menu" type="button">TITLE SCREEN</button>
        </div>
      </div>
    `;

    this.overlay.querySelector('#clear-ad')!.addEventListener('click', () => {
      if (!this.clearCard || this.clearCard.doubled) return;
      const ok = this.adsUI.show(this.ads, {
        placement: 'clear_double',
        rewardText: 'Double this clear reward',
      });
      if (!ok) {
        this.toast('AD CAP REACHED');
        return;
      }
      this.adsUI.onAccepted = (p) => {
        void this.ads
          .offer(p)
          .then(({ reward }) => {
            if (reward?.fragmentMul && this.clearCard && !this.clearCard.doubled) {
              this.clearCard.doubled = true;
              const extraF = this.clearCard.frag;
              const extraC = this.clearCard.core;
              this.currency.addFragments(extraF, 1);
              this.currency.addCoreEnergy(extraC, 1);
              this.clearCard.frag *= 2;
              this.clearCard.core *= 2;
              const rew = this.overlay.querySelector('.reward');
              if (rew) {
                rew.textContent = `+${this.clearCard.frag} FRAG · +${this.clearCard.core} CORE (×2)`;
              }
              const adBtn = this.overlay.querySelector('#clear-ad') as HTMLButtonElement | null;
              if (adBtn) {
                adBtn.disabled = true;
                adBtn.textContent = 'REWARD DOUBLED';
              }
              this.persist();
              this.toast('REWARD DOUBLED');
            }
          })
          .finally(() => {
            this.adsUI.hide();
          });
      };
      this.adsUI.onDeclined = () => {
        this.adsUI.hide();
      };
    });

    this.overlay.querySelector('#next-level')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.returnToClear = false;
      this.startLevel(this.pendingNextLevelId || this.currentLevelId + 1);
    });
    this.overlay.querySelector('#clear-tech')!.addEventListener('click', () => {
      this.returnToClear = true;
      this.overlay.innerHTML = '';
      this.openTech();
      if (this.mode !== 'tech') this.presentLevelClearCard();
    });
    this.overlay.querySelector('#clear-menu')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.returnToClear = false;
      this.currentLevelId = Math.min(
        this.pendingNextLevelId || this.currentLevelId + 1,
        this.save.data.highestLevel
      );
      this.showMenu({ forceReloadDemo: true });
    });
  }

  private toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    // Non-modal host — must not use #overlay-root
    this.toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const preset = getGraphicsPreset(this.effectiveQuality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dprCap));
    this.renderer.setSize(w, h, false);
    this.cameraCtrl.resize(w / h);
    this.post.setSize(w, h);
    this.updateOrientationGate();
  };

  private silenceAudio(): void {
    this.music.pause();
    this.audio.suspend();
  }

  private restoreAudio(): void {
    void this.audio.resume();
    void this.music.unlock();
    this.music.resume();
    this.syncMusicToMode();
  }

  private onPageHide = (): void => {
    this.silenceAudio();
  };

  private onVisibility = (): void => {
    this.hidden = document.hidden;
    if (document.hidden) {
      this.silenceAudio();
      if (this.mode !== 'core_death' && this.mode !== 'dying') this.persist();
      return;
    }
    this.time.reset();
    this.restoreAudio();
    if (this.mode !== 'core_death' && this.mode !== 'dying') this.persist();
  };

  private maybeSave(dt: number): void {
    if (this.mode === 'core_death' || this.mode === 'dying') return;
    this.saveAccum += dt;
    if (this.saveAccum > 10) {
      this.saveAccum = 0;
      this.persist();
    }
  }

  private frameCapHz(): number {
    switch (this.mode) {
      case 'playing':
      case 'intro':
      case 'cinematic':
      case 'core_death':
      case 'levelclear':
      case 'dying':
      case 'paused':
        return PERFORMANCE_FRAME_CAP_HZ;
      case 'menu':
        return this.menuDemoActive ? 30 : PERFORMANCE_MENU_FRAME_CAP_HZ;
      case 'tech':
      case 'levels':
      case 'loadout':
      case 'research':
      case 'dead':
      case 'settings':
        return PERFORMANCE_MENU_FRAME_CAP_HZ;
      default:
        return PERFORMANCE_FRAME_CAP_HZ;
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    try {
    const nowMs = performance.now();
    const minMs = 1000 / this.frameCapHz();
    if (nowMs - this.lastPresentMs < minMs - 0.5) return;
    this.lastPresentMs = nowMs;
    const dt = this.time.tick();
    const now = this.time.elapsed;

    if (this.mode === 'playing' && !this.bloomThermallyCut) {
      this.combatBloomElapsed += dt;
      if (this.combatBloomElapsed >= PERFORMANCE_COMBAT_BLOOM_GRACE_SECONDS) {
        this.bloomThermallyCut = true;
        this.post.setThermalBloomCut(true);
      }
    }

    // Adaptive VFX + temporary quality demotion under thermal/FPS pressure
    if (
      this.mode === 'playing' ||
      this.mode === 'intro' ||
      this.mode === 'cinematic' ||
      this.mode === 'core_death' ||
      this.mode === 'levelclear'
    ) {
      if (this.time.fps < PERF.lowFpsThreshold) {
        this.lowFpsTimer += dt;
        // Soft: pull VFX scale before hard quality demotion
        if (this.lowFpsTimer > 0.6) {
          this.vfxScale = Math.max(0.32, this.vfxScale * 0.92);
          const budget = Math.floor(
            getGraphicsPreset(this.effectiveQuality).particleBudget * this.vfxScale
          );
          this.particles.setBudget(Math.max(120, budget));
        }
        if (this.lowFpsTimer > PERF.lowFpsSeconds) {
          const demoted =
            this.effectiveQuality === 'high'
              ? 'medium'
              : this.effectiveQuality === 'medium'
                ? 'low'
                : null;
          if (demoted) {
            this.applyGraphics(demoted, true);
            this.lowFpsTimer = 0;
          }
        }
      } else if (this.time.fps > PERF.targetFps + 8) {
        this.lowFpsTimer = 0;
        // Slowly recover VFX if we demoted only the soft scale
        const target =
          this.effectiveQuality === 'high'
            ? 1
            : this.effectiveQuality === 'medium'
              ? 0.72
              : 0.42;
        this.vfxScale = Math.min(target, this.vfxScale + dt * 0.08);
      } else {
        this.lowFpsTimer = Math.max(0, this.lowFpsTimer - dt * 0.5);
      }
    }

    this.arena.update(dt);
    this.screenFx.update(dt);
    if (this.mode !== 'playing') this.audio.setKamikazeSeek(0);

    if (this.mode === 'menu' || (this.mode === 'settings' && this.menuDemoActive)) {
      // Demo cube: smooth orbit presentation (settings must not pop the cube)
      this.updateMenuPresentation(dt, now);
    } else if (this.mode === 'cinematic' && this.cinematic) {
      this.post.setPresentation(true);
      // Animate the instanced cinematic cube only — real cube stays pristine & hidden
      this.cinematicCube.update(dt, now);
      this.cube.group.visible = false;
      // Visibility of cinematicCube is owned by CinematicIntro (hidden until portal breach)
      // Enforce ship hide every frame (prevents mid-cut ghost at origin)
      this.ship.group.visible = false;
      this.ship.group.scale.setScalar(0);
      this.hardpoints.group.visible = false;
      const done = this.cinematic.update(dt);
      if (done) this.finishIntro();
    } else if (this.mode === 'intro') {
      this.introTimer += dt;
      const progress = this.introTimer / this.introDuration;
      this.cameraCtrl.updateIntro(progress, dt);
      this.ship.update(this.cameraCtrl, dt);
      this.cubeAnimator.update(dt);
      if (Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2;
        const r = this.cube.halfExtent * (1.2 + Math.random());
        this.particles.spawn(
          Math.cos(a) * r,
          (Math.random() - 0.5) * r,
          Math.sin(a) * r,
          COLORS.cyan,
          1,
          0.5,
          'ember'
        );
      }
      const level = getLevel(this.currentLevelId);
      this.hud.updateLevel(
        level.id,
        level.name,
        this.cube.progress,
        this.cube.aliveBlocks,
        this.cube.totalBlocks
      );
      if (progress >= 1) this.finishIntro();
    } else if (this.mode === 'paused') {
      this.post.setPresentation(false);
      this.cameraCtrl.update(dt);
      this.ship.update(this.cameraCtrl, 0);
    } else if (this.mode === 'settings') {
      // Combat-seat settings: hold the live cube, do not load a demo stage
      this.post.setPresentation(false);
      this.cameraCtrl.update(dt);
      this.ship.update(this.cameraCtrl, 0);
    } else if (this.mode === 'playing' || this.mode === 'levelclear') {
      this.input.update(dt);
      const zoom = this.input.consumeZoom();
      if (this.mode === 'playing') {
        this.cameraCtrl.applyInput(
          this.input.axisX,
          this.input.axisY,
          zoom,
          dt,
          this.tech.stats.orbitSpeedMul
        );
      }
      this.cameraCtrl.update(dt);
      this.ship.update(this.cameraCtrl, dt, this.particles);

      if (this.mode === 'playing') {
        this.audio.setKamikazeSeek(this.cubeDefense.kamikazeSeekIntensity(this.ship.position));
        if (this.reviveImmunity > 0) {
          this.reviveImmunity = Math.max(0, this.reviveImmunity - dt);
        }
        this.vitals.update(dt);
        this.updateHudVitals();
        this.updateCombatWarmup(dt);
        if (this.input.consumeAmmoCycle()) this.cycleMainGunAmmo();
        const allowFire = this.canFireWeapons() && this.input.isFiring;

        // Always update aim (so crosshair tracks); fire only when armed
        if (this.scanPulseTimer > 0) {
          this.scanPulseTimer = Math.max(0, this.scanPulseTimer - dt);
        }
        const combatStats =
          this.scanPulseTimer > 0
            ? {
                ...this.tech.stats,
                damageMul: this.tech.stats.damageMul * 1.25,
              }
            : this.tech.stats;
        this.weapon.update(
          dt,
          allowFire,
          this.ship,
          this.cube,
          combatStats,
          now,
          this.input.aimX,
          this.input.aimY,
          {
            enemyTargets: this.cubeDefense.getEnemyTargetsForWeapons(),
            onEnemyHit: (id, dmg) => this.cubeDefense.damageEnemy(id, dmg),
            ammo: this.mainGunAmmo,
          }
        );

        this.weapon.getAimDirection(this._aimDir);
        this.hud.setCrosshairVisible(true);
        this.updateAimCrosshair(allowFire);

        // Guided tutorial progress
        const orbitMag = Math.hypot(this.input.axisX, this.input.axisY);
        const aimMag = Math.hypot(this.input.aimX, this.input.aimY);
        {
          const ownsDrone =
            this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked;
          const canAffordDrone =
            !ownsDrone && this.currency.dataFragments >= FIRST_DRONE_COST;
          const rocketCost = this.loadout.weaponBuyCost(
            'rocket_pod',
            this.shopGateLevel()
          );
          this.tutorial.update(dt, {
            orbitMag,
            aimMag,
            blocksDestroyedSession: this.sessionBlocksDestroyed,
            shopOpen: this.shopOpen,
            purchasedThisSession: this.sessionPurchased,
            // First loadout weapon is Rocket Pod (field name kept for tutorial API)
            ownsArcBeam: this.loadout.isOwned('rocket_pod'),
            hasEquippedWeapon: this.loadout.allDerived().length > 0,
            canAffordShop: canAffordDrone || ownsDrone,
            canAffordArcBeam:
              !!rocketCost && this.currency.dataFragments >= rocketCost.fragments,
            canAffordDrone,
            ownsDrone,
            fragments: this.currency.dataFragments,
            canAffordSecondDrone:
              ownsDrone &&
              canAffordSecondDrone(this.droneBays.state, this.currency.dataFragments),
            fleetExpanded: this.droneBays.equippedCount() >= 2,
            ownsSplitBeam: this.tech.owned.has('off_multi_1'),
          });
          if (
            ownsDrone &&
            this.save.data.tutorialStage1Done &&
            !this.save.data.tutorialFleetDone &&
            canAffordSecondDrone(this.droneBays.state, this.currency.dataFragments) &&
            this.droneBays.equippedCount() < 2
          ) {
            this.tutorial.tryStartFleet();
          }
          if (
            this.save.data.tutorialFleetDone &&
            !this.save.data.tutorialGunDone &&
            !this.tech.owned.has('off_multi_1') &&
            this.currency.dataFragments >= 100 &&
            this.droneBays.equippedCount() >= 2
          ) {
            this.tutorial.tryStartGun();
          }
        }

        // Hardpoints: forward / guided only — never player aim stick
        this.hardpoints.update(
          dt,
          allowFire,
          this.ship.position,
          this.cube,
          this.tech.stats,
          now,
          {
            enemyTargets: this.cubeDefense.getEnemyTargetsForWeapons(),
            onEnemyHit: (id, dmg) => this.cubeDefense.damageEnemy(id, dmg),
          }
        );

        this.drones.setCombatContext({
          enemies: this.cubeDefense.getEnemyUnitRefs(),
          intercepts: this.cubeDefense.getInterceptTargets(),
          onEnemyHit: (id, dmg) => this.cubeDefense.damageEnemy(id, dmg),
          onInterceptHit: (id, dmg) => this.cubeDefense.damageIntercept(id, dmg),
          shipPos: this.ship.position.clone(),
          nucleusExposed: this.cube.nucleus.isExposed,
        });
        this.drones.update(dt, this.cube, this.tech.stats, now, this.hidden);
        this.groundStations.setCombat(
          this.cubeDefense.getEnemyTargetsForWeapons(),
          (id, dmg) => this.cubeDefense.damageEnemy(id, dmg),
          this.cubeDefense.getInterceptTargets(),
          (id, dmg) => this.cubeDefense.damageIntercept(id, dmg)
        );
        this.groundStations.update(dt, now, this.canFireWeapons(), this.tech.stats);

        this.cube.update(dt, now);
        this.cubeAnimator.update(dt);
        // Nucleus: decay / regen / swarm factory / rage arcs
        this.cube.nucleus.update(dt, now, {
          onArcBeam: (dir, speed, damage) => {
            this.cubeDefense.fireArcBeam(dir, speed, damage);
          },
        });
        this.cubeDefense.setFireRateMul(this.cube.nucleus.rageFireMul);
        // Turrets/enemy drones locked during stage countdown same as player
        this.cubeDefense.update(dt, this.canFireWeapons());
        const tug = this.cubeDefense.consumeOrbitNudge();
        if (tug) this.cameraCtrl.nudgeAngular(tug.yaw, tug.pitch);

        const level = getLevel(this.currentLevelId);
        this.hud.updateLevel(
          level.id,
          level.name,
          this.cube.progress,
          this.cube.aliveBlocks,
          this.cube.totalBlocks
        );
        this.hud.updateNucleus({
          ...this.cube.nucleus.snapshot(),
          laserPhase: this.cubeDefense.rageLaserPhase,
          spikePhase: this.cubeDefense.spikePhase,
        });
        this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);

        // Nucleus dead → death FX, then clear UI (not instant card)
        if (this.cube.isLevelComplete()) this.beginCoreDeathSequence();
      }
    } else if (this.mode === 'transit') {
      this.post.setPresentation(true);
      this.updateTransit(dt);
    } else if (this.mode === 'core_death') {
      this.updateCoreDeath(dt);
    } else if (this.mode === 'dying') {
      this.updateDying(dt);
    } else if (
      this.mode === 'tech' ||
      this.mode === 'levels' ||
      this.mode === 'loadout' ||
      this.mode === 'research' ||
      this.mode === 'dead'
    ) {
      // Combat shop: freeze orbit on ship. Menu/demo: gentle spin.
      // Never leave ship at cinematic scale-0 while the shop is open.
      if (this.mode === 'tech' && this.pendingReturnMode === 'playing') {
        if (!this.ship.group.visible || this.ship.group.scale.x < 0.5) {
          this.restoreShipVisual();
        }
      }
      if (this.pendingReturnMode === 'playing' && !this.menuDemoActive) {
        this.cameraCtrl.update(dt);
        this.ship.update(this.cameraCtrl, dt);
      } else if (this.menuDemoActive) {
        this.updateMenuPresentation(dt, now);
      } else {
        this.cameraCtrl.yaw += dt * 0.05;
        this.cameraCtrl.update(dt);
        this.ship.update(this.cameraCtrl, dt);
      }
    }

    this.particles.update(dt);
    this.shatter.update(dt);
    this.rings.update(dt);
    this.post.render();
    this.maybeSave(dt);
    } catch (err) {
      // One bad frame must not freeze the WebView on a still cube.
      console.error('[game-loop]', err);
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const u of this.unsubs) u();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onOverlayKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.cube.dispose();
    this.cinematicCube.dispose();
    this.cubeAnimator.dispose();
    this.cubeDefense.dispose();
    this.ship.dispose();
    this.weapon.dispose();
    this.hardpoints.dispose();
    this.drones.dispose();
    this.groundStations.dispose();
    this.particles.dispose();
    this.shatter.dispose();
    this.rings.dispose();
    this.reticle.dispose();
    this.cinematic?.dispose();
    this.screenFx?.dispose();
    this.arena.dispose();
    this.post.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
  }
}
