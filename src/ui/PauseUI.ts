/**
 * Combat pause sheet — Resume / Settings / Extract.
 * Must never start a sector. Extract is the only path that leaves the stage.
 */
export class PauseUI {
  private root: HTMLElement;
  private visible = false;

  onResume: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onShop: (() => void) | null = null;
  onExtract: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get isOpen(): boolean {
    return this.visible;
  }

  show(opts: { sectorName: string; sectorId: number }): void {
    this.visible = true;
    this.root.innerHTML = `
      <div class="overlay-card interactive pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">PAUSED</h2>
        <p>Sector ${opts.sectorId} · ${opts.sectorName}</p>
        <p class="pause-hint">Stage is held. Resume to continue — Extract returns to the title screen.</p>
        <button class="menu-btn primary ui-btn" id="pause-resume" type="button">RESUME SECTOR</button>
        <button class="menu-btn ui-btn" id="pause-settings" type="button">SETTINGS</button>
        <button class="menu-btn ui-btn" id="pause-shop" type="button">SHOP</button>
        <button class="menu-btn magenta ui-btn" id="pause-extract" type="button">EXTRACT TO MENU</button>
      </div>
    `;
    const bind = (id: string, fn: () => void) => {
      this.root.querySelector(id)?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        fn();
      });
    };
    bind('#pause-resume', () => this.onResume?.());
    bind('#pause-settings', () => this.onSettings?.());
    bind('#pause-shop', () => this.onShop?.());
    bind('#pause-extract', () => this.onExtract?.());
    requestAnimationFrame(() => {
      (this.root.querySelector('#pause-resume') as HTMLButtonElement | null)?.focus();
    });
  }

  hide(): void {
    if (!this.visible && !this.root.innerHTML) return;
    this.visible = false;
    this.root.innerHTML = '';
  }
}
