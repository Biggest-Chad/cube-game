export class MenuUI {
  private root: HTMLElement;
  onPlay: (() => void) | null = null;
  onTech: (() => void) | null = null;
  onLevels: (() => void) | null = null;
  onLoadout: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onReset: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderMain();
  }

  private renderMain(): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive menu-landscape">
        <div class="menu-left-panel ui-enter">
          <div class="menu-brand">
            <div class="menu-title">THE CUBE</div>
            <div class="menu-sub">Destroy · Orbit · Ascend</div>
          </div>
          <div class="menu-actions">
            <button class="menu-btn menu-engage primary ui-btn" id="m-play" type="button">
              <span class="menu-engage-glow" aria-hidden="true"></span>
              <span class="menu-btn-kicker">ENGAGE</span>
              <span class="menu-btn-label">START MISSION</span>
              <span class="menu-engage-sub">Orbit · Aim · Destroy</span>
            </button>

            <div class="menu-subrow" role="group" aria-label="Submenus">
              <button class="menu-btn menu-subbtn ui-btn" id="m-levels" type="button">
                <span class="menu-btn-label">Sectors</span>
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-tech" type="button">
                <span class="menu-btn-label">Shop</span>
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-loadout" type="button">
                <span class="menu-btn-label">Loadout</span>
              </button>
              <button class="menu-btn menu-subbtn ui-btn" id="m-settings" type="button">
                <span class="menu-btn-label">Settings</span>
              </button>
            </div>

            <button class="menu-btn menu-reset-btn magenta ui-btn" id="m-reset" type="button">
              <span class="menu-btn-label">Reset Save</span>
            </button>
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
    this.root.querySelector('#m-reset')?.addEventListener('click', () => {
      if (confirm('Erase all progress?')) this.onReset?.();
    });
  }

  show(): void {
    this.root.classList.remove('panel-hidden');
    this.renderMain();
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }
}
