export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  muted = false;
  volume = 0.7;
  private started = false;

  async resume(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startHum();
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  private startHum(): void {
    if (!this.ctx || !this.master) return;
    this.hum = this.ctx.createOscillator();
    this.hum.type = 'sine';
    this.hum.frequency.value = 55;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.03;
    this.hum.connect(this.humGain);
    this.humGain.connect(this.master);
    this.hum.start();
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    gain = 0.08
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  playFire(): void {
    this.beep(880, 0.04, 'square', 0.04);
  }

  playHit(): void {
    this.beep(220 + Math.random() * 80, 0.05, 'triangle', 0.06);
  }

  playDestroy(): void {
    this.beep(140, 0.08, 'sawtooth', 0.07);
    this.beep(320, 0.06, 'square', 0.04);
  }

  playUi(): void {
    this.beep(660, 0.05, 'sine', 0.05);
  }

  playLevelClear(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.15, 'sine', 0.09), i * 100);
    });
  }

  playPurchase(): void {
    this.beep(520, 0.06, 'sine', 0.06);
    this.beep(780, 0.08, 'sine', 0.05);
  }

  dispose(): void {
    try {
      this.hum?.stop();
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}
