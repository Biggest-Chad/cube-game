export class HUD {
  private root: HTMLElement;
  private fragEl!: HTMLElement;
  private coreEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private blocksEl!: HTMLElement;
  private joyZone!: HTMLElement;
  private stickEl!: HTMLElement;
  private fireBtn!: HTMLElement;
  private btnTech!: HTMLElement;
  private btnLevels!: HTMLElement;
  private btnMute!: HTMLElement;
  private btnMenu!: HTMLElement;
  private shopHint!: HTMLElement;
  private introBanner!: HTMLElement;
  private controlsLayer!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-top hud-landscape">
        <div class="hud-stat-cluster">
          <div class="hud-stat">
            <div class="label">Fragments</div>
            <div class="value" id="hud-frag">0</div>
          </div>
          <div class="hud-stat magenta">
            <div class="label">Core</div>
            <div class="value" id="hud-core">0</div>
          </div>
        </div>
        <div class="hud-center-strip">
          <div class="level-banner" id="hud-level">LEVEL 1</div>
          <div class="progress-bar"><span id="hud-progress"></span></div>
          <div class="blocks-line" id="hud-blocks"></div>
        </div>
        <div class="hud-actions">
          <button class="shop-btn interactive" id="btn-tech" title="Open Tech Shop" type="button">
            <span class="shop-btn-icon" aria-hidden="true">◈</span>
            <span class="shop-btn-text">
              <span class="shop-btn-title">SHOP</span>
              <span class="shop-btn-sub">Upgrades</span>
            </span>
            <span class="shop-btn-badge panel-hidden" id="shop-badge">BUY</span>
          </button>
          <div class="hud-icon-row">
            <button class="icon-btn interactive" id="btn-levels" title="Sectors" type="button">☰</button>
            <button class="icon-btn interactive" id="btn-mute" title="Mute" type="button">
              <span id="mute-icon">♪</span>
            </button>
            <button class="icon-btn interactive" id="btn-menu" title="Menu" type="button">▦</button>
          </div>
        </div>
      </div>
      <div class="shop-hint panel-hidden interactive" id="shop-hint">
        <div class="shop-hint-title">UPGRADE READY</div>
        <div class="shop-hint-body" id="shop-hint-body">You can buy your first power boost.</div>
        <button class="shop-hint-btn" id="shop-hint-open" type="button">Open Shop</button>
      </div>
      <div class="intro-banner panel-hidden" id="intro-banner">
        <div class="intro-title">SECTOR SCAN</div>
        <div class="intro-sub" id="intro-sub">Mapping cube topology…</div>
      </div>
      <div class="hud-bottom hud-bottom-landscape" id="controls-layer">
        <div class="joystick-zone interactive" id="joy-zone">
          <div class="joystick-base">
            <div class="joystick-stick" id="joy-stick"></div>
          </div>
        </div>
        <button class="fire-btn interactive" id="fire-btn" type="button">FIRE</button>
      </div>
      <div class="desktop-hint">WASD / ARROWS ORBIT · SPACE FIRE · SCROLL ZOOM</div>
    `;
    this.fragEl = this.root.querySelector('#hud-frag')!;
    this.coreEl = this.root.querySelector('#hud-core')!;
    this.levelEl = this.root.querySelector('#hud-level')!;
    this.progressEl = this.root.querySelector('#hud-progress')!;
    this.blocksEl = this.root.querySelector('#hud-blocks')!;
    this.joyZone = this.root.querySelector('#joy-zone')!;
    this.stickEl = this.root.querySelector('#joy-stick')!;
    this.fireBtn = this.root.querySelector('#fire-btn')!;
    this.btnTech = this.root.querySelector('#btn-tech')!;
    this.btnLevels = this.root.querySelector('#btn-levels')!;
    this.btnMute = this.root.querySelector('#btn-mute')!;
    this.btnMenu = this.root.querySelector('#btn-menu')!;
    this.shopHint = this.root.querySelector('#shop-hint')!;
    this.introBanner = this.root.querySelector('#intro-banner')!;
    this.controlsLayer = this.root.querySelector('#controls-layer')!;
  }

  get elements() {
    return {
      joyZone: this.joyZone,
      stickEl: this.stickEl,
      fireBtn: this.fireBtn,
      btnTech: this.btnTech,
      btnLevels: this.btnLevels,
      btnMute: this.btnMute,
      btnMenu: this.btnMenu,
      shopHintOpen: this.root.querySelector('#shop-hint-open') as HTMLElement,
    };
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  setIntro(active: boolean, subtitle?: string): void {
    this.introBanner.classList.toggle('panel-hidden', !active);
    this.controlsLayer.style.opacity = active ? '0.2' : '1';
    this.controlsLayer.style.pointerEvents = active ? 'none' : '';
    if (subtitle) {
      const el = this.root.querySelector('#intro-sub');
      if (el) el.textContent = subtitle;
    }
  }

  /** Hide combat chrome entirely during full cinematic (titles are separate). */
  setCinematicChrome(hidden: boolean): void {
    this.root.classList.toggle('hud-cinematic', hidden);
    this.controlsLayer.style.opacity = hidden ? '0' : '1';
    this.controlsLayer.style.pointerEvents = hidden ? 'none' : '';
    if (hidden) this.introBanner.classList.add('panel-hidden');
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
