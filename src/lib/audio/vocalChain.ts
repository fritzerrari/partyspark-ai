// Live vocal processing chain for karaoke.
// Mic → Compressor → EQ(Lo/Mid/Hi) → [Dry + Reverb + Delay + Doubler] → Monitor & Recorder
import { makeImpulseResponse, type ReverbPreset } from "./reverbImpulse";

export type VocalChainSettings = {
  monitor: boolean;        // route to speakers (false = recording-only, avoids feedback)
  compressor: boolean;
  threshold: number;       // dB, -60..0
  ratio: number;           // 1..20
  eqLow: number;           // -12..+12 dB
  eqMid: number;           // -12..+12 dB
  eqHigh: number;          // -12..+12 dB
  reverb: boolean;
  reverbPreset: ReverbPreset;
  reverbMix: number;       // 0..1
  delay: boolean;
  delayTime: number;       // 0..1.0 s
  delayFeedback: number;   // 0..0.9
  delayMix: number;        // 0..1
  doubler: boolean;
  doublerAmount: number;   // 0..1
};

export const DEFAULT_VOCAL_CHAIN: VocalChainSettings = {
  monitor: false,
  compressor: true,
  threshold: -24,
  ratio: 4,
  eqLow: 0, eqMid: 1, eqHigh: 2,
  reverb: true,
  reverbPreset: "hall",
  reverbMix: 0.25,
  delay: false,
  delayTime: 0.32,
  delayFeedback: 0.25,
  delayMix: 0.2,
  doubler: true,
  doublerAmount: 0.4,
};

export class VocalChain {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  input: GainNode;
  comp: DynamicsCompressorNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  dry: GainNode;
  reverbSend: GainNode;
  reverbNode: ConvolverNode;
  reverbReturn: GainNode;
  delaySend: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayReturn: GainNode;
  doublerDelay: DelayNode;
  doublerGain: GainNode;
  out: GainNode;            // pre-monitor sum (for MediaStreamDestination recording)
  monitorGain: GainNode;    // to speakers
  recordDest: MediaStreamAudioDestinationNode;
  analyser: AnalyserNode;

  constructor(ctx: AudioContext, micStream: MediaStream) {
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(micStream);
    this.input = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.eqLow = ctx.createBiquadFilter();
    this.eqMid = ctx.createBiquadFilter();
    this.eqHigh = ctx.createBiquadFilter();
    this.dry = ctx.createGain();
    this.reverbSend = ctx.createGain();
    this.reverbNode = ctx.createConvolver();
    this.reverbReturn = ctx.createGain();
    this.delaySend = ctx.createGain();
    this.delayNode = ctx.createDelay(2.0);
    this.delayFeedback = ctx.createGain();
    this.delayReturn = ctx.createGain();
    this.doublerDelay = ctx.createDelay(0.1);
    this.doublerGain = ctx.createGain();
    this.out = ctx.createGain();
    this.monitorGain = ctx.createGain();
    this.recordDest = ctx.createMediaStreamDestination();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // EQ filter types
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 250;
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 1200;
    this.eqMid.Q.value = 0.8;
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 5000;

    // Wire: source → input → comp → eqLow → eqMid → eqHigh → splits
    this.source.connect(this.input);
    this.input.connect(this.comp);
    this.comp.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    // Dry split
    this.eqHigh.connect(this.dry);
    this.dry.connect(this.out);

    // Reverb send
    this.eqHigh.connect(this.reverbSend);
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbReturn);
    this.reverbReturn.connect(this.out);

    // Delay send (with feedback loop)
    this.eqHigh.connect(this.delaySend);
    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayReturn);
    this.delayReturn.connect(this.out);

    // Doubler (short slap)
    this.eqHigh.connect(this.doublerDelay);
    this.doublerDelay.delayTime.value = 0.025;
    this.doublerDelay.connect(this.doublerGain);
    this.doublerGain.connect(this.out);

    // Outputs
    this.out.connect(this.analyser);
    this.out.connect(this.recordDest);
    this.out.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);

    this.dry.gain.value = 1;
  }

  apply(s: VocalChainSettings) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.monitorGain.gain.setTargetAtTime(s.monitor ? 1 : 0, t, 0.02);
    // Compressor bypass: ratio=1 + threshold=0 is effectively off
    this.comp.threshold.setTargetAtTime(s.compressor ? s.threshold : 0, t, 0.05);
    this.comp.ratio.setTargetAtTime(s.compressor ? s.ratio : 1, t, 0.05);
    this.comp.knee.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.eqLow.gain.setTargetAtTime(s.eqLow, t, 0.05);
    this.eqMid.gain.setTargetAtTime(s.eqMid, t, 0.05);
    this.eqHigh.gain.setTargetAtTime(s.eqHigh, t, 0.05);
    // Gain-stage so dry + reverb + delay + doubler can never overshoot 0 dBFS.
    // Each FX return is capped, and dry is trimmed when many parallel paths are hot.
    const reverb  = s.reverb  ? s.reverbMix       : 0;
    const delay   = s.delay   ? s.delayMix        : 0;
    const doubler = s.doubler ? s.doublerAmount   : 0;
    const hot = 1 + reverb * 0.7 + delay * 0.6 + doubler * 0.6;
    const dryTrim = 1 / hot;
    this.dry.gain.setTargetAtTime(dryTrim, t, 0.05);
    this.reverbSend.gain.setTargetAtTime(reverb, t, 0.05);
    this.reverbReturn.gain.setTargetAtTime(0.85 * dryTrim, t, 0.05);
    this.delaySend.gain.setTargetAtTime(delay, t, 0.05);
    this.delayNode.delayTime.setTargetAtTime(s.delayTime, t, 0.05);
    this.delayFeedback.gain.setTargetAtTime(Math.min(0.75, s.delayFeedback), t, 0.05);
    this.delayReturn.gain.setTargetAtTime(0.85 * dryTrim, t, 0.05);
    this.doublerGain.gain.setTargetAtTime(doubler * dryTrim, t, 0.05);
  }

  setReverbPreset(preset: ReverbPreset) {
    this.reverbNode.buffer = makeImpulseResponse(this.ctx, preset);
  }

  dispose() {
    try {
      this.source.disconnect();
      this.monitorGain.disconnect();
      this.out.disconnect();
    } catch { /* noop */ }
  }
}