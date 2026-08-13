/**
 * Settings panel — graphics, audio, reset progress.
 * Close / Back never start a sector; Game decides the return destination.
 */
import {
  GRAPHICS_QUALITIES,
  GRAPHICS_PRESETS,
  type GraphicsQuality,
} from '../data/graphics';

export class SettingsUI {
  private root: HTMLElement;
  private quality: GraphicsQuality = 'medium';
  private muted = false;
  private volume = 0.7;

  onClose: (() => void) | null = null;
  onGraphicsChange: ((q: GraphicsQuality) => void) | null = null;
  onMuteChange: ((muted: boolean) => void) | null = null;
  onVolumeChange: ((volume: number) => void) | null = null;
  onReset: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    // Swallow closing taps so they cannot activate START MISSION under the panel.
    this.root.addEventListener('pointerup', (ev) => ev.stopPropagation());
    this.root.addEventListener('click', (ev) => ev.stopPropagation());
  }

  show(opts: {
    graphics: GraphicsQuality;
    muted: boolean;
    volume: number;
  }): void {
    this.quality = opts.graphics;
    this.muted = opts.muted;
    this.volume = opts.volume;
    this.root.classList.remove('panel-hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.render();
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '';
  }

  private requestClose(): void {
    // Do not hide here — Game owns teardown + destination (menu / pause / resume).
    this.onClose?.();
  }

  private render(): void {
    const preset = GRAPHICS_PRESETS[this.quality];
    this.root.innerHTML = `
      <div class="settings-panel interactive tech-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="shop-header tech-header">
          <div>
            <h2 id="settings-title">SETTINGS</h2>
            <div class="tech-header-sub">Graphics · audio · data</div>
          </div>
          <button class="icon-btn ui-btn" id="settings-close" type="button" aria-label="Back">✕</button>
        </div>

        <div class="settings-body">
          <button class="menu-btn primary ui-btn settings-back" id="settings-back" type="button">
            BACK
          </button>

          <section class="settings-section">
            <div class="settings-label">GRAPHICS QUALITY</div>
            <div class="settings-seg" role="radiogroup" aria-label="Graphics quality">
              ${GRAPHICS_QUALITIES.map(
                (q) => `
                <button type="button" class="settings-seg-btn ${
                  q === this.quality ? 'active' : ''
                }" data-gfx="${q}" role="radio" aria-checked="${q === this.quality}">
                  ${GRAPHICS_PRESETS[q].label}
                </button>`
              ).join('')}
            </div>
            <p class="settings-hint" id="gfx-hint">${preset.description}</p>
          </section>

          <section class="settings-section">
            <div class="settings-label">AUDIO</div>
            <div class="settings-row">
              <label for="settings-volume">Master volume</label>
              <input type="range" id="settings-volume" min="0" max="100"
                value="${Math.round(this.volume * 100)}"
                ${this.muted ? 'disabled' : ''}
                aria-valuemin="0" aria-valuemax="100"
                aria-valuenow="${Math.round(this.volume * 100)}" />
              <span class="settings-vol-val">${Math.round(this.volume * 100)}%</span>
            </div>
            <button type="button" class="menu-btn ui-btn ${this.muted ? 'primary' : ''}" id="settings-mute">
              ${this.muted ? 'UNMUTE' : 'MUTE'}
            </button>
          </section>

          <section class="settings-section dim">
            <div class="settings-label">PRESETS</div>
            <ul class="settings-list">
              <li><strong>LOW</strong> — no bloom, 1× DPR, sparse VFX</li>
              <li><strong>MEDIUM</strong> — soft bloom, balanced particles (default)</li>
              <li><strong>HIGH</strong> — full bloom, max particles &amp; resolution</li>
            </ul>
          </section>

          <section class="settings-section settings-danger">
            <div class="settings-label">DATA</div>
            <p class="settings-hint">Erase all progress, currencies, upgrades and loadouts. Cannot be undone.</p>
            <button type="button" class="menu-btn magenta ui-btn" id="settings-reset">
              RESET PROGRESS
            </button>
          </section>
        </div>
      </div>
    `;

    const close = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.requestClose();
    };
    this.root.querySelector('#settings-close')?.addEventListener('click', close);
    this.root.querySelector('#settings-back')?.addEventListener('click', close);

    this.root.querySelectorAll('[data-gfx]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const q = (btn as HTMLElement).dataset.gfx as GraphicsQuality;
        if (!q || q === this.quality) return;
        this.quality = q;
        this.onGraphicsChange?.(q);
        this.render();
      });
    });

    const vol = this.root.querySelector('#settings-volume') as HTMLInputElement | null;
    vol?.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      this.volume = v;
      const label = this.root.querySelector('.settings-vol-val');
      if (label) label.textContent = `${Math.round(v * 100)}%`;
      vol.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      this.onVolumeChange?.(v);
    });

    this.root.querySelector('#settings-mute')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.muted = !this.muted;
      this.onMuteChange?.(this.muted);
      this.render();
    });

    this.root.querySelector('#settings-reset')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (
        confirm(
          'Erase ALL progress?\n\nThis deletes fragments, upgrades, loadouts and sector progress.'
        )
      ) {
        this.onReset?.();
      }
    });

    requestAnimationFrame(() => {
      (this.root.querySelector('#settings-back') as HTMLButtonElement | null)?.focus();
    });
  }
}
