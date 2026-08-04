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

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-landscape">
        <div class="hud-top-bar">
          <div class="hud-stat ui-chip">
            <div class="label">Fragments</div>
            <div class="value" id="hud-frag">0</div>
          </div>
          <div class="hud-center-stack">
            <div class="level-banner" id="hud-level">LEVEL 1</div>
            <div class="progress-bar"><span id="hud-progress"></span></div>
            <div class="level-banner blocks" id="hud-blocks"></div>
          </div>
          <div class="hud-stat magenta ui-chip">
            <div class="label">Core Energy</div>
            <div class="value" id="hud-core">0</div>
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
   * Offset crosshair slightly with aim stick so players read intent,
   * while keeping it fixed-depth on the HUD (no world z-fighting).
   */
  updateCrosshair(aimX: number, aimY: number, firing = false): void {
    if (!this.crosshair || this.crosshair.classList.contains('panel-hidden')) return;
    const maxPx = 28;
    const x = Math.max(-1, Math.min(1, aimX)) * maxPx;
    const y = Math.max(-1, Math.min(1, aimY)) * maxPx;
    this.crosshair.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`;
    this.crosshair.classList.toggle('firing', firing);
  }

  updateCurrency(fragments: number, core: number): void {
    this.fragEl.textContent = Math.floor(fragments).toLocaleString();
    this.coreEl.textContent = Math.floor(core).toLocaleString();
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

  setShopAffordable(canBuy: boolean, firstTime: boolean, hintText = ''): void {
    this.btnTech.classList.toggle('shop-ready', canBuy);
    const badge = this.root.querySelector('#shop-badge');
    if (badge) badge.classList.toggle('panel-hidden', !canBuy);

    if (firstTime && canBuy && hintText) {
      this.shopHint.classList.remove('panel-hidden');
      const body = this.root.querySelector('#shop-hint-body');
      if (body) body.textContent = hintText;
    } else if (!firstTime) {
      this.shopHint.classList.add('panel-hidden');
    }
  }

  hideShopHint(): void {
    this.shopHint.classList.add('panel-hidden');
  }
}
