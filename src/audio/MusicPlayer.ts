/**
 * Streaming music player.
 * - Always keeps a bed playing (menu / intro / shuffle)
 * - Soft duck+muffle only for combat-adjacent shops (not sector/settings)
 * - Crossfade-style out→in when swapping stage shuffle tracks
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
  | 'ui' // shop / lattice / loadout — duck + muffle only
  | 'preserve'; // keep current track (submenus)

export class MusicPlayer {
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private wired = false;

  private current: MusicTrack | null = null;
  private context: MusicContext = 'menu';
  private muffled = false;
  private shuffle: MusicTrack[] = [];
  private shuffleIdx = 0;
  private masterVol = 0.55;
  private muted = false;
  private unlocked = false;
  private fadeToken = 0;
  private readonly FADE_SEC = 1.05;

  onTrackChange: ((track: MusicTrack | null) => void) | null = null;

  constructor() {
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.audio.addEventListener('ended', () => this.onEnded());
    // If playback stalls, try to recover a bed
    this.audio.addEventListener('error', () => {
      window.setTimeout(() => this.ensurePlaying(), 400);
    });
  }

  get currentTrack(): MusicTrack | null {
    return this.current;
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && !!this.audio.src;
  }

  get currentTime(): number {
    return this.audio.currentTime || 0;
  }

  get duration(): number {
    return this.audio.duration || 0;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGains(0.12);
    if (!m) void this.resume();
  }

  setMasterVolume(v: number): void {
    this.masterVol = Math.max(0, Math.min(1, v));
    this.applyGains(0.12);
  }

  async unlock(): Promise<void> {
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.unlocked = true;
    this.ensurePlaying();
  }

  /**
   * High-level bed selection.
   * - menu: Boot Sequence (loop) — only restarts if not already that track
   * - intro/stage1: Final Protocol seamless
   * - stage (2+): shuffle with fade between tracks
   * - ui: duck/muffle only (keep bed)
   * - preserve: keep bed, no duck (sectors/settings)
   */
  setContext(ctx: MusicContext, opts?: { levelId?: number }): void {
    const prev = this.context;
    this.context = ctx;

    if (ctx === 'ui') {
      this.setMuffled(true);
      this.ensurePlaying();
      return;
    }

    if (ctx === 'preserve') {
      this.setMuffled(false);
      this.ensurePlaying();
      return;
    }

    this.setMuffled(false);

    if (ctx === 'menu') {
      // Never restart Boot Sequence just because we re-entered menu from a submenu
      const alreadyMenu =
        this.current?.id === MUSIC_MENU.id && (this.isPlaying || !!this.audio.src);
      this.playTrack(MUSIC_MENU, {
        loop: true,
        forceRestart: !alreadyMenu && prev !== 'menu' && prev !== 'preserve' && prev !== 'ui',
        fade: prev === 'stage' || prev === 'stage1' || prev === 'intro',
      });
      return;
    }

    if (ctx === 'intro' || ctx === 'stage1') {
      if (this.current?.id === MUSIC_INTRO.id && (this.isPlaying || !!this.audio.src)) {
        this.audio.loop = true;
        void this.audio.play().catch(() => undefined);
        this.onTrackChange?.(this.current);
        return;
      }
      this.playTrack(MUSIC_INTRO, {
        loop: true,
        forceRestart: false,
        fade: prev === 'menu' || prev === 'stage',
      });
      return;
    }

    if (ctx === 'stage') {
      const id = opts?.levelId ?? 2;
      if (id <= 1) {
        this.setContext('stage1');
        return;
      }
      // New stage: always pick a shuffled track with fade (unless same request mid-song keep)
      this.ensureShuffle();
      const next = this.pickShuffleNext(true);
      if (next) {
        const same = this.current?.id === next.id && this.isPlaying;
        this.playTrack(next, {
          loop: false,
          forceRestart: !same,
          fade: true,
        });
      } else {
        this.ensurePlaying();
      }
    }
  }

  /** If nothing is playing, start an appropriate bed. */
  ensurePlaying(): void {
    if (this.muted) return;
    if (this.isPlaying) {
      void this.audio.play().catch(() => undefined);
      return;
    }
    if (this.context === 'menu' || this.context === 'preserve') {
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: false, fade: false });
      return;
    }
    if (this.context === 'intro' || this.context === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: false, fade: false });
      return;
    }
    // stage / ui: random from pool
    this.ensureShuffle();
    const t = this.pickShuffleNext(true) ?? MUSIC_POOL[0] ?? MUSIC_MENU;
    this.playTrack(t, { loop: false, forceRestart: true, fade: false });
  }

  playTrack(
    track: MusicTrack,
    opts?: { loop?: boolean; forceRestart?: boolean; fade?: boolean }
  ): void {
    const force = opts?.forceRestart ?? true;
    const loop = opts?.loop ?? false;
    const fade = opts?.fade ?? false;

    if (!force && this.current?.id === track.id && this.isPlaying) {
      this.audio.loop = loop;
      this.onTrackChange?.(this.current);
      return;
    }

    if (!force && this.current?.id === track.id && this.audio.src) {
      this.audio.loop = loop;
      void this.audio.play().catch(() => undefined);
      this.onTrackChange?.(this.current);
      return;
    }

    if (fade && this.isPlaying && this.current?.id !== track.id) {
      void this.fadeToTrack(track, loop);
      return;
    }

    this.startTrackNow(track, loop);
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    void this.audio.play().catch(() => undefined);
  }

  stop(): void {
    this.fadeToken++;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.current = null;
    this.onTrackChange?.(null);
  }

  skipNext(): void {
    if (this.context === 'menu' || this.context === 'preserve') {
      // On menu radio, skip through combat pool but return to menu bed later
      this.ensureShuffle();
      const t = this.pickShuffleNext(true);
      if (t) this.playTrack(t, { loop: false, forceRestart: true, fade: true });
      return;
    }
    if (this.context === 'intro' || this.context === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: true, fade: true });
      return;
    }
    this.ensureShuffle();
    const t = this.pickShuffleNext(true);
    if (t) this.playTrack(t, { loop: false, forceRestart: true, fade: true });
  }

  setMuffled(on: boolean): void {
    this.muffled = on;
    this.applyGains(0.2);
  }

  private async fadeToTrack(track: MusicTrack, loop: boolean): Promise<void> {
    const token = ++this.fadeToken;
    this.ensureGraph();
    const fadeMs = this.FADE_SEC * 1000;

    // Fade out
    if (this.gain && this.ctx) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(this.gain.gain.value, t);
      this.gain.gain.linearRampToValueAtTime(0.001, t + this.FADE_SEC);
    } else {
      // Element fallback
      const start = this.audio.volume;
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, fadeMs / steps));
        if (token !== this.fadeToken) return;
        this.audio.volume = start * (1 - i / steps);
      }
    }

    await new Promise((r) => setTimeout(r, fadeMs));
    if (token !== this.fadeToken) return;

    this.startTrackNow(track, loop, true);

    // Fade in
    if (this.gain && this.ctx) {
      const t = this.ctx.currentTime;
      const target = this.targetGain();
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(0.001, t);
      this.gain.gain.linearRampToValueAtTime(target, t + this.FADE_SEC);
    } else {
      this.applyGains(this.FADE_SEC);
    }
  }

  private startTrackNow(track: MusicTrack, loop: boolean, fromFade = false): void {
    this.current = track;
    this.audio.loop = loop;
    this.audio.src = track.src;
    this.audio.load();
    if (fromFade && this.gain && this.ctx) {
      this.gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    }
    void this.audio.play().catch(() => {
      window.setTimeout(() => this.ensurePlaying(), 500);
    });
    this.onTrackChange?.(track);
    if (!fromFade) this.applyGains(0.15);
  }

  private onEnded(): void {
    if (this.audio.loop) return;
    // Always continue with something
    if (this.context === 'menu' || this.context === 'preserve') {
      // If user skipped to a pool track on menu, after it ends return to Boot Sequence
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: true, fade: true });
      return;
    }
    if (this.context === 'intro' || this.context === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: true, fade: false });
      return;
    }
    // stage / ui: next shuffle
    this.ensureShuffle();
    const t = this.pickShuffleNext(true);
    if (t) this.playTrack(t, { loop: false, forceRestart: true, fade: true });
    else this.ensurePlaying();
  }

  private ensureShuffle(): void {
    if (this.shuffle.length === 0) {
      this.shuffle = [...MUSIC_POOL];
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
      this.applyGains(0);
    } catch {
      this.wired = false;
    }
  }

  private targetGain(): number {
    const base = this.muted ? 0 : this.masterVol;
    // Shop / UI: ~40% bed + low-pass “next room” filter
    return base * (this.muffled ? 0.4 : 1);
  }

  private applyGains(rampSec = 0.18): void {
    const vol = this.targetGain();
    if (this.gain && this.filter && this.ctx) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(Math.max(0.001, this.gain.gain.value || vol), t);
      this.gain.gain.linearRampToValueAtTime(Math.max(0.001, vol), t + Math.max(0.02, rampSec));
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.linearRampToValueAtTime(
        this.muffled ? 480 : 18000,
        t + Math.max(0.05, rampSec)
      );
      this.audio.volume = 1;
    } else {
      this.audio.volume = vol;
    }
  }
}
