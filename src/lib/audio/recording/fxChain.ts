// Web-Audio FX chain for live mic recording — supports pitch shift, reverb,
// delay, autotune snap and soft distortion, all bypassable in real time.
// Pitch shift uses a delay-line granular trick (no worklet required) which
// keeps it dependency-free and reliable in the browser.
import { freqToMidi, midiToFreq, snapToScale } from "@/lib/audio/pitch";

function snapHzToScale(hz: number, mode: "major" | "minor"): number | null {
  if (!hz || !isFinite(hz)) return null;
  const midi = freqToMidi(hz);
  // Scale rooted at C — good enough for monophonic vocal snap.
  const snapped = snapToScale(midi, mode === "minor" ? "a-minor" : "c-major");
  return midiToFreq(snapped);
}

export type FxConfig = {
  pitchSemis: number;     // -12..+12
  reverb: number;         // 0..1
  delay: number;          // 0..1
  distortion: number;     // 0..1
  autoSnap: "off" | "major" | "minor";
  monitor: boolean;
};

export type FxHandle = {
  inputNode: AudioNode;
  outputNode: AudioNode;
  analyser: AnalyserNode;
  setConfig: (cfg: Partial<FxConfig>) => void;
  getConfig: () => FxConfig;
  dispose: () => void;
};

function makeImpulse(ctx: BaseAudioContext, durationSec: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * durationSec));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function makeDistortionCurve(amount: number, samples = 1024) {
  const k = amount * 100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Simple grain-based pitch shifter using two delay lines crossfaded over
 * a 50ms window. Lightweight and produces an audible musical effect for
 * the ±12 semitone range we expose.
 */
function makePitchShifter(ctx: AudioContext): { input: GainNode; output: GainNode; setSemis: (s: number) => void } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0;
  input.connect(dry);
  dry.connect(output);
  // Two delay paths with modulated delay-time => pitch shift.
  const grain = ctx.createDelay(0.2);
  const grain2 = ctx.createDelay(0.2);
  const gA = ctx.createGain();
  const gB = ctx.createGain();
  gA.gain.value = 0.5;
  gB.gain.value = 0.5;
  input.connect(grain); grain.connect(gA); gA.connect(output);
  input.connect(grain2); grain2.connect(gB); gB.connect(output);
  // LFO-driven sawtooth modulators (we'll fake with constant ramps).
  let semis = 0;
  let raf = 0;
  const window = 0.05; // 50ms grain
  const start = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (semis === 0) {
      grain.delayTime.value = 0;
      grain2.delayTime.value = 0;
      dry.gain.value = 1;
      gA.gain.value = 0; gB.gain.value = 0;
      return;
    }
    dry.gain.value = 0; gA.gain.value = 0.55; gB.gain.value = 0.55;
    const rate = Math.pow(2, semis / 12);
    const speed = (1 - rate);                 // negative = pitch up
    const period = window / Math.max(0.0001, Math.abs(speed));
    const phase = ((performance.now() - start) / 1000) % period;
    const t = phase / period;                  // 0..1
    const t2 = (t + 0.5) % 1;
    grain.delayTime.value = t * window;
    grain2.delayTime.value = t2 * window;
    // Crossfade two grains for smoother result
    const fade = (x: number) => 0.5 - 0.5 * Math.cos(x * Math.PI * 2);
    gA.gain.value = fade(t) * 0.6;
    gB.gain.value = fade(t2) * 0.6;
  };
  raf = requestAnimationFrame(loop);
  return {
    input, output,
    setSemis: (s: number) => { semis = Math.max(-12, Math.min(12, Math.round(s))); },
  };
}

export function createFxChain(ctx: AudioContext, source: AudioNode, initial?: Partial<FxConfig>): FxHandle {
  const cfg: FxConfig = {
    pitchSemis: 0, reverb: 0.2, delay: 0.0, distortion: 0.0,
    autoSnap: "off", monitor: false,
    ...initial,
  };

  const inGain = ctx.createGain();
  inGain.gain.value = 1;
  source.connect(inGain);

  const pitch = makePitchShifter(ctx);
  inGain.connect(pitch.input);

  // Distortion (post-pitch so the harmonics aren't lost in shifting)
  const dist = ctx.createWaveShaper();
  dist.curve = makeDistortionCurve(cfg.distortion);
  dist.oversample = "2x";
  const distMix = ctx.createGain();
  pitch.output.connect(dist);
  dist.connect(distMix);
  // Dry mix bypass when distortion 0
  const distBypass = ctx.createGain();
  distBypass.gain.value = 1;
  pitch.output.connect(distBypass);

  const postSum = ctx.createGain();
  distMix.connect(postSum);
  distBypass.connect(postSum);

  // Delay
  const delayNode = ctx.createDelay(1.5);
  delayNode.delayTime.value = 0.32;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const delayMix = ctx.createGain();
  delayMix.gain.value = cfg.delay;
  postSum.connect(delayNode);
  delayNode.connect(feedback);
  feedback.connect(delayNode);
  delayNode.connect(delayMix);

  // Reverb
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.2, 2.4);
  const reverbMix = ctx.createGain();
  reverbMix.gain.value = cfg.reverb;
  postSum.connect(conv);
  conv.connect(reverbMix);

  // Output sum + monitor + analyser
  const outSum = ctx.createGain();
  postSum.connect(outSum);
  delayMix.connect(outSum);
  reverbMix.connect(outSum);

  const monitorGain = ctx.createGain();
  monitorGain.gain.value = cfg.monitor ? 1 : 0;
  outSum.connect(monitorGain);
  monitorGain.connect(ctx.destination);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  outSum.connect(analyser);

  function applyConfig() {
    pitch.setSemis(cfg.pitchSemis);
    dist.curve = makeDistortionCurve(cfg.distortion);
    distMix.gain.value = cfg.distortion > 0.001 ? 1 : 0;
    distBypass.gain.value = cfg.distortion > 0.001 ? 0 : 1;
    delayMix.gain.value = cfg.delay * 0.6;
    feedback.gain.value = 0.2 + cfg.delay * 0.45;
    reverbMix.gain.value = cfg.reverb * 0.7;
    monitorGain.gain.value = cfg.monitor ? 1 : 0;
  }
  applyConfig();

  // AutoSnap loop — measures pitch every ~120ms and nudges pitchSemis toward the nearest key tone.
  let snapRaf = 0;
  let lastSnap = 0;
  const snapBuf = new Float32Array(analyser.fftSize);
  function detectPitchHz(): number | null {
    analyser.getFloatTimeDomainData(snapBuf);
    // Simple autocorrelation pitch detector.
    const SR = ctx.sampleRate;
    let rms = 0;
    for (let i = 0; i < snapBuf.length; i++) rms += snapBuf[i] * snapBuf[i];
    rms = Math.sqrt(rms / snapBuf.length);
    if (rms < 0.01) return null;
    let bestOff = -1, bestCorr = 0;
    const minOff = Math.floor(SR / 800);
    const maxOff = Math.floor(SR / 70);
    for (let off = minOff; off < maxOff; off++) {
      let c = 0;
      for (let i = 0; i < snapBuf.length - off; i++) c += snapBuf[i] * snapBuf[i + off];
      if (c > bestCorr) { bestCorr = c; bestOff = off; }
    }
    if (bestOff <= 0) return null;
    return SR / bestOff;
  }
  const snapLoop = () => {
    snapRaf = requestAnimationFrame(snapLoop);
    if (cfg.autoSnap === "off") return;
    const now = performance.now();
    if (now - lastSnap < 140) return;
    lastSnap = now;
    const hz = detectPitchHz();
    if (!hz) return;
    const snapped = snapHzToScale(hz, cfg.autoSnap === "minor" ? "minor" : "major");
    if (!snapped) return;
    const cents = 1200 * Math.log2(snapped / hz);
    // Soft correction — push pitchSemis by partial semitone (max 0.2 step).
    const target = Math.max(-12, Math.min(12, cfg.pitchSemis + Math.max(-0.2, Math.min(0.2, cents / 100))));
    cfg.pitchSemis = target;
    pitch.setSemis(target);
  };
  snapRaf = requestAnimationFrame(snapLoop);

  return {
    inputNode: inGain,
    outputNode: outSum,
    analyser,
    getConfig: () => ({ ...cfg }),
    setConfig: (patch) => { Object.assign(cfg, patch); applyConfig(); },
    dispose: () => {
      cancelAnimationFrame(snapRaf);
      try { source.disconnect(inGain); } catch { /* noop */ }
      try { monitorGain.disconnect(); } catch { /* noop */ }
    },
  };
}