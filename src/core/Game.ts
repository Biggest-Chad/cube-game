import * as THREE from 'three';
import { COLORS, ORBIT, PERF } from '../data/constants';
import { getLevel } from '../data/levels';
import type { UpgradeNodeDef } from '../data/upgrades';
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
import { AdsOfferUI } from '../ui/AdsOfferUI';

type Mode =
  | 'menu'
  | 'intro'
  | 'playing'
  | 'levelclear'
  | 'tech'
  | 'levels'
  | 'loadout'
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
  private audio = new AudioEngine();
  private ads = new AdService(new DummyAdProvider());

  private hud: HUD;
  private menu: MenuUI;
  private shopUI: ShopUI;
  private levelUI: LevelSelectUI;
  private loadoutUI: LoadoutUI;
  private adsUI: AdsOfferUI;
  private overlay: HTMLElement;

  private mode: Mode = 'menu';
  private currentLevelId = 1;
  private raf = 0;
  private hidden = false;
  private lowFpsTimer = 0;
  private highQuality = true;
  private levelClearHandled = false;
  private unsubs: Array<() => void> = [];
  private introTimer = 0;
  private introDuration = ORBIT.introDuration;
  private shopHintShown = false;
  private pendingIdle = 0;
  private saveAccum = 0;
  private clearRewardMul = 1;
  private pendingReturnMode: Mode = 'playing';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
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
    this.rings = new ImpactRings(28);
    this.scene.add(this.particles.points);
    this.scene.add(this.rings.group);

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
    this.adsUI = new AdsOfferUI(document.getElementById('ads-root')!);
    this.overlay = document.getElementById('overlay-root')!;

    const els = this.hud.elements;
    this.input.bind(els.joyZone, els.stickEl, els.fireBtn);
    this.input.autoFire = true;

    this.wireUI();
    this.wireEvents();
    this.loadProgress();

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('beforeunload', () => this.persist());

    this.showMenu();
    this.loop();
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
    this.menu.onReset = () => {
      this.save.reset();
      this.shopHintShown = false;
      this.loadProgress();
      this.showMenu();
    };

    const els = this.hud.elements;
    els.btnTech.addEventListener('click', () => this.openTech());
    els.btnLevels.addEventListener('click', () => this.openLevels());
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

    // Extra loadout button via tech shop loadouts tab is enough; also bind double-tap menu for loadout
    this.shopUI.onClose = () => {
      this.shopUI.hide();
      this.hud.hideShopHint();
      if (this.pendingReturnMode === 'playing' || this.mode === 'tech') {
        this.mode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
        if (this.mode === 'playing') this.hud.setVisible(true);
        else this.showMenu();
      } else {
        this.showMenu();
      }
    };
    this.shopUI.onPurchase = (node) => this.buyUpgrade(node);

    this.levelUI.onClose = () => {
      this.levelUI.hide();
      this.mode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
      if (this.mode === 'playing') this.hud.setVisible(true);
      else this.showMenu();
    };
    this.levelUI.onSelect = (id) => {
      this.levelUI.hide();
      void this.audio.resume();
      this.startLevel(id);
    };

    this.loadoutUI.onClose = () => {
      this.loadoutUI.hide();
      this.mode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
      if (this.mode === 'playing') this.hud.setVisible(true);
      else this.showMenu();
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

    this.adsUI.onAccepted = (placement) => {
      void this.handleAdReward(placement);
    };
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
        }) => {
          const len = Math.hypot(r.x, r.y, r.z) || 1;
          this.cubeAnimator.notifyDamage(r.destroyed ? 12 : 3);

          if (r.destroyed) {
            this.shatter.shatter(r.x, r.y, r.z, r.type);
            this.rings.spawn(r.x, r.y, r.z, colorForType(r.type), r.type === BlockType.Core ? 1.6 : 1);
            this.cameraCtrl.shake(r.type === BlockType.Core ? 0.14 : 0.08);
            this.audio.playDestroy();
            const gained = this.currency.addFragments(r.fragments, this.tech.stats.fragmentMul);
            this.save.data.totalBlocksDestroyed++;
            if (gained > 0) {
              this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
            }
            this.refreshShopPrompt();
          } else {
            this.shatter.impact(r.x, r.y, r.z, r.x / len, r.y / len, r.z / len, !!r.crit);
            this.rings.spawn(r.x, r.y, r.z, r.crit ? COLORS.magenta : COLORS.cyan, 0.55);
            this.audio.playHit();
          }
        }
      ),
      bus.on('weapon-fire', () => this.audio.playFire()),
      bus.on('upgrade-purchased', () => {
        this.audio.playPurchase();
        this.applyStatsToSystems();
        this.shopHintShown = true;
        this.hud.hideShopHint();
        this.persist();
        this.refreshShopPrompt();
      }),
      bus.on('cube-rotation-start', () => {
        this.cameraCtrl.shake(0.12);
        this.toast('CUBE REALIGNING');
      }),
      bus.on('cube-rotation-end', () => this.cameraCtrl.shake(0.18))
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
    const canBuy = !!rec;
    const firstTime = canBuy && !this.shopHintShown && this.tech.owned.size === 0;
    const hint = rec
      ? `You can buy “${rec.name}” (${rec.cost} ${rec.costCurrency === 'coreEnergy' ? 'CORE' : 'FRAG'}) — ${rec.description}`
      : '';
    this.hud.setShopAffordable(canBuy, firstTime, hint);
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

    this.loadout.load({
      hardpointUnlocks: data.hardpointsUnlocked,
      slots: data.loadout.map((s) =>
        s ? { defId: s.defId, branchRanks: s.ranks ?? {} } : null
      ),
      ownedWeapons: data.ownedWeapons,
    });
    this.loadout.syncLevelUnlocks(data.highestLevel);
    this.hardpoints.bindLoadout(this.loadout);

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
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.adsUI.hide?.();
    this.overlay.innerHTML = '';
    this.cameraCtrl.endCinematic();
    this.menu.show();
  }

  private openTech(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.pendingReturnMode = this.cube.aliveBlocks > 0 ? 'playing' : 'menu';
    this.mode = 'tech';
    this.hud.setVisible(false);
    this.hud.hideShopHint();
    this.shopHintShown = true;
    this.shopUI.setVitals(this.vitals.snapshot());
    this.shopUI.show(this.tech, this.currency);
  }

  private openLoadout(): void {
    void this.audio.resume();
    this.audio.playUi();
    this.menu.hide();
    this.shopUI.hide();
    this.mode = 'loadout';
    this.hud.setVisible(false);
    this.loadoutUI.show(this.loadout, this.currency, this.save.data.highestLevel);
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
    // Hardpoint unlocks via shop also sync loadout
    if (this.tech.purchase(node, this.currency)) {
      if (node.effects.hardpointAdd) {
        this.loadout.hardpointUnlocks = Math.max(
          this.loadout.hardpointUnlocks,
          this.tech.stats.hardpoints
        );
        this.hardpoints.rebuildFromLoadout();
      }
      this.applyStatsToSystems();
      this.shopUI.setVitals(this.vitals.snapshot());
      this.shopUI.render(this.tech, this.currency);
      this.hud.updateCurrency(this.currency.dataFragments, this.currency.coreEnergy);
      this.persist();
    }
  }

  private startLevel(id: number): void {
    const level = getLevel(id);
    this.currentLevelId = id;
    this.levelClearHandled = false;
    this.clearRewardMul = 1;
    this.menu.hide();
    this.shopUI.hide();
    this.levelUI.hide();
    this.loadoutUI.hide();
    this.overlay.innerHTML = '';

    // Session hygiene — clear projectiles/particles/defense before new cube
    this.wipeCombatSession();

    this.mode = 'intro';
    this.introTimer = 0;
    this.hud.setVisible(true);
    this.hud.setIntro(true, `${level.name} · ${level.size}³ lattice`);

    this.cube.loadLevel(level);
    this.cubeAnimator.setLevel(id);
    this.cubeDefense.startLevel(id);
    this.cameraCtrl.setOrbitLimits(this.cube.halfExtent);
    this.cameraCtrl.setTopSpeedMul(this.tech.stats.orbitSpeedMul);
    this.cameraCtrl.extendMaxRadius(this.tech.stats.zoomRangeAdd);
    this.cameraCtrl.startCinematic(this.cameraCtrl.yaw);

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
  }

  private finishIntro(): void {
    this.mode = 'playing';
    this.cameraCtrl.endCinematic();
    this.hud.setIntro(false);
    this.refreshShopPrompt();
    this.toast('ENGAGE');
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
    this.renderer.setSize(w, h, false);
    this.cameraCtrl.resize(w / h);
    this.post.setSize(w, h);
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

    if (
      this.time.fps < PERF.lowFpsThreshold &&
      (this.mode === 'playing' || this.mode === 'intro')
    ) {
      this.lowFpsTimer += dt;
      if (this.lowFpsTimer > PERF.lowFpsSeconds && this.highQuality) {
        this.highQuality = false;
        this.post.setQuality(false);
        this.particles.setBudget(PERF.lowMaxParticles);
        this.ambient.setQuality(true);
        this.renderer.setPixelRatio(1);
      }
    } else {
      this.lowFpsTimer = 0;
    }

    this.ambient.update(dt);

    if (this.mode === 'menu') {
      this.cameraCtrl.yaw += dt * 0.08;
      this.cameraCtrl.pitch = 0.28 + Math.sin(now * 0.15) * 0.06;
      this.cameraCtrl.update(dt);
      this.ship.update(this.cameraCtrl, dt);
    } else if (this.mode === 'intro') {
      this.introTimer += dt;
      const progress = this.introTimer / this.introDuration;
      this.cameraCtrl.updateIntro(progress, dt);
      this.ship.update(this.cameraCtrl, dt);
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
    } else if (this.mode === 'playing' || this.mode === 'levelclear') {
      this.input.update();
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
      this.ship.update(this.cameraCtrl, dt);

      if (this.mode === 'playing') {
        this.vitals.update(dt);

        // Combat origin = ship visual pos (tracks orbit with lag)
        this.weapon.update(
          dt,
          this.input.isFiring,
          this.ship.position,
          this.cube,
          this.tech.stats,
          now
        );

        this.hardpoints.update(
          dt,
          this.input.isFiring,
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
      this.cameraCtrl.yaw += dt * 0.06;
      this.cameraCtrl.update(dt);
      this.ship.update(this.cameraCtrl, dt);
    }

    this.particles.update(dt);
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
    this.rings.dispose();
    this.ambient.dispose();
    this.post.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
  }
}
