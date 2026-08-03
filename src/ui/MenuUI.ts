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
      <div class="menu-screen interactive">
        <div class="menu-title">CUBE</div>
        <div class="menu-sub">Destroy · Orbit · Ascend</div>
        <button class="menu-btn primary" id="m-play">Engage</button>
        <button class="menu-btn" id="m-tech">Tech Tree</button>
        <button class="menu-btn" id="m-levels">Sectors</button>
        <button class="menu-btn magenta" id="m-reset">Reset Save</button>
        <div class="menu-hint">
          Orbit the cube with the left stick. Hold FIRE or enable auto-fire.
          Install to Home Screen on Android for fullscreen offline play.
        </div>
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
