import { LEVELS } from '../data/levels';

export class LevelSelectUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onSelect: ((levelId: number) => void) | null = null;
  onReplayIntro: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(highest: number, current: number): void {
    this.root.classList.remove('panel-hidden');
    const canReplay = highest > 1;

    let html = `
      <div class="level-panel interactive panel-landscape ui-enter">
        <div class="panel-chrome">
          <div class="panel-chrome-left">
            <h2 class="panel-title">SECTORS</h2>
            <p class="panel-sub">Select a cleared sector to redeploy</p>
          </div>
          <div class="panel-chrome-right">
            ${
              canReplay
                ? `<button class="menu-btn ui-btn" id="lv-replay" type="button">
                     <span class="menu-btn-label">Replay Intro</span>
                   </button>`
                : ''
            }
            <button class="icon-btn ui-btn" id="lv-close" type="button" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="level-grid landscape-grid">
    `;
    for (const l of LEVELS) {
      const unlocked = l.id <= highest;
      const cls = [
        'level-card',
        'ui-btn',
        !unlocked ? 'locked' : '',
        l.id === current ? 'current' : '',
        unlocked && l.id < highest ? 'cleared' : '',
      ]
        .filter(Boolean)
        .join(' ');
      html += `
        <button class="${cls}" data-id="${l.id}" type="button" ${!unlocked ? 'disabled' : ''}>
          <div class="lv">${String(l.id).padStart(2, '0')}</div>
          <div class="meta">${l.size}³</div>
          <div class="meta name">${l.name}</div>
        </button>`;
    }
    html += `</div></div>`;
    this.root.innerHTML = html;

    this.root.querySelector('#lv-close')?.addEventListener('click', () => this.onClose?.());
    this.root.querySelector('#lv-replay')?.addEventListener('click', () => this.onReplayIntro?.());
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
