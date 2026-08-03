import { LEVELS } from '../data/levels';

export class LevelSelectUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onSelect: ((levelId: number) => void) | null = null;
  /** Replay level-1 cinematic intro (preview). */
  onReplayCinematic: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(highest: number, current: number): void {
    this.root.classList.remove('panel-hidden');
    let html = `
      <div class="level-panel level-panel-landscape interactive">
        <div class="tech-header level-header">
          <div class="level-header-left">
            <h2>SECTORS</h2>
            <span class="level-header-sub">Select lattice to engage</span>
          </div>
          <div class="level-header-actions">
            <button class="cine-replay-btn interactive" id="lv-replay-cine" type="button" title="Replay intro cinematic">
              <span class="cine-replay-icon" aria-hidden="true">▣</span>
              <span class="cine-replay-label">REPLAY INTRO</span>
            </button>
            <button class="icon-btn" id="lv-close" type="button" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="level-grid level-grid-landscape">
    `;
    for (const l of LEVELS) {
      const unlocked = l.id <= highest;
      const cls = [
        'level-card',
        !unlocked ? 'locked' : '',
        l.id === current ? 'current' : '',
        l.id < current || (unlocked && l.id < highest) ? 'cleared' : '',
      ]
        .filter(Boolean)
        .join(' ');
      html += `
        <button class="${cls}" data-id="${l.id}" ${!unlocked ? 'disabled' : ''} type="button">
          <div class="lv">${l.id}</div>
          <div class="meta">${l.size}³ · ${l.name}</div>
        </button>`;
    }
    html += `</div></div>`;
    this.root.innerHTML = html;
    this.root.querySelector('#lv-close')!.addEventListener('click', () => this.onClose?.());
    this.root.querySelector('#lv-replay-cine')!.addEventListener('click', () => {
      this.onReplayCinematic?.();
    });
    this.root.querySelectorAll('.level-card:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number((btn as HTMLElement).dataset.id);
        this.onSelect?.(id);
      });
    });
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }
}
