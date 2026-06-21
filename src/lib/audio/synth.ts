// Procedural FX synthesizer. Takes a JSON parameter set and renders an AudioBuffer.
import { makeImpulseResponse } from "./reverbImpulse";

export type SynthParams = {
  oscType: "sine" | "square" | "sawtooth" | "triangle" | "noise";
  freqStart: number;      // Hz
  freqEnd: number;        // Hz (sweep target)
  duration: number;       // seconds (0.05–6)
  attack: number;         // seconds
  decay: number;          // seconds
  sustain: number;        // 0..1
  release: number;        // seconds
  filterType: "lowpass" | "highpass" | "bandpass" | "none";
  filterFreq: number;     // Hz
  filterQ: number;        // 0.1..20
  filterSweepTo?: number; // Hz, optional automation target
  lfoRate: number;        // Hz (0 = off)
  lfoDepth: number;       // cents
  distortion: number;     // 0..1
  reverb: "none" | "room" | "hall" | "plate" | "cathedral";
  reverbMix: number;      // 0..1
};

export const DEFAULT_SYNTH: SynthParams = {
  oscType: "sine", freqStart: 440, freqEnd: 440, duration: 1,
  attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2,
  filterType: "lowpass", filterFreq: 8000, filterQ: 1,
  lfoRate: 0, lfoDepth: 0, distortion: 0,
  reverb: "none", reverbMix: 0.2,
};

export async function renderSynth(p: SynthParams): Promise<AudioBuffer> {
  const sr = 44100;
  const tail = p.reverb !== "none" ? 2.0 : 0.3;
  const total = Math.max(0.05, Math.min(6, p.duration)) + tail;
  const ctx = new OfflineAudioContext(2, Math.floor(total * sr), sr);
  const t0 = 0;
  const end = t0 + p.duration;

  // Source
  let source: AudioNode;
  if (p.oscType === "noise") {
    const buf = ctx.createBuffer(1, Math.floor(p.duration * sr), sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf;
    n.start(t0); n.stop(end);
    source = n;
  } else {
    const osc = ctx.createOscillator();
    osc.type = p.oscType;
    osc.frequency.setValueAtTime(p.freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.freqEnd), end);
    if (p.lfoRate > 0 && p.lfoDepth > 0) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = p.lfoRate;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = p.lfoDepth;
      lfo.connect(lfoGain); lfoGain.connect(osc.detune);
      lfo.start(t0); lfo.stop(end);
    }
    osc.start(t0); osc.stop(end);
    source = osc;
  }

  // ADSR envelope
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(1, t0 + p.attack);
  env.gain.linearRampToValueAtTime(p.sustain, t0 + p.attack + p.decay);
  env.gain.setValueAtTime(p.sustain, Math.max(t0 + p.attack + p.decay, end - p.release));
  env.gain.linearRampToValueAtTime(0, end + p.release);

  // Filter
  let chain: AudioNode = env;
  source.connect(env);
  if (p.filterType !== "none") {
    const f = ctx.createBiquadFilter();
    f.type = p.filterType;
    f.frequency.setValueAtTime(p.filterFreq, t0);
    if (p.filterSweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, p.filterSweepTo), end);
    f.Q.value = p.filterQ;
    chain.connect(f);
    chain = f;
  }

  // Distortion
  if (p.distortion > 0) {
    const ws = ctx.createWaveShaper();
    const k = p.distortion * 50;
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1024) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    ws.curve = curve;
    chain.connect(ws);
    chain = ws;
  }

  // Wet/dry reverb
  const out = ctx.createGain();
  if (p.reverb !== "none") {
    const dry = ctx.createGain(); dry.gain.value = 1 - p.reverbMix;
    const wet = ctx.createGain(); wet.gain.value = p.reverbMix;
    const conv = ctx.createConvolver(); conv.buffer = makeImpulseResponse(ctx, p.reverb);
    chain.connect(dry); dry.connect(out);
    chain.connect(conv); conv.connect(wet); wet.connect(out);
  } else {
    chain.connect(out);
  }
  out.connect(ctx.destination);

  return await ctx.startRendering();
}