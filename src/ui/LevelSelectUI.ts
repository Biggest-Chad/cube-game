import { LEVELS } from '../data/levels';

export class LevelSelectUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onSelect: ((levelId: number) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(highest: number, current: number): void {
    this.root.classList.remove('panel-hidden');
    let html = `
      <div class="level-panel interactive">
        <div class="tech-header">
          <h2>SECTORS</h2>
          <button class="icon-btn" id="lv-close">✕</button>
        </div>
        <div class="level-grid">
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
        <button class="${cls}" data-id="${l.id}" ${!unlocked ? 'disabled' : ''}>
          <div class="lv">${l.id}</div>
          <div class="meta">${l.size}³ · ${l.name}</div>
        </button>`;
    }
    html += `</div></div>`;
    this.root.innerHTML = html;
    this.root.querySelector('#lv-close')!.addEventListener('click', () => this.onClose?.());
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
