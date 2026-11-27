/**
 * Procedural Web Audio API soundscape for Hanoi Shipper 3D Retro (Ver 2.0).
 * Zero external audio assets — synthesizes ~82 BPM Lo-fi chill chord loop,
 * distinct Gasoline (4-gear + idle garăngti), Electric (inverter whine + regen),
 * and Suzuki RGV 120 2-Stroke (real sampled engine MP3 loops with procedural fallback)
 * engine audio, plus horn, crash, remount, reward, camera shutter, warning, and gameover SFX.
 */

export const RGV_ENGINE_AUDIO_PATH = '/assets/audio/suzuki_rgv_engine.mp3';

export type EngineProfile = 'gasoline' | 'electric' | 'two_stroke';

export interface EngineTelemetry {
  profile: EngineProfile;
  active: boolean;
  speedRatio: number;
  isBraking: boolean;
  estimatedGain: number;
  gear: number;
}

export interface EngineUpdateOptions {
  isBraking?: boolean;
  speed?: number;
}

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

// 4-gear RPM frequency ranges for classic 4-stroke gasoline bike
const GASOLINE_GEARS: ReadonlyArray<{ minRatio: number; maxRatio: number; minHz: number; maxHz: number }> = [
  { minRatio: 0.0, maxRatio: 0.25, minHz: 56, maxHz: 128 },
  { minRatio: 0.25, maxRatio: 0.50, minHz: 74, maxHz: 138 },
  { minRatio: 0.50, maxRatio: 0.75, minHz: 86, maxHz: 148 },
  { minRatio: 0.75, maxRatio: 1.0, minHz: 98, maxHz: 164 }
];

// 6 close-ratio gears for Suzuki RGV 120 2-stroke (crisp, higher expansion-chamber pitch)
const TWO_STROKE_GEARS: ReadonlyArray<{ minRatio: number; maxRatio: number; minHz: number; maxHz: number }> = [
  { minRatio: 0.0, maxRatio: 0.17, minHz: 114, maxHz: 195 },
  { minRatio: 0.17, maxRatio: 0.34, minHz: 138, maxHz: 218 },
  { minRatio: 0.34, maxRatio: 0.52, minHz: 158, maxHz: 238 },
  { minRatio: 0.52, maxRatio: 0.70, minHz: 176, maxHz: 258 },
  { minRatio: 0.70, maxRatio: 0.86, minHz: 196, maxHz: 276 },
  { minRatio: 0.86, maxRatio: 1.0, minHz: 214, maxHz: 295 }
];

function computeGasolineGearAndFreq(ratio: number, isStopped: boolean): { gear: number; freqHz: number } {
  if (isStopped) {
    // Classic 4-stroke idle garăngti (~26 Hz sub-octave thump, 52 Hz primary)
    return { gear: 1, freqHz: 52 };
  }
  for (let i = 0; i < GASOLINE_GEARS.length; i++) {
    const g = GASOLINE_GEARS[i];
    if (ratio < g.maxRatio || i === GASOLINE_GEARS.length - 1) {
      const span = Math.max(0.001, g.maxRatio - g.minRatio);
      const inGear = Math.max(0, Math.min(1, (ratio - g.minRatio) / span));
      return {
        gear: i + 1,
        freqHz: g.minHz + inGear * (g.maxHz - g.minHz)
      };
    }
  }
  return { gear: 4, freqHz: 164 };
}

function computeTwoStrokeGearAndFreq(ratio: number, isStopped: boolean): { gear: number; freqHz: number } {
  if (isStopped) {
    // Crisp staccato 2-stroke idle garăngti
    return { gear: 1, freqHz: 78 };
  }
  for (let i = 0; i < TWO_STROKE_GEARS.length; i++) {
    const g = TWO_STROKE_GEARS[i];
    if (ratio < g.maxRatio || i === TWO_STROKE_GEARS.length - 1) {
      const span = Math.max(0.001, g.maxRatio - g.minRatio);
      const inGear = Math.max(0, Math.min(1, (ratio - g.minRatio) / span));
      return {
        gear: i + 1,
        freqHz: g.minHz + inGear * (g.maxHz - g.minHz)
      };
    }
  }
  return { gear: 6, freqHz: 295 };
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Gasoline synth chain
  private gasOsc: OscillatorNode | null = null;
  private gasSubOsc: OscillatorNode | null = null;
  private gasIdleLfo: OscillatorNode | null = null;
  private gasIdleLfoGain: GainNode | null = null;
  private gasFilter: BiquadFilterNode | null = null;
  private gasGain: GainNode | null = null;

  // Electric synth chain
  private elecOsc: OscillatorNode | null = null;
  private elecHarm2Osc: OscillatorNode | null = null;
  private elecHarm35Osc: OscillatorNode | null = null;
  private elecHarm2Gain: GainNode | null = null;
  private elecHarm35Gain: GainNode | null = null;
  private elecRegenOsc: OscillatorNode | null = null;
  private elecRegenGain: GainNode | null = null;
  private elecFilter: BiquadFilterNode | null = null;
  private elecGain: GainNode | null = null;

  // Two-stroke (Suzuki RGV 120) procedural fallback chain
  private twoOsc: OscillatorNode | null = null;
  private twoHarmOsc: OscillatorNode | null = null;
  private twoHarmGain: GainNode | null = null;
  private twoIdleLfo: OscillatorNode | null = null;
  private twoIdleLfoGain: GainNode | null = null;
  private twoBandpass: BiquadFilterNode | null = null;
  private twoLowpass: BiquadFilterNode | null = null;
  private twoGain: GainNode | null = null;

  // Real sampled Suzuki RGV 120 2-stroke MP3 idle + rev layers
  private rgvBuffer: AudioBuffer | null = null;
  private rgvLoadStarted = false;
  private rgvIdleSrc: AudioBufferSourceNode | null = null;
  private rgvIdleGain: GainNode | null = null;
  private rgvRevSrc: AudioBufferSourceNode | null = null;
  private rgvRevGain: GainNode | null = null;
  private rgvLowpass: BiquadFilterNode | null = null;

  private engineProfile: EngineProfile = 'gasoline';
  private lastTelemetry: EngineTelemetry = {
    profile: 'gasoline',
    active: false,
    speedRatio: 0,
    isBraking: false,
    estimatedGain: 0,
    gear: 0
  };

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

      // Safety limiter before destination so layered engine + BGM + SFX never clip
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.12;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.42;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.initEngineLoop(this.ctx);
      this.loadRgvSample(this.ctx);
    }

    return this.ctx;
  }

  private loadRgvSample(ctx: AudioContext): void {
    if (this.rgvLoadStarted || typeof fetch !== 'function') return;
    this.rgvLoadStarted = true;

    void fetch(RGV_ENGINE_AUDIO_PATH)
      .then((res) =>
        res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))
      )
      .then((arrBuf) => ctx.decodeAudioData(arrBuf))
      .then((decoded) => {
        if (this.ctx !== ctx) return;
        this.rgvBuffer = decoded;
        this.initRgvSampleNodes(ctx);
      })
      .catch(() => undefined);
  }

  private initRgvSampleNodes(ctx: AudioContext): void {
    if (!this.rgvBuffer || !this.sfxGain || this.rgvIdleSrc) return;

    const dur = Math.max(2, this.rgvBuffer.duration);
    const idleStart = Math.min(0.25, dur * 0.05);
    const idleEnd = Math.max(idleStart + 0.5, Math.min(5.45, dur - 0.1));
    const revStart = Math.min(19.6, dur * 0.45);
    const revEnd = Math.max(revStart + 0.5, Math.min(25.4, dur - 0.1));

    this.rgvLowpass = ctx.createBiquadFilter();
    this.rgvLowpass.type = 'lowpass';
    this.rgvLowpass.frequency.value = 4500;
    this.rgvLowpass.Q.value = 0.7;
    this.rgvLowpass.connect(this.sfxGain);

    this.rgvIdleGain = ctx.createGain();
    this.rgvIdleGain.gain.value = 0;
    this.rgvIdleGain.connect(this.rgvLowpass);

    this.rgvRevGain = ctx.createGain();
    this.rgvRevGain.gain.value = 0;
    this.rgvRevGain.connect(this.rgvLowpass);

    this.rgvIdleSrc = ctx.createBufferSource();
    this.rgvIdleSrc.buffer = this.rgvBuffer;
    this.rgvIdleSrc.loop = true;
    this.rgvIdleSrc.loopStart = idleStart;
    this.rgvIdleSrc.loopEnd = idleEnd;
    this.rgvIdleSrc.connect(this.rgvIdleGain);
    this.rgvIdleSrc.start(0, idleStart);

    this.rgvRevSrc = ctx.createBufferSource();
    this.rgvRevSrc.buffer = this.rgvBuffer;
    this.rgvRevSrc.loop = true;
    this.rgvRevSrc.loopStart = revStart;
    this.rgvRevSrc.loopEnd = revEnd;
    this.rgvRevSrc.connect(this.rgvRevGain);
    this.rgvRevSrc.start(0, revStart);
  }

  public hasRgvAudioSample(): boolean {
    return this.rgvBuffer !== null;
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
    if (!this.sfxGain || this.gasOsc) return;

    // 1. Gasoline chain: sawtooth + sub-octave triangle + idle garăngti LFO modulation
    this.gasFilter = ctx.createBiquadFilter();
    this.gasFilter.type = 'lowpass';
    this.gasFilter.frequency.value = 240;
    this.gasFilter.Q.value = 2.0;

    this.gasGain = ctx.createGain();
    this.gasGain.gain.value = 0;

    this.gasOsc = ctx.createOscillator();
    this.gasOsc.type = 'sawtooth';
    this.gasOsc.frequency.value = 52;

    this.gasSubOsc = ctx.createOscillator();
    this.gasSubOsc.type = 'triangle';
    this.gasSubOsc.frequency.value = 26;

    this.gasIdleLfo = ctx.createOscillator();
    this.gasIdleLfo.type = 'sine';
    this.gasIdleLfo.frequency.value = 12;

    this.gasIdleLfoGain = ctx.createGain();
    this.gasIdleLfoGain.gain.value = 35;

    this.gasIdleLfo.connect(this.gasIdleLfoGain);
    this.gasIdleLfoGain.connect(this.gasFilter.frequency);

    this.gasOsc.connect(this.gasFilter);
    this.gasSubOsc.connect(this.gasFilter);
    this.gasFilter.connect(this.gasGain);
    this.gasGain.connect(this.sfxGain);

    this.gasOsc.start();
    this.gasSubOsc.start();
    this.gasIdleLfo.start();

    // 2. Electric chain: pure sine fundamental + 2.0x & 3.5x inverter whine + regen brake hum
    this.elecFilter = ctx.createBiquadFilter();
    this.elecFilter.type = 'lowpass';
    this.elecFilter.frequency.value = 2600;
    this.elecFilter.Q.value = 0.7;

    this.elecGain = ctx.createGain();
    this.elecGain.gain.value = 0;

    this.elecOsc = ctx.createOscillator();
    this.elecOsc.type = 'sine';
    this.elecOsc.frequency.value = 180;

    this.elecHarm2Osc = ctx.createOscillator();
    this.elecHarm2Osc.type = 'sine';
    this.elecHarm2Osc.frequency.value = 360;

    this.elecHarm2Gain = ctx.createGain();
    this.elecHarm2Gain.gain.value = 0.26;

    this.elecHarm35Osc = ctx.createOscillator();
    this.elecHarm35Osc.type = 'sine';
    this.elecHarm35Osc.frequency.value = 630;

    this.elecHarm35Gain = ctx.createGain();
    this.elecHarm35Gain.gain.value = 0.11;

    this.elecRegenOsc = ctx.createOscillator();
    this.elecRegenOsc.type = 'triangle';
    this.elecRegenOsc.frequency.value = 240;

    this.elecRegenGain = ctx.createGain();
    this.elecRegenGain.gain.value = 0;

    this.elecOsc.connect(this.elecFilter);
    this.elecHarm2Osc.connect(this.elecHarm2Gain);
    this.elecHarm2Gain.connect(this.elecFilter);
    this.elecHarm35Osc.connect(this.elecHarm35Gain);
    this.elecHarm35Gain.connect(this.elecFilter);
    this.elecRegenOsc.connect(this.elecRegenGain);
    this.elecRegenGain.connect(this.elecFilter);

    this.elecFilter.connect(this.elecGain);
    this.elecGain.connect(this.sfxGain);

    this.elecOsc.start();
    this.elecHarm2Osc.start();
    this.elecHarm35Osc.start();
    this.elecRegenOsc.start();

    // 3. Two-stroke (Suzuki RGV 120) chain: sawtooth + 2.0x square + resonant bandpass expansion chamber
    this.twoBandpass = ctx.createBiquadFilter();
    this.twoBandpass.type = 'bandpass';
    this.twoBandpass.frequency.value = 680;
    this.twoBandpass.Q.value = 3.5;

    this.twoLowpass = ctx.createBiquadFilter();
    this.twoLowpass.type = 'lowpass';
    this.twoLowpass.frequency.value = 3300;
    this.twoLowpass.Q.value = 0.8;

    this.twoGain = ctx.createGain();
    this.twoGain.gain.value = 0;

    this.twoOsc = ctx.createOscillator();
    this.twoOsc.type = 'sawtooth';
    this.twoOsc.frequency.value = 78;

    this.twoHarmOsc = ctx.createOscillator();
    this.twoHarmOsc.type = 'square';
    this.twoHarmOsc.frequency.value = 156;

    this.twoHarmGain = ctx.createGain();
    this.twoHarmGain.gain.value = 0.34;

    this.twoIdleLfo = ctx.createOscillator();
    this.twoIdleLfo.type = 'sine';
    this.twoIdleLfo.frequency.value = 14.5;

    this.twoIdleLfoGain = ctx.createGain();
    this.twoIdleLfoGain.gain.value = 120;

    this.twoIdleLfo.connect(this.twoIdleLfoGain);
    this.twoIdleLfoGain.connect(this.twoBandpass.frequency);

    this.twoOsc.connect(this.twoBandpass);
    this.twoHarmOsc.connect(this.twoHarmGain);
    this.twoHarmGain.connect(this.twoBandpass);
    this.twoBandpass.connect(this.twoLowpass);
    this.twoLowpass.connect(this.twoGain);
    this.twoGain.connect(this.sfxGain);

    this.twoOsc.start();
    this.twoHarmOsc.start();
    this.twoIdleLfo.start();
  }

  public setEngineProfile(profile: EngineProfile): void {
    this.engineProfile = profile;
    this.lastTelemetry = {
      ...this.lastTelemetry,
      profile,
      gear: profile === 'electric' ? 0 : this.lastTelemetry.gear
    };

    if (this.ctx && this.gasGain && this.elecGain && this.twoGain) {
      const now = this.ctx.currentTime;
      if (profile !== 'gasoline') {
        this.gasGain.gain.setTargetAtTime(0, now, 0.03);
      }
      if (profile !== 'electric') {
        this.elecGain.gain.setTargetAtTime(0, now, 0.03);
        if (this.elecRegenGain) {
          this.elecRegenGain.gain.setTargetAtTime(0, now, 0.03);
        }
      }
      if (profile !== 'two_stroke') {
        this.twoGain.gain.setTargetAtTime(0, now, 0.03);
        this.rgvIdleGain?.gain.setTargetAtTime(0, now, 0.03);
        this.rgvRevGain?.gain.setTargetAtTime(0, now, 0.03);
      } else {
        this.loadRgvSample(this.ctx);
      }
    }
  }

  public getEngineProfile(): EngineProfile {
    return this.engineProfile;
  }

  public getEngineTelemetry(): EngineTelemetry {
    return { ...this.lastTelemetry };
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
   * SFX #1: Continuous motorbike sound differentiated by engineProfile
   * ('gasoline' 4-gear + idle garăngti vs 'electric' inverter whine vs 'two_stroke' 6-gear RGV 120).
   */
  public updateEngine(
    speedRatio: number,
    active: boolean,
    options?: EngineUpdateOptions
  ): void {
    const ratio = Number.isFinite(speedRatio) ? Math.max(0, Math.min(1, speedRatio)) : 0;
    const isBraking = Boolean(options?.isBraking);
    const hasExplicitSpeed = options?.speed !== undefined && Number.isFinite(options.speed);
    const effectiveSpeed = hasExplicitSpeed ? Math.max(0, options!.speed!) : ratio * 68;
    const isStopped = (hasExplicitSpeed && effectiveSpeed <= 0.4) || ratio <= 0.01;

    let gear = 0;
    let estimatedGain = 0;
    let gasFreq = 52;
    let elecFreq = 180;
    let regenGain = 0;
    let twoFreq = 78;

    if (active) {
      if (this.engineProfile === 'gasoline') {
        const computed = computeGasolineGearAndFreq(ratio, isStopped);
        gear = computed.gear;
        gasFreq = computed.freqHz;
        estimatedGain = isStopped
          ? 0.052
          : (isBraking ? 0.050 : 0.060) + ratio * 0.050;
      } else if (this.engineProfile === 'two_stroke') {
        const computed = computeTwoStrokeGearAndFreq(ratio, isStopped);
        gear = computed.gear;
        twoFreq = computed.freqHz;
        estimatedGain = isStopped
          ? 0.056
          : (isBraking ? 0.054 : 0.066) + ratio * 0.052;
      } else {
        // Electric: gear = 0, near-silent at 0 km/h (target gain 0)
        gear = 0;
        elecFreq = 180 + ratio * (920 - 180);
        if (isStopped) {
          estimatedGain = 0;
        } else {
          const regenActive = isBraking && effectiveSpeed > 1;
          regenGain = regenActive ? 0.024 * Math.min(1, effectiveSpeed / 12) : 0;
          estimatedGain = 0.026 + ratio * 0.048 + regenGain * 0.4;
        }
      }
    }

    this.lastTelemetry = {
      profile: this.engineProfile,
      active,
      speedRatio: ratio,
      isBraking,
      estimatedGain,
      gear
    };

    if (
      !this.ctx ||
      !this.gasGain ||
      !this.gasOsc ||
      !this.gasSubOsc ||
      !this.gasFilter ||
      !this.gasIdleLfo ||
      !this.gasIdleLfoGain ||
      !this.elecGain ||
      !this.elecOsc ||
      !this.elecHarm2Osc ||
      !this.elecHarm35Osc ||
      !this.elecRegenOsc ||
      !this.elecRegenGain ||
      !this.twoGain ||
      !this.twoOsc ||
      !this.twoHarmOsc ||
      !this.twoBandpass ||
      !this.twoIdleLfo ||
      !this.twoIdleLfoGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!active || this.ctx.state !== 'running') {
      this.gasGain.gain.setTargetAtTime(0, now, 0.06);
      this.elecGain.gain.setTargetAtTime(0, now, 0.06);
      this.elecRegenGain.gain.setTargetAtTime(0, now, 0.05);
      this.twoGain.gain.setTargetAtTime(0, now, 0.06);
      this.rgvIdleGain?.gain.setTargetAtTime(0, now, 0.05);
      this.rgvRevGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    if (this.engineProfile === 'gasoline') {
      this.elecGain.gain.setTargetAtTime(0, now, 0.04);
      this.elecRegenGain.gain.setTargetAtTime(0, now, 0.04);
      this.twoGain.gain.setTargetAtTime(0, now, 0.04);
      this.rgvIdleGain?.gain.setTargetAtTime(0, now, 0.04);
      this.rgvRevGain?.gain.setTargetAtTime(0, now, 0.04);

      this.gasOsc.frequency.setTargetAtTime(gasFreq, now, 0.045);
      this.gasSubOsc.frequency.setTargetAtTime(gasFreq * 0.5, now, 0.045);
      this.gasIdleLfo.frequency.setTargetAtTime(isStopped ? 11.5 : 18 + ratio * 14, now, 0.06);
      this.gasIdleLfoGain.gain.setTargetAtTime(isStopped ? 65 : 18, now, 0.06);
      this.gasFilter.frequency.setTargetAtTime(
        isStopped ? 215 : (isBraking ? 230 : 280) + ratio * 380,
        now,
        0.05
      );
      this.gasGain.gain.setTargetAtTime(estimatedGain, now, 0.05);
    } else if (this.engineProfile === 'two_stroke') {
      this.gasGain.gain.setTargetAtTime(0, now, 0.04);
      this.elecGain.gain.setTargetAtTime(0, now, 0.04);
      this.elecRegenGain.gain.setTargetAtTime(0, now, 0.04);

      if (
        this.rgvBuffer &&
        this.rgvIdleSrc &&
        this.rgvRevSrc &&
        this.rgvIdleGain &&
        this.rgvRevGain &&
        this.rgvLowpass
      ) {
        this.twoGain.gain.setTargetAtTime(0, now, 0.03);
        const revMix = isStopped ? 0 : Math.min(1, ratio / 0.28);
        const idleTargetGain = isStopped ? 0.48 : (1 - revMix) * 0.42;
        const revTargetGain = isStopped
          ? 0
          : (0.24 + revMix * 0.34) * (isBraking ? 0.72 : 1.0);
        const revRate = Math.max(
          0.72,
          Math.min(1.38, 0.78 + ((twoFreq - 110) / 190) * 0.52)
        );
        const idleRate = isStopped ? 1.0 : 1.0 + ratio * 0.28;
        const lpFreq = isStopped ? 3600 : (isBraking ? 2800 : 3400) + ratio * 3400;

        this.rgvIdleSrc.playbackRate.setTargetAtTime(idleRate, now, 0.045);
        this.rgvRevSrc.playbackRate.setTargetAtTime(revRate, now, 0.04);
        this.rgvLowpass.frequency.setTargetAtTime(lpFreq, now, 0.05);
        this.rgvIdleGain.gain.setTargetAtTime(idleTargetGain, now, 0.05);
        this.rgvRevGain.gain.setTargetAtTime(revTargetGain, now, 0.045);
      } else {
        this.twoOsc.frequency.setTargetAtTime(twoFreq, now, 0.035);
        this.twoHarmOsc.frequency.setTargetAtTime(twoFreq * 2.0, now, 0.035);
        this.twoIdleLfo.frequency.setTargetAtTime(isStopped ? 14.5 : 22 + ratio * 16, now, 0.05);
        this.twoIdleLfoGain.gain.setTargetAtTime(isStopped ? 140 : 45, now, 0.05);
        const chamberFreq = isStopped ? 680 : (isBraking ? 740 : 880) + ratio * 1170;
        this.twoBandpass.frequency.setTargetAtTime(chamberFreq, now, 0.04);
        this.twoGain.gain.setTargetAtTime(estimatedGain, now, 0.045);
      }
    } else {
      this.gasGain.gain.setTargetAtTime(0, now, 0.04);
      this.twoGain.gain.setTargetAtTime(0, now, 0.04);
      this.rgvIdleGain?.gain.setTargetAtTime(0, now, 0.04);
      this.rgvRevGain?.gain.setTargetAtTime(0, now, 0.04);

      this.elecOsc.frequency.setTargetAtTime(elecFreq, now, 0.04);
      this.elecHarm2Osc.frequency.setTargetAtTime(elecFreq * 2.0, now, 0.04);
      this.elecHarm35Osc.frequency.setTargetAtTime(elecFreq * 3.5, now, 0.04);

      const regenFreq = 110 + ratio * 250;
      this.elecRegenOsc.frequency.setTargetAtTime(regenFreq, now, 0.04);
      this.elecRegenGain.gain.setTargetAtTime(regenGain > 0 ? 0.35 : 0, now, 0.04);
      this.elecGain.gain.setTargetAtTime(estimatedGain, now, 0.045);
    }
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
   * SFX #3b: Engine kick-start rev (gasoline / 2-stroke RGV) or electric power-on hum when remounting.
   */
  public playRemount(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;

    if (this.engineProfile === 'electric') {
      const hum = ctx.createOscillator();
      const gain = ctx.createGain();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(190, now);
      hum.frequency.exponentialRampToValueAtTime(480, now + 0.14);
      hum.frequency.exponentialRampToValueAtTime(310, now + 0.26);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      hum.connect(gain);
      gain.connect(this.sfxGain);
      hum.start(now);
      hum.stop(now + 0.3);
      return;
    }

    if (this.engineProfile === 'two_stroke') {
      if (this.rgvBuffer) {
        const dur = this.rgvBuffer.duration;
        const offset = Math.min(6.15, Math.max(0, dur - 1.2));
        const playDur = Math.min(1.05, Math.max(0.25, dur - offset));
        const src = ctx.createBufferSource();
        src.buffer = this.rgvBuffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.42, now + 0.04);
        gain.gain.setValueAtTime(0.38, now + Math.max(0.08, playDur - 0.16));
        gain.gain.exponentialRampToValueAtTime(0.001, now + playDur);
        src.connect(gain);
        gain.connect(this.sfxGain);
        src.start(now, offset, playDur);
        return;
      }

      for (const offset of [0, 0.12]) {
        const rev = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        rev.type = 'sawtooth';
        rev.frequency.setValueAtTime(115, now + offset);
        rev.frequency.exponentialRampToValueAtTime(295, now + offset + 0.07);
        rev.frequency.exponentialRampToValueAtTime(160, now + offset + 0.14);

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1280, now + offset);
        bp.Q.setValueAtTime(3.2, now + offset);

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.14, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

        rev.connect(bp);
        bp.connect(gain);
        gain.connect(this.sfxGain);
        rev.start(now + offset);
        rev.stop(now + offset + 0.16);
      }
      return;
    }

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

  /**
   * SFX #6: Camera Phạt Nguội shutter click + subtle alert chirp.
   */
  public playCameraShutter(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    if (this.noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      click.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      click.start(now);
      click.stop(now + 0.065);
    }

    const chirp = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1480, now + 0.03);
    chirp.frequency.setValueAtTime(1120, now + 0.09);
    chirpGain.gain.setValueAtTime(0.001, now + 0.03);
    chirpGain.gain.linearRampToValueAtTime(0.09, now + 0.045);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    chirp.connect(chirpGain);
    chirpGain.connect(this.sfxGain);
    chirp.start(now + 0.03);
    chirp.stop(now + 0.18);
  }

  /**
   * SFX #7: Short double alert chirp before a reckless motorbike cuts lanes.
   */
  public playWarningBeep(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    for (const offset of [0, 0.1]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.08, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    }
  }

  public dispose(): void {
    this.stopBgm();
    const oscs: Array<OscillatorNode | null> = [
      this.gasOsc,
      this.gasSubOsc,
      this.gasIdleLfo,
      this.elecOsc,
      this.elecHarm2Osc,
      this.elecHarm35Osc,
      this.elecRegenOsc,
      this.twoOsc,
      this.twoHarmOsc,
      this.twoIdleLfo
    ];
    for (const osc of oscs) {
      if (osc) {
        try {
          osc.stop();
        } catch {
          // Ignore already stopped oscillator
        }
      }
    }
    for (const src of [this.rgvIdleSrc, this.rgvRevSrc]) {
      if (src) {
        try {
          src.stop();
        } catch {
          // Ignore already stopped sample source
        }
      }
    }
    this.gasOsc = null;
    this.gasSubOsc = null;
    this.gasIdleLfo = null;
    this.elecOsc = null;
    this.elecHarm2Osc = null;
    this.elecHarm35Osc = null;
    this.elecRegenOsc = null;
    this.twoOsc = null;
    this.twoHarmOsc = null;
    this.twoIdleLfo = null;
    this.rgvIdleSrc = null;
    this.rgvIdleGain = null;
    this.rgvRevSrc = null;
    this.rgvRevGain = null;
    this.rgvLowpass = null;
    this.rgvBuffer = null;
    this.rgvLoadStarted = false;

    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
