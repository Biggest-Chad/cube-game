import { CORE } from '../data/core';

const DRONE_ICONS: Record<string, string> = {
  fighter: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.2 14.5,14.2 8,11 1.5,14.2"/></svg>`,
  bomber: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.5 15,8 8,14.5 1,8"/><rect x="3.2" y="7.1" width="9.6" height="1.8"/></svg>`,
  defender: `<svg class="hud-drone-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 L14 4.2 V8.6 C14 12.2 8 14.8 8 14.8 C8 14.8 2 12.2 2 8.6 V4.2 Z"/></svg>`,
};

const DRONE_ROLE_ORDER = ['fighter', 'bomber', 'defender'] as const;

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
              <span class="hud-nucleus-val" id="hud-nucleus-val">—</span>
            </div>
          </div>
          <div class="hud-top-spacer" aria-hidden="true"></div>
        </div>

        <div class="hud-drones panel-hidden" id="hud-drones" aria-label="Drone fleet"></div>

        <div class="hud-combat-tray" id="hud-combat-tray">
          <div class="hud-ammo" id="hud-ammo">
            <button class="hud-ammo-btn interactive ui-btn" id="hud-ammo-btn" type="button" aria-label="Cycle main gun ammo, Standard">
              <span class="hud-ammo-icon" aria-hidden="true">
                <svg class="ico-std" viewBox="0 0 16 16"><polygon points="8,1 10.2,6.4 16,7.2 11.6,10.6 13,16 8,13.1 3,16 4.4,10.6 0,7.2 5.8,6.4"/></svg>
                <svg class="ico-ap" viewBox="0 0 16 16"><polygon points="8,1 10,6 10,14 8,15.4 6,14 6,6"/></svg>
                <svg class="ico-he" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.2 V3.6 M8 12.4 V14.8 M1.2 8 H3.6 M12.4 8 H14.8 M3.1 3.1 L4.8 4.8 M11.2 11.2 L12.9 12.9 M12.9 3.1 L11.2 4.8 M4.8 11.2 L3.1 12.9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
              </span>
              <span class="hud-ammo-tag" id="hud-ammo-tag">STD</span>
              <span class="hud-ammo-key">R</span>
            </button>
          </div>
          <button class="hud-pilot-btn interactive ui-btn panel-hidden" id="hud-pilot-btn" type="button" aria-label="Pilot active">
            <span class="hud-pilot-ring" id="hud-pilot-ring"></span>
            <span class="hud-pilot-call" id="hud-pilot-call">—</span>
            <span class="hud-pilot-key">Q</span>
          </button>
        </div>

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

        <div class="hud-flyer panel-hidden" id="hud-flyer" aria-label="Transit">
          <div class="hud-flyer-title" id="hud-flyer-title">TRANSFER</div>
          <div class="hud-flyer-meta">
            <span id="hud-flyer-time">0.0s</span>
            <span id="hud-flyer-speed">×1.00</span>
          </div>
          <div class="hud-flyer-lock" id="hud-flyer-lock" aria-hidden="true"></div>
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
    this.dronesEl = this.root.querySelector('#hud-drones');
    this.ammoWrap = this.root.querySelector('#hud-ammo');
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
      btnAmmo: this.root.querySelector('#hud-ammo-btn') as HTMLElement,
      btnPilot: this.root.querySelector('#hud-pilot-btn') as HTMLElement,
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
    const wrap = this.ammoWrap ?? this.root.querySelector('#hud-ammo');
    const btn = this.root.querySelector('#hud-ammo-btn');
    if (tag) tag.textContent = info.short;
    wrap?.classList.toggle('ap', info.id === 'ap');
    wrap?.classList.toggle('he', info.id === 'he');
    wrap?.classList.toggle('std', info.id === 'standard');
    btn?.classList.toggle('locked', !info.canCycle);
    btn?.setAttribute(
      'aria-label',
      info.canCycle
        ? `Cycle main gun ammo, ${info.name}. ${info.hint}`
        : `Main gun ammo, ${info.name}. ${info.hint}`
    );
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

  /**
   * Dedicated drone cluster (left of vitals). Hidden when the bay is empty.
   * Role icons + counts; per-unit HP fill. Dead units show remaining respawn.
   */
  updateDrones(
    entries: Array<{ role: string; alive: boolean; hp: number; maxHp: number; respawn: number }>
  ): void {
    const el = this.dronesEl ?? (this.root.querySelector('#hud-drones') as HTMLElement | null);
    if (!el) return;
    if (!entries.length) {
      if (this.lastDroneKey !== '') {
        this.lastDroneKey = '';
        el.classList.add('panel-hidden');
        el.innerHTML = '';
      }
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
    el.classList.remove('panel-hidden');
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
        const pips = list
          .map((d) => {
            const pct = d.alive ? Math.max(0, Math.min(100, (d.hp / Math.max(1, d.maxHp)) * 100)) : 0;
            const wait = !d.alive ? `${Math.max(0, Math.ceil(d.respawn))}s` : '';
            return `<span class="hud-drone-pip ${d.role}${d.alive ? '' : ' dead'}">
              <i style="width:${pct.toFixed(0)}%"></i>
              ${wait ? `<b>${wait}</b>` : ''}
            </span>`;
          })
          .join('');
        return `<div class="hud-drone-group ${role}" title="${role}" aria-label="${role} ${alive} of ${list.length}">
          ${icon}
          <span class="hud-drone-count">${list.length}</span>
          <span class="hud-drone-pips">${pips}</span>
        </div>`;
      })
      .join('');
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

  setFlyerVisible(on: boolean): void {
    this.landscapeEl?.classList.toggle('flyer-mode', on);
    this.root.querySelector('#hud-flyer')?.classList.toggle('panel-hidden', !on);
    this.root.querySelector('#hud-combat-tray')?.classList.toggle('panel-hidden', on);
    this.ammoWrap?.classList.toggle('panel-hidden', on);
    const labels = this.root.querySelectorAll('.control-label');
    if (labels[0]) labels[0].textContent = on ? 'STRAFE' : 'ORBIT';
    if (labels[1]) labels[1].textContent = on ? 'FIRE' : 'AIM';
    const lock = this.root.querySelector('#hud-flyer-lock');
    if (!on && lock) lock.classList.remove('hot');
  }

  updateFlyer(info: { title: string; time: number; speed: number; lock: boolean }): void {
    const title = this.root.querySelector('#hud-flyer-title');
    const time = this.root.querySelector('#hud-flyer-time');
    const speed = this.root.querySelector('#hud-flyer-speed');
    const lock = this.root.querySelector('#hud-flyer-lock');
    if (title) title.textContent = info.title;
    if (time) time.textContent = `${info.time.toFixed(1)}s`;
    if (speed) speed.textContent = `×${info.speed.toFixed(2)}`;
    lock?.classList.toggle('hot', info.lock);
  }
}
