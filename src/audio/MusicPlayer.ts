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
   * Continuity-first: never restart or swap mid-song when changing levels / menus / modes.
   * Track only advances on natural end, user skip, or when nothing is loaded yet.
   * - ui: duck/muffle only
   * - preserve: unmuffle, keep bed
   * - menu / stage / intro: keep current song if one is already loaded
   */
  setContext(ctx: MusicContext, _opts?: { levelId?: number }): void {
    this.context = ctx;

    if (ctx === 'ui') {
      this.setMuffled(true);
      // Cancel in-flight crossfade so a prior skip cannot restart mid-shop
      this.fadeToken++;
      this.ensurePlaying();
      return;
    }

    if (ctx === 'preserve') {
      this.setMuffled(false);
      this.fadeToken++;
      this.ensurePlaying();
      return;
    }

    this.setMuffled(false);

    // Level 1 maps to stage1 for onEnded routing only — never force a restart
    if (ctx === 'stage' && (_opts?.levelId ?? 2) <= 1) {
      this.context = 'stage1';
      ctx = 'stage1';
    }

    // Something already loaded → keep it (levels, menu, shop return, etc.)
    if (this.hasActiveBed()) {
      // Invalidate any pending fadeToTrack so continuity wins
      this.fadeToken++;
      this.applyLoopForContext(ctx);
      void this.audio.play().catch(() => undefined);
      this.onTrackChange?.(this.current);
      this.applyGains(0.12);
      return;
    }

    // Cold start only — pick a bed for this context
    if (ctx === 'menu') {
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: false, fade: false });
      return;
    }
    if (ctx === 'intro' || ctx === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: false, fade: false });
      return;
    }
    if (ctx === 'stage') {
      this.ensureShuffle();
      const next = this.pickShuffleNext(true) ?? MUSIC_POOL[0] ?? MUSIC_MENU;
      this.playTrack(next, { loop: false, forceRestart: false, fade: false });
    }
  }

  /** True if a track is loaded and not finished (paused is still "active"). */
  private hasActiveBed(): boolean {
    if (!this.current || !this.audio.src) return false;
    if (this.audio.ended) return false;
    return true;
  }

  /** Loop only dedicated beds; shuffle tracks always play through once. */
  private applyLoopForContext(ctx: MusicContext): void {
    if (!this.current) return;
    if (this.current.id === MUSIC_MENU.id) {
      // Boot Sequence loops on menu/submenus; if it rode into combat, let it finish once
      this.audio.loop = ctx === 'menu' || ctx === 'preserve' || ctx === 'ui';
      return;
    }
    if (this.current.id === MUSIC_INTRO.id) {
      // Final Protocol loops on sector 1 / intro only; later sectors keep the song but
      // allow natural end → shuffle (no mid-track restart on level change).
      this.audio.loop = ctx === 'intro' || ctx === 'stage1';
      return;
    }
    // Combat shuffle / radio picks — never infinite-loop across stages
    this.audio.loop = false;
  }

  /** If nothing is playing, start an appropriate bed. Never restarts a live track. */
  ensurePlaying(): void {
    if (this.muted) return;
    if (this.hasActiveBed()) {
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
    // stage / ui: random from pool (only when nothing is loaded)
    this.ensureShuffle();
    const t = this.pickShuffleNext(true) ?? MUSIC_POOL[0] ?? MUSIC_MENU;
    this.playTrack(t, { loop: false, forceRestart: false, fade: false });
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
    // Natural end only — pick the next bed for the *current* mode (no mid-level restarts)
    if (this.context === 'menu' || this.context === 'preserve') {
      // Pool/radio pick finished on menu → ease back into Boot Sequence
      this.playTrack(MUSIC_MENU, { loop: true, forceRestart: true, fade: true });
      return;
    }
    if (this.context === 'intro' || this.context === 'stage1') {
      this.playTrack(MUSIC_INTRO, { loop: true, forceRestart: true, fade: false });
      return;
    }
    // stage / ui / dying: continue shuffle without gaps
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
