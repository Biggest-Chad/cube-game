import { CORE } from '../data/core';

const ICO_STD = `<svg class="hud-drop-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.1 1.5h3.8v6.4H6.1zM5.3 8.1h5.4v1.5H5.3zM7.2 9.6h1.6V14H7.2z"/></svg>`;
const ICO_AP = `<svg class="hud-drop-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.2 1.2h1.6L10.2 6H5.8zM2.4 6.6h11.2v2.1H2.4zM7.1 9.2h1.8V14h-1.8z"/></svg>`;
const ICO_HE = `<svg class="hud-drop-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.1 1.2h1.8v2.1H7.1zM7.1 12.7h1.8v2.1H7.1zM1.2 7.1h2.1v1.8H1.2zM12.7 7.1h2.1v1.8h-2.1zM3.2 3.2l1.5 1.5-1.3 1.3L1.9 4.5zM12.6 10l1.5 1.5-1.3 1.3-1.5-1.5zM3.4 11.3l1.3-1.3 1.5 1.5-1.3 1.3zM10 4.7l1.3-1.3 1.5 1.5-1.3 1.3zM6.1 6.1h3.8v3.8H6.1z"/></svg>`;
const ICO_CORE = `<svg class="hud-drop-ico ico-core" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 2.1a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"/></svg>`;
const ICO_BLOCKS = `<svg class="hud-drop-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3 14 4.6v6.8L8 14.7 2 11.4V4.6zm0 1.7L3.6 5.5 8 8l4.4-2.5zM3.2 6.7v4.1L7.4 13V8.8zm9.6 0L8.6 8.8V13l4.2-2.2z"/></svg>`;

const DRONE_ICONS: Record<string, string> = {
  fighter: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.2 14.5,14.2 8,11 1.5,14.2"/></svg>`,
  bomber: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.5 15,8 8,14.5 1,8"/><rect x="3.2" y="7.1" width="9.6" height="1.8"/></svg>`,
  defender: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 L14 4.2 V8.6 C14 12.2 8 14.8 8 14.8 C8 14.8 2 12.2 2 8.6 V4.2 Z"/></svg>`,
};

const DRONE_ROLE_ORDER = ['fighter', 'bomber', 'defender'] as const;
const DRONE_ROLE_NAME: Record<string, string> = {
  fighter: 'Fighter',
  bomber: 'Bomber',
  defender: 'Defender',
};

export class HUD {
  private root: HTMLElement;
  private landscapeEl!: HTMLElement;
  private fragEl!: HTMLElement;
  private coreEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private progressWrap!: HTMLElement;
  private blocksEl!: HTMLElement;
  private joyZone!: HTMLElement;
  private stickEl!: HTMLElement;
  private aimZone!: HTMLElement;
  private aimStickEl!: HTMLElement;
  private btnTech!: HTMLElement;
  private btnLevels!: HTMLElement;
  private btnMute!: HTMLElement;
  private btnMenu!: HTMLElement;
  private shopHint!: HTMLElement;
  private introBanner!: HTMLElement;
  private introBarTop!: HTMLElement;
  private introBarBot!: HTMLElement;
  private controlsLayer!: HTMLElement;
  private crosshair!: HTMLElement;
  private shieldBar!: HTMLElement;
  private hullBar!: HTMLElement;
  private shieldVal!: HTMLElement;
  private hullVal!: HTMLElement;
  private nucleusWrap!: HTMLElement;
  private nucleusBar!: HTMLElement;
  private nucleusVal!: HTMLElement;
  private vitalsEl!: HTMLElement | null;
  private dronesEl!: HTMLElement | null;
  private ammoWrap!: HTMLElement | null;

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
  private lastCoreBonus = '';
  private lastNucleusStatus = '';
  private lastNucleusExposed: boolean | null = null;
  private lastNucleusOverload: boolean | null = null;
  private lastNucleusDecaying: boolean | null = null;
  private lastNucleusLaser: boolean | null = null;
  private lastAmmoKey = '';
  private lastDroneKey = '';
  private lastPilotKey = '';

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
            <div class="progress-bar" id="hud-progress-wrap">
              <span id="hud-progress"></span>
              <i class="hud-destab-mark" id="hud-destab-mark" aria-hidden="true"></i>
            </div>
            <div class="level-banner blocks" id="hud-blocks"></div>
            <div class="hud-nucleus panel-hidden" id="hud-nucleus" aria-label="Cube nucleus">
              <div class="hud-nucleus-bar"><i id="hud-nucleus-bar"></i></div>
              <span class="hud-nucleus-val" id="hud-nucleus-val">—</span><span class="hud-core-bonus" id="hud-core-bonus">CORE +0%</span>
            </div>
          </div>
          <div class="hud-top-spacer" aria-hidden="true"></div>
        </div>

        <button class="hud-pilot-btn interactive ui-btn panel-hidden" id="hud-pilot-btn" type="button" aria-label="Pilot active">
          <span class="hud-pilot-ring" id="hud-pilot-ring"></span>
          <span class="hud-pilot-call" id="hud-pilot-call">—</span>
          <span class="hud-pilot-key">Q</span>
        </button>

        <div class="cockpit-bar" id="cockpit-bar">
          <button type="button" class="cockpit-drones ui-btn" id="hud-drones" aria-haspopup="dialog" aria-label="Drone fleet">
            <span class="cockpit-kicker">Drones</span>
            <span class="cockpit-drone-rows" id="hud-drone-rows"><span class="cockpit-drone-empty">None fielded</span></span>
          </button>

          <div class="hud-vitals" id="hud-vitals" aria-label="Ship integrity">
          <div class="hud-vital-row shield">
            <span class="hud-vital-label" title="Shield" aria-label="Shield">
              <svg class="hud-vital-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4 L13.6 3.8 V8.2 C13.6 11.6 8 14.4 8 14.4 C8 14.4 2.4 11.6 2.4 8.2 V3.8 Z"/></svg>
            </span>
            <div class="hud-vital-bar"><i id="hud-shield-bar"></i></div>
            <span class="hud-vital-val" id="hud-shield-val">40</span>
          </div>
          <div class="hud-vital-row hull">
            <span class="hud-vital-label" title="Hull" aria-label="Hull">
              <svg class="hud-vital-ico" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.6 13.6,5.2 13.6,11.2 8,14.4 2.4,11.2 2.4,5.2"/></svg>
            </span>
            <div class="hud-vital-bar"><i id="hud-hull-bar"></i></div>
            <span class="hud-vital-val" id="hud-hull-val">100</span>
          </div>
          </div>

          <div class="cockpit-right" id="hud-config">
            <div class="cockpit-readouts">
              <div class="cockpit-read hud-ammo std" id="hud-ammo">
                <span class="hud-drop-ico-slot" aria-hidden="true">
                  <svg class="hud-drop-ico ico-std" viewBox="0 0 16 16"><path d="M6.1 1.5h3.8v6.4H6.1zM5.3 8.1h5.4v1.5H5.3zM7.2 9.6h1.6V14H7.2z"/></svg>
                  <svg class="hud-drop-ico ico-ap" viewBox="0 0 16 16"><path d="M7.2 1.2h1.6L10.2 6H5.8zM2.4 6.6h11.2v2.1H2.4zM7.1 9.2h1.8V14h-1.8z"/></svg>
                  <svg class="hud-drop-ico ico-he" viewBox="0 0 16 16"><path d="M7.1 1.2h1.8v2.1H7.1zM7.1 12.7h1.8v2.1H7.1zM1.2 7.1h2.1v1.8H1.2zM12.7 7.1h2.1v1.8h-2.1zM3.2 3.2l1.5 1.5-1.3 1.3L1.9 4.5zM12.6 10l1.5 1.5-1.3 1.3-1.5-1.5zM3.4 11.3l1.3-1.3 1.5 1.5-1.3 1.3zM10 4.7l1.3-1.3 1.5 1.5-1.3 1.3zM6.1 6.1h3.8v3.8H6.1z"/></svg>
                </span>
                <span class="cockpit-read-copy">
                  <span class="cockpit-kicker">Ammo</span>
                  <span class="hud-drop-label">STD</span>
                </span>
              </div>
              <div class="cockpit-read hud-lock-switch nuc" id="hud-lock-btn">
                <span class="hud-drop-ico-slot" aria-hidden="true">
                  <svg class="hud-drop-ico ico-core" viewBox="0 0 16 16"><path d="M8 1.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 2.1a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"/></svg>
                  <svg class="hud-drop-ico ico-blocks" viewBox="0 0 16 16"><path d="M8 1.3 14 4.6v6.8L8 14.7 2 11.4V4.6zm0 1.7L3.6 5.5 8 8l4.4-2.5zM3.2 6.7v4.1L7.4 13V8.8zm9.6 0L8.6 8.8V13l4.2-2.2z"/></svg>
                </span>
                <span class="cockpit-read-copy">
                  <span class="cockpit-kicker">Target</span>
                  <span class="hud-drop-label">CORE</span>
                </span>
              </div>
            </div>
            <button type="button" class="cockpit-caret ui-btn" id="hud-config-caret" aria-expanded="false" aria-haspopup="dialog" aria-label="Ammo and target">
              <svg class="cockpit-caret-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 10.4 8 5.6l4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          <div class="cockpit-sheet panel-hidden" id="hud-config-sheet" role="dialog" aria-label="Ammo and target">
            <div class="cockpit-sheet-head">
              <span>Ammo and target</span>
              <button type="button" class="cockpit-x ui-btn" data-close="config" aria-label="Close">X</button>
            </div>
            <div class="cockpit-sheet-scroll">
              <div class="cockpit-sheet-label">Ammo</div>
              <button type="button" class="cockpit-opt ui-btn is-on" data-ammo="standard" role="menuitemradio" aria-checked="true">
                ${ICO_STD}<span class="cockpit-opt-copy"><b>Standard</b><i>Balanced pierce and splash</i></span>
              </button>
              <button type="button" class="cockpit-opt ui-btn" data-ammo="ap" role="menuitemradio" aria-checked="false">
                ${ICO_AP}<span class="cockpit-opt-copy"><b>Armor penetrating</b><i>Extra pierce, no splash</i></span>
              </button>
              <button type="button" class="cockpit-opt ui-btn" data-ammo="he" role="menuitemradio" aria-checked="false">
                ${ICO_HE}<span class="cockpit-opt-copy"><b>High explosive</b><i>Extra splash, no pierce</i></span>
              </button>
              <div class="cockpit-sheet-label">Target</div>
              <button type="button" class="cockpit-opt hud-lock-opt ui-btn is-on" data-lock="nucleus" role="menuitemradio" aria-checked="true">
                ${ICO_CORE}<span class="cockpit-opt-copy"><b>Core</b><i>Hold the nucleus</i></span>
              </button>
              <button type="button" class="cockpit-opt hud-lock-opt ui-btn" data-lock="blocks" role="menuitemradio" aria-checked="false">
                ${ICO_BLOCKS}<span class="cockpit-opt-copy"><b>Blocks</b><i>Strip the shell first</i></span>
              </button>
            </div>
          </div>
          </div>

          <div class="cockpit-sheet panel-hidden" id="hud-drone-sheet" role="dialog" aria-label="Drone details">
            <div class="cockpit-sheet-head">
              <span>Drones</span>
              <button type="button" class="cockpit-x ui-btn" data-close="drone" aria-label="Close">X</button>
            </div>
            <div class="cockpit-sheet-scroll" id="hud-drone-detail">
              <p class="cockpit-drone-empty">No drones fielded.</p>
            </div>
            <button type="button" class="cockpit-shop ui-btn" id="hud-drone-shop">Drone shop</button>
          </div>
        </div>

        <div class="hud-flyer panel-hidden" id="hud-flyer" aria-label="Transit">
          <div class="hud-flyer-title" id="hud-flyer-title">TRANSFER</div>
          <div class="hud-flyer-thrust" id="hud-flyer-thrust" aria-label="Thrust">
            <div class="hud-flyer-thrust-label">THRUST <b id="hud-flyer-thrust-val">100%</b></div>
          <div class="hud-flyer-boost panel-hidden" id="hud-flyer-boost" aria-live="polite">BOOST</div>
            <div class="hud-flyer-thrust-bar"><i id="hud-flyer-thrust-fill"></i></div>
          </div>
          <div class="hud-flyer-meta">
            <span id="hud-flyer-time">0.0s</span>
            <span id="hud-flyer-speed">x1.00</span>
          </div>
          <div class="hud-flyer-callout panel-hidden" id="hud-flyer-callout" aria-live="polite"></div>
          <div class="hud-flyer-lock" id="hud-flyer-lock" aria-hidden="true"></div>
        </div>

        <div class="hud-side-rail">
          <button class="shop-btn interactive ui-btn" id="btn-tech" type="button">
            <span class="shop-btn-icon">◈</span>
            <span class="shop-btn-text">
              <span class="shop-btn-title">SHOP</span>
              <span class="shop-btn-sub">Upgrades</span>
            </span>
            <span class="shop-btn-badge panel-hidden" id="shop-badge">BUY</span><span class="hud-evolve-pip panel-hidden" id="hud-evolve-pip">EVOLVE</span>
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

        <div class="intro-bar intro-bar-top panel-hidden" id="intro-bar-top"></div>
        <div class="intro-bar intro-bar-bot panel-hidden" id="intro-bar-bot"></div>
        <div class="intro-banner panel-hidden" id="intro-banner">
          <div class="intro-kicker">SECTOR SCAN</div>
          <div class="intro-title" id="intro-title">APPROACH</div>
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

      </div>
    `;
    this.landscapeEl = this.root.querySelector('.hud-landscape')!;
    this.fragEl = this.root.querySelector('#hud-frag')!;
    this.coreEl = this.root.querySelector('#hud-core')!;
    this.levelEl = this.root.querySelector('#hud-level')!;
    this.progressEl = this.root.querySelector('#hud-progress')!;
    this.progressWrap = this.root.querySelector('#hud-progress-wrap')!;
    this.blocksEl = this.root.querySelector('#hud-blocks')!;
    this.joyZone = this.root.querySelector('#joy-zone')!;
    this.stickEl = this.root.querySelector('#joy-stick')!;
    this.aimZone = this.root.querySelector('#aim-zone')!;
    this.aimStickEl = this.root.querySelector('#aim-stick')!;
    this.btnTech = this.root.querySelector('#btn-tech')!;
    this.btnLevels = this.root.querySelector('#btn-levels')!;
    this.btnMute = this.root.querySelector('#btn-mute')!;
    this.btnMenu = this.root.querySelector('#btn-menu')!;
    this.shopHint = this.root.querySelector('#shop-hint')!;
    this.introBanner = this.root.querySelector('#intro-banner')!;
    this.introBarTop = this.root.querySelector('#intro-bar-top')!;
    this.introBarBot = this.root.querySelector('#intro-bar-bot')!;
    this.controlsLayer = this.root.querySelector('#controls-layer')!;
    this.crosshair = this.root.querySelector('#hud-crosshair')!;
    this.shieldBar = this.root.querySelector('#hud-shield-bar')!;
    this.hullBar = this.root.querySelector('#hud-hull-bar')!;
    this.shieldVal = this.root.querySelector('#hud-shield-val')!;
    this.hullVal = this.root.querySelector('#hud-hull-val')!;
    this.nucleusWrap = this.root.querySelector('#hud-nucleus')!;
    this.nucleusBar = this.root.querySelector('#hud-nucleus-bar')!;
    this.nucleusVal = this.root.querySelector('#hud-nucleus-val')!;
    this.vitalsEl = this.root.querySelector('#hud-vitals');
    this.dronesEl = this.root.querySelector('#hud-drone-rows');
    this.ammoWrap = this.root.querySelector('#hud-ammo');
    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'x' && ev.key !== 'X') return;
      if (ev.repeat) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (!this.root.querySelector('.cockpit-sheet:not(.panel-hidden)')) return;
      ev.preventDefault();
      this.closeDrops();
    });
    const destabMark = this.root.querySelector('#hud-destab-mark') as HTMLElement | null;
    if (destabMark) {
      destabMark.style.left = `${((1 - CORE.destabilizeShellRatio) * 100).toFixed(2)}%`;
    }
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
      shopHintOpen: this.root.querySelector('#shop-hint-open') as HTMLElement,
      btnAmmo: this.root.querySelector('#hud-config') as HTMLElement,
      btnLock: this.root.querySelector('#hud-config') as HTMLElement,
      btnConfig: this.root.querySelector('#hud-config') as HTMLElement,
      btnDrones: this.root.querySelector('#hud-drones') as HTMLElement,
      btnDroneSheet: this.root.querySelector('#hud-drone-sheet') as HTMLElement,
      btnPilot: this.root.querySelector('#hud-pilot-btn') as HTMLElement,
    };
  }

  updateAmmo(info: {
    short: string;
    name: string;
    hint: string;
    id: string;
    canCycle: boolean;
    ammoAp?: boolean;
    ammoHe?: boolean;
  }): void {
    const key = `${info.id}|${info.ammoAp ? 1 : 0}|${info.ammoHe ? 1 : 0}`;
    if (key === this.lastAmmoKey) return;
    this.lastAmmoKey = key;
    const wrap = this.ammoWrap ?? this.root.querySelector('#hud-ammo');
    wrap?.classList.toggle('ap', info.id === 'ap');
    wrap?.classList.toggle('he', info.id === 'he');
    wrap?.classList.toggle('std', info.id === 'standard');
    const short = info.id === 'ap' ? 'AP' : info.id === 'he' ? 'HE' : 'STD';
    const name = info.id === 'ap' ? 'Armor penetrating' : info.id === 'he' ? 'High explosive' : 'Standard';
    const barLabel = wrap?.querySelector('.hud-drop-label');
    if (barLabel) barLabel.textContent = short;
    wrap?.setAttribute('aria-label', `Ammo, ${name}`);
    this.root.querySelectorAll<HTMLButtonElement>('#hud-config-sheet [data-ammo]').forEach((btn) => {
      const id = btn.dataset.ammo;
      const on = id === info.id;
      const locked = (id === 'ap' && !info.ammoAp) || (id === 'he' && !info.ammoHe);
      btn.classList.toggle('is-on', on);
      btn.classList.toggle('locked', locked);
      btn.disabled = false;
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      const label = id === 'ap' ? 'Armor penetrating' : id === 'he' ? 'High explosive' : 'Standard';
      btn.setAttribute('aria-label', locked ? `${label}, locked` : `${label}${on ? ', selected' : ''}. ${info.hint}`);
    });
  }

  toggleSheet(which: 'config' | 'drone'): void {
    const id = which === 'config' ? 'hud-config-sheet' : 'hud-drone-sheet';
    const el = this.root.querySelector('#' + id);
    const wasOpen = !!el && !el.classList.contains('panel-hidden');
    this.closeDrops();
    if (wasOpen || !el) return;
    el.classList.remove('panel-hidden');
    if (which === 'config') {
      this.root.querySelector('#hud-config-caret')?.setAttribute('aria-expanded', 'true');
    }
  }

  closeDrops(): void {
    this.root.querySelectorAll('.cockpit-sheet').forEach((el) => el.classList.add('panel-hidden'));
    this.root.querySelector('#hud-config-caret')?.setAttribute('aria-expanded', 'false');
  }

  updateLockPriority(mode: 'nucleus' | 'blocks' | 'drones'): void {
    const root = this.root.querySelector('#hud-lock-btn') as HTMLElement | null;
    if (!root) return;
    root.classList.toggle('nuc', mode === 'nucleus');
    root.classList.toggle('blk', mode === 'blocks');
    root.classList.toggle('drn', mode === 'drones');
    const short = mode === 'blocks' ? 'BLOCKS' : mode === 'drones' ? 'DRONES' : 'CORE';
    const full = mode === 'blocks' ? 'Blocks' : mode === 'drones' ? 'Drones' : 'Core';
    const barLabel = root.querySelector('.hud-drop-label');
    if (barLabel) barLabel.textContent = short;
    root.setAttribute('aria-label', 'Target, ' + full);
    this.root.querySelectorAll('#hud-config-sheet .hud-lock-opt').forEach((el) => {
      const btn = el as HTMLElement;
      const on = btn.dataset.lock === mode;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  updatePilot(info: {
    visible: boolean;
    callsign: string;
    ready: boolean;
    active: boolean;
    cooldown01: number;
    accent?: string;
  }): void {
    const btn = this.root.querySelector('#hud-pilot-btn') as HTMLElement | null;
    if (!btn) return;
    const key = `${info.visible ? 1 : 0}|${info.callsign}|${info.ready ? 1 : 0}|${info.active ? 1 : 0}|${info.cooldown01.toFixed(2)}`;
    if (key === this.lastPilotKey) return;
    this.lastPilotKey = key;
    btn.classList.toggle('panel-hidden', !info.visible);
    if (!info.visible) return;
    const call = this.root.querySelector('#hud-pilot-call');
    const ring = this.root.querySelector('#hud-pilot-ring') as HTMLElement | null;
    if (call) call.textContent = info.callsign;
    btn.classList.toggle('ready', info.ready);
    btn.classList.toggle('active', info.active);
    btn.classList.toggle('cooling', !info.ready && !info.active);
    const pct = Math.round((1 - info.cooldown01) * 100);
    if (ring) {
      const c = info.accent ?? '#00f0ff';
      ring.style.background = `conic-gradient(${c} ${pct}%, rgba(0,20,28,0.55) ${pct}%)`;
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) {
      this.setCrosshairVisible(false);
      this.closeDrops();
    }
  }

  setIntro(active: boolean, subtitle?: string, title?: string): void {
    this.root.classList.toggle('intro-on', active);
    this.introBanner.classList.toggle('panel-hidden', !active);
    this.introBarTop.classList.toggle('panel-hidden', !active);
    this.introBarBot.classList.toggle('panel-hidden', !active);
    if (active) this.closeDrops();
    this.controlsLayer.style.opacity = active ? '0' : '1';
    this.controlsLayer.style.pointerEvents = active ? 'none' : '';
    this.setCrosshairVisible(!active && this.root.style.display !== 'none');
    if (subtitle) {
      const el = this.root.querySelector('#intro-sub');
      if (el) el.textContent = subtitle;
    }
    if (title) {
      const el = this.root.querySelector('#intro-title');
      if (el) el.textContent = title;
    }
    if (active) {
      this.introBanner.classList.remove('intro-in');
      void this.introBanner.offsetWidth;
      this.introBanner.classList.add('intro-in');
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

  setWarmupVisible(show: boolean, secondsLeft = 0, label?: string): void {
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
    const head = label ?? 'WEAPONS ARMING';
    el.classList.toggle('hud-warmup-transit', !!label);
    if (label && secondsLeft > 0.05) {
      const n = Math.max(1, Math.ceil(secondsLeft));
      el.innerHTML = `<b>${n}</b><span>${head}</span>`;
    } else {
      el.textContent =
        secondsLeft > 0.05
          ? `${head} · ${secondsLeft.toFixed(1)}s`
          : label ?? 'WEAPONS HOLD';
    }
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

  /**
   * Left cockpit slot: one row per role. The detail sheet lists every unit.
   */
  updateDrones(
    entries: Array<{ role: string; alive: boolean; hp: number; maxHp: number; respawn: number }>
  ): void {
    const el = this.dronesEl ?? (this.root.querySelector('#hud-drone-rows') as HTMLElement | null);
    const detail = this.root.querySelector('#hud-drone-detail') as HTMLElement | null;
    if (!el) return;
    if (!entries.length) {
      if (this.lastDroneKey === 'empty') return;
      this.lastDroneKey = 'empty';
      el.innerHTML = `<span class="cockpit-drone-empty">None fielded</span>`;
      if (detail) detail.innerHTML = `<p class="cockpit-drone-empty">No drones fielded.</p>`;
      this.root.querySelector('#hud-drones')?.setAttribute('aria-label', 'Drones, none fielded');
      return;
    }
    const key = entries
      .map((d) => {
        const hp = d.alive ? Math.round((d.hp / Math.max(1, d.maxHp)) * 8) : `r${Math.ceil(d.respawn)}`;
        return `${d.role[0]}${hp}`;
      })
      .join('|');
    if (key === this.lastDroneKey) return;
    this.lastDroneKey = key;
    const groups = new Map<string, typeof entries>();
    for (const d of entries) {
      const list = groups.get(d.role);
      if (list) list.push(d);
      else groups.set(d.role, [d]);
    }
    const roles = [
      ...DRONE_ROLE_ORDER.filter((r) => groups.has(r)),
      ...[...groups.keys()].filter((r) => !(DRONE_ROLE_ORDER as readonly string[]).includes(r)),
    ];
    el.innerHTML = roles
      .map((role) => {
        const list = groups.get(role)!;
        const alive = list.filter((d) => d.alive).length;
        const icon = DRONE_ICONS[role] ?? DRONE_ICONS.fighter;
        const name = DRONE_ROLE_NAME[role] ?? role;
        let sum = 0;
        for (const d of list) sum += d.alive ? d.hp / Math.max(1, d.maxHp) : 0;
        const pct = Math.round((sum / list.length) * 100);
        return `<span class="cockpit-drone-row ${role}">
          ${icon}
          <span class="cockpit-drone-name">${name}</span>
          <span class="cockpit-drone-count">${alive}/${list.length}</span>
          <span class="cockpit-drone-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </span>`;
      })
      .join('');
    this.root.querySelector('#hud-drones')?.setAttribute('aria-label', `Drones, ${entries.length} fielded`);
    if (!detail) return;
    const scroller = detail.classList.contains('cockpit-sheet-scroll') ? detail : detail.parentElement;
    const scroll = scroller?.scrollTop ?? 0;
    const seen = new Map<string, number>();
    detail.innerHTML = roles
      .map((role) => {
        const list = groups.get(role)!;
        const name = DRONE_ROLE_NAME[role] ?? role;
        const alive = list.filter((d) => d.alive).length;
        const units = list
          .map((d) => {
            const n = (seen.get(role) ?? 0) + 1;
            seen.set(role, n);
            const pct = d.alive ? Math.max(0, Math.min(100, (d.hp / Math.max(1, d.maxHp)) * 100)) : 0;
            const status = d.alive ? `${Math.round(pct)}%` : `${Math.max(0, Math.ceil(d.respawn))}s`;
            return `<div class="cockpit-drone-unit ${role}${d.alive ? '' : ' dead'}">
              <span class="cockpit-drone-unit-name">${name} ${n}</span>
              <span class="cockpit-drone-bar"><i style="width:${pct.toFixed(0)}%"></i></span>
              <span class="cockpit-drone-unit-stat">${status}</span>
            </div>`;
          })
          .join('');
        return `<div class="cockpit-drone-role">${name} ${alive}/${list.length}</div>${units}`;
      })
      .join('');
    if (scroller) scroller.scrollTop = scroll;
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
    const blocksText = `${alive} / ${total}`;
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
    const remaining = total > 0 ? alive / total : 1;
    this.progressWrap?.classList.toggle('destab-hot', remaining <= CORE.destabilizeShellRatio);
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
    shellBonusPct?: number;
  } | null): void {
    if (!this.nucleusWrap) return;
    if (!snap?.active) {
      if (this.lastNucleusActive !== false) {
        this.nucleusWrap.classList.add('panel-hidden');
        this.nucleusWrap.classList.remove('exposed', 'overload', 'decaying', 'laser');
        this.nucleusWrap.setAttribute('aria-label', 'Cube nucleus');
        this.lastNucleusActive = false;
        this.lastNucleusExposed = false;
        this.lastNucleusOverload = false;
        this.lastNucleusDecaying = false;
        this.lastNucleusLaser = false;
        this.lastNucleusStatus = '';
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
    const bonus = Math.round(snap.shellBonusPct ?? 0);
    const bonusText = "CORE +" + bonus + "%";
    if (bonusText !== this.lastCoreBonus) {
      this.lastCoreBonus = bonusText;
      const pip = this.root.querySelector("#hud-core-bonus");
      if (pip) pip.textContent = bonusText;
    }
    const laserHot =
      snap.laserPhase === 'warmup' || snap.laserPhase === 'charge' || snap.laserPhase === 'fire';
    const spikeHot = snap.spikePhase === 'telegraph' || snap.spikePhase === 'fire';
    let status = snap.attributeLabel || 'stable';
    if (snap.laserPhase === 'fire') status = 'rage laser';
    else if (snap.laserPhase === 'charge') status = 'cannon lock';
    else if (snap.laserPhase === 'warmup') status = 'rage wind-up';
    else if (snap.spikePhase === 'telegraph') status = 'spike burst';
    else if (snap.spikePhase === 'fire') status = 'spikes';
    else if (snap.overloadActive) status = 'overload';
    else if (snap.decaying) status = 'destabilizing';
    else if (snap.exposed) status = 'exposed';
    if (status !== this.lastNucleusStatus) {
      this.lastNucleusStatus = status;
      this.nucleusWrap.setAttribute('aria-label', `Cube nucleus, ${status}`);
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
    visible = true,
    recoLabel = ''
  ): void {
    this.btnTech.classList.toggle('panel-hidden', !visible);
    this.btnTech.classList.toggle('shop-ready', visible && canBuy);
    const badge = this.root.querySelector('#shop-badge');
    if (badge) {
      badge.classList.toggle('panel-hidden', !visible || !canBuy);
      if (canBuy && visible) badge.textContent = 'BUY';
    }
    const sub = this.btnTech.querySelector('.shop-btn-sub');
    if (sub) sub.textContent = visible && recoLabel ? recoLabel : 'Upgrades';

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

  setEvolveReady(on: boolean): void {
    this.btnTech.classList.toggle('evolve-ready', on);
    const pip = this.root.querySelector('#hud-evolve-pip');
    if (pip) pip.classList.toggle('panel-hidden', !on);
  }

  setFlyerVisible(on: boolean): void {
    this.landscapeEl?.classList.toggle('flyer-mode', on);
    this.root.querySelector('#hud-flyer')?.classList.toggle('panel-hidden', !on);
    this.root.querySelector('#hud-flyer-callout')?.classList.add('panel-hidden');
    if (on) this.closeDrops();
    const labels = this.root.querySelectorAll('.control-label');
    if (labels[0]) labels[0].textContent = on ? 'STRAFE' : 'ORBIT';
    if (labels[1]) labels[1].textContent = on ? 'FIRE' : 'AIM';
    const lock = this.root.querySelector('#hud-flyer-lock');
    if (!on && lock) lock.classList.remove('hot');
  }

  updateFlyer(info: { title: string; time: number; speed: number; thrust: number; lock: boolean }): void {
    const title = this.root.querySelector('#hud-flyer-title');
    const time = this.root.querySelector('#hud-flyer-time');
    const speed = this.root.querySelector('#hud-flyer-speed');
    const lock = this.root.querySelector('#hud-flyer-lock');
    const thrustVal = this.root.querySelector('#hud-flyer-thrust-val');
    const thrustFill = this.root.querySelector('#hud-flyer-thrust-fill') as HTMLElement | null;
    const thrustRoot = this.root.querySelector('#hud-flyer-thrust');
    if (title) title.textContent = info.title;
    if (time) time.textContent = `${info.time.toFixed(1)}s`;
    if (speed) speed.textContent = `x${info.speed.toFixed(2)}`;
    const thr = Math.round(info.thrust);
    if (thrustVal) thrustVal.textContent = `${thr}%`;
    if (thrustFill) {
      const pct = Math.max(8, Math.min(100, (thr / 165) * 100));
      thrustFill.style.width = `${pct}%`;
    }
    thrustRoot?.classList.toggle('over', thr > 104);
    thrustRoot?.classList.toggle('under', thr < 96);
    thrustRoot?.classList.toggle('nominal', thr >= 96 && thr <= 104);
    // WAVE39: single boost grammar — corner BOOST pill (no competing bars)
    const boostEl = this.root.querySelector('#hud-flyer-boost');
    if (boostEl) {
      const on = thr > 104;
      boostEl.classList.toggle('panel-hidden', !on);
      boostEl.classList.toggle('hot', on);
    }
    lock?.classList.toggle('hot', info.lock);
  }

  /** One short line for a pickup. Not a lecture. */
  flashPickup(text: string, kind: 'boost' | 'shield' | 'hull' | 'ring'): void {
    const root = this.root.querySelector('#hud-flyer');
    if (root) {
      root.classList.remove('flash-boost', 'flash-hazard', 'flash-gate', 'flash-shield', 'flash-hull', 'flash-ring');
      void (root as HTMLElement).offsetWidth;
      root.classList.add(`flash-${kind}`);
    }
    const el = this.root.querySelector('#hud-flyer-callout') as HTMLElement | null;
    if (!el) return;
    el.className = `hud-flyer-callout kind-${kind}`;
    el.textContent = text;
    el.classList.remove('panel-hidden');
    window.clearTimeout((el as HTMLElement & { _hideT?: number })._hideT);
    (el as HTMLElement & { _hideT?: number })._hideT = window.setTimeout(() => el.classList.add('panel-hidden'), 780);
  }

  /** WAVE42: lecture callouts muted in normal play — debug flag only. */
  showFlyerCallout(text: string, kind: 'boost' | 'hazard' | 'gate' | 'info' = 'info'): void {
    const debug = !!(globalThis as any).__FLYER_DEBUG_UI;
    if (!debug) return;
    const el = this.root.querySelector('#hud-flyer-callout') as HTMLElement | null;
    if (!el) return;
    el.className = `hud-flyer-callout kind-${kind}`;
    el.textContent = text;
    el.classList.remove('panel-hidden');
    window.clearTimeout((el as any)._hideT);
    (el as any)._hideT = window.setTimeout(() => el.classList.add('panel-hidden'), 2200);
  }

  flashFlyerEvent(kind: 'boost' | 'hazard' | 'gate'): void {
    const root = this.root.querySelector('#hud-flyer');
    if (!root) return;
    root.classList.remove('flash-boost', 'flash-hazard', 'flash-gate');
    void (root as HTMLElement).offsetWidth;
    root.classList.add(`flash-${kind}`);
  }
}
