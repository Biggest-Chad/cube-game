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
  private kamiTimer: ReturnType<typeof setTimeout> | null = null;

  /** Low pulsing drone while a pulse weapon is held. */
  private pulseGain: GainNode | null = null;
  private pulseNodes: AudioNode[] = [];
  private pulseLfo: OscillatorNode | null = null;
  private lastPulseAt = -1;

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
    this.stopPulseDrone();
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
    // Pulse is a held drone, not a one-shot, so it must not share the shot limiter.
    if (family === 'pulse') {
      this.sfxPulseFire(t);
      return;
    }
    const minGap = family === 'beam' ? 0.06 : 0.04;
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
    if (this.kamiTimer == null) this.kamiBeep();
  }

  /** Discrete square beeps that get faster and higher as the seeker closes. */
  private kamiBeep(): void {
    this.kamiTimer = null;
    if (this.kamiIntensity <= 0.02 || this.muted || !this.ready()) return;
    const t = this.now();
    const v = this.kamiIntensity;
    const f = 480 + v * 920;
    this.tone(f, 'square', 0.016 + v * 0.026, 0.004, 0.04, t, {
      endFreq: f * 1.25,
      filter: { type: 'bandpass', freq: 900 + v * 900, q: 2.2 },
    });
    const gap = Math.max(0.05, 0.24 - v * 0.18);
    this.kamiTimer = setTimeout(() => this.kamiBeep(), gap * 1000);
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
    if (this.kamiTimer != null) {
      clearTimeout(this.kamiTimer);
      this.kamiTimer = null;
    }
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

  /** Shield fizz or hull clang, depending on what actually took the hit. */
  playPlayerHit(where: 'shield' | 'hull' = 'hull'): void {
    if (!this.ready()) return;
    const t = this.now();
    if (t - this.lastHurtAt < 0.08) return;
    this.lastHurtAt = t;
    if (where === 'shield') this.sfxShieldFizz(t);
    else this.sfxHullClang(t);
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

  /** Transit boost pad — two tones racing upward. */
  playFlyerBoost(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(520, 'triangle', 0.05, 0.004, 0.18, t, { endFreq: 1100, bus: this.uiBus! });
    this.tone(780, 'sine', 0.028, 0.008, 0.16, t + 0.03, { endFreq: 1600, bus: this.uiBus! });
  }

  /** Object hit (down saw) or wall scrape (metal). */
  playFlyerHazard(kind: 'hit' | 'scrape' = 'hit'): void {
    if (!this.ready()) return;
    const t = this.now();
    if (kind === 'scrape') {
      this.noiseBurst(0.05, 0.01, 0.16, t, { type: 'bandpass', freq: 1200, endFreq: 400, q: 0.8 });
      this.tone(300, 'triangle', 0.03, 0.004, 0.14, t, { endFreq: 140 });
      return;
    }
    this.tone(220, 'sawtooth', 0.06, 0.003, 0.2, t, { endFreq: 60, filter: { type: 'lowpass', freq: 700, q: 0.8 } });
    this.tone(100, 'sine', 0.04, 0.004, 0.16, t, { endFreq: 42 });
  }

  /** Transit gate cleared (lock kill). Two-tone rise. */
  playFlyerGate(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(660, 'square', 0.04, 0.003, 0.09, t, { endFreq: 1040, bus: this.uiBus! });
    this.tone(440, 'triangle', 0.028, 0.01, 0.14, t + 0.05, { endFreq: 880, bus: this.uiBus! });
  }

  /** Dry-blip countdown (3/2/1) or the matching launch sting (0). */
  playFlyerCountdown(n: number): void {
    if (!this.ready()) return;
    const t = this.now();
    const bus = this.uiBus!;
    if (n <= 0) {
      this.tone(420, 'square', 0.05, 0.004, 0.18, t, { endFreq: 700, bus });
      this.tone(540, 'triangle', 0.03, 0.01, 0.2, t + 0.05, { endFreq: 980, bus });
      return;
    }
    const f = n >= 3 ? 420 : n === 2 ? 540 : 700;
    this.tone(f, 'square', 0.042, 0.002, 0.08, t, { bus });
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
    // Uneasy minor: a low second that barely moves.
    mk(49, 'sine', 0.032);
    mk(52, 'sine', 0.022);
    mk(73.4, 'triangle', 0.012);
    // Portal hum channel (driven by setCinematicPortalHum)
    this.cineHumOsc = this.ctx.createOscillator();
    this.cineHumOsc.type = 'sine';
    this.cineHumOsc.frequency.value = 55;
    const fifth = this.ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = 82.5;
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.55;
    this.cineHumFilter = this.ctx.createBiquadFilter();
    this.cineHumFilter.type = 'lowpass';
    this.cineHumFilter.frequency.value = 220;
    this.cineHumFilter.Q.value = 2;
    this.cineHumGain = this.ctx.createGain();
    this.cineHumGain.gain.value = 0.0001;
    this.cineHumOsc.connect(this.cineHumFilter);
    fifth.connect(fifthGain);
    fifthGain.connect(this.cineHumFilter);
    fifth.start(t);
    this.cineBedOscs.push(fifth);
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
      this.cineHumFilter.frequency.setTargetAtTime(240 + v * 60, t, 0.1);
      const ng = (this.cineHumFilter as BiquadFilterNode & { _noiseGain?: GainNode })._noiseGain;
      ng?.gain.setTargetAtTime(0.0001 + v * 0.006, t, 0.1);
    }
    if (this.cineHumOsc) {
      this.cineHumOsc.frequency.setTargetAtTime(55 + v * 1.5, t, 0.2);
    }
  }

  playCinematicPortalOpen(): void {
    if (!this.ready()) return;
    const t = this.now();
    // Slow vacuum: air leaving, a low tone sinking with it.
    this.noiseBurst(0.07, 0.08, 1.0, t, { type: 'lowpass', freq: 700, endFreq: 140, brown: true, q: 0.5 });
    this.tone(90, 'sine', 0.055, 0.1, 0.95, t, { endFreq: 38 });
  }

  playCinematicBreach(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(1800, 'sine', 0.04, 0.002, 0.11, t, { endFreq: 400 });
    this.noiseBurst(0.045, 0.002, 0.1, t, { type: 'highpass', freq: 2500, endFreq: 600, q: 0.6 });
    this.tone(60, 'sine', 0.09, 0.01, 0.34, t + 0.06, { endFreq: 28 });
  }

  playCinematicImpact(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.noiseBurst(0.05, 0.03, 0.48, t, { type: 'lowpass', freq: 280, endFreq: 70, brown: true, q: 0.45 });
    this.tone(55, 'sine', 0.055, 0.02, 0.48, t, { endFreq: 30 });
  }

  playCinematicTitle(which: 0 | 1): void {
    if (!this.ready()) return;
    const t = this.now();
    if (which === 0) {
      this.tone(523, 'triangle', 0.055, 0.004, 0.18, t);
      this.tone(1046, 'sine', 0.022, 0.004, 0.16, t);
    } else {
      this.tone(349, 'sawtooth', 0.045, 0.004, 0.18, t, {
        endFreq: 320,
        filter: { type: 'lowpass', freq: 1100, q: 0.6 },
      });
      this.tone(523, 'sawtooth', 0.028, 0.004, 0.18, t, {
        endFreq: 480,
        filter: { type: 'lowpass', freq: 1300, q: 0.5 },
      });
    }
  }

  playCinematicStinger(kind: 'open' | 'hero' | 'end'): void {
    if (!this.ready()) return;
    const t = this.now();
    if (kind === 'open') {
      this.tone(65, 'sine', 0.055, 0.06, 1.0, t, { endFreq: 40 });
      this.noiseBurst(0.035, 0.08, 0.8, t, { type: 'lowpass', freq: 260, endFreq: 90, brown: true, q: 0.45 });
    } else if (kind === 'hero') {
      // Engine catch, pushed further: longer burn, a second stage, a high flare.
      this.tone(72, 'sawtooth', 0.07, 0.02, 0.55, t, {
        endFreq: 190,
        filter: { type: 'lowpass', freq: 640, q: 0.7 },
      });
      this.noiseBurst(0.07, 0.02, 0.48, t, { type: 'bandpass', freq: 280, endFreq: 1500, brown: true, q: 0.55 });
      this.tone(140, 'sawtooth', 0.04, 0.04, 0.5, t + 0.1, {
        endFreq: 300,
        filter: { type: 'lowpass', freq: 900, q: 0.6 },
      });
      this.tone(480, 'sine', 0.028, 0.05, 0.4, t + 0.16, { endFreq: 920 });
    } else {
      this.tone(110, 'sine', 0.045, 0.04, 0.4, t, { endFreq: 220 });
    }
  }

  dispose(): void {
    try {
      this.stopKamikazeSeek();
      this.stopPulseDrone();
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

    // Quiet machine hum: two low partials with a slow pitch wander.
    this.spawnAmbientOsc(60, 'triangle', 0.01, t);
    this.spawnAmbientOsc(120, 'triangle', 0.005, t);

    const pitchLfo = ctx.createOscillator();
    pitchLfo.type = 'sine';
    pitchLfo.frequency.value = 0.13;
    const pitchAmt = ctx.createGain();
    pitchAmt.gain.value = 1.1;
    pitchLfo.connect(pitchAmt);
    for (const osc of this.ambientOscs) pitchAmt.connect(osc.frequency);
    this.ambientLfo = pitchLfo;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBufferLo;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.005;
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 220;
    this.ambientFilter.Q.value = 0.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 18;
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
    let filter: BiquadFilterNode | null = null;
    if (opts.filter) {
      filter = this.ctx.createBiquadFilter();
      filter.type = opts.filter.type;
      filter.frequency.value = opts.filter.freq;
      filter.Q.value = opts.filter.q ?? 1;
      osc.connect(filter);
      filter.connect(g);
    } else {
      osc.connect(g);
    }
    osc.start(t);
    const end = t + attack + decay + 0.05;
    osc.stop(end);
    osc.onended = () => {
      try {
        osc.disconnect();
        filter?.disconnect();
        g.disconnect();
      } catch {
        /* already torn down */
      }
    };
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
    const end = t + attack + decay + 0.05;
    src.stop(end);
    src.onended = () => {
      try {
        src.disconnect();
        f.disconnect();
        g.disconnect();
      } catch {
        /* already torn down */
      }
    };
  }

  // ── SFX designs ─────────────────────────────────────────────

  /** Random mix of a falling ion zip and a twin bolt. */
  private sfxLaserFire(t: number): void {
    if (Math.random() < 0.5) {
      this.tone(2100, 'square', 0.048, 0.002, 0.1, t, {
        endFreq: 640,
        filter: { type: 'bandpass', freq: 1800, q: 1.1 },
      });
      this.tone(3000, 'sine', 0.016, 0.001, 0.05, t, { endFreq: 980 });
      this.noiseBurst(0.012, 0.001, 0.028, t, { type: 'highpass', freq: 4200, endFreq: 1600, q: 0.6 });
      return;
    }
    this.tone(1860, 'square', 0.042, 0.001, 0.04, t, { endFreq: 900 });
    this.tone(2100, 'square', 0.038, 0.001, 0.04, t + 0.055, { endFreq: 1000 });
  }

  /** Two tiny bites. Clearly not the player's gun. */
  private sfxDroneZap(t: number): void {
    this.tone(1700, 'square', 0.036, 0.001, 0.028, t, { endFreq: 1200 });
    this.tone(1900, 'square', 0.03, 0.001, 0.028, t + 0.045, { endFreq: 1300 });
  }

  /** Quiet rising chirp before a drone bolt. */
  private sfxDroneWarn(t: number): void {
    this.tone(620, 'triangle', 0.016, 0.02, 0.15, t, {
      endFreq: 1400,
      filter: { type: 'bandpass', freq: 1100, q: 0.7 },
    });
  }

  /** Held low drone that pulses while the pulse weapon is firing. */
  private sfxPulseFire(t: number): void {
    this.touchPulseDrone(t);
  }

  private touchPulseDrone(t: number): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.pulseGain) this.startPulseDrone(t);
    const gap = this.lastPulseAt >= 0 ? t - this.lastPulseAt : 1;
    this.lastPulseAt = t;
    if (this.pulseLfo && gap > 0.012 && gap < 0.4) {
      const hz = Math.min(24, Math.max(6.2, 1 / gap));
      this.pulseLfo.frequency.setTargetAtTime(hz, t, 0.08);
    }
    const g = this.pulseGain;
    if (!g) return;
    g.gain.cancelScheduledValues(t);
    const cur = Math.max(0.0001, g.gain.value);
    g.gain.setValueAtTime(cur, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.04);
    g.gain.setValueAtTime(0.05, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  }

  private startPulseDrone(t: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.2;
    this.pulseLfo = lfo;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.28;
    lfo.connect(lfoAmt);
    lfoAmt.connect(trem.gain);
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 48;
    const mid = ctx.createOscillator();
    mid.type = 'triangle';
    mid.frequency.value = 72;
    const midGain = ctx.createGain();
    midGain.gain.value = 0.28;
    low.connect(filter);
    mid.connect(midGain);
    midGain.connect(filter);
    filter.connect(trem);
    trem.connect(gain);
    gain.connect(this.sfxBus);
    low.start(t);
    mid.start(t);
    lfo.start(t);
    this.pulseGain = gain;
    this.pulseNodes = [low, mid, lfo];
  }

  private stopPulseDrone(): void {
    const t = this.now();
    try {
      this.pulseGain?.gain.cancelScheduledValues(t);
      this.pulseGain?.gain.setTargetAtTime(0.0001, t, 0.05);
    } catch { /* ignore */ }
    for (const n of this.pulseNodes) {
      try { (n as OscillatorNode).stop(t + 0.2); } catch { /* ignore */ }
    }
    this.pulseGain = null;
    this.pulseNodes = [];
    this.pulseLfo = null;
  }

  /** Bright crack, then the low body of the slug. */
  private sfxRailFire(t: number): void {
    this.noiseBurst(0.055, 0.001, 0.045, t, { type: 'highpass', freq: 4200, endFreq: 900, q: 0.7 });
    this.tone(90, 'sine', 0.08, 0.004, 0.16, t, { endFreq: 38 });
    this.tone(1800, 'square', 0.022, 0.001, 0.045, t, { endFreq: 400 });
  }

  /** Two ignition stutters, then the burn catches. */
  private sfxRocketLaunch(t: number): void {
    this.noiseBurst(0.04, 0.001, 0.035, t, { type: 'lowpass', freq: 500, endFreq: 280, brown: true, q: 0.7 });
    this.noiseBurst(0.035, 0.001, 0.035, t + 0.06, { type: 'lowpass', freq: 620, endFreq: 300, brown: true, q: 0.7 });
    this.noiseBurst(0.065, 0.012, 0.2, t + 0.12, { type: 'bandpass', freq: 400, endFreq: 1600, brown: true, q: 0.8 });
    this.tone(110, 'sawtooth', 0.032, 0.02, 0.18, t + 0.12, {
      endFreq: 58,
      filter: { type: 'lowpass', freq: 380, q: 0.7 },
    });
  }

  /** Quiet acknowledgment beep, then a short whoosh. */
  private sfxMissileLaunch(t: number): void {
    this.tone(880, 'square', 0.02, 0.002, 0.05, t, { filter: { type: 'bandpass', freq: 1400, q: 1.6 } });
    this.noiseBurst(0.026, 0.012, 0.12, t + 0.07, { type: 'bandpass', freq: 600, endFreq: 1800, brown: true, q: 0.7 });
  }

  /** Three little pops in a tight cluster. */
  private sfxFlakFire(t: number): void {
    const pops = [1600, 2100, 2700];
    pops.forEach((f, i) => {
      this.noiseBurst(0.045, 0.001, 0.035, t + i * 0.02, { type: 'bandpass', freq: f, endFreq: 500 + i * 80, q: 1.6 });
    });
    this.tone(160, 'triangle', 0.028, 0.002, 0.07, t, { endFreq: 70 });
  }

  /** Deep tone sinking under a wash of low air. */
  private sfxTorpedoLaunch(t: number): void {
    this.tone(74, 'sine', 0.08, 0.03, 0.38, t, { endFreq: 40 });
    this.noiseBurst(0.05, 0.02, 0.32, t, { type: 'lowpass', freq: 420, endFreq: 140, brown: true, q: 0.6 });
  }

  /** Quiet low thunk. Pitch wanders so rapid hits don't machine-gun. */
  private sfxEnergyHit(t: number, crit: boolean): void {
    if (crit) {
      const f = 120 + Math.random() * 36;
      this.tone(f, 'sine', 0.03, 0.003, 0.1, t, { endFreq: f * 0.45 });
      this.tone(1400 + Math.random() * 360, 'triangle', 0.016, 0.001, 0.06, t, { endFreq: 700 });
      return;
    }
    const f = 130 + Math.random() * 55;
    this.tone(f, 'sine', 0.028, 0.003, 0.09, t, { endFreq: f * 0.42 });
    this.noiseBurst(0.012, 0.002, 0.05, t, { type: 'lowpass', freq: 280, endFreq: 110, brown: true, q: 0.6 });
  }

  /** Gravel for a normal break, deep glass for armor. Both kept quiet. */
  private sfxShatter(t: number, heavy: boolean): void {
    if (heavy) {
      this.tone(640, 'sine', 0.022, 0.002, 0.13, t, { endFreq: 170 });
      this.noiseBurst(0.018, 0.002, 0.11, t, { type: 'bandpass', freq: 1100, endFreq: 180, q: 0.7 });
      this.tone(130, 'sine', 0.02, 0.004, 0.13, t, { endFreq: 48 });
      return;
    }
    const f = 80 + Math.random() * 70;
    this.noiseBurst(0.028, 0.002, 0.11, t, { type: 'lowpass', freq: 700, endFreq: 160, brown: true, q: 0.6 });
    this.tone(f, 'sine', 0.018, 0.003, 0.09, t, { endFreq: Math.max(36, f * 0.4) });
  }

  private sfxBoom(t: number, scale: number): void {
    const f = 64 + Math.random() * 22;
    this.noiseBurst(0.11 * scale, 0.004, 0.28 * scale, t, {
      type: 'lowpass',
      freq: 900,
      endFreq: 120,
      brown: true,
      q: 0.7,
    });
    this.tone(f, 'sine', 0.1 * scale, 0.005, 0.32 * scale, t, { endFreq: 30 });
    this.tone(170 + Math.random() * 20, 'triangle', 0.04 * scale, 0.003, 0.14 * scale, t, { endFreq: 55 });
  }

  /** Flame whoosh more than a thump. */
  private sfxMissileBoom(t: number, scale: number): void {
    this.noiseBurst(0.09 * scale, 0.012, 0.26 * scale, t, {
      type: 'bandpass',
      freq: 380,
      endFreq: 1500,
      brown: true,
      q: 0.6,
    });
    this.tone(140, 'sawtooth', 0.035 * scale, 0.01, 0.22 * scale, t, {
      endFreq: 48,
      filter: { type: 'lowpass', freq: 480, q: 0.7 },
    });
  }

  /** Two heavy hits, the second deeper. */
  private sfxHeavyBoom(t: number, scale: number): void {
    this.tone(70, 'sine', 0.1 * scale, 0.004, 0.14, t, { endFreq: 40 });
    this.tone(50, 'sine', 0.12 * scale, 0.006, 0.26, t + 0.16, { endFreq: 26 });
    this.noiseBurst(0.07 * scale, 0.004, 0.28, t, { type: 'lowpass', freq: 380, endFreq: 80, brown: true, q: 0.55 });
  }

  private sfxUiClick(t: number): void {
    if (!this.uiBus) return;
    if (Math.random() < 0.5) {
      this.tone(980, 'sine', 0.04, 0.002, 0.045, t, { endFreq: 1400, bus: this.uiBus });
    } else {
      this.tone(220, 'triangle', 0.042, 0.003, 0.06, t, { endFreq: 260, bus: this.uiBus });
    }
  }

  private sfxPurchase(t: number): void {
    if (!this.uiBus) return;
    this.tone(784, 'sine', 0.048, 0.006, 0.12, t, { bus: this.uiBus });
    this.tone(1175, 'sine', 0.04, 0.006, 0.16, t + 0.08, { bus: this.uiBus });
  }

  private sfxLevelClear(t: number): void {
    this.tone(196, 'triangle', 0.05, 0.02, 0.38, t);
    this.tone(294, 'sine', 0.045, 0.02, 0.42, t + 0.12);
    this.tone(392, 'sine', 0.04, 0.02, 0.5, t + 0.24);
  }

  private sfxShieldFizz(t: number): void {
    this.noiseBurst(0.04, 0.002, 0.1, t, { type: 'bandpass', freq: 1800, endFreq: 600, q: 1.1 });
    this.tone(900, 'square', 0.028, 0.002, 0.09, t, { endFreq: 400 });
  }

  private sfxHullClang(t: number): void {
    this.tone(280, 'triangle', 0.05, 0.002, 0.16, t, { endFreq: 140 });
    this.tone(420, 'sine', 0.02, 0.002, 0.12, t, { endFreq: 200 });
    this.noiseBurst(0.028, 0.001, 0.05, t, { type: 'bandpass', freq: 1200, endFreq: 280, q: 1.2 });
  }

  private sfxShipDeath(t: number): void {
    this.tone(70, 'sine', 0.1, 0.008, 0.28, t, { endFreq: 32 });
    this.noiseBurst(0.1, 0.01, 0.55, t, { type: 'lowpass', freq: 1000, endFreq: 80, brown: true, q: 0.5 });
    for (let i = 0; i < 5; i++) {
      this.tone(400 - i * 55, 'sawtooth', 0.04, 0.008, 0.16, t + 0.1 + i * 0.1, {
        endFreq: 60,
        filter: { type: 'lowpass', freq: 800, q: 0.8 },
      });
    }
    this.tone(55, 'sine', 0.1, 0.04, 0.9, t + 0.4, { endFreq: 22 });
    // Extra small blasts inside the breakup.
    this.sfxBoom(t + 0.18, 0.45);
    this.sfxBoom(t + 0.4, 0.35);
    this.sfxBoom(t + 0.62, 0.4);
  }

  private sfxCritSpark(t: number): void {
    this.tone(1600, 'sine', 0.038, 0.001, 0.08, t, { endFreq: 3200 });
    this.noiseBurst(0.012, 0.001, 0.028, t, { type: 'highpass', freq: 4000, q: 0.6 });
  }

  /** Long, quiet, low hydraulic move. Heavy machinery, not a beep. */
  private sfxCubeShift(t: number): void {
    this.tone(46, 'sawtooth', 0.016, 0.08, 0.95, t, {
      endFreq: 30,
      filter: { type: 'lowpass', freq: 160, q: 0.5 },
    });
    this.tone(34, 'sine', 0.02, 0.1, 1.05, t, { endFreq: 26 });
    this.noiseBurst(0.014, 0.08, 0.9, t, { type: 'lowpass', freq: 150, endFreq: 60, brown: true, q: 0.45 });
  }
}
