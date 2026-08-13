import { UI_CLICK_LOCK_MS } from '../core/NavPolicy';

export class MenuUI {
  private root: HTMLElement;
  private ascensionTier = 0;
  private coreEnergy = 0;
  private shopLocked = false;
  private shopLockHint = 'Need 150 FRAG';
  private missionLabel = 'START MISSION';

  onPlay: (() => void) | null = null;
  onTech: (() => void) | null = null;
  onLevels: (() => void) | null = null;
  onLoadout: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onResearch: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderMain();
  }

  setMeta(ascensionTier: number, coreEnergy: number): void {
    this.ascensionTier = ascensionTier;
    this.coreEnergy = coreEnergy;
  }

  setChrome(opts: {
    shopLocked: boolean;
    shopLockHint?: string;
    missionLabel?: string;
  }): void {
    this.shopLocked = opts.shopLocked;
    if (opts.shopLockHint) this.shopLockHint = opts.shopLockHint;
    if (opts.missionLabel) this.missionLabel = opts.missionLabel;
  }

  private renderMain(): void {
    const ascLabel =
      this.ascensionTier > 0
        ? `Ascension Tier ${this.ascensionTier}`
        : 'Ascension Tier 0 · Evolve to rise';
    this.root.innerHTML = `
      <div class="menu-screen interactive menu-landscape">
        <div class="menu-left-panel ui-enter">
          <div class="menu-brand">
            <div class="menu-title">THE CUBE</div>
            <div class="menu-sub">Destroy · Orbit · Ascend</div>
            <div class="menu-asc-badge" id="menu-asc">${ascLabel}</div>
            <div class="menu-core-line">◆ ${Math.floor(this.coreEnergy)} CORE</div>
          </div>
          <div class="menu-actions">
            <button class="menu-btn menu-engage primary ui-btn" id="m-play" type="button">
              <span class="menu-engage-glow" aria-hidden="true"></span>
              <span class="menu-btn-label">${this.missionLabel}</span>
            </button>

            <div class="menu-subrow" role="group" aria-label="Submenus">
              <button class="menu-btn menu-subbtn ui-btn" id="m-levels" type="button">
                <span class="menu-btn-label">Sectors</span>
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-tech" type="button"
                ${this.shopLocked ? `disabled aria-disabled="true" title="${this.shopLockHint}"` : ''}>
                <span class="menu-btn-label">Shop</span>
                ${this.shopLocked ? `<span class="menu-btn-lock">${this.shopLockHint}</span>` : ''}
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-research" type="button">
                <span class="menu-btn-label">Lattice</span>
                <span class="menu-btn-lock">Core research</span>
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-loadout" type="button"
                ${this.shopLocked ? `disabled aria-disabled="true" title="${this.shopLockHint}"` : ''}>
                <span class="menu-btn-label">Loadout</span>
                ${this.shopLocked ? `<span class="menu-btn-lock">${this.shopLockHint}</span>` : ''}
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-settings" type="button">
                <span class="menu-btn-label">Settings</span>
              </button>
            </div>
          </div>
          <div class="menu-hint">
            Left stick: orbit · Right stick: aim main gun · Auto-fire armed
          </div>
        </div>
        <div class="menu-right-fade" aria-hidden="true"></div>
      </div>
    `;
    this.bind();
  }

  private bind(): void {
    this.root.querySelector('#m-play')?.addEventListener('click', () => this.onPlay?.());
    this.root.querySelector('#m-tech')?.addEventListener('click', () => this.onTech?.());
    this.root.querySelector('#m-levels')?.addEventListener('click', () => this.onLevels?.());
    this.root.querySelector('#m-loadout')?.addEventListener('click', () => this.onLoadout?.());
    this.root.querySelector('#m-settings')?.addEventListener('click', () => this.onSettings?.());
    this.root.querySelector('#m-research')?.addEventListener('click', () => this.onResearch?.());
  }

  show(): void {
    this.root.classList.remove('panel-hidden');
    this.renderMain();
    // Closing settings remounts this menu in the same tap — keep START inert briefly.
    const play = this.root.querySelector('#m-play') as HTMLButtonElement | null;
    if (play) {
      play.disabled = true;
      play.setAttribute('aria-disabled', 'true');
      window.setTimeout(() => {
        play.disabled = false;
        play.removeAttribute('aria-disabled');
      }, UI_CLICK_LOCK_MS);
    }
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }
}
