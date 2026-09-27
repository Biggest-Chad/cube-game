import { getLevel, LEVELS } from '../data/levels';
import { isChronobeacon } from '../data/evolve';
import {
  FLYER_SCENES,
  flyerSceneFromQuery,
  flyerSceneTitle,
  pickFlyerScene,
  shouldRunTransit,
  type FlyerSceneId,
} from '../data/flyer';

export class LevelSelectUI {
  private root: HTMLElement;
  onClose: (() => void) | null = null;
  onSelect: ((levelId: number) => void) | null = null;
  /** Replay the transfer flight that follows cube `afterLevelId`. */
  onSelectTransit: ((afterLevelId: number) => void) | null = null;
  /** Dev/test: jump into a flyer scene with no sector-clear gate. */
  onSelectFlyerTest: ((sceneId: FlyerSceneId) => void) | null = null;
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
            <p class="panel-sub">Chronobeacons every 5 Â· Transfers after 2 / 7 / 12â€¦</p>
          </div>
          <div class="panel-chrome-right">
            ${
              canReplay
                ? `<button class="menu-btn ui-btn" id="lv-replay" type="button">
                     <span class="menu-btn-label">Replay Intro</span>
                   </button>`
                : ''
            }
            <button class="icon-btn ui-btn" id="lv-close" type="button" aria-label="Close">âœ•</button>
          </div>
        </div>
        <div class="fly-test-row">
          <div class="fly-test-head">FLY TEST</div>
          ${FLYER_SCENES.map(
            (id) => `
            <button class="level-card ui-btn fly-test" data-fly-scene="${id}" type="button">
              <div class="lv">âœˆ</div>
              <div class="meta">TEST</div>
              <div class="meta name">${flyerSceneTitle(id)}</div>
            </button>`
          ).join('')}
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
          <div class="lv">${String(l.id).padStart(2, '0')}${beacon ? ' â—†' : ''}</div>
          <div class="meta">${l.size}Â³</div>
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
            <div class="lv">âœˆ T${String(l.id).padStart(2, '0')}</div>
            <div class="meta">TRANSFER</div>
            <div class="meta name">${flyerSceneTitle(scene)}</div>
          </button>`;
      }
    }
    html += `</div></div>`;
    this.root.innerHTML = html;
    this.paintBeaconFlow(highest);

    this.root.querySelector('#lv-close')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onClose?.();
    });
    this.root.querySelector('#lv-replay')?.addEventListener('click', () => this.onReplayIntro?.());
    this.root.querySelectorAll('.level-card:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const flyScene = flyerSceneFromQuery(el.dataset.flyScene);
        if (flyScene) {
          this.onSelectFlyerTest?.(flyScene);
          return;
        }
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

  private paintBeaconFlow(highest: number): void {
    const grid = this.root.querySelector(".level-grid") as HTMLElement | null;
    if (!grid) return;
    const cards = [...grid.querySelectorAll(".level-card.beacon:not(.locked)")] as HTMLElement[];
    if (cards.length < 2) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "beacon-flow");
    svg.setAttribute("aria-hidden", "true");
    const gbox = grid.getBoundingClientRect();
    const pts = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2 - gbox.left + grid.scrollLeft, y: r.top + r.height / 2 - gbox.top };
    });
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      d += (i === 0 ? "M" : "L") + pts[i].x.toFixed(1) + " " + pts[i].y.toFixed(1) + " ";
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d.trim());
    path.setAttribute("class", "beacon-flow-path");
    svg.appendChild(path);
    grid.appendChild(svg);
    void highest;
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.innerHTML = '';
  }
}
