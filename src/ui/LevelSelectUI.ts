import { getLevel, LEVELS } from '../data/levels';
import { isChronobeacon } from '../data/evolve';
import { flyerSceneTitle, pickFlyerScene, shouldRunTransit } from '../data/flyer';

export class LevelSelectUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onSelect: ((levelId: number) => void) | null = null;
  /** Replay the transfer flight that follows cube `afterLevelId`. */
  onSelectTransit: ((afterLevelId: number) => void) | null = null;
  onReplayIntro: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(highest: number, current: number, currentTransitAfter = 0): void {
    this.root.classList.remove('panel-hidden');
    const canReplay = highest > 1;

    let html = `
      <div class="level-panel interactive panel-landscape ui-enter">
        <div class="panel-chrome">
          <div class="panel-chrome-left">
            <h2 class="panel-title">SECTORS</h2>
            <p class="panel-sub">Chronobeacons every 5 · Transfers after 2 / 7 / 12…</p>
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
    const maxId = Math.max(LEVELS.length, highest, current, 30);
    for (let id = 1; id <= maxId; id++) {
      const l = getLevel(id);
      const unlocked = l.id <= highest;
      const beacon = isChronobeacon(l.id);
      const cls = [
        'level-card',
        'ui-btn',
        !unlocked ? 'locked' : '',
        l.id === current ? 'current' : '',
        unlocked && l.id < highest ? 'cleared' : '',
        beacon ? 'beacon' : '',
      ]
        .filter(Boolean)
        .join(' ');
      html += `
        <button class="${cls}" data-id="${l.id}" type="button" ${!unlocked ? 'disabled' : ''}>
          <div class="lv">${String(l.id).padStart(2, '0')}${beacon ? ' ◆' : ''}</div>
          <div class="meta">${l.size}³</div>
          <div class="meta name">${l.name}</div>
        </button>`;
      if (shouldRunTransit(l.id)) {
        const flyUnlocked = highest > l.id;
        const scene = pickFlyerScene(l.id);
        const flyCls = [
          'level-card',
          'ui-btn',
          'transit',
          !flyUnlocked ? 'locked' : '',
          currentTransitAfter === l.id ? 'current' : '',
          flyUnlocked && current !== l.id && currentTransitAfter !== l.id ? 'cleared' : '',
        ]
          .filter(Boolean)
          .join(' ');
        html += `
          <button class="${flyCls}" data-fly-after="${l.id}" type="button" ${!flyUnlocked ? 'disabled' : ''}>
            <div class="lv">✈ T${String(l.id).padStart(2, '0')}</div>
            <div class="meta">TRANSFER</div>
            <div class="meta name">${flyerSceneTitle(scene)}</div>
          </button>`;
      }
    }
    html += `</div></div>`;
    this.root.innerHTML = html;

    this.root.querySelector('#lv-close')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onClose?.();
    });
    this.root.querySelector('#lv-replay')?.addEventListener('click', () => this.onReplayIntro?.());
    this.root.querySelectorAll('.level-card:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const flyAfter = el.dataset.flyAfter;
        if (flyAfter) {
          this.onSelectTransit?.(Number(flyAfter));
          return;
        }
        const id = Number(el.dataset.id);
        this.onSelect?.(id);
      });
    });
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }
}
