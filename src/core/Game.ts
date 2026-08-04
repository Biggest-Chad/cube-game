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
import { DroneManager } from '../drones/DroneManager';
import { Currency } from '../progression/Currency';
import { TechTree } from '../progression/TechTree';
import { IdleSimulator } from '../progression/IdleSimulator';
import { ParticlePool } from '../vfx/ParticlePool';
import { ShatterSystem } from '../vfx/ShatterSystem';
import { ImpactRings } from '../vfx/ImpactRings';
import { AimReticle } from '../vfx/AimReticle';
import { CinematicIntro } from '../vfx/CinematicIntro';
import { PostProcessing } from '../vfx/PostProcessing';
import { AmbientEnvironment } from '../world/AmbientEnvironment';
import { AudioEngine } from '../audio/AudioEngine';
import { AdService } from '../ads/AdService';
import { DummyAdProvider } from '../ads/DummyAdProvider';
import { HUD } from '../ui/HUD';
import { MenuUI } from '../ui/MenuUI';
import { ShopUI } from '../ui/ShopUI';
import { LevelSelectUI } from '../ui/LevelSelectUI';
import { LoadoutUI } from '../ui/LoadoutUI';
import { SettingsUI } from '../ui/SettingsUI';
import { AdsOfferUI } from '../ui/AdsOfferUI';
import { TutorialDirector } from '../ui/TutorialDirector';
import { ScreenTransition } from '../ui/ScreenTransition';
import { cheapestPurchasableWeapon, weaponUnlockCost } from '../data/weapons';

type Mode =
  | 'menu'
  | 'intro'
  | 'cinematic'
  | 'playing'
  | 'levelclear'
  | 'tech'
  | 'levels'
  | 'loadout'
  | 'settings'
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
  private cubeAnimator = new CubeAnimator();
  private cubeDefense = new CubeDefense();
  private ship = new Ship();
  private vitals = new ShipVitals();
  private weapon = new Weapon();
  private hardpoints = new HardpointSystem();
  private loadout = new LoadoutState();
  private drones = new DroneManager();
  private input = new InputController();
  private currency = new Currency();
  private tech = new TechTree();
  private idle = new IdleSimulator();
  private particles: ParticlePool;
  private shatter: ShatterSystem;
  private rings: ImpactRings;
  private reticle = new AimReticle();
  private cinematic: CinematicIntro | null = null;
  private audio = new AudioEngine();
  private ads = new AdService(new DummyAdProvider());
  private readonly _muzzle = new THREE.Vector3();
  private readonly _aimDir = new THREE.Vector3();

  private hud: HUD;
  private menu: MenuUI;
  private shopUI: ShopUI;
  private levelUI: LevelSelectUI;
  private loadoutUI: LoadoutUI;
  private settingsUI: SettingsUI;
  private adsUI: AdsOfferUI;
  private tutorial!: TutorialDirector;
  private screenFx!: ScreenTransition;
  private overlay: HTMLElement;
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
  /** Seconds remaining before weapons may fire (3s level warm-up). */
  private combatWarmup = 0;
  /** Tutorial: fire blocked until welcome ack or movement. */
  private tutorialFireUnlocked = false;
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

    const amb = new THREE.AmbientLight(0x1a2830, 0.75);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0x3a5a6a, 0x080810, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xc8e8f0, 0.85);
    key.position.set(18, 28, 14);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8866aa, 0.25);
    rim.position.set(-16, -6, -12);
    this.scene.add(rim);

    this.cubeAnimator.bind(this.cube);
    this.cubeDefense.bind(this.cube);
    this.cubeDefense.setHooks({
      onPlayerDamage: (amount) => this.onPlayerDamaged(amount),
      getPlayerPosition: () => this.ship.position.clone(),
    });

    this.registerSessionCleaners();

    this.hud = new HUD(document.getElementById('hud-root')!);
    this.menu = new MenuUI(document.getElementById('menu-root')!);
    this.shopUI = new ShopUI(document.getElementById('tech-tree-root')!);
    this.levelUI = new LevelSelectUI(document.getElementById('level-select-root')!);
    this.loadoutUI = new LoadoutUI(document.getElementById('loadout-root')!);
    this.settingsUI = new SettingsUI(document.getElementById('settings-root')!);
    this.adsUI = new AdsOfferUI(document.getElementById('ads-root')!);
    this.overlay = document.getElementById('overlay-root')!;
    this.tutorial = new TutorialDirector(document.getElementById('hud-root')!, {
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
      this.startLevel(this.currentLevelId);
    };
    this.menu.onTech = () => this.openTech();
    this.menu.onLevels = () => this.openLevels();
    this.menu.onLoadout = () => this.openLoadout();
    this.menu.onSettings = () => this.openSettings();

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
      if (this.pendingReturnMode === 'playing' || this.mode === 'tech') {
        this.mode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
        if (this.mode === 'playing') {
          this.hud.setVisible(true);
          this.hud.setCrosshairVisible(true);
          this.tutorial.showIfActive();
        } else this.showMenu();
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
      const cost = this.loadout.hardpointCost(slot);
      const discount = this.ads.consumeHardpointDiscount();
      const finalCost = Math.round(cost * (1 - discount));
      if (!this.currency.spendCoreEnergy(finalCost)) return false;
      if (this.loadout.unlockHardpoint(slot, this.save.data.highestLevel) < 0) {
        this.currency.coreEnergy += finalCost;
        return false;
      }
      this.sessionPurchased = true;
      this.tutorial.notifyPurchase();
      this.hardpoints.celebrateUnlock(slot);
      this.hardpoints.rebuildFromLoadout();
      this.syncLoadoutToSave();
      this.persist();
      this.audio.playPurchase();
      return true;
    };

    this.tutorial.onRequestShop = () => {
      const step = this.tutorial.currentStep;
      if (step?.id === 'loadout_buy' || step?.advance === 'weapon_owned') {
        this.openTech('loadouts');
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
      this.mode = this.cube.aliveBlocks > 0 && !this.menuDemoActive ? 'playing' : 'menu';
      if (this.mode === 'playing') this.hud.setVisible(true);
      else this.showMenu();
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
      const discount = this.ads.consumeHardpointDiscount();
      const finalCost = Math.round(cost * (1 - discount));
      if (!this.currency.spendCoreEnergy(finalCost)) return false;
      this.hardpoints.celebrateUnlock(slot);
      this.audio.playPurchase();
      return true;
    };
    this.loadoutUI.onSpendFragments = (n) => this.currency.spendFragments(n);

    this.settingsUI.onClose = () => {
      this.settingsUI.hide();
      if (this.pendingReturnMode === 'playing' && this.cube.aliveBlocks > 0) {
        this.mode = 'playing';
        this.hud.setVisible(true);
        this.hud.setCrosshairVisible(true);
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
    };
    this.settingsUI.onMuteChange = (m) => {
      this.audio.setMuted(m);
      this.save.data.muted = m;
      this.hud.setMuted(m);
      this.persist();
    };
    this.settingsUI.onVolumeChange = (v) => {
      this.audio.setVolume(v);
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
  }

  private openSettings(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.pendingReturnMode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
    this.mode = 'settings';
    this.hud.setVisible(false);
    this.settingsUI.show({
      graphics: this.graphicsQuality,
      muted: this.audio.muted,
      volume: this.audio.volume,
    });
  }

  private async handleAdReward(placement: import('../ads/AdProvider').AdPlacement): Promise<void> {
    const { reward } = await this.ads.offer(placement);
    if (!reward) return;
    if (reward.fragments) this.currency.addFragments(reward.fragments, 1);
    if (reward.fragmentMul) this.clearRewardMul = Math.max(this.clearRewardMul, reward.fragmentMul);
    if (reward.hullRestore) this.vitals.heal(this.vitals.maxHull * reward.hullRestore);
    if (reward.shieldFull) this.vitals.restoreShield(this.vitals.maxShield);
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.persist();
    this.toast('AD REWARD APPLIED');
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
            this.shatter.shatter(r.x, r.y, r.z, r.type, style, nx, ny, nz);
            this.rings.spawn(
              r.x,
              r.y,
              r.z,
              colorForType(r.type),
              r.type === BlockType.Core ? 2.0 : 1.35
            );
            this.cameraCtrl.shake(
              r.type === BlockType.Core ? 0.18 : r.crit ? 0.12 : 0.09
            );
            this.audio.playDestroy();
            const gained = this.currency.addFragments(r.fragments, this.tech.stats.fragmentMul);
            this.save.data.totalBlocksDestroyed++;
            this.sessionBlocksDestroyed++;
            if (gained > 0) {
              this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
            }
            this.refreshShopPrompt();
          } else {
            this.shatter.impact(r.x, r.y, r.z, nx, ny, nz, !!r.crit);
            this.rings.spawn(
              r.x,
              r.y,
              r.z,
              r.crit ? COLORS.magenta : COLORS.cyan,
              r.crit ? 0.85 : 0.65
            );
            this.audio.playHit();
          }
        }
      ),
      bus.on('weapon-fire', () => this.audio.playFire()),
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
      // Cube scramble: silent (no toast spam)
      // Single shake path only (animator emits camera-shake-request on complete)
      bus.on('camera-shake-request', (p: { amount?: number }) => {
        if (this.mode === 'playing' || this.mode === 'cinematic') {
          this.cameraCtrl.shake(Math.min(0.12, p?.amount ?? 0.08));
        }
      })
    );
  }

  private onPlayerDamaged(amount: number): void {
    if (this.mode !== 'playing') return;
    const hit = this.vitals.takeDamage(amount);
    this.cameraCtrl.shake(0.1);
    this.audio.playHit();
    this.updateHudVitals();
    if (hit.died) this.onShipDestroyed();
  }

  private onShipDestroyed(): void {
    this.mode = 'dead';
    this.wipeCombatSession();
    this.persist();

    const salvage = Math.floor(this.currency.dataFragments * 0.05);
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
        this.mode = 'playing';
        this.toast('REPAIR UNAVAILABLE — FULL RESTORE');
      } else {
        this.adsUI.onAccepted = (p) => {
          void this.handleAdReward(p).then(() => {
            if (this.vitals.isAlive) {
              this.mode = 'playing';
              this.hud.setVisible(true);
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
    void salvage;
  }

  private extractToMenu(): void {
    this.vitals.fullRestore();
    this.showMenu();
  }

  private applyStatsToSystems(): void {
    this.vitals.syncFromStats(this.tech.stats);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);
    // Hardpoints from tech
    if (this.tech.stats.hardpoints > this.loadout.hardpointUnlocks) {
      this.loadout.hardpointUnlocks = Math.min(3, this.tech.stats.hardpoints);
    }
    this.hardpoints.bindLoadout(this.loadout);
    this.drones.syncCount(this.tech.stats);
    this.updateHudVitals();
  }

  private updateHudVitals(): void {
    this.shopUI.setVitals(this.vitals.snapshot());
    // Extend currency line with hull/shield if HUD supports — use blocks line suffix
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
      this.hud.setShopAffordable(false, false);
      return;
    }
    const rec = this.cheapestAffordable();
    const weapon = cheapestPurchasableWeapon(
      this.loadout.ownedWeapons,
      this.currency.dataFragments
    );
    const canBuy = !!rec || !!weapon;
    const firstUpgrade =
      !!rec && !this.shopHintShown && this.tech.owned.size === 0 && !this.tutorial.isActive;
    const firstWeapon =
      !!weapon &&
      weapon.id === 'pulse_laser' &&
      !this.loadout.isOwned('pulse_laser') &&
      !this.save.data.tutorialLoadoutDone;

    let hint = '';
    if (firstWeapon && weapon) {
      const c = weaponUnlockCost(weapon);
      hint = `Arc Beam ready — ${c.fragments} FRAG. Open SHOP → LOADOUTS to purchase your first hardpoint weapon.`;
      this.tutorial.tryStartLoadout();
    } else if (rec) {
      hint = `You can buy “${rec.name}” (${rec.cost} ${
        rec.costCurrency === 'coreEnergy' ? 'CORE' : 'FRAG'
      }) — ${rec.description}`;
    } else if (weapon) {
      const c = weaponUnlockCost(weapon);
      hint = `Weapon available: ${weapon.name} · ${c.fragments} FRAG in LOADOUTS`;
    }
    this.hud.setShopAffordable(canBuy, firstUpgrade || firstWeapon, hint);
  }

  private loadProgress(): void {
    const data = this.save.load();
    this.currency.load(data.dataFragments, data.coreEnergy, data.prestigeTokens);
    this.tech.load(data.ownedUpgrades);
    this.currentLevelId = data.currentLevel;
    this.audio.setMuted(data.muted);
    this.audio.setVolume(data.masterVolume);
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
    this.drones.syncCount(this.tech.stats);

    const offlineSec = this.idle.computeOffline(data.lastSaveTime, this.tech.stats);
    if (offlineSec > 30) this.pendingIdle = offlineSec;
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
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.adsUI.hide?.();
    this.cinematicRoot?.classList.add('panel-hidden');
    this.overlay.innerHTML = '';
    this.cameraCtrl.endCinematic();
    // Restore user graphics preference if FPS demotion was active
    if (this.effectiveQuality !== this.graphicsQuality) {
      this.applyGraphics(this.graphicsQuality, false);
    }
    this.menu.show();
    this.startMenuDemo();
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

  private openTech(tab?: 'ship' | 'main_gun' | 'loadouts' | 'drones' | 'economy' | 'global'): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.pendingReturnMode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
    this.mode = 'tech';
    this.shopOpen = true;
    this.hud.setVisible(false);
    this.hud.hideShopHint();
    this.shopHintShown = true;
    this.tutorial.notifyShopOpened();
    this.shopUI.setVitals(this.vitals.snapshot());
    this.shopUI.setLoadoutContext(this.loadout, this.save.data.highestLevel);
    this.shopUI.show(this.tech, this.currency, tab);
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
    this.mode = 'levels';
    this.hud.setVisible(false);
    this.levelUI.show(this.save.data.highestLevel, this.currentLevelId);
  }

  private buyUpgrade(node: UpgradeNodeDef): void {
    if (this.tech.purchase(node, this.currency)) {
      this.sessionPurchased = true;
      this.tutorial.notifyPurchase();
      if (node.effects.hardpointAdd) {
        this.loadout.hardpointUnlocks = Math.max(
          this.loadout.hardpointUnlocks,
          this.tech.stats.hardpoints
        );
        this.hardpoints.rebuildFromLoadout();
      }
      this.applyStatsToSystems();
      this.shopUI.setVitals(this.vitals.snapshot());
      this.shopUI.setLoadoutContext(this.loadout, this.save.data.highestLevel);
      this.shopUI.render(this.tech, this.currency);
      this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
      this.audio.playPurchase();
      this.persist();
    }
  }

  private buyWeapon(defId: string): boolean {
    const cost = this.loadout.weaponBuyCost(defId);
    if (!cost) return false;
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
    this.tutorial.notifyPurchase();
    this.hardpoints.rebuildFromLoadout();
    this.syncLoadoutToSave();
    this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
    this.audio.playPurchase();
    this.toast(`${defId === 'pulse_laser' ? 'ARC BEAM' : 'WEAPON'} ACQUIRED`);
    this.persist();
    return true;
  }

  /**
   * Start a sector with cinematic letterbox fade (menu → level, level → level).
   */
  private startLevel(id: number): void {
    const go = () => this.startLevelImmediate(id);
    if (this.screenFx.isActive) {
      go();
      return;
    }
    this.screenFx.play({
      fadeOut: 0.55,
      hold: 0.4,
      fadeIn: 0.8,
      onBlack: go,
    });
  }

  private startLevelImmediate(id: number): void {
    const level = getLevel(id);
    this.currentLevelId = id;
    this.levelClearHandled = false;
    this.clearRewardMul = 1;
    this.stopMenuDemo();
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.settingsUI.hide();
    this.overlay.innerHTML = '';

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
    this.drones.syncCount(this.tech.stats);
    this.vitals.fullRestore();
    this.vitals.syncFromStats(this.tech.stats);
    this.vitals.fullRestore();

    if (this.pendingIdle > 0) {
      let seconds = this.pendingIdle;
      const boost = this.ads.consumeOfflineBoost();
      seconds *= boost;
      const result = this.idle.apply(
        seconds,
        this.cube,
        this.tech.stats,
        this.currency,
        performance.now() / 1000
      );
      this.pendingIdle = 0;
      if (result.blocksDestroyed > 0) {
        this.toast(`OFFLINE +${result.fragments} FRAG · ${result.blocksDestroyed} BLOCKS`);
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
      this.cinematic.start({
        cube: this.cube,
        animator: this.cubeAnimator,
        camera: this.cameraCtrl,
        ship: this.ship,
        particles: this.particles,
      });
      try {
        this.audio.playUi();
      } catch {
        /* audio may be locked until gesture */
      }
    } else {
      this.mode = 'intro';
      this.introTimer = 0;
      this.hud.setVisible(true);
      this.hud.setIntro(true, `${level.name} · ${level.size}³ lattice`);
      this.reticle.setVisible(false);
      this.ship.group.visible = true;
      this.cameraCtrl.startCinematic(this.cameraCtrl.yaw);
    }
  }

  /**
   * Exit cinematic / short intro into gameplay through a black letterbox cut.
   */
  private finishIntro(): void {
    const go = () => this.finishIntroImmediate();
    if (this.screenFx.isActive) {
      go();
      return;
    }
    this.screenFx.play({
      fadeOut: 0.7,
      hold: 0.45,
      fadeIn: 1.0,
      onBlack: go,
    });
  }

  private finishIntroImmediate(): void {
    // Hard-reset cube to playable origin
    this.cube.group.position.set(0, 0, 0);
    this.cube.group.rotation.set(0, 0, 0);
    this.cube.group.quaternion.identity();
    this.cube.group.scale.setScalar(1);
    this.cubeAnimator.endCinematicBurst();
    this.cubeAnimator.reset();
    this.cubeAnimator.setEnabled(true);

    this.cameraCtrl.yaw = 0.85;
    this.cameraCtrl.pitch = 0.28;
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent);
    this.cameraCtrl.endCinematic();

    // Place ship on orbit seat BEFORE unhiding (never spawn inside cube)
    this.ship.group.scale.setScalar(1);
    this.ship.group.visible = false;
    for (let i = 0; i < 12; i++) this.ship.update(this.cameraCtrl, 0.08);
    this.ship.group.visible = true;
    this.hardpoints.group.visible = true;

    this.mode = 'playing';
    this.sessionBlocksDestroyed = 0;
    this.sessionPurchased = false;
    this.combatWarmup = 3;
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
        void this.ads.offer(p).then(({ reward }) => {
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
        });
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
    this.overlay.appendChild(el);
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

    // Temporary FPS demotion (one step) without changing user settings preference
    if (
      this.time.fps < PERF.lowFpsThreshold &&
      (this.mode === 'playing' || this.mode === 'intro' || this.mode === 'cinematic')
    ) {
      this.lowFpsTimer += dt;
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
    } else {
      this.lowFpsTimer = 0;
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
      // Cube block regen/flash only — transform + ship owned by cinematic director
      this.cube.update(dt, now);
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
        this.vitals.update(dt);
        this.updateCombatWarmup(dt);
        const allowFire = this.canFireWeapons() && this.input.isFiring;

        // Always update aim (so crosshair tracks); fire only when armed
        this.weapon.update(
          dt,
          allowFire,
          this.ship,
          this.cube,
          this.tech.stats,
          now,
          this.input.aimX,
          this.input.aimY
        );

        this.weapon.getAimDirection(this._aimDir);
        this.hud.setCrosshairVisible(true);
        this.updateAimCrosshair(allowFire);

        // Guided tutorial progress
        const orbitMag = Math.hypot(this.input.axisX, this.input.axisY);
        const aimMag = Math.hypot(this.input.aimX, this.input.aimY);
        this.tutorial.update(dt, {
          orbitMag,
          aimMag,
          blocksDestroyedSession: this.sessionBlocksDestroyed,
          shopOpen: this.shopOpen,
          purchasedThisSession: this.sessionPurchased,
          ownsArcBeam: this.loadout.isOwned('pulse_laser'),
          hasEquippedWeapon: this.loadout.allDerived().length > 0,
          canAffordShop: !!this.cheapestAffordable(),
          canAffordArcBeam:
            !this.loadout.isOwned('pulse_laser') &&
            this.currency.dataFragments >=
              (this.loadout.weaponBuyCost('pulse_laser')?.fragments ?? Infinity),
        });

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
          onEnemyHit: (id, dmg) => this.cubeDefense.damageEnemy(id, dmg),
          onShieldRepair: (amt) => this.vitals.restoreShield(amt),
        });
        this.drones.update(dt, this.cube, this.tech.stats, now, this.hidden);

        this.cube.update(dt, now);
        this.cubeAnimator.update(dt);
        this.cubeDefense.update(dt);

        const level = getLevel(this.currentLevelId);
        this.hud.updateLevel(
          level.id,
          level.name,
          this.cube.progress,
          this.cube.aliveBlocks,
          this.cube.totalBlocks
        );
        this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);

        if (this.cube.aliveBlocks <= 0) this.onLevelClear();
      }
    } else if (
      this.mode === 'tech' ||
      this.mode === 'levels' ||
      this.mode === 'loadout' ||
      this.mode === 'dead'
    ) {
      this.cameraCtrl.yaw += dt * 0.05;
      this.cameraCtrl.update(dt);
      if (this.menuDemoActive) {
        this.cube.update(dt, now);
        this.cubeAnimator.update(dt);
      } else {
        this.ship.update(this.cameraCtrl, dt);
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
