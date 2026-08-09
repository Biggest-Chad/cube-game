/**
 * Compact radio widget — main menu bottom-right.
 */
import type { MusicPlayer } from '../audio/MusicPlayer';
import type { MusicTrack } from '../audio/MusicCatalog';

export class MusicRadioUI {
  private root: HTMLElement;
  private player: MusicPlayer;
  private titleEl: HTMLElement | null = null;
  private playBtn: HTMLElement | null = null;
  private raf = 0;

  constructor(host: HTMLElement, player: MusicPlayer) {
    this.root = document.createElement('div');
    this.root.className = 'music-radio interactive';
    this.root.setAttribute('aria-label', 'Music radio');
    host.appendChild(this.root);
    this.player = player;
    this.render();
    player.onTrackChange = (t) => this.updateTrack(t);
    this.tick();
  }

  private render(): void {
    const t = this.player.currentTrack;
    this.root.innerHTML = `
      <div class="music-radio-inner">
        <div class="music-radio-eq" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </div>
        <div class="music-radio-meta">
          <div class="music-radio-kicker">COMMS · RADIO</div>
          <div class="music-radio-title" id="radio-title">${t?.title ?? '— Standby —'}</div>
        </div>
        <div class="music-radio-controls">
          <button type="button" class="music-radio-btn" id="radio-prev" title="Restart">⏮</button>
          <button type="button" class="music-radio-btn primary" id="radio-play" title="Play / Pause">▶</button>
          <button type="button" class="music-radio-btn" id="radio-next" title="Next">⏭</button>
        </div>
      </div>
    `;
    this.titleEl = this.root.querySelector('#radio-title');
    this.playBtn = this.root.querySelector('#radio-play');
    this.root.querySelector('#radio-play')?.addEventListener('click', () => {
      void this.player.unlock().then(() => {
        if (this.player.isPlaying) this.player.pause();
        else this.player.resume();
        this.syncPlayIcon();
      });
    });
    this.root.querySelector('#radio-next')?.addEventListener('click', () => {
      void this.player.unlock().then(() => {
        this.player.skipNext();
        this.syncPlayIcon();
      });
    });
    this.root.querySelector('#radio-prev')?.addEventListener('click', () => {
      void this.player.unlock().then(() => {
        const cur = this.player.currentTrack;
        if (cur) this.player.playTrack(cur, { loop: true, forceRestart: true });
        this.syncPlayIcon();
      });
    });
    this.syncPlayIcon();
  }

  private updateTrack(t: MusicTrack | null): void {
    if (this.titleEl) this.titleEl.textContent = t?.title ?? '— Standby —';
    this.root.classList.toggle('playing', this.player.isPlaying);
    this.syncPlayIcon();
  }

  private syncPlayIcon(): void {
    if (this.playBtn) {
      this.playBtn.textContent = this.player.isPlaying ? '❚❚' : '▶';
    }
    this.root.classList.toggle('playing', this.player.isPlaying);
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    this.syncPlayIcon();
  };

  show(): void {
    this.root.classList.remove('panel-hidden');
  }

  hide(): void {
    this.root.classList.add('panel-hidden');
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}
