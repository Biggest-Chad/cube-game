/**
 * WAVE13 playfeel hooks — thrust meter + flyer event feedback + cube→flyer transition.
 * Visual HUD wiring may be owned by a parallel agent; this module ships the runtime contract.
 */
export type FlyerPlayfeelEvent =
  | 'pickup'
  | 'hit'
  | 'boost'
  | 'fail'
  | 'transition_start'
  | 'transition_go';

export type FlyerObjectKind = 'good' | 'bad' | 'neutral';

export interface FlyerPlayfeelState {
  thrust: number;
  transitionCountdown: number;
  inTransition: boolean;
  lastEvent: FlyerPlayfeelEvent | null;
  lastEventAt: number;
}

const THRUST_BASE = 100;
const THRUST_MIN = 40;
const THRUST_MAX = 160;
const RECOVER_PER_SEC = 28;

export class FlyerPlayfeel {
  readonly state: FlyerPlayfeelState = {
    thrust: THRUST_BASE,
    transitionCountdown: 0,
    inTransition: false,
    lastEvent: null,
    lastEventAt: 0,
  };

  onEvent: ((ev: FlyerPlayfeelEvent, detail?: Record<string, unknown>) => void) | null = null;

  beginTransition(countdownSec = 3): void {
    this.state.inTransition = true;
    this.state.transitionCountdown = Math.max(0.5, countdownSec);
    this.emit('transition_start', { countdown: this.state.transitionCountdown });
  }

  static markObject(kind: FlyerObjectKind, explain: string): { kind: FlyerObjectKind; explain: string } {
    return { kind, explain };
  }

  applyBoost(amount = 18): void {
    this.state.thrust = Math.min(THRUST_MAX, this.state.thrust + amount);
    this.emit('boost', { thrust: this.state.thrust, amount });
  }

  applyFail(amount = 22): void {
    this.state.thrust = Math.max(THRUST_MIN, this.state.thrust - amount);
    this.emit('fail', { thrust: this.state.thrust, amount });
  }

  applyPickup(): void {
    this.emit('pickup', { thrust: this.state.thrust });
  }

  applyHit(): void {
    this.emit('hit', { thrust: this.state.thrust });
  }

  update(dt: number): void {
    if (this.state.inTransition) {
      this.state.transitionCountdown = Math.max(0, this.state.transitionCountdown - dt);
      if (this.state.transitionCountdown <= 0) {
        this.state.inTransition = false;
        this.emit('transition_go', { thrust: this.state.thrust });
      }
    }
    const t = this.state.thrust;
    if (Math.abs(t - THRUST_BASE) < 0.15) {
      this.state.thrust = THRUST_BASE;
      return;
    }
    const dir = t > THRUST_BASE ? -1 : 1;
    this.state.thrust = t + dir * RECOVER_PER_SEC * dt;
    if ((dir < 0 && this.state.thrust < THRUST_BASE) || (dir > 0 && this.state.thrust > THRUST_BASE)) {
      this.state.thrust = THRUST_BASE;
    }
  }

  private emit(ev: FlyerPlayfeelEvent, detail?: Record<string, unknown>): void {
    this.state.lastEvent = ev;
    this.state.lastEventAt = performance.now();
    this.onEvent?.(ev, detail);
  }
}

export const flyerPlayfeel = new FlyerPlayfeel();
