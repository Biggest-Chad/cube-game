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
import { AmbientEnvironment } from '../world/AmbientEnvironment';
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
import { AdsOfferUI } from '../ui/AdsOfferUI';
import { TutorialDirector } from '../ui/TutorialDirector';
import { ScreenTransition } from '../ui/ScreenTransition';
import { cheapestPurchasableWeapon, weaponUnlockCost } from '../data/weapons';
import {
  baselineFromTier,
  canEvolve,
  evolveCoreGrant,
  evolveCost,
} from '../data/evolve';
import { EVOLVE_FRAG_PER_CORE, getResearchNode } from '../data/research';

type Mode =
  | 'menu'
  | 'intro'
  | 'cinematic'
  | 'playing'
  | 'levelclear'
  | 'tech'
  | 'research'
  | 'levels'
  | 'loadout'
  | 'settings'
  | 'dying'
  | 'dead';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private time = new Time();
  private save = new SaveSystem();
  private cameraCtrl: OrbitalCamera;
  private post: PostProcessing;
  private ambient = new AmbientEnvironment();
  private cube = new CubeManager();
  /** Separate lattice used only during the intro cinematic (real cube stays pristine). */
  private cinematicCube = new CubeManager();
  private cubeAnimator = new CubeAnimator();
  private cubeDefense = new CubeDefense();
  private ship = new Ship();
  private vitals = new ShipVitals();
  private weapon = new Weapon();
  private hardpoints = new HardpointSystem();
  private loadout = new LoadoutState();
  private droneBays = new DroneBayController();
  private drones = new DroneManager();
  private input = new InputController();
  private currency = new Currency();
  private tech = new TechTree();
  private research = new ResearchTree();
  private idle = new IdleSimulator();
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
  private adsUI: AdsOfferUI;
  private tutorial!: TutorialDirector;
  private screenFx!: ScreenTransition;
  private overlay: HTMLElement;
  private toastRoot: HTMLElement;
  private cinematicRoot: HTMLElement;
  private orientLock: HTMLElement | null = null;

  private mode: Mode = 'menu';
  private currentLevelId = 1;
  private raf = 0;
  private hidden = false;
  private lowFpsTimer = 0;
  /** User-selected graphics tier (persisted). Default medium. */
  private graphicsQuality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  /** Runtime quality after optional FPS demotion (never above user selection). */
  private effectiveQuality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  private levelClearHandled = false;
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
  private pendingReturnMode: Mode = 'playing';
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
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, bootPreset.dprCap)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = bootPreset.exposure;
    this.renderer.setClearColor(COLORS.black, 1);

    this.cameraCtrl = new OrbitalCamera(window.innerWidth / window.innerHeight);
    this.post = new PostProcessing(this.renderer, this.scene, this.cameraCtrl.camera);

    this.ambient.applyToScene(this.scene);
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

    // Dramatic neon arena lighting — readable cube + punchy emissives
    const amb = new THREE.AmbientLight(0x142030, 0.55);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0x4a7a9a, 0x100818, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xd8f4ff, 1.05);
    key.position.set(18, 32, 16);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xaa44cc, 0.45);
    rim.position.set(-18, -4, -14);
    this.scene.add(rim);
    const fillCyan = new THREE.PointLight(COLORS.cyan, 18, 90, 2);
    fillCyan.position.set(0, 14, 0);
    this.scene.add(fillCyan);
    const fillMag = new THREE.PointLight(COLORS.magenta, 12, 70, 2);
    fillMag.position.set(-12, -6, 10);
    this.scene.add(fillMag);

    this.cubeAnimator.bind(this.cube);
    this.cubeDefense.bind(this.cube);
    // Nucleus damage passes through regenerating core shield bubble first
    (this.cube as { defenseAbsorb?: (n: number) => number }).defenseAbsorb = (n) =>
      this.cubeDefense.absorbCoreDamage(n);
    this.cubeDefense.setHooks({
      onPlayerDamage: (amount) => this.onPlayerDamaged(amount),
      getPlayerPosition: () => this.ship.position.clone(),
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
    this.adsUI = new AdsOfferUI(document.getElementById('ads-root')!);
    this.overlay = document.getElementById('overlay-root')!;
    this.toastRoot =
      document.getElementById('toast-root') ?? this.overlay;
    // Mount on ui-root (not hud-root) so shop open (HUD hidden) still shows briefing
    this.tutorial = new TutorialDirector(document.getElementById('ui-root')!, {
      stage1Done: false,
      loadoutDone: false,
    });
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
    window.addEventListener('beforeunload', () => this.persist());
    this.lockLandscape();

    this.showMenu();
    this.loop();
  }

  private lockLandscape(): void {
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void o.lock?.('landscape');
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

  private wireUI(): void {
    this.menu.onPlay = () => {
      void this.audio.resume();
      void this.music.unlock();
      this.startLevel(this.currentLevelId);
    };
    this.menu.onTech = () => this.openTech();
    this.menu.onLevels = () => this.openLevels();
    this.menu.onLoadout = () => this.openLoadout();
    this.menu.onSettings = () => this.openSettings();
    this.menu.onResearch = () => this.openResearch();

    const els = this.hud.elements;
    els.btnTech.addEventListener('click', () => this.openTech());
    els.btnLevels.addEventListener('click', () => this.openLevels());
    els.btnLoadout.addEventListener('click', () => this.openLoadout());
    els.btnMenu.addEventListener('click', () => {
      this.persist();
      this.showMenu();
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

    this.shopUI.onClose = () => {
      this.shopUI.hide();
      this.shopOpen = false;
      this.hud.hideShopHint();
      // If purchase happened while shop was open, ensure tutorial advances
      if (this.sessionPurchased) this.tutorial.notifyPurchase();
      if (this.pendingReturnMode === 'playing' && !this.menuDemoActive) {
        this.resumeGameplayFromShop();
      } else {
        this.showMenu();
      }
    };
    this.shopUI.onPurchase = (node) => this.buyUpgrade(node);
    this.shopUI.onBuyWeapon = (defId) => this.buyWeapon(defId);
    this.shopUI.onEquipWeapon = (slot, defId) => {
      this.loadout.equip(slot, defId);
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
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
        this.loadout.unlockHardpoint(slot, this.save.data.highestLevel, asc) < 0
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
    this.shopUI.onEvolve = () => this.performEvolve();
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
      return true;
    };
    this.shopUI.onUnlockDroneType = (role) => {
      const def = DRONE_ROLES[role];
      if (this.save.data.highestLevel < def.unlockLevel) {
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
      return true;
    };
    this.shopUI.onAssignDroneSlot = (slot, role) => {
      const ok = this.droneBays.assignSlot(slot, role);
      if (ok) {
        this.syncDronesFromBays();
        this.persist();
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

    this.researchUI.onClose = () => {
      this.researchUI.hide();
      this.showMenu();
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
      } else if (
        step?.id === 'shop_drone' ||
        step?.id === 'shop_hint' ||
        step?.advance === 'drone_owned'
      ) {
        // Ally Protocol lives under DRONES → UPGRADES
        this.openTech('drone_bays');
      } else {
        this.openTech();
      }
    };
    this.tutorial.onComplete = (id) => {
      if (id === 'stage1') this.save.data.tutorialStage1Done = true;
      if (id === 'loadout') this.save.data.tutorialLoadoutDone = true;
      this.persist();
    };

    this.levelUI.onClose = () => {
      this.levelUI.hide();
      const toPlaying =
        this.pendingReturnMode === 'playing' &&
        !this.menuDemoActive &&
        this.cube.aliveBlocks > 0;
      if (toPlaying) {
        this.resumeGameplayFromShop();
      } else if (this.cube.aliveBlocks > 0 && !this.menuDemoActive) {
        this.mode = 'playing';
        this.hud.setVisible(true);
        this.refreshShopPrompt();
        this.syncMusicToMode();
      } else {
        this.showMenu();
      }
    };
    this.levelUI.onSelect = (id) => {
      this.levelUI.hide();
      void this.audio.resume();
      this.startLevel(id);
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
      if (this.loadout.unlockHardpoint(slot, this.save.data.highestLevel, asc) < 0) {
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
      // Never drop into combat from menu demo cube (aliveBlocks > 0 on menu)
      if (this.pendingReturnMode === 'playing' && !this.menuDemoActive) {
        this.resumeGameplayFromShop();
      } else {
        this.showMenu();
      }
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
      this.loadProgress();
      this.applyGraphics(this.graphicsQuality, false);
      this.showMenu();
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
    this.ambient.setQuality(preset.ambientTier);
    this.cameraCtrl.resize(window.innerWidth / window.innerHeight);
    // Base VFX density from tier (adaptive FPS may pull this down further)
    this.vfxScale =
      quality === 'high' ? 1 : quality === 'medium' ? 0.72 : 0.42;
  }

  private openSettings(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    // Capture return BEFORE switching mode. Menu demo has a live cube, so
    // aliveBlocks alone must not mean "resume combat".
    const prev = this.mode;
    const fromCombat =
      !this.menuDemoActive &&
      (prev === 'playing' ||
        prev === 'levelclear' ||
        prev === 'intro' ||
        (prev === 'settings' && this.pendingReturnMode === 'playing') ||
        (prev === 'tech' && this.pendingReturnMode === 'playing'));
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
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

    // Retrain combat shop only — keep weapons, branches, research
    this.tech.resetCombatUpgrades();
    this.tech.setBaseline(this.save.data.baseline);
    this.tech.setResearch(this.research.bonuses);

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
    this.shopUI.setLoadoutContext(
      this.loadout,
      this.save.data.highestLevel,
      newTier
    );
    this.persist();
    this.audio.playPurchase();
    const convertMsg = converted > 0 ? ` · +${converted} CORE FROM FRAG` : '';
    this.toast(`ASCENSION ${newTier} · +${grant} CORE${convertMsg} · RETRAIN`);
    bus.emit('evolved', {
      tier: newTier,
      coreGrant: grant,
      fragConverted: converted,
    });
    return true;
  }

  private openResearch(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
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
      bus.on('enemy-drone-fire', () => this.audio.playFire('pulse')),
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
          this.showPhaseChip(p.title ?? 'NUCLEUS', p.kind ?? '');
        }
      ),
      bus.on('core-destroyed', () => {
        this.cameraCtrl.shake(0.1);
        this.audio.playCrit();
      }),
      bus.on('enemy-drone-destroyed', () => {
        this.currency.addFragments(3, this.tech.stats.fragmentMul);
      })
    );
  }

  /** Small non-blocking phase label (does not steal focus or block input). */
  private showPhaseChip(title: string, kind: string): void {
    // Host on toast-root — never #overlay-root (that dims + blocks input)
    this.toastRoot.querySelectorAll('.phase-chip').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = `phase-chip phase-${kind || 'info'}`;
    el.textContent = title;
    el.setAttribute('aria-live', 'polite');
    this.toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 1600);
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
      <div class="overlay-card interactive">
        <h2>SYSTEMS CRITICAL</h2>
        <p>Hull integrity failure. Extracting with partial salvage.</p>
        <div class="reward">Emergency extract</div>
        <button class="menu-btn primary" id="dead-repair" type="button">WATCH AD · REPAIR</button>
        <button class="menu-btn" id="dead-extract" type="button">EXTRACT</button>
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
    this.tutorial.showIfActive();
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
    // Sector select / settings: keep current bed (menu Boot Sequence) playing — no pause
    if (m === 'levels' || m === 'settings') {
      this.music.setContext('preserve');
      // If we came from main menu, radio can stay hidden but bed continues
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
    this.showMenu();
  }

  private applyStatsToSystems(): void {
    this.vitals.syncFromStats(this.tech.stats);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);
    // Hardpoints are Ascension + Core unlocks only (not combat shop).
    this.hardpoints.bindLoadout(this.loadout);
    this.syncDronesFromBays();
    this.updateHudVitals();
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

  private updateHudVitals(): void {
    const snap = this.vitals.snapshot();
    this.shopUI.setVitals(snap);
    this.hud.updateVitals(snap);
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
    const droneCost = 150;
    const canAffordDrone =
      !ownsDrone && this.currency.dataFragments >= droneCost;
    // Shop hidden until first drone is affordable OR already owned
    const shopVisible = ownsDrone || canAffordDrone;

    const rec = this.cheapestAffordable();
    const weapon = cheapestPurchasableWeapon(
      this.loadout.ownedWeapons,
      this.currency.dataFragments,
      this.save.data.highestLevel
    );
    const canBuy = shopVisible && (!!rec || !!weapon);
    const firstDrone =
      canAffordDrone && !this.shopHintShown && !this.tutorial.isActive;
    const firstWeapon =
      !!weapon &&
      weapon.id === 'rocket_pod' &&
      !this.loadout.isOwned('rocket_pod') &&
      !this.save.data.tutorialLoadoutDone &&
      this.save.data.highestLevel >= 3;

    let hint = '';
    if (firstDrone) {
      hint =
        'Ally Protocol ready — 150 FRAG. Open SHOP and buy your first AI drone.';
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
      shopVisible
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
    this.graphicsQuality = data.graphicsQuality ?? DEFAULT_GRAPHICS_QUALITY;
    this.effectiveQuality = this.graphicsQuality;

    this.loadout.load({
      hardpointUnlocks: data.hardpointsUnlocked,
      slots: data.loadout.map((s) =>
        s ? { defId: s.defId, branchRanks: s.ranks ?? {} } : null
      ),
      ownedWeapons: data.ownedWeapons,
    });
    this.loadout.syncLevelUnlocks(data.highestLevel);
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

    this.tutorial.setFlags(
      !!data.tutorialStage1Done,
      !!data.tutorialLoadoutDone
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
    const db = this.droneBays.toJSON();
    this.save.data.droneBays = db.bays;
    this.save.data.droneOwned = db.owned;
    this.save.data.droneSlots = db.slots;
    this.save.data.droneUnlockedTypes = db.unlockedTypes;
    this.syncLoadoutToSave();
    const adSnap = this.ads.toJSON();
    this.save.data.adsDayKey = adSnap.day;
    this.save.data.adsWatchedToday = adSnap.counts as Record<string, number>;
    if (this.currentLevelId > this.save.data.highestLevel) {
      this.save.data.highestLevel = this.currentLevelId;
    }
    this.save.save();
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.hud.setVisible(false);
    this.hud.setIntro(false);
    this.reticle.setVisible(false);
    this.shopUI.hide();
    this.researchUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.adsUI.hide?.();
    this.cinematicRoot?.classList.add('panel-hidden');
    this.cinematicCube.group.visible = false;
    this.cube.group.visible = true;
    this.cubeAnimator.bind(this.cube);
    this.overlay.innerHTML = '';
    this.cameraCtrl.endCinematic();
    // Restore user graphics preference if FPS demotion was active
    if (this.effectiveQuality !== this.graphicsQuality) {
      this.applyGraphics(this.graphicsQuality, false);
    }
    this.menu.setMeta(this.save.data.ascensionTier, this.currency.coreEnergy);
    this.menu.show();
    this.startMenuDemo();
    void this.music.unlock().then(() => this.syncMusicToMode());
    this.syncMusicToMode();
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
    this.cameraCtrl.yaw = 0.95;
    this.cameraCtrl.pitch = 0.32;
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
    tab?: 'ship' | 'main_gun' | 'loadouts' | 'drone_bays' | 'other' | 'drones' | 'economy' | 'global'
  ): void {
    // Gate shop until first drone is affordable or already owned
    const ownsDrone =
      this.tech.owned.has('drone_unlock') || this.tech.stats.dronesUnlocked;
    const canAffordDrone = this.currency.dataFragments >= 150;
    if (!ownsDrone && !canAffordDrone) {
      this.toast('SHOP LOCKED — EARN 150 FRAG FOR YOUR FIRST DRONE');
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

    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.researchUI.hide();
    this.overlay.innerHTML = '';
    // Resume combat only from live stage — not level-clear (avoids empty-lattice limbo)
    const fromCombat =
      !this.menuDemoActive &&
      (this.mode === 'playing' ||
        this.mode === 'intro' ||
        this.mode === 'cinematic' ||
        (this.mode === 'tech' && this.pendingReturnMode === 'playing'));
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
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
      this.save.data.highestLevel,
      this.save.data.ascensionTier
    );
    this.shopUI.setDroneBay(this.droneBays);
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
    // After shop DOM exists so tutorial can highlight .shop-reco / drone_unlock
    this.tutorial.notifyShopOpened();
    this.tutorial.showIfActive();
    this.syncMusicToMode();
  }

  private openLoadout(): void {
    // Loadout is a dedicated shop tab — same design language
    this.openTech('loadouts');
  }

  private openLevels(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.loadoutUI.hide();
    const fromCombat =
      !this.menuDemoActive &&
      (this.mode === 'playing' ||
        this.mode === 'intro' ||
        this.mode === 'levelclear' ||
        (this.mode === 'tech' && this.pendingReturnMode === 'playing') ||
        (this.mode === 'settings' && this.pendingReturnMode === 'playing'));
    this.pendingReturnMode = fromCombat ? 'playing' : 'menu';
    this.mode = 'levels';
    this.hud.setVisible(false);
    this.levelUI.show(this.save.data.highestLevel, this.currentLevelId);
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
        this.save.data.highestLevel,
        this.save.data.ascensionTier
      );
      this.shopUI.setDroneBay(this.droneBays);
      this.shopUI.render(this.tech, this.currency);
      this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
      this.audio.playPurchase();
      this.refreshShopPrompt();
      this.persist();
    }
  }

  private buyWeapon(defId: string): boolean {
    const cost = this.loadout.weaponBuyCost(defId, this.save.data.highestLevel);
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
    this.levelLoadGen++;
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
    this.overlay.innerHTML = '';
    this.hud.setIntro(false);
    // Never inherit scale 0 / off-map pose from cinematic or death
    this.restoreShipVisual();

    this.wipeCombatSession();

    this.cube.loadLevel(level);
    this.cubeAnimator.setDemoMode(false);
    this.cubeAnimator.setLevel(id);
    this.cubeDefense.startLevel(id);
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);

    this.loadout.syncLevelUnlocks(this.save.data.highestLevel);
    this.hardpoints.rebuildFromLoadout();
    this.syncDronesFromBays();
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
        this.save.data.tutorialLoadoutDone
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

  private onLevelClear(): void {
    if (this.levelClearHandled) return;
    this.levelClearHandled = true;
    this.mode = 'levelclear';
    this.audio.playLevelClear();
    this.hud.setShopAffordable(false, false);

    // Wipe combat world before UI / next cube
    this.wipeCombatSession();

    const level = getLevel(this.currentLevelId);
    let fragGain = Math.round(
      level.rewardFragments * this.tech.stats.fragmentMul * this.clearRewardMul
    );
    let coreGain = Math.round(
      level.rewardCoreEnergy * this.tech.stats.coreEnergyMul * this.clearRewardMul
    );
    this.currency.addFragments(fragGain, 1);
    this.currency.addCoreEnergy(coreGain, 1);

    this.particles.spawn(0, 0, 0, COLORS.cyan, 40, 12, 'spark');
    this.particles.spawn(0, 0, 0, COLORS.magenta, 30, 10, 'glow');
    this.rings.spawn(0, 0, 0, COLORS.white, 2.5);

    if (this.currentLevelId >= this.save.data.highestLevel) {
      this.save.data.highestLevel = this.currentLevelId + 1;
    }
    this.loadout.syncLevelUnlocks(this.save.data.highestLevel);
    this.persist();

    this.overlay.innerHTML = `
      <div class="overlay-card interactive">
        <h2>LEVEL CLEAR</h2>
        <p>${level.name}</p>
        <div class="reward">+${fragGain} FRAG · +${coreGain} CORE</div>
        <button class="menu-btn primary" id="next-level" type="button">NEXT SECTOR</button>
        <button class="menu-btn" id="clear-loadout" type="button">LOADOUT</button>
        <button class="menu-btn" id="clear-tech" type="button">TECH SHOP</button>
        <button class="menu-btn magenta" id="clear-ad" type="button">WATCH AD · ×2 REWARD</button>
        <button class="menu-btn" id="clear-menu" type="button">MENU</button>
      </div>
    `;

    let doubled = this.clearRewardMul >= 2;
    this.overlay.querySelector('#clear-ad')!.addEventListener('click', () => {
      if (doubled) return;
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
            if (reward?.fragmentMul && !doubled) {
              doubled = true;
              const extraF = fragGain;
              const extraC = coreGain;
              this.currency.addFragments(extraF, 1);
              this.currency.addCoreEnergy(extraC, 1);
              fragGain *= 2;
              coreGain *= 2;
              const rew = this.overlay.querySelector('.reward');
              if (rew) rew.textContent = `+${fragGain} FRAG · +${coreGain} CORE (×2)`;
              this.persist();
              this.toast('REWARD DOUBLED');
            }
          })
          .finally(() => {
            // Always clear ad dim layer so clear card stays interactive
            this.adsUI.hide();
          });
      };
      this.adsUI.onDeclined = () => {
        this.adsUI.hide();
      };
    });

    this.overlay.querySelector('#next-level')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.startLevel(this.currentLevelId + 1);
    });
    this.overlay.querySelector('#clear-loadout')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.openLoadout();
    });
    this.overlay.querySelector('#clear-tech')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.openTech();
    });
    this.overlay.querySelector('#clear-menu')!.addEventListener('click', () => {
      this.overlay.innerHTML = '';
      this.currentLevelId = Math.min(this.currentLevelId + 1, this.save.data.highestLevel);
      this.showMenu();
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

  private onVisibility = (): void => {
    this.hidden = document.hidden;
    if (!document.hidden) this.time.reset();
    this.persist();
  };

  private maybeSave(dt: number): void {
    this.saveAccum += dt;
    if (this.saveAccum > 10) {
      this.saveAccum = 0;
      this.persist();
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.time.tick();
    const now = this.time.elapsed;

    // Adaptive VFX + temporary quality demotion under thermal/FPS pressure
    if (
      this.mode === 'playing' ||
      this.mode === 'intro' ||
      this.mode === 'cinematic' ||
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

    this.ambient.update(dt);
    this.screenFx.update(dt);

    if (this.mode === 'menu') {
      // Demo cube: smooth orbit presentation
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
    } else if (this.mode === 'settings') {
      // Static backdrop — keep menu demo if it was running
      this.cameraCtrl.yaw += dt * 0.04;
      this.cameraCtrl.update(dt);
      if (this.menuDemoActive) {
        this.cube.update(dt, now);
        this.cubeAnimator.update(dt);
      }
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
        if (this.reviveImmunity > 0) {
          this.reviveImmunity = Math.max(0, this.reviveImmunity - dt);
        }
        this.vitals.update(dt);
        this.updateHudVitals();
        this.updateCombatWarmup(dt);
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
            !ownsDrone && this.currency.dataFragments >= 150;
          const rocketCost = this.loadout.weaponBuyCost(
            'rocket_pod',
            this.save.data.highestLevel
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
          });
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

        const level = getLevel(this.currentLevelId);
        this.hud.updateLevel(
          level.id,
          level.name,
          this.cube.progress,
          this.cube.aliveBlocks,
          this.cube.totalBlocks
        );
        this.hud.updateNucleus(this.cube.nucleus.snapshot());
        this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);

        // Level ends only when nucleus is destroyed (or no nucleus + no blocks)
        if (this.cube.isLevelComplete()) this.onLevelClear();
      }
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
      } else {
        this.cameraCtrl.yaw += dt * 0.05;
        this.cameraCtrl.update(dt);
        if (this.menuDemoActive) {
          this.cube.update(dt, now);
          this.cubeAnimator.update(dt);
        } else {
          this.ship.update(this.cameraCtrl, dt);
        }
      }
    }

    this.particles.update(dt);
    this.shatter.update(dt);
    this.rings.update(dt);
    this.post.render();
    this.maybeSave(dt);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const u of this.unsubs) u();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.cube.dispose();
    this.cinematicCube.dispose();
    this.cubeAnimator.dispose();
    this.cubeDefense.dispose();
    this.ship.dispose();
    this.weapon.dispose();
    this.hardpoints.dispose();
    this.drones.dispose();
    this.particles.dispose();
    this.shatter.dispose();
    this.rings.dispose();
    this.reticle.dispose();
    this.cinematic?.dispose();
    this.screenFx?.dispose();
    this.ambient.dispose();
    this.post.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
  }
}
