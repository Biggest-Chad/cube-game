export class HUD {
  private root: HTMLElement;
  private fragEl!: HTMLElement;
  private coreEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private blocksEl!: HTMLElement;
  private joyZone!: HTMLElement;
  private stickEl!: HTMLElement;
  private aimZone!: HTMLElement;
  private aimStickEl!: HTMLElement;
  private btnTech!: HTMLElement;
  private btnLevels!: HTMLElement;
  private btnMute!: HTMLElement;
  private btnMenu!: HTMLElement;
  private btnLoadout!: HTMLElement;
  private shopHint!: HTMLElement;
  private introBanner!: HTMLElement;
  private controlsLayer!: HTMLElement;
  private crosshair!: HTMLElement;
  private shieldBar!: HTMLElement;
  private hullBar!: HTMLElement;
  private shieldVal!: HTMLElement;
  private hullVal!: HTMLElement;
  private nucleusWrap!: HTMLElement;
  private nucleusBar!: HTMLElement;
  private nucleusVal!: HTMLElement;
  private nucleusStatus!: HTMLElement;
  private vitalsEl!: HTMLElement | null;

  private lastFrag = Number.NaN;
  private lastCore = Number.NaN;
  private lastHullCeil = Number.NaN;
  private lastShieldCeil = Number.NaN;
  private lastHullBar = '';
  private lastShieldBar = '';
  private lastVitalsCritical: boolean | null = null;
  private lastShieldDown: boolean | null = null;
  private lastLevelText = '';
  private lastProgressBar = '';
  private lastBlocksText = '';
  private lastNucleusActive: boolean | null = null;
  private lastNucleusBar = '';
  private lastNucleusVal = '';
  private lastNucleusStatus = '';
  private lastNucleusExposed: boolean | null = null;
  private lastNucleusOverload: boolean | null = null;
  private lastNucleusDecaying: boolean | null = null;
  private lastNucleusLaser: boolean | null = null;
  private lastAmmoKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-landscape">
        <div class="hud-top-bar">
          <div class="hud-currency-stack ui-chip">
            <div class="hud-currency-row">
              <div class="label">Fragments</div>
              <div class="value" id="hud-frag">0</div>
            </div>
            <div class="hud-currency-row magenta">
              <div class="label">Core Energy</div>
              <div class="value" id="hud-core">0</div>
            </div>
          </div>
          <div class="hud-center-stack">
            <div class="level-banner" id="hud-level">LEVEL 1</div>
            <div class="progress-bar"><span id="hud-progress"></span></div>
            <div class="level-banner blocks" id="hud-blocks"></div>
            <div class="hud-nucleus panel-hidden" id="hud-nucleus" aria-label="Cube nucleus">
              <div class="hud-nucleus-top">
                <span class="hud-nucleus-label">NUCLEUS</span>
                <span class="hud-nucleus-status" id="hud-nucleus-status">STABLE</span>
              </div>
              <div class="hud-nucleus-bar"><i id="hud-nucleus-bar"></i></div>
              <span class="hud-nucleus-val" id="hud-nucleus-val">—</span>
            </div>
          </div>
          <div class="hud-top-spacer" aria-hidden="true"></div>
        </div>

        <div class="hud-ammo" id="hud-ammo">
          <button class="hud-ammo-btn interactive ui-btn" id="hud-ammo-btn" type="button" aria-label="Cycle main gun ammo">
            <span class="hud-ammo-tag" id="hud-ammo-tag">STD</span>
            <span class="hud-ammo-copy">
              <span class="hud-ammo-name" id="hud-ammo-name">STANDARD</span>
              <span class="hud-ammo-hint" id="hud-ammo-hint">Balanced pierce / splash</span>
            </span>
            <span class="hud-ammo-key">R</span>
          </button>
        </div>

        <div class="hud-vitals" id="hud-vitals" aria-label="Ship integrity">
          <div class="hud-vital-row shield">
            <span class="hud-vital-label">SHD</span>
            <div class="hud-vital-bar"><i id="hud-shield-bar"></i></div>
            <span class="hud-vital-val" id="hud-shield-val">40</span>
          </div>
          <div class="hud-vital-row hull">
            <span class="hud-vital-label">HULL</span>
            <div class="hud-vital-bar"><i id="hud-hull-bar"></i></div>
            <span class="hud-vital-val" id="hud-hull-val">100</span>
          </div>
        </div>

        <div class="hud-side-rail">
          <button class="shop-btn interactive ui-btn" id="btn-tech" type="button">
            <span class="shop-btn-icon">◈</span>
            <span class="shop-btn-text">
              <span class="shop-btn-title">SHOP</span>
              <span class="shop-btn-sub">Upgrades</span>
            </span>
            <span class="shop-btn-badge panel-hidden" id="shop-badge">BUY</span>
          </button>
          <button class="action-btn interactive ui-btn" id="btn-loadout" type="button">
            <span class="action-btn-icon">◎</span>
            <span class="action-btn-label">Loadout</span>
          </button>
          <button class="action-btn interactive ui-btn" id="btn-levels" type="button">
            <span class="action-btn-icon">☰</span>
            <span class="action-btn-label">Sectors</span>
          </button>
          <button class="action-btn interactive ui-btn" id="btn-mute" type="button">
            <span class="action-btn-icon" id="mute-icon">♪</span>
            <span class="action-btn-label">Audio</span>
          </button>
          <button class="action-btn interactive ui-btn" id="btn-menu" type="button">
            <span class="action-btn-icon">▦</span>
            <span class="action-btn-label">Pause</span>
          </button>
        </div>

        <div class="shop-hint panel-hidden interactive" id="shop-hint">
          <div class="shop-hint-title">UPGRADE READY</div>
          <div class="shop-hint-body" id="shop-hint-body">You can buy your first power boost.</div>
          <button class="shop-hint-btn ui-btn" id="shop-hint-open" type="button">Open Shop</button>
        </div>

        <div class="intro-banner panel-hidden" id="intro-banner">
          <div class="intro-title">SECTOR SCAN</div>
          <div class="intro-sub" id="intro-sub">Mapping cube topology…</div>
        </div>

        <!-- Neon HUD crosshair (screen-space — never painted on 3D blocks) -->
        <div class="hud-crosshair panel-hidden" id="hud-crosshair" aria-hidden="true">
          <div class="hx-ring"></div>
          <div class="hx-ring outer"></div>
          <div class="hx-bar h"></div>
          <div class="hx-bar v"></div>
          <div class="hx-dot"></div>
        </div>

        <div class="hud-controls" id="controls-layer">
          <div class="control-cluster left">
            <div class="control-label">ORBIT</div>
            <div class="joystick-zone interactive" id="joy-zone">
              <div class="joystick-base">
                <div class="joystick-stick" id="joy-stick"></div>
              </div>
            </div>
          </div>
          <div class="control-cluster right">
            <div class="control-label">AIM</div>
            <div class="aim-zone interactive" id="aim-zone">
              <div class="joystick-base aim-base">
                <div class="joystick-stick aim-stick" id="aim-stick"></div>
                <div class="aim-crosshair-hint">+</div>
              </div>
            </div>
          </div>
        </div>

        <div class="desktop-hint">WASD ORBIT · IJKL / RIGHT STICK AIM · R AMMO · AUTO-FIRE · SCROLL ZOOM</div>
      </div>
    `;
    this.fragEl = this.root.querySelector('#hud-frag')!;
    this.coreEl = this.root.querySelector('#hud-core')!;
    this.levelEl = this.root.querySelector('#hud-level')!;
    this.progressEl = this.root.querySelector('#hud-progress')!;
    this.blocksEl = this.root.querySelector('#hud-blocks')!;
    this.joyZone = this.root.querySelector('#joy-zone')!;
    this.stickEl = this.root.querySelector('#joy-stick')!;
    this.aimZone = this.root.querySelector('#aim-zone')!;
    this.aimStickEl = this.root.querySelector('#aim-stick')!;
    this.btnTech = this.root.querySelector('#btn-tech')!;
    this.btnLevels = this.root.querySelector('#btn-levels')!;
    this.btnMute = this.root.querySelector('#btn-mute')!;
    this.btnMenu = this.root.querySelector('#btn-menu')!;
    this.btnLoadout = this.root.querySelector('#btn-loadout')!;
    this.shopHint = this.root.querySelector('#shop-hint')!;
    this.introBanner = this.root.querySelector('#intro-banner')!;
    this.controlsLayer = this.root.querySelector('#controls-layer')!;
    this.crosshair = this.root.querySelector('#hud-crosshair')!;
    this.shieldBar = this.root.querySelector('#hud-shield-bar')!;
    this.hullBar = this.root.querySelector('#hud-hull-bar')!;
    this.shieldVal = this.root.querySelector('#hud-shield-val')!;
    this.hullVal = this.root.querySelector('#hud-hull-val')!;
    this.nucleusWrap = this.root.querySelector('#hud-nucleus')!;
    this.nucleusBar = this.root.querySelector('#hud-nucleus-bar')!;
    this.nucleusVal = this.root.querySelector('#hud-nucleus-val')!;
    this.nucleusStatus = this.root.querySelector('#hud-nucleus-status')!;
    this.vitalsEl = this.root.querySelector('#hud-vitals');
  }

  get elements() {
    return {
      joyZone: this.joyZone,
      stickEl: this.stickEl,
      aimZone: this.aimZone,
      aimStickEl: this.aimStickEl,
      btnTech: this.btnTech,
      btnLevels: this.btnLevels,
      btnMute: this.btnMute,
      btnMenu: this.btnMenu,
      btnLoadout: this.btnLoadout,
      shopHintOpen: this.root.querySelector('#shop-hint-open') as HTMLElement,
      btnAmmo: this.root.querySelector('#hud-ammo-btn') as HTMLElement,
    };
  }

  updateAmmo(info: {
    short: string;
    name: string;
    hint: string;
    id: string;
    canCycle: boolean;
  }): void {
    const key = `${info.id}|${info.canCycle ? 1 : 0}`;
    if (key === this.lastAmmoKey) return;
    this.lastAmmoKey = key;
    const tag = this.root.querySelector('#hud-ammo-tag');
    const name = this.root.querySelector('#hud-ammo-name');
    const hint = this.root.querySelector('#hud-ammo-hint');
    const wrap = this.root.querySelector('#hud-ammo');
    const btn = this.root.querySelector('#hud-ammo-btn');
    if (tag) tag.textContent = info.short;
    if (name) name.textContent = info.name.toUpperCase();
    if (hint) hint.textContent = info.hint;
    wrap?.classList.toggle('ap', info.id === 'ap');
    wrap?.classList.toggle('he', info.id === 'he');
    btn?.classList.toggle('locked', !info.canCycle);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) this.setCrosshairVisible(false);
  }

  setIntro(active: boolean, subtitle?: string): void {
    this.introBanner.classList.toggle('panel-hidden', !active);
    this.controlsLayer.style.opacity = active ? '0.2' : '1';
    this.controlsLayer.style.pointerEvents = active ? 'none' : '';
    this.setCrosshairVisible(!active && this.root.style.display !== 'none');
    if (subtitle) {
      const el = this.root.querySelector('#intro-sub');
      if (el) el.textContent = subtitle;
    }
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair?.classList.toggle('panel-hidden', !v);
  }

  /**
   * Place crosshair at screen pixel coords relative to the HUD root
   * (projected from the main-gun aim ray — matches where bolts fly).
   */
  updateCrosshairScreen(
    xPx: number,
    yPx: number,
    firing = false,
    onTarget = false
  ): void {
    if (!this.crosshair || this.crosshair.classList.contains('panel-hidden')) return;
    this.crosshair.style.left = `${xPx.toFixed(1)}px`;
    this.crosshair.style.top = `${yPx.toFixed(1)}px`;
    this.crosshair.style.transform = 'translate(-50%, -50%)';
    this.crosshair.classList.toggle('firing', firing);
    this.crosshair.classList.toggle('on-target', onTarget);
  }

  /** @deprecated use updateCrosshairScreen */
  updateCrosshair(aimX: number, aimY: number, firing = false): void {
    const maxPx = 28;
    const x = window.innerWidth * 0.5 + Math.max(-1, Math.min(1, aimX)) * maxPx;
    const y = window.innerHeight * 0.5 + Math.max(-1, Math.min(1, aimY)) * maxPx;
    this.updateCrosshairScreen(x, y, firing, false);
  }

  setWarmupVisible(show: boolean, secondsLeft = 0): void {
    let el = this.root.querySelector('#hud-warmup') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'hud-warmup';
      el.className = 'hud-warmup panel-hidden';
      this.root.appendChild(el);
    }
    if (!show) {
      el.classList.add('panel-hidden');
      return;
    }
    el.classList.remove('panel-hidden');
    el.textContent =
      secondsLeft > 0.05
        ? `WEAPONS ARMING · ${secondsLeft.toFixed(1)}s`
        : 'WEAPONS HOLD';
  }

  updateCurrency(fragments: number, core: number): void {
    const frag = Math.floor(fragments);
    const coreN = Math.floor(core);
    if (frag !== this.lastFrag) {
      this.lastFrag = frag;
      this.fragEl.textContent = frag.toLocaleString();
    }
    if (coreN !== this.lastCore) {
      this.lastCore = coreN;
      this.coreEl.textContent = coreN.toLocaleString();
    }
  }

  /** Shield + hull bars at bottom of combat HUD. */
  updateVitals(v: {
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
  }): void {
    const hullPct = Math.max(0, Math.min(100, (v.hull / Math.max(1, v.maxHull)) * 100));
    const shPct = Math.max(0, Math.min(100, (v.shield / Math.max(1, v.maxShield)) * 100));
    const hullBar = `${hullPct.toFixed(1)}%`;
    const shBar = `${shPct.toFixed(1)}%`;
    const hullCeil = Math.ceil(v.hull);
    const shieldCeil = Math.ceil(v.shield);
    const critical = hullPct < 28;
    const shieldDown = shPct < 1;
    if (this.hullBar && hullBar !== this.lastHullBar) {
      this.lastHullBar = hullBar;
      this.hullBar.style.width = hullBar;
    }
    if (this.shieldBar && shBar !== this.lastShieldBar) {
      this.lastShieldBar = shBar;
      this.shieldBar.style.width = shBar;
    }
    if (this.hullVal && hullCeil !== this.lastHullCeil) {
      this.lastHullCeil = hullCeil;
      this.hullVal.textContent = `${hullCeil}`;
    }
    if (this.shieldVal && shieldCeil !== this.lastShieldCeil) {
      this.lastShieldCeil = shieldCeil;
      this.shieldVal.textContent = `${shieldCeil}`;
    }
    if (critical !== this.lastVitalsCritical) {
      this.lastVitalsCritical = critical;
      this.vitalsEl?.classList.toggle('critical', critical);
    }
    if (shieldDown !== this.lastShieldDown) {
      this.lastShieldDown = shieldDown;
      this.vitalsEl?.classList.toggle('shield-down', shieldDown);
    }
  }

  updateLevel(id: number, name: string, progress: number, alive: number, total: number): void {
    const levelText = `L${id} · ${name}`;
    const progressBar = `${Math.min(100, progress * 100).toFixed(1)}%`;
    const blocksText = `${alive} / ${total} BLOCKS`;
    if (levelText !== this.lastLevelText) {
      this.lastLevelText = levelText;
      this.levelEl.textContent = levelText;
    }
    if (progressBar !== this.lastProgressBar) {
      this.lastProgressBar = progressBar;
      this.progressEl.style.width = progressBar;
    }
    if (blocksText !== this.lastBlocksText) {
      this.lastBlocksText = blocksText;
      this.blocksEl.textContent = blocksText;
    }
  }

  updateNucleus(snap: {
    active: boolean;
    hp: number;
    maxHp: number;
    exposed: boolean;
    decaying: boolean;
    overloadActive: boolean;
    attributeLabel: string;
    laserPhase?: 'idle' | 'warmup' | 'charge' | 'fire' | 'cooldown';
    spikePhase?: 'idle' | 'telegraph' | 'fire';
  } | null): void {
    if (!this.nucleusWrap) return;
    if (!snap?.active) {
      if (this.lastNucleusActive !== false) {
        this.nucleusWrap.classList.add('panel-hidden');
        this.nucleusWrap.classList.remove('exposed', 'overload', 'decaying', 'laser');
        this.lastNucleusActive = false;
        this.lastNucleusExposed = false;
        this.lastNucleusOverload = false;
        this.lastNucleusDecaying = false;
        this.lastNucleusLaser = false;
      }
      return;
    }
    if (this.lastNucleusActive !== true) {
      this.nucleusWrap.classList.remove('panel-hidden');
      this.lastNucleusActive = true;
    }
    const pct = Math.max(0, Math.min(100, (snap.hp / Math.max(1, snap.maxHp)) * 100));
    const bar = `${pct.toFixed(1)}%`;
    if (this.nucleusBar && bar !== this.lastNucleusBar) {
      this.lastNucleusBar = bar;
      this.nucleusBar.style.width = bar;
    }
    const val = `${Math.ceil(snap.hp)} / ${Math.ceil(snap.maxHp)}`;
    if (this.nucleusVal && val !== this.lastNucleusVal) {
      this.lastNucleusVal = val;
      this.nucleusVal.textContent = val;
    }
    const laserHot =
      snap.laserPhase === 'warmup' || snap.laserPhase === 'charge' || snap.laserPhase === 'fire';
    const spikeHot = snap.spikePhase === 'telegraph' || snap.spikePhase === 'fire';
    let status = snap.attributeLabel;
    if (snap.laserPhase === 'fire') status = 'RAGE LASER';
    else if (snap.laserPhase === 'charge') status = 'CANNON LOCK';
    else if (snap.laserPhase === 'warmup') status = 'RAGE WIND-UP';
    else if (snap.spikePhase === 'telegraph') status = 'SPIKE BURST';
    else if (snap.spikePhase === 'fire') status = 'SPIKES';
    else if (snap.overloadActive) status = 'OVERLOAD';
    else if (snap.decaying) status = 'DESTABILIZING';
    else if (snap.exposed) status = 'EXPOSED';
    if (this.nucleusStatus && status !== this.lastNucleusStatus) {
      this.lastNucleusStatus = status;
      this.nucleusStatus.textContent = status;
    }
    const exposed = snap.exposed && !snap.overloadActive && !laserHot;
    const laser = laserHot || spikeHot;
    if (exposed !== this.lastNucleusExposed) {
      this.lastNucleusExposed = exposed;
      this.nucleusWrap.classList.toggle('exposed', exposed);
    }
    if (snap.overloadActive !== this.lastNucleusOverload) {
      this.lastNucleusOverload = snap.overloadActive;
      this.nucleusWrap.classList.toggle('overload', snap.overloadActive);
    }
    if (snap.decaying !== this.lastNucleusDecaying) {
      this.lastNucleusDecaying = snap.decaying;
      this.nucleusWrap.classList.toggle('decaying', snap.decaying);
    }
    if (laser !== this.lastNucleusLaser) {
      this.lastNucleusLaser = laser;
      this.nucleusWrap.classList.toggle('laser', laser);
    }
  }

  setMuted(m: boolean): void {
    const icon = this.root.querySelector('#mute-icon');
    if (icon) icon.textContent = m ? '🔇' : '♪';
  }

  /**
   * @param visible When false, shop CTA is fully hidden (pre-drone ramp).
   * @param canBuy Glow/badge when something affordable.
   */
  setShopAffordable(
    canBuy: boolean,
    firstTime: boolean,
    hintText = '',
    visible = true
  ): void {
    this.btnTech.classList.toggle('panel-hidden', !visible);
    this.btnTech.classList.toggle('shop-ready', visible && canBuy);
    // Also hide loadout entry until shop is online (same early ramp)
    this.btnLoadout.classList.toggle('panel-hidden', !visible);
    const badge = this.root.querySelector('#shop-badge');
    if (badge) badge.classList.toggle('panel-hidden', !visible || !canBuy);

    if (visible && firstTime && canBuy && hintText) {
      this.shopHint.classList.remove('panel-hidden');
      const body = this.root.querySelector('#shop-hint-body');
      if (body) body.textContent = hintText;
    } else if (!firstTime || !visible) {
      this.shopHint.classList.add('panel-hidden');
    }
  }

  hideShopHint(): void {
    this.shopHint.classList.add('panel-hidden');
  }
}
