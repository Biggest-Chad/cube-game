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
          </div>
          <div class="hud-top-spacer" aria-hidden="true"></div>
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
            <span class="action-btn-label">Menu</span>
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

        <div class="desktop-hint">WASD ORBIT · IJKL / RIGHT STICK AIM · AUTO-FIRE · SCROLL ZOOM</div>
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
    };
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
    this.fragEl.textContent = Math.floor(fragments).toLocaleString();
    this.coreEl.textContent = Math.floor(core).toLocaleString();
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
    if (this.hullBar) this.hullBar.style.width = `${hullPct.toFixed(1)}%`;
    if (this.shieldBar) this.shieldBar.style.width = `${shPct.toFixed(1)}%`;
    if (this.hullVal) {
      this.hullVal.textContent = `${Math.ceil(v.hull)}`;
    }
    if (this.shieldVal) {
      this.shieldVal.textContent = `${Math.ceil(v.shield)}`;
    }
    const vitals = this.root.querySelector('#hud-vitals');
    vitals?.classList.toggle('critical', hullPct < 28);
    vitals?.classList.toggle('shield-down', shPct < 1);
  }

  updateLevel(id: number, name: string, progress: number, alive: number, total: number): void {
    this.levelEl.textContent = `L${id} · ${name}`;
    this.progressEl.style.width = `${Math.min(100, progress * 100).toFixed(1)}%`;
    this.blocksEl.textContent = `${alive} / ${total} BLOCKS`;
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
