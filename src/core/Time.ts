export class Time {
  delta = 0;
  elapsed = 0;
  scale = 1;
  fps = 60;
  private last = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;

  tick(now = performance.now()): number {
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.delta = raw * this.scale;
    this.elapsed += this.delta;
    this.fpsAccum += raw;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    return this.delta;
  }

  /** Snap the frame clock after a pause — do NOT zero elapsed (regen/hit timers use it). */
  reset(): void {
    this.last = performance.now();
    this.delta = 0;
  }
}
