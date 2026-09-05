/**
 * High-fidelity procedural audio for The Cube.
 * Neon / Tron / industrial sci-fi palette — pure Web Audio (no sample packs).
 *
 * Buses: master (compressor) → sfx / ui / ambient
 * Building blocks: multi-osc layers, noise, band-pass sweeps, slapback “space” delay
 */

type OscType = OscillatorType;

export type WeaponFamilySound =
  | 'beam'
  | 'pulse'
  | 'rocket'
  | 'missile'
  | 'rail'
  | 'flak'
  | 'torpedo'
  | string;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private spaceDelay: DelayNode | null = null;
  private spaceFb: GainNode | null = null;
  private spaceFilter: BiquadFilterNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private noiseBufferLo: AudioBuffer | null = null;

  /** Ambient layers */
  private ambientOscs: OscillatorNode[] = [];
  private ambientGains: GainNode[] = [];
  private ambientLfo: OscillatorNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;

  muted = false;
  volume = 0.7;
  private started = false;
  private kamiGain: GainNode | null = null;
  private kamiOsc: OscillatorNode | null = null;
  private kamiOsc2: OscillatorNode | null = null;
  private kamiLfo: OscillatorNode | null = null;
  private kamiFilter: BiquadFilterNode | null = null;
  private kamiNoise: AudioBufferSourceNode | null = null;
  private kamiNoiseGain: GainNode | null = null;
  private kamiIntensity = 0;

  /** Rate limits (seconds since epoch in audio time) */
  private lastFireAt = 0;
  private lastHitAt = 0;
  private lastDestroyAt = 0;
  private lastUiAt = 0;
  private lastHurtAt = 0;
  private lastExplosionAt = 0;

  async resume(): Promise<void> {
    if (!this.ctx) this.buildGraph();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startAmbient();
    }
  }

  /** Stop every SFX/ambient voice immediately (app backgrounded / closed). */
  suspend(): void {
    this.stopKamikazeSeek();
    if (!this.ctx) return;
    if (this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMasterGain();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  // ── Public one-shots ────────────────────────────────────────

  /** Main gun / hardpoint fire. Family shapes the timbre. */
  playFire(family: WeaponFamilySound = 'beam'): void {
    if (!this.ready()) return;
    const t = this.now();
    // Soft rate limit so beam RoF doesn't clip
    const minGap = family === 'beam' || family === 'pulse' ? 0.028 : 0.04;
    if (t - this.lastFireAt < minGap) return;
    this.lastFireAt = t;

    switch (family) {
      case 'rocket':
        this.sfxRocketLaunch(t);
        break;
      case 'missile':
        this.sfxMissileLaunch(t);
        break;
      case 'rail':
        this.sfxRailFire(t);
        break;
      case 'flak':
        this.sfxFlakFire(t);
        break;
      case 'torpedo':
        this.sfxTorpedoLaunch(t);
        break;
      case 'pulse':
        this.sfxPulseFire(t);
        break;
      case 'drone':
        this.sfxDroneZap(t);
        break;
      case 'drone_warn':
        this.sfxDroneWarn(t);
        break;
      case 'beam':
      default:
        this.sfxLaserFire(t);
        break;
    }
  }

  /** Block impact (non-destroy). */
  playHit(crit = false): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastHitAt < 0.018) return;
    this.lastHitAt = t;
    this.sfxEnergyHit(t, crit);
  }

  /** Block destroyed / shatter. */
  playDestroy(heavy = false): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastDestroyAt < 0.022) return;
    this.lastDestroyAt = t;
    this.sfxShatter(t, heavy);
  }

  /**
   * Looping seeker chirp. Intensity 0..1 — rate and pitch climb as they close
   * or as the fuse runs out. 0 fades the voice out.
   */
  setKamikazeSeek(intensity: number): void {
    const v = Math.max(0, Math.min(1, intensity));
    this.kamiIntensity = v;
    if (v <= 0.02 || this.muted) {
      this.stopKamikazeSeek();
      return;
    }
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running' || !this.started) return;
    if (!this.kamiGain) this.startKamikazeSeek();
    if (!this.kamiGain || !this.ctx) return;
    const t = this.now();
    const peak = 0.012 + v * 0.055;
    this.kamiGain.gain.cancelScheduledValues(t);
    this.kamiGain.gain.setTargetAtTime(peak, t, 0.08);
    if (this.kamiOsc) this.kamiOsc.frequency.setTargetAtTime(420 + v * 520, t, 0.1);
    if (this.kamiOsc2) this.kamiOsc2.frequency.setTargetAtTime(640 + v * 780, t, 0.1);
    if (this.kamiLfo) this.kamiLfo.frequency.setTargetAtTime(3.2 + v * 11, t, 0.12);
    if (this.kamiFilter) this.kamiFilter.frequency.setTargetAtTime(900 + v * 2200, t, 0.1);
    if (this.kamiNoiseGain) this.kamiNoiseGain.gain.setTargetAtTime(0.004 + v * 0.03, t, 0.1);
  }

  private startKamikazeSeek(): void {
    if (!this.ctx || !this.sfxBus) return;
    this.stopKamikazeSeek();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 3.4;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 480;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(osc2.frequency);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.value = 0.0001;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc2.start(t);
    lfo.start(t);
    noise.start(t);
    this.kamiGain = gain;
    this.kamiOsc = osc;
    this.kamiOsc2 = osc2;
    this.kamiLfo = lfo;
    this.kamiFilter = filter;
    this.kamiNoise = noise;
    this.kamiNoiseGain = ng;
  }

  private stopKamikazeSeek(): void {
    const t = this.now();
    if (this.kamiGain) {
      try {
        this.kamiGain.gain.cancelScheduledValues(t);
        this.kamiGain.gain.setTargetAtTime(0.0001, t, 0.05);
      } catch {
        /* ignore */
      }
    }
    const stopAt = t + 0.18;
    for (const n of [this.kamiOsc, this.kamiOsc2, this.kamiLfo, this.kamiNoise]) {
      try {
        n?.stop(stopAt);
      } catch {
        /* ignore */
      }
    }
    this.kamiGain = null;
    this.kamiOsc = null;
    this.kamiOsc2 = null;
    this.kamiLfo = null;
    this.kamiFilter = null;
    this.kamiNoise = null;
    this.kamiNoiseGain = null;
    this.kamiIntensity = 0;
  }

  /** Splash / missile / rocket detonation. */
  playExplosion(radius = 2, family?: string): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastExplosionAt < 0.04) return;
    this.lastExplosionAt = t;
    const scale = Math.min(1.6, 0.55 + radius * 0.18);
    if (family === 'torpedo') this.sfxHeavyBoom(t, scale * 1.25);
    else if (family === 'missile') this.sfxMissileBoom(t, scale);
    else this.sfxBoom(t, scale);
  }

  playUi(): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastUiAt < 0.04) return;
    this.lastUiAt = t;
    this.sfxUiClick(t);
  }

  playPurchase(): void {
    if (!this.ready()) return;
    this.sfxPurchase(this.now());
  }

  playLevelClear(): void {
    if (!this.ready()) return;
    this.sfxLevelClear(this.now());
  }

  /** Player shield / hull damage sting. */
  playPlayerHit(): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastHurtAt < 0.08) return;
    this.lastHurtAt = t;
    this.sfxPlayerHurt(t);
  }

  /** Ship destruction cascade. */
  playShipDeath(): void {
    if (!this.ready()) return;
    this.sfxShipDeath(this.now());
  }

  playCrit(): void {
    if (!this.ready()) return;
    this.sfxCritSpark(this.now());
  }

  /** Subtle lattice scramble rumble. */
  playCubeShift(): void {
    if (!this.ready()) return;
    this.sfxCubeShift(this.now());
  }

  // ── Cinematic score / SFX ─────────────────────────────────

  private cineBedOscs: OscillatorNode[] = [];
  private cineBedGains: GainNode[] = [];
  private cineHumGain: GainNode | null = null;
  private cineHumOsc: OscillatorNode | null = null;
  private cineHumNoise: AudioBufferSourceNode | null = null;
  private cineHumFilter: BiquadFilterNode | null = null;
  private cineActive = false;

  /** Low cinematic bed (pads + sub) for the intro. */
  startCinematicBed(): void {
    if (!this.ctx || !this.ambientBus || this.muted) return;
    this.stopCinematicBed();
    this.cineActive = true;
    const t = this.now();
    const mk = (freq: number, type: OscType, peak: number) => {
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 1.8);
      o.connect(g);
      g.connect(this.ambientBus!);
      o.start(t);
      this.cineBedOscs.push(o);
      this.cineBedGains.push(g);
    };
    mk(36.7, 'sine', 0.045); // sub D
    mk(55, 'sine', 0.028);
    mk(73.4, 'triangle', 0.016);
    mk(110, 'sine', 0.01);
    mk(164.8, 'triangle', 0.007);
    // Portal hum channel (driven by setCinematicPortalHum)
    this.cineHumOsc = this.ctx.createOscillator();
    this.cineHumOsc.type = 'sawtooth';
    this.cineHumOsc.frequency.value = 48;
    this.cineHumFilter = this.ctx.createBiquadFilter();
    this.cineHumFilter.type = 'lowpass';
    this.cineHumFilter.frequency.value = 220;
    this.cineHumFilter.Q.value = 2;
    this.cineHumGain = this.ctx.createGain();
    this.cineHumGain.gain.value = 0.0001;
    this.cineHumOsc.connect(this.cineHumFilter);
    this.cineHumFilter.connect(this.cineHumGain);
    this.cineHumGain.connect(this.ambientBus);
    this.cineHumOsc.start(t);

    this.cineHumNoise = this.ctx.createBufferSource();
    this.cineHumNoise.buffer = this.noiseBufferLo;
    this.cineHumNoise.loop = true;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.0001;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 280;
    nf.Q.value = 1.2;
    this.cineHumNoise.connect(nf);
    nf.connect(ng);
    ng.connect(this.ambientBus);
    this.cineHumNoise.start(t);
    // stash noise gain on filter for updates
    (this.cineHumFilter as BiquadFilterNode & { _noiseGain?: GainNode })._noiseGain = ng;
  }

  stopCinematicBed(): void {
    const t = this.now();
    for (const g of this.cineBedGains) {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      } catch {
        /* ignore */
      }
    }
    for (const o of this.cineBedOscs) {
      try {
        o.stop(t + 1);
      } catch {
        /* ignore */
      }
    }
    this.cineBedOscs = [];
    this.cineBedGains = [];
    try {
      this.cineHumOsc?.stop(t + 0.5);
      this.cineHumNoise?.stop(t + 0.5);
    } catch {
      /* ignore */
    }
    this.cineHumOsc = null;
    this.cineHumNoise = null;
    this.cineHumGain = null;
    this.cineHumFilter = null;
    this.cineActive = false;
  }

  /** 0..1 portal intensity — continuous hum under the tear. */
  setCinematicPortalHum(intensity: number): void {
    if (!this.ctx || !this.cineHumGain || this.muted) return;
    const t = this.now();
    const v = Math.max(0, Math.min(1, intensity));
    const peak = 0.0001 + v * 0.055;
    this.cineHumGain.gain.cancelScheduledValues(t);
    this.cineHumGain.gain.setTargetAtTime(peak, t, 0.08);
    if (this.cineHumFilter) {
      this.cineHumFilter.frequency.setTargetAtTime(160 + v * 420, t, 0.1);
      const ng = (this.cineHumFilter as BiquadFilterNode & { _noiseGain?: GainNode })._noiseGain;
      ng?.gain.setTargetAtTime(0.0001 + v * 0.04, t, 0.1);
    }
    if (this.cineHumOsc) {
      this.cineHumOsc.frequency.setTargetAtTime(42 + v * 28, t, 0.12);
    }
  }

  playCinematicPortalOpen(): void {
    if (!this.ready()) return;
    const t = this.now();
    // Rising tear
    this.noiseBurst(0.12, 0.08, 1.1, t, {
      type: 'bandpass',
      freq: 200,
      endFreq: 2400,
      q: 0.7,
      brown: true,
    });
    this.tone(55, 'sawtooth', 0.08, 0.05, 0.9, t, {
      endFreq: 110,
      filter: { type: 'lowpass', freq: 500, q: 1.5 },
    });
    this.tone(110, 'square', 0.04, 0.1, 0.7, t + 0.15, {
      endFreq: 220,
      filter: { type: 'bandpass', freq: 400, q: 2 },
    });
    this.tone(880, 'sine', 0.03, 0.2, 0.5, t + 0.4, { endFreq: 1760 });
  }

  playCinematicBreach(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.sfxHeavyBoom(t, 1.1);
    this.noiseBurst(0.14, 0.01, 0.55, t, {
      type: 'highpass',
      freq: 600,
      endFreq: 2800,
      q: 0.8,
    });
    this.tone(180, 'sawtooth', 0.07, 0.005, 0.35, t, {
      endFreq: 60,
      filter: { type: 'lowpass', freq: 800, q: 1 },
    });
    this.tone(720, 'triangle', 0.05, 0.002, 0.25, t + 0.02, { endFreq: 240 });
    // Seeker-like digital chirps
    for (let i = 0; i < 4; i++) {
      this.tone(400 + i * 180, 'square', 0.03, 0.002, 0.08, t + 0.05 + i * 0.04, {
        endFreq: 900 + i * 100,
        filter: { type: 'bandpass', freq: 1200, q: 4 },
      });
    }
  }

  playCinematicImpact(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(48, 'sine', 0.11, 0.01, 0.55, t, { endFreq: 28 });
    this.noiseBurst(0.08, 0.005, 0.35, t, {
      type: 'lowpass',
      freq: 500,
      endFreq: 100,
      brown: true,
    });
    this.tone(220, 'triangle', 0.04, 0.003, 0.2, t, { endFreq: 80 });
  }

  playCinematicTitle(which: 0 | 1): void {
    if (!this.ready()) return;
    const t = this.now();
    if (which === 0) {
      // Cold cyan hit
      const notes = [261.63, 329.63, 392.0, 523.25];
      notes.forEach((f, i) => {
        this.tone(f, 'sine', 0.06, 0.01, 0.45, t + i * 0.07, {
          filter: { type: 'lowpass', freq: 2800, q: 0.6 },
        });
        this.tone(f * 2.01, 'triangle', 0.02, 0.008, 0.35, t + i * 0.07);
      });
    } else {
      // Magenta urgency
      const notes = [349.23, 415.3, 523.25, 698.46];
      notes.forEach((f, i) => {
        this.tone(f, 'sine', 0.065, 0.01, 0.5, t + i * 0.065, {
          filter: { type: 'lowpass', freq: 3200, q: 0.7 },
        });
        this.tone(f * 1.5, 'triangle', 0.025, 0.008, 0.4, t + i * 0.065);
      });
      this.noiseBurst(0.04, 0.05, 0.5, t + 0.2, {
        type: 'bandpass',
        freq: 900,
        endFreq: 2000,
        q: 0.5,
      });
    }
  }

  playCinematicStinger(kind: 'open' | 'hero' | 'end'): void {
    if (!this.ready()) return;
    const t = this.now();
    if (kind === 'open') {
      this.tone(65, 'sine', 0.06, 0.15, 1.2, t, { endFreq: 40 });
      this.noiseBurst(0.05, 0.2, 1.0, t, {
        type: 'lowpass',
        freq: 300,
        endFreq: 120,
        brown: true,
      });
    } else if (kind === 'hero') {
      this.tone(130.8, 'sawtooth', 0.05, 0.01, 0.35, t, {
        endFreq: 98,
        filter: { type: 'lowpass', freq: 600, q: 1 },
      });
      this.tone(196, 'triangle', 0.04, 0.02, 0.4, t + 0.05);
      this.noiseBurst(0.06, 0.005, 0.2, t, { type: 'highpass', freq: 1500, q: 0.7 });
    } else {
      // End — settle into silence / combat
      this.tone(82, 'sine', 0.05, 0.05, 0.7, t, { endFreq: 55 });
      this.tone(123, 'triangle', 0.03, 0.05, 0.55, t + 0.08, { endFreq: 82 });
    }
  }

  dispose(): void {
    try {
      this.stopKamikazeSeek();
      this.stopCinematicBed();
      for (const o of this.ambientOscs) o.stop();
      this.ambientLfo?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.uiBus = null;
    this.ambientBus = null;
    this.started = false;
    this.ambientOscs = [];
    this.ambientGains = [];
  }

  // ── Graph ───────────────────────────────────────────────────

  private ready(): boolean {
    return !!(
      this.ctx &&
      this.ctx.state === 'running' &&
      this.master &&
      this.sfxBus &&
      !this.muted &&
      this.started
    );
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private applyMasterGain(): void {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private buildGraph(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = 0.7;
    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = 0.55;

    // Lightweight “space” send: filtered delay feedback (not muddy reverb)
    this.spaceDelay = ctx.createDelay(1.0);
    this.spaceDelay.delayTime.value = 0.085;
    this.spaceFb = ctx.createGain();
    this.spaceFb.gain.value = 0.22;
    this.spaceFilter = ctx.createBiquadFilter();
    this.spaceFilter.type = 'highpass';
    this.spaceFilter.frequency.value = 420;
    this.spaceFilter.Q.value = 0.5;
    const spaceOut = ctx.createGain();
    spaceOut.gain.value = 0.28;

    this.spaceDelay.connect(this.spaceFilter);
    this.spaceFilter.connect(this.spaceFb);
    this.spaceFb.connect(this.spaceDelay);
    this.spaceFilter.connect(spaceOut);
    spaceOut.connect(this.compressor);

    this.sfxBus.connect(this.compressor);
    this.sfxBus.connect(this.spaceDelay);
    this.uiBus.connect(this.compressor);
    this.ambientBus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.noiseBuffer = this.makeNoiseBuffer(1.2, false);
    this.noiseBufferLo = this.makeNoiseBuffer(1.2, true);
  }

  private makeNoiseBuffer(seconds: number, brownish: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brownish) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buf;
  }

  private startAmbient(): void {
    if (!this.ctx || !this.ambientBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Deep sub drone
    this.spawnAmbientOsc(48, 'sine', 0.035, t);
    // Hollow fifth
    this.spawnAmbientOsc(72, 'triangle', 0.012, t);
    // High thin air (barely there)
    this.spawnAmbientOsc(312, 'sine', 0.004, t);
    // Slight detuned cyan shimmer
    this.spawnAmbientOsc(311.5, 'sine', 0.0035, t);

    // Slow filter breathe on a noise bed
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBufferLo;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.018;
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = 'bandpass';
    this.ambientFilter.frequency.value = 180;
    this.ambientFilter.Q.value = 0.8;
    this.ambientLfo = ctx.createOscillator();
    this.ambientLfo.type = 'sine';
    this.ambientLfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    this.ambientLfo.connect(lfoGain);
    lfoGain.connect(this.ambientFilter.frequency);
    noise.connect(this.ambientFilter);
    this.ambientFilter.connect(ng);
    ng.connect(this.ambientBus);
    noise.start(t);
    this.ambientLfo.start(t);
  }

  private spawnAmbientOsc(freq: number, type: OscType, gain: number, t: number): void {
    if (!this.ctx || !this.ambientBus) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 2.5);
    osc.connect(g);
    g.connect(this.ambientBus);
    osc.start(t);
    this.ambientOscs.push(osc);
    this.ambientGains.push(g);
  }

  // ── Synth primitives ────────────────────────────────────────

  private envGain(
    peak: number,
    attack: number,
    decay: number,
    t: number,
    bus: GainNode = this.sfxBus!
  ): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.004, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(bus);
    return g;
  }

  private tone(
    freq: number,
    type: OscType,
    peak: number,
    attack: number,
    decay: number,
    t: number,
    opts: {
      endFreq?: number;
      detune?: number;
      bus?: GainNode;
      filter?: { type: BiquadFilterType; freq: number; q?: number };
    } = {}
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (opts.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + attack + decay);
    }
    if (opts.detune) osc.detune.value = opts.detune;

    const g = this.envGain(peak, attack, decay, t, opts.bus ?? this.sfxBus!);
    if (opts.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.frequency.value = opts.filter.freq;
      f.Q.value = opts.filter.q ?? 1;
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  private noiseBurst(
    peak: number,
    attack: number,
    decay: number,
    t: number,
    opts: {
      type?: BiquadFilterType;
      freq?: number;
      q?: number;
      endFreq?: number;
      brown?: boolean;
      bus?: GainNode;
    } = {}
  ): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = opts.brown ? this.noiseBufferLo : this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    f.Q.value = opts.q ?? 1.2;
    if (opts.endFreq !== undefined) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.endFreq), t + attack + decay);
    }
    const g = this.envGain(peak, attack, decay, t, opts.bus ?? this.sfxBus!);
    src.connect(f);
    f.connect(g);
    src.start(t);
    src.stop(t + attack + decay + 0.05);
  }

  // ── SFX designs ─────────────────────────────────────────────

  /** Neon laser zip — bright, short, digital. */
  private sfxLaserFire(t: number): void {
    const f0 = 1480 + Math.random() * 220;
    this.tone(f0, 'square', 0.045, 0.002, 0.055, t, {
      endFreq: f0 * 0.35,
      filter: { type: 'bandpass', freq: 2200, q: 2.5 },
    });
    this.tone(f0 * 1.5, 'sawtooth', 0.018, 0.001, 0.04, t, {
      endFreq: f0 * 0.5,
      filter: { type: 'highpass', freq: 900, q: 0.7 },
    });
    this.noiseBurst(0.03, 0.001, 0.03, t, {
      type: 'highpass',
      freq: 2800,
      q: 0.6,
    });
  }

  /** Hostile drone bolt — thin zap sting. */
  private sfxDroneZap(t: number): void {
    const f0 = 1480 + Math.random() * 220;
    this.tone(f0, 'square', 0.045, 0.001, 0.07, t, {
      endFreq: f0 * 0.45,
      filter: { type: 'highpass', freq: 700, q: 0.8 },
    });
    this.tone(f0 * 0.5, 'sawtooth', 0.03, 0.001, 0.06, t, {
      endFreq: 180,
      filter: { type: 'bandpass', freq: 900, q: 1.4 },
    });
    this.noiseBurst(0.025, 0.001, 0.04, t, {
      type: 'highpass',
      freq: 2400,
      q: 0.7,
    });
  }

  /** Telegraph chirp before a drone bolt. */
  private sfxDroneWarn(t: number): void {
    const f0 = 620 + Math.random() * 80;
    this.tone(f0, 'triangle', 0.035, 0.02, 0.16, t, {
      endFreq: f0 * 1.85,
      filter: { type: 'bandpass', freq: 1400, q: 1.1 },
    });
    this.tone(f0 * 2, 'sine', 0.02, 0.04, 0.12, t, {
      endFreq: f0 * 3.1,
    });
  }

  /** Softer continuous beam pulse (arc). */
  private sfxPulseFire(t: number): void {
    const f0 = 920 + Math.random() * 140;
    this.tone(f0, 'sine', 0.05, 0.004, 0.09, t, {
      endFreq: f0 * 0.55,
      filter: { type: 'lowpass', freq: 2400, q: 0.8 },
    });
    this.tone(f0 * 2.02, 'triangle', 0.02, 0.003, 0.07, t, {
      endFreq: f0 * 0.9,
    });
  }

  /** Railgun — charge crack + sub thump. */
  private sfxRailFire(t: number): void {
    this.noiseBurst(0.08, 0.001, 0.05, t, {
      type: 'bandpass',
      freq: 4500,
      endFreq: 800,
      q: 3,
    });
    this.tone(90, 'sawtooth', 0.07, 0.002, 0.12, t, {
      endFreq: 40,
      filter: { type: 'lowpass', freq: 280, q: 1 },
    });
    this.tone(1800, 'square', 0.035, 0.001, 0.04, t, {
      endFreq: 400,
      filter: { type: 'highpass', freq: 600, q: 0.7 },
    });
  }

  /** Rocket whoosh. */
  private sfxRocketLaunch(t: number): void {
    this.noiseBurst(0.07, 0.01, 0.22, t, {
      type: 'bandpass',
      freq: 400,
      endFreq: 1800,
      q: 0.9,
      brown: true,
    });
    this.tone(110, 'sawtooth', 0.04, 0.02, 0.2, t, {
      endFreq: 55,
      filter: { type: 'lowpass', freq: 400, q: 0.8 },
    });
  }

  /** Missile side-rack — two-tone seeker chirp. */
  private sfxMissileLaunch(t: number): void {
    this.tone(640, 'square', 0.04, 0.005, 0.1, t, {
      endFreq: 980,
      filter: { type: 'bandpass', freq: 1400, q: 4 },
    });
    this.tone(420, 'triangle', 0.03, 0.01, 0.14, t + 0.02, {
      endFreq: 700,
    });
    this.noiseBurst(0.04, 0.005, 0.12, t, {
      type: 'highpass',
      freq: 1200,
      endFreq: 3000,
      q: 0.7,
    });
  }

  /** Flak scatter burst. */
  private sfxFlakFire(t: number): void {
    for (let i = 0; i < 3; i++) {
      const dt = i * 0.012;
      this.noiseBurst(0.05, 0.001, 0.04, t + dt, {
        type: 'bandpass',
        freq: 1800 + i * 500 + Math.random() * 200,
        endFreq: 600,
        q: 2,
      });
    }
    this.tone(160, 'triangle', 0.03, 0.002, 0.06, t, { endFreq: 80 });
  }

  /** Torpedo heavy launch. */
  private sfxTorpedoLaunch(t: number): void {
    this.tone(70, 'sine', 0.09, 0.03, 0.35, t, {
      endFreq: 42,
      filter: { type: 'lowpass', freq: 200, q: 1 },
    });
    this.noiseBurst(0.06, 0.02, 0.28, t, {
      type: 'lowpass',
      freq: 500,
      endFreq: 200,
      brown: true,
      q: 0.6,
    });
    this.tone(220, 'sawtooth', 0.03, 0.01, 0.15, t, {
      endFreq: 90,
      filter: { type: 'lowpass', freq: 600, q: 1 },
    });
  }

  /** Energy impact on block surface. */
  private sfxEnergyHit(t: number, crit: boolean): void {
    const peak = crit ? 0.07 : 0.045;
    this.noiseBurst(peak, 0.001, crit ? 0.07 : 0.045, t, {
      type: 'bandpass',
      freq: crit ? 2400 : 1600,
      endFreq: 500,
      q: crit ? 3 : 1.8,
    });
    this.tone(crit ? 880 : 520, 'triangle', peak * 0.7, 0.002, 0.06, t, {
      endFreq: crit ? 220 : 180,
    });
    if (crit) this.sfxCritSpark(t);
  }

  /** Digital shatter when a block dies. */
  private sfxShatter(t: number, heavy: boolean): void {
    const peak = heavy ? 0.1 : 0.065;
    this.noiseBurst(peak, 0.002, heavy ? 0.16 : 0.1, t, {
      type: 'bandpass',
      freq: 2200,
      endFreq: 180,
      q: 1.4,
    });
    this.tone(heavy ? 160 : 210, 'sawtooth', peak * 0.55, 0.003, heavy ? 0.14 : 0.09, t, {
      endFreq: 55,
      filter: { type: 'lowpass', freq: 900, q: 0.9 },
    });
    // Glass-like high ping
    this.tone(2400 + Math.random() * 400, 'sine', 0.025, 0.001, 0.08, t, {
      endFreq: 900,
    });
  }

  private sfxBoom(t: number, scale: number): void {
    this.noiseBurst(0.12 * scale, 0.004, 0.28 * scale, t, {
      type: 'lowpass',
      freq: 900,
      endFreq: 120,
      brown: true,
      q: 0.7,
    });
    this.tone(70 / scale, 'sine', 0.12 * scale, 0.005, 0.35 * scale, t, {
      endFreq: 32,
    });
    this.tone(180, 'triangle', 0.05 * scale, 0.003, 0.15 * scale, t, {
      endFreq: 60,
    });
  }

  private sfxMissileBoom(t: number, scale: number): void {
    this.sfxBoom(t, scale * 0.9);
    this.noiseBurst(0.06 * scale, 0.002, 0.12, t, {
      type: 'highpass',
      freq: 2000,
      endFreq: 600,
      q: 1,
    });
  }

  private sfxHeavyBoom(t: number, scale: number): void {
    this.sfxBoom(t, scale * 1.15);
    this.tone(48, 'sine', 0.14 * scale, 0.01, 0.5 * scale, t, { endFreq: 28 });
  }

  private sfxUiClick(t: number): void {
    if (!this.uiBus) return;
    this.tone(920, 'sine', 0.04, 0.002, 0.05, t, {
      endFreq: 1400,
      bus: this.uiBus,
    });
    this.tone(1380, 'triangle', 0.02, 0.001, 0.04, t + 0.015, {
      bus: this.uiBus,
    });
  }

  private sfxPurchase(t: number): void {
    if (!this.uiBus) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.tone(f, 'sine', 0.05, 0.004, 0.14, t + i * 0.055, {
        bus: this.uiBus!,
        filter: { type: 'lowpass', freq: 3200, q: 0.7 },
      });
      this.tone(f * 2, 'triangle', 0.015, 0.003, 0.1, t + i * 0.055, {
        bus: this.uiBus!,
      });
    });
  }

  private sfxLevelClear(t: number): void {
    // Rising neon fanfare — C minor-ish cyber chords
    const chordA = [261.63, 311.13, 392.0];
    const chordB = [293.66, 349.23, 440.0];
    const chordC = [349.23, 415.3, 523.25, 659.25];
    const playChord = (freqs: number[], at: number, peak: number, dur: number) => {
      for (const f of freqs) {
        this.tone(f, 'sine', peak, 0.02, dur, at, {
          filter: { type: 'lowpass', freq: 2800, q: 0.6 },
        });
        this.tone(f * 2.005, 'triangle', peak * 0.35, 0.02, dur * 0.9, at);
      }
    };
    playChord(chordA, t, 0.055, 0.35);
    playChord(chordB, t + 0.22, 0.06, 0.35);
    playChord(chordC, t + 0.48, 0.08, 0.7);
    this.noiseBurst(0.04, 0.05, 0.6, t + 0.48, {
      type: 'bandpass',
      freq: 800,
      endFreq: 2400,
      q: 0.5,
    });
  }

  private sfxPlayerHurt(t: number): void {
    this.noiseBurst(0.08, 0.002, 0.12, t, {
      type: 'bandpass',
      freq: 500,
      endFreq: 200,
      q: 2,
      brown: true,
    });
    this.tone(180, 'sawtooth', 0.07, 0.003, 0.14, t, {
      endFreq: 70,
      filter: { type: 'lowpass', freq: 700, q: 1.2 },
    });
    this.tone(90, 'square', 0.04, 0.002, 0.1, t, {
      endFreq: 45,
      filter: { type: 'lowpass', freq: 300, q: 1 },
    });
  }

  private sfxShipDeath(t: number): void {
    // Cascading failure
    this.sfxHeavyBoom(t, 1.2);
    this.noiseBurst(0.14, 0.01, 0.8, t, {
      type: 'lowpass',
      freq: 1200,
      endFreq: 80,
      brown: true,
      q: 0.5,
    });
    for (let i = 0; i < 5; i++) {
      this.tone(400 - i * 55, 'sawtooth', 0.05, 0.01, 0.2, t + 0.08 + i * 0.09, {
        endFreq: 60,
        filter: { type: 'lowpass', freq: 900 - i * 100, q: 1 },
      });
      this.noiseBurst(0.05, 0.005, 0.15, t + 0.1 + i * 0.1, {
        type: 'bandpass',
        freq: 1500 - i * 200,
        endFreq: 300,
        q: 1.5,
      });
    }
    // Final sub death
    this.tone(55, 'sine', 0.12, 0.05, 1.1, t + 0.35, { endFreq: 22 });
  }

  private sfxCritSpark(t: number): void {
    this.tone(1760, 'sine', 0.04, 0.001, 0.08, t, { endFreq: 3200 });
    this.tone(2340, 'triangle', 0.025, 0.001, 0.06, t + 0.01, { endFreq: 2800 });
    this.noiseBurst(0.025, 0.001, 0.04, t, {
      type: 'highpass',
      freq: 4000,
      q: 0.8,
    });
  }

  private sfxCubeShift(t: number): void {
    this.tone(90, 'triangle', 0.03, 0.02, 0.25, t, {
      endFreq: 70,
      filter: { type: 'lowpass', freq: 300, q: 1 },
    });
    this.noiseBurst(0.025, 0.03, 0.2, t, {
      type: 'bandpass',
      freq: 200,
      endFreq: 140,
      brown: true,
      q: 1.2,
    });
  }
}
