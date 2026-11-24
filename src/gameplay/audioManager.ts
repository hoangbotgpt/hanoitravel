/**
 * Procedural Web Audio API soundscape for Hanoi Shipper 3D Retro.
 * Zero external audio assets — synthesizes ~82 BPM Lo-fi chill chord loop
 * plus 5 distinct retro SFX: engine, horn, crash, reward, gameover.
 */

const LOFI_BPM = 82;
const STEP_DURATION = 60 / LOFI_BPM / 2; // eighth-note step (~0.3658s)

// Warm jazz 7th progression: Fmaj7 -> Em7 -> Dm7 -> Cmaj7 (in Hz)
const CHORD_PROGRESSION: ReadonlyArray<{ bass: number; notes: number[] }> = [
  { bass: 87.31, notes: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
  { bass: 82.41, notes: [164.81, 196.0, 246.94, 293.66] }, // Em7
  { bass: 73.42, notes: [146.83, 174.61, 220.0, 261.63] }, // Dm7
  { bass: 65.41, notes: [130.81, 164.81, 196.0, 246.94] }  // Cmaj7
];

const MELODY_STEPS: ReadonlyArray<number | null> = [
  523.25, null, 659.25, 587.33, null, 440.0, null, 523.25,
  493.88, null, 587.33, null, 440.0, 392.0, null, null,
  440.0, null, 523.25, 493.88, null, 349.23, null, 440.0,
  392.0, null, 493.88, 523.25, null, null, 329.63, null
];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private volume = 0.65;
  private bgmRunning = false;
  private bgmTimerId: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.42;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.initEngineLoop(this.ctx);
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private initEngineLoop(ctx: AudioContext): void {
    if (!this.sfxGain || this.engineOsc) return;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 64;

    this.engineSubOsc = ctx.createOscillator();
    this.engineSubOsc.type = 'triangle';
    this.engineSubOsc.frequency.value = 32;

    this.engineOsc.connect(filter);
    this.engineSubOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc.start();
    this.engineSubOsc.start();
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    if (!this.bgmRunning) {
      this.startBgm();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : this.volume;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(target, now, 0.025);
  }

  public startBgm(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.bgmRunning) return;

    this.bgmRunning = true;
    this.nextStepTime = ctx.currentTime + 0.06;
    this.bgmTimerId = window.setInterval(() => {
      this.scheduleBgmSteps();
    }, 90);
  }

  public stopBgm(): void {
    this.bgmRunning = false;
    if (this.bgmTimerId !== null) {
      window.clearInterval(this.bgmTimerId);
      this.bgmTimerId = null;
    }
  }

  private scheduleBgmSteps(): void {
    if (!this.ctx || !this.bgmGain || !this.bgmRunning) return;
    if (this.ctx.state !== 'running') return;

    const lookAhead = 0.25;
    while (this.nextStepTime < this.ctx.currentTime + lookAhead) {
      this.playBgmStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += STEP_DURATION;
      this.stepIndex = (this.stepIndex + 1) % 32;
    }
  }

  private playBgmStep(step: number, when: number): void {
    if (!this.ctx || !this.bgmGain) return;

    const chordStep = step % 8;
    const chordIdx = Math.floor(step / 8) % CHORD_PROGRESSION.length;
    const chord = CHORD_PROGRESSION[chordIdx];

    // Warm electric-piano lo-fi pad at start of each 8-step bar
    if (chordStep === 0) {
      this.triggerLofiBass(chord.bass, when, STEP_DURATION * 7.2);
      chord.notes.forEach((freq, idx) => {
        this.triggerLofiChordNote(freq, when + idx * 0.018, STEP_DURATION * 7.4);
      });
    }

    // Gentle chill melody bell
    const melodyFreq = MELODY_STEPS[step];
    if (melodyFreq !== null) {
      this.triggerLofiMelody(melodyFreq, when, STEP_DURATION * 1.6);
    }

    // Soft lo-fi beat: kick on 0, 3; brushed snare on 2, 6; quiet hat on even steps
    if (chordStep === 0 || chordStep === 3) {
      this.triggerSoftKick(when);
    }
    if (chordStep === 2 || chordStep === 6) {
      this.triggerSoftSnare(when);
    } else if (step % 2 === 0) {
      this.triggerSoftHat(when);
    }
  }

  private triggerLofiChordNote(freq: number, when: number, duration: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    // Subtle retro tape detune warmth
    osc.frequency.setValueAtTime(freq, when);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 6, when);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(980, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.065, when + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  private triggerLofiBass(freq: number, when: number, duration: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.16, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  private triggerLofiMelody(freq: number, when: number, duration: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.055, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  private triggerSoftKick(when: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.14);

    gain.gain.setValueAtTime(0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(when);
    osc.stop(when + 0.2);
  }

  private triggerSoftSnare(when: number): void {
    if (!this.ctx || !this.bgmGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, when);
    filter.Q.setValueAtTime(0.9, when);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.055, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    src.start(when);
    src.stop(when + 0.13);
  }

  private triggerSoftHat(when: number): void {
    if (!this.ctx || !this.bgmGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5200, when);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.022, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    src.start(when);
    src.stop(when + 0.06);
  }

  /**
   * SFX #1: Continuous scooter engine hum whose pitch follows player speed.
   */
  public updateEngine(speedRatio: number, active: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.ctx.state !== 'running') {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    const ratio = Math.max(0, Math.min(1, speedRatio));
    const baseFreq = 56 + ratio * 74;
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);
    this.engineGain.gain.setTargetAtTime(0.055 + ratio * 0.055, now, 0.05);
  }

  /**
   * SFX #2: Classic Vietnamese scooter dual-tone horn beep (Spacebar).
   */
  public playHorn(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    const playBeep = (start: number, dur: number): void => {
      if (!this.sfxGain) return;
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscA.type = 'square';
      oscB.type = 'triangle';
      oscA.frequency.setValueAtTime(445, start);
      oscB.frequency.setValueAtTime(558, start);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.01);
      gain.gain.setValueAtTime(0.13, start + dur - 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      oscA.start(start);
      oscB.start(start);
      oscA.stop(start + dur + 0.02);
      oscB.stop(start + dur + 0.02);
    };

    playBeep(now, 0.09);
    playBeep(now + 0.13, 0.11);
  }

  /**
   * SFX #3: Heavy collision crunch, asphalt skid hiss + penalty chime.
   */
  public playCrash(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;

    // Low impact thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(160, now);
    thud.frequency.exponentialRampToValueAtTime(34, now + 0.28);
    thudGain.gain.setValueAtTime(0.36, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    thud.connect(thudGain);
    thudGain.connect(this.sfxGain);
    thud.start(now);
    thud.stop(now + 0.32);

    // Metallic chassis crunch + asphalt skid hiss
    if (this.noiseBuffer) {
      const crunch = ctx.createBufferSource();
      crunch.buffer = this.noiseBuffer;
      const crunchFilter = ctx.createBiquadFilter();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.setValueAtTime(1150, now);
      crunchFilter.Q.setValueAtTime(1.2, now);
      const crunchGain = ctx.createGain();
      crunchGain.gain.setValueAtTime(0.24, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      crunch.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.sfxGain);
      crunch.start(now);
      crunch.stop(now + 0.18);

      const skid = ctx.createBufferSource();
      skid.buffer = this.noiseBuffer;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.setValueAtTime(1450, now + 0.04);
      skidFilter.frequency.exponentialRampToValueAtTime(460, now + 0.46);
      skidFilter.Q.setValueAtTime(1.6, now + 0.04);
      const skidGain = ctx.createGain();
      skidGain.gain.setValueAtTime(0.001, now);
      skidGain.gain.linearRampToValueAtTime(0.14, now + 0.06);
      skidGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      skid.connect(skidFilter);
      skidFilter.connect(skidGain);
      skidGain.connect(this.sfxGain);
      skid.start(now);
      skid.stop(now + 0.5);
    }

    // Brief retro penalty chime
    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(580, now + 0.04);
    chime.frequency.exponentialRampToValueAtTime(310, now + 0.24);
    cGain.gain.setValueAtTime(0.11, now + 0.04);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    chime.connect(cGain);
    cGain.connect(this.sfxGain);
    chime.start(now + 0.04);
    chime.stop(now + 0.28);
  }

  /**
   * SFX #3b: Engine kick-start rev chirp when remounting bike after crash.
   */
  public playRemount(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    const rev = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    rev.type = 'sawtooth';
    rev.frequency.setValueAtTime(68, now);
    rev.frequency.exponentialRampToValueAtTime(165, now + 0.14);
    rev.frequency.exponentialRampToValueAtTime(92, now + 0.28);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(780, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    rev.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    rev.start(now);
    rev.stop(now + 0.32);
  }

  /**
   * SFX #4: Warm ascending stage-clear / coin reward arpeggio.
   */
  public playReward(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.sfxGain) return;
      const start = now + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.34);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  /**
   * SFX #5: Gentle descending retro cadence on Game Over.
   */
  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    const notes = [392.0, 349.23, 329.63, 261.63];
    notes.forEach((freq, idx) => {
      if (!this.sfxGain) return;
      const start = now + idx * 0.16;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  public dispose(): void {
    this.stopBgm();
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch {
        // Ignore already stopped oscillator
      }
      this.engineOsc = null;
    }
    if (this.engineSubOsc) {
      try {
        this.engineSubOsc.stop();
      } catch {
        // Ignore already stopped oscillator
      }
      this.engineSubOsc = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
