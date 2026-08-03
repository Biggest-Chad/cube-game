export class MenuUI {
  private root: HTMLElement;
  onPlay: (() => void) | null = null;
  onTech: (() => void) | null = null;
  onLevels: (() => void) | null = null;
  onReset: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderMain();
  }

  private renderMain(): void {
    this.root.innerHTML = `
      <div class="menu-screen menu-landscape interactive">
        <div class="menu-bg-grid" aria-hidden="true"></div>
        <div class="menu-bg-glow" aria-hidden="true"></div>
        <div class="menu-layout">
          <div class="menu-brand">
            <div class="menu-kicker menu-anim delay-0">ORBITAL STRIKE PROTOCOL</div>
            <div class="menu-title menu-anim delay-1">
              <span class="menu-title-line">CUBE</span>
            </div>
            <div class="menu-sub menu-anim delay-2">Destroy · Orbit · Ascend</div>
            <div class="menu-tagline menu-anim delay-3">
              A giant emissive lattice has breached the void.<br />
              Engage from orbit. Shatter every block.
            </div>
          </div>
          <div class="menu-actions menu-anim delay-4">
            <button class="menu-btn primary menu-btn-wide" id="m-play" type="button">
              <span class="menu-btn-glyph">▶</span>
              <span class="menu-btn-copy">
                <span class="menu-btn-label">ENGAGE</span>
                <span class="menu-btn-hint">Start current sector</span>
              </span>
            </button>
            <div class="menu-btn-row">
              <button class="menu-btn" id="m-levels" type="button">SECTORS</button>
              <button class="menu-btn" id="m-tech" type="button">TECH</button>
            </div>
            <button class="menu-btn magenta menu-btn-quiet" id="m-reset" type="button">Reset Save</button>
            <div class="menu-hint">
              Left stick orbits · FIRE destroys · Landscape required for combat
            </div>
          </div>
        </div>
        <div class="menu-scan" aria-hidden="true"></div>
      </div>
    `;
    this.root.querySelector('#m-play')!.addEventListener('click', () => this.onPlay?.());
    this.root.querySelector('#m-tech')!.addEventListener('click', () => this.onTech?.());
    this.root.querySelector('#m-levels')!.addEventListener('click', () => this.onLevels?.());
    this.root.querySelector('#m-reset')!.addEventListener('click', () => {
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
