/**
 * Cinematic letterbox + full black fade for scene transitions
 * (cinematic ↔ gameplay, level ↔ level).
 */
export type TransitionPhase = 'idle' | 'out' | 'hold' | 'in';

export interface TransitionOptions {
  /** Fade to black duration (seconds) */
  fadeOut?: number;
  /** Hold on solid black (seconds) */
  hold?: number;
  /** Fade from black duration (seconds) */
  fadeIn?: number;
  /** Called once while fully black (swap scenes here) */
  onBlack?: () => void;
  /** Called when fully clear again */
  onComplete?: () => void;
}

const DEFAULTS = {
  fadeOut: 0.65,
  hold: 0.4,
  fadeIn: 0.85,
};

export class ScreenTransition {
  private root: HTMLElement;
  private veil: HTMLElement;
  private barTop: HTMLElement;
  private barBot: HTMLElement;
  private phase: TransitionPhase = 'idle';
  private t = 0;
  private outDur = DEFAULTS.fadeOut;
  private holdDur = DEFAULTS.hold;
  private inDur = DEFAULTS.fadeIn;
  private onBlack: (() => void) | null = null;
  private onComplete: (() => void) | null = null;
  private blackFired = false;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'screen-transition';
    this.root.className = 'screen-transition';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="st-letterbox st-top"></div>
      <div class="st-letterbox st-bot"></div>
      <div class="st-veil"></div>
    `;
    parent.appendChild(this.root);
    this.veil = this.root.querySelector('.st-veil')!;
    this.barTop = this.root.querySelector('.st-top')!;
    this.barBot = this.root.querySelector('.st-bot')!;
    this.setVisual(0, 0);
    this.root.style.pointerEvents = 'none';
  }

  get isActive(): boolean {
    return this.phase !== 'idle';
  }

  /**
   * Run a full cinematic cut: fade out → black mid → fade in.
   * Ignores re-entry while already active (queues not needed for game).
   */
  play(opts: TransitionOptions = {}): boolean {
    // Supersede any in-flight cut so double-taps / re-entry cannot stack onBlack
    if (this.phase !== 'idle') this.cancel();
    this.outDur = opts.fadeOut ?? DEFAULTS.fadeOut;
    this.holdDur = opts.hold ?? DEFAULTS.hold;
    this.inDur = opts.fadeIn ?? DEFAULTS.fadeIn;
    this.onBlack = opts.onBlack ?? null;
    this.onComplete = opts.onComplete ?? null;
    this.blackFired = false;
    this.t = 0;
    this.phase = 'out';
    this.root.classList.add('active');
    this.root.style.pointerEvents = 'auto';
    this.setVisual(0, 0);
    return true;
  }

  /**
   * Abort the transition immediately (clear veil + letterbox + pointer capture).
   * Does not invoke onBlack / onComplete.
   */
  cancel(): void {
    this.phase = 'idle';
    this.t = 0;
    this.blackFired = true;
    this.onBlack = null;
    this.onComplete = null;
    this.setVisual(0, 0);
    this.root.classList.remove('active');
    this.root.style.pointerEvents = 'none';
  }

  /** Instant black then fade in (e.g. first boot optional). */
  fadeInOnly(opts: { fadeIn?: number; onBlack?: () => void; onComplete?: () => void } = {}): boolean {
    if (this.phase !== 'idle') this.cancel();
    this.outDur = 0;
    this.holdDur = 0.05;
    this.inDur = opts.fadeIn ?? DEFAULTS.fadeIn;
    this.onBlack = opts.onBlack ?? null;
    this.onComplete = opts.onComplete ?? null;
    this.blackFired = false;
    this.t = 0;
    this.phase = 'hold';
    this.root.classList.add('active');
    this.root.style.pointerEvents = 'auto';
    this.setVisual(1, 1);
    return true;
  }

  update(dt: number): void {
    if (this.phase === 'idle') return;
    const d = Math.min(0.05, Math.max(0, dt));
    this.t += d;

    if (this.phase === 'out') {
      const u = this.outDur <= 0 ? 1 : Math.min(1, this.t / this.outDur);
      // Ease in cubic
      const e = u * u * u;
      // Letterbox expands first, veil follows
      const bars = Math.min(1, e * 1.35);
      const veil = Math.max(0, (e - 0.15) / 0.85);
      this.setVisual(veil, bars);
      if (u >= 1) {
        this.phase = 'hold';
        this.t = 0;
        this.setVisual(1, 1);
        if (!this.blackFired) {
          this.blackFired = true;
          try {
            this.onBlack?.();
          } catch (err) {
            console.error(err);
          }
        }
      }
      return;
    }

    if (this.phase === 'hold') {
      this.setVisual(1, 1);
      if (!this.blackFired) {
        this.blackFired = true;
        try {
          this.onBlack?.();
        } catch (err) {
          console.error(err);
        }
      }
      if (this.t >= this.holdDur) {
        this.phase = 'in';
        this.t = 0;
      }
      return;
    }

    if (this.phase === 'in') {
      const u = this.inDur <= 0 ? 1 : Math.min(1, this.t / this.inDur);
      // Ease out cubic
      const e = 1 - Math.pow(1 - u, 3);
      // Veil clears first, letterbox retracts slightly later
      const veil = 1 - e;
      const bars = 1 - Math.min(1, e * 1.15);
      this.setVisual(Math.max(0, veil), Math.max(0, bars));
      if (u >= 1) {
        this.phase = 'idle';
        this.t = 0;
        this.setVisual(0, 0);
        this.root.classList.remove('active');
        this.root.style.pointerEvents = 'none';
        try {
          this.onComplete?.();
        } catch (err) {
          console.error(err);
        }
        this.onBlack = null;
        this.onComplete = null;
      }
    }
  }

  /**
   * @param veil 0..1 black opacity
   * @param bars 0..1 letterbox scale (height)
   */
  private setVisual(veil: number, bars: number): void {
    this.veil.style.opacity = String(Math.max(0, Math.min(1, veil)));
    const h = `${(bars * 12).toFixed(2)}%`;
    this.barTop.style.height = h;
    this.barBot.style.height = h;
    this.barTop.style.opacity = bars > 0.01 ? '1' : '0';
    this.barBot.style.opacity = bars > 0.01 ? '1' : '0';
  }

  dispose(): void {
    this.root.remove();
  }
}
