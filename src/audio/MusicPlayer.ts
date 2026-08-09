/**
 * Streaming music player with soft “next door” muffling for shop UI.
 * Uses HTMLAudioElement + Web Audio graph (gain + lowpass).
 */
import {
  MUSIC_INTRO,
  MUSIC_MENU,
  MUSIC_POOL,
  type MusicTrack,
} from './MusicCatalog';

export type MusicContext =
  | 'menu'
  | 'intro'
  | 'stage1'
  | 'stage'
  | 'ui' // shop / lattice / loadout — duck + muffle
  | 'silent';

export class MusicPlayer {
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private wired = false;

  private current: MusicTrack | null = null;
  private context: MusicContext = 'silent';
  private muffled = false;
  private shuffle: MusicTrack[] = [];
  private shuffleIdx = 0;
  private masterVol = 0.55;
  private muted = false;
  private unlocked = false;

  onTrackChange: ((track: MusicTrack | null) => void) | null = null;

  constructor() {
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.audio.addEventListener('ended', () => this.onEnded());
  }

  get currentTrack(): MusicTrack | null {
    return this.current;
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  get currentTime(): number {
    return this.audio.currentTime || 0;
  }

  get duration(): number {
    return this.audio.duration || 0;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGains();
  }

  setMasterVolume(v: number): void {
    this.masterVol = Math.max(0, Math.min(1, v));
    this.applyGains();
  }

  /** Call after user gesture so autoplay policies allow playback. */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.unlocked = true;
  }

  /**
   * Set high-level music context. Handles seamless Final Protocol across intro→L1.
   */
  setContext(ctx: MusicContext, opts?: { levelId?: number }): void {
    const prev = this.context;
    this.context = ctx;

    if (ctx === 'silent') {
      this.stop();
      return;
    }

    if (ctx === 'ui') {
      this.setMuffled(true);
      // Keep whatever is playing; just duck
      return;
    }

    this.setMuffled(false);

    if (ctx === 'menu') {
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: prev !== 'menu' });
      return;
    }

    if (ctx === 'intro' || ctx === 'stage1') {
      // Seamless: if Final Protocol already playing, leave it alone
      if (
        this.current?.id === MUSIC_INTRO.id &&
        this.isPlaying &&
        (prev === 'intro' || prev === 'stage1' || prev === 'ui')
      ) {
        this.audio.loop = true;
        return;
      }
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: false });
      return;
    }

    if (ctx === 'stage') {
      // Level 1 uses Final Protocol (handled via stage1). Other levels shuffle.
      const id = opts?.levelId ?? 2;
      if (id <= 1) {
        this.setContext('stage1');
        return;
      }
      this.ensureShuffle();
      const next = this.pickShuffleNext(true);
      if (next) this.playTrack(next, { loop: false, forceRestart: true });
    }
  }

  /** Explicit play from radio widget. */
  playTrack(
    track: MusicTrack,
    opts?: { loop?: boolean; forceRestart?: boolean }
  ): void {
    const force = opts?.forceRestart ?? true;
    const loop = opts?.loop ?? false;

    if (
      !force &&
      this.current?.id === track.id &&
      this.isPlaying
    ) {
      this.audio.loop = loop;
      this.onTrackChange?.(this.current);
      return;
    }

    // Same track restart only if forced
    if (this.current?.id === track.id && !force && this.audio.src) {
      this.audio.loop = loop;
      void this.audio.play().catch(() => undefined);
      return;
    }

    this.current = track;
    this.audio.loop = loop;
    this.audio.src = track.src;
    this.audio.load();
    void this.audio.play().catch(() => {
      // Autoplay blocked until unlock()
    });
    this.onTrackChange?.(track);
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    void this.audio.play().catch(() => undefined);
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.current = null;
    this.onTrackChange?.(null);
  }

  skipNext(): void {
    if (this.context === 'menu') {
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: true });
      return;
    }
    this.ensureShuffle();
    const t = this.pickShuffleNext(true);
    if (t) this.playTrack(t, { loop: false, forceRestart: true });
  }

  setMuffled(on: boolean): void {
    this.muffled = on;
    this.applyGains();
  }

  private onEnded(): void {
    if (this.audio.loop) return;
    if (this.context === 'menu') {
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: true });
      return;
    }
    if (this.context === 'intro' || this.context === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: true });
      return;
    }
    if (this.context === 'stage' || this.context === 'ui') {
      this.ensureShuffle();
      const t = this.pickShuffleNext(true);
      if (t) this.playTrack(t, { loop: false, forceRestart: true });
    }
  }

  private ensureShuffle(): void {
    if (this.shuffle.length === 0) {
      this.shuffle = [...MUSIC_POOL];
      // Fisher–Yates
      for (let i = this.shuffle.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [this.shuffle[i], this.shuffle[j]] = [this.shuffle[j], this.shuffle[i]];
      }
      this.shuffleIdx = 0;
    }
  }

  private pickShuffleNext(advance: boolean): MusicTrack | null {
    this.ensureShuffle();
    if (this.shuffle.length === 0) return null;
    // Avoid immediate repeat of current combat track
    let guard = 0;
    let t = this.shuffle[this.shuffleIdx % this.shuffle.length];
    while (t.id === this.current?.id && this.shuffle.length > 1 && guard < 8) {
      this.shuffleIdx++;
      t = this.shuffle[this.shuffleIdx % this.shuffle.length];
      guard++;
    }
    if (advance) {
      this.shuffleIdx = (this.shuffleIdx + 1) % this.shuffle.length;
      if (this.shuffleIdx === 0) {
        // Reshuffle after full cycle
        this.shuffle = [];
        this.ensureShuffle();
      }
    }
    return t;
  }

  private ensureGraph(): void {
    if (this.wired) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.gain = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 18000;
      this.filter.Q.value = 0.7;
      this.source.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.wired = true;
      this.applyGains();
    } catch {
      // Fallback: element-only (no muffling)
      this.wired = false;
    }
  }

  private applyGains(): void {
    const base = this.muted ? 0 : this.masterVol;
    const duck = this.muffled ? 0.28 : 1;
    const vol = base * duck;
    if (this.gain && this.filter && this.ctx) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.linearRampToValueAtTime(vol, t + 0.18);
      this.filter.frequency.cancelScheduledValues(t);
      // “Room next door”: heavy low-pass when muffled
      this.filter.frequency.linearRampToValueAtTime(
        this.muffled ? 480 : 18000,
        t + 0.22
      );
      this.audio.volume = 1; // drive volume via gain node
    } else {
      this.audio.volume = vol;
    }
  }
}
