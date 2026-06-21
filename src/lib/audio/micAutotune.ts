// Sing-along autotune: locks an incoming mic stream to the scale of the
// currently playing song. Lightweight grain-based pitch shifter driven by
// an autocorrelation pitch detector — no worklets, no extra dependencies.
import { freqToMidi, midiToFreq } from "@/lib/audio/pitch";
import { keyToPitchClass, isMinorKey } from "@/lib/audio/keyDelta";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const CHROMATIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export type ScaleMode = "major" | "minor" | "chromatic";

export type AutotuneTarget = {
  /** Root pitch class 0..11 (0 = C). */
  root: number;
  mode: ScaleMode;
};

export type AutotuneConfig = {
  enabled: boolean;
  /** 0..1 — how strongly to pull toward the snapped note (0=natural, 1=hard T-Pain). */
  strength: number;
  /** ms between snap updates. */
  speedMs: number;
  target: AutotuneTarget;
};

export type MicAutotuneHandle = {
  output: AudioNode;
  setConfig: (patch: Partial<AutotuneConfig>) => void;
  setTargetKey: (musicalKey: string | null, fallback?: ScaleMode) => void;
  getDetectedHz: () => number;
  getCurrentDetune: () => number;
  dispose: () => void;
};

export function targetFromKey(key: string | null | undefined, fallback: ScaleMode = "chromatic"): AutotuneTarget {
  const pc = keyToPitchClass(key);
  if (pc == null) return { root: 0, mode: fallback };
  return { root: pc, mode: isMinorKey(key) ? "minor" : "major" };
}

function snapMidi(midi: number, t: AutotuneTarget): number {
  const notes = t.mode === "minor" ? MINOR : t.mode === "chromatic" ? CHROMATIC : MAJOR;
  const allowed = new Set(notes.map((n) => (n + t.root) % 12));
  let best = Math.round(midi);
  let bestDist = Infinity;
  for (let cand = Math.round(midi) - 2; cand <= Math.round(midi) + 2; cand++) {
    if (allowed.has(((cand % 12) + 12) % 12)) {
      const d = Math.abs(cand - midi);
      if (d < bestDist) { bestDist = d; best = cand; }
    }
  }
  return best;
}

/** Cross-faded delay-line pitch shifter driven by a `cents` control (±300 ≈ ±3 semitones). */
function makeCentsShifter(ctx: AudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 1;
  input.connect(dry); dry.connect(output);
  const grainA = ctx.createDelay(0.25);
  const grainB = ctx.createDelay(0.25);
  const gA = ctx.createGain(); gA.gain.value = 0;
  const gB = ctx.createGain(); gB.gain.value = 0;
  input.connect(grainA); grainA.connect(gA); gA.connect(output);
  input.connect(grainB); grainB.connect(gB); gB.connect(output);

  let cents = 0;            // target
  let displayed = 0;        // smoothed
  let raf = 0;
  const W = 0.05;           // 50 ms grain window
  const start = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    // Smoothly approach target (~60 ms time-constant).
    displayed += (cents - displayed) * 0.18;
    if (Math.abs(displayed) < 1) {
      grainA.delayTime.value = 0;
      grainB.delayTime.value = 0;
      dry.gain.value = 1; gA.gain.value = 0; gB.gain.value = 0;
      return;
    }
    const rate = Math.pow(2, displayed / 1200);
    const speed = 1 - rate;
    const period = W / Math.max(0.0001, Math.abs(speed));
    const phase = ((performance.now() - start) / 1000) % period;
    const t = phase / period;
    const t2 = (t + 0.5) % 1;
    grainA.delayTime.value = t * W;
    grainB.delayTime.value = t2 * W;
    const fade = (x: number) => 0.5 - 0.5 * Math.cos(x * Math.PI * 2);
    const wet = Math.min(1, Math.abs(displayed) / 80);
    dry.gain.value = 1 - wet;
    gA.gain.value = fade(t) * 0.6 * wet;
    gB.gain.value = fade(t2) * 0.6 * wet;
  };
  raf = requestAnimationFrame(loop);
  return {
    input, output,
    setCents: (c: number) => { cents = Math.max(-1200, Math.min(1200, c)); },
    getCents: () => displayed,
    dispose: () => cancelAnimationFrame(raf),
  };
}

export function createMicAutotune(ctx: AudioContext, source: AudioNode, initial?: Partial<AutotuneConfig>): MicAutotuneHandle {
  const cfg: AutotuneConfig = {
    enabled: true,
    strength: 0.7,
    speedMs: 80,
    target: { root: 0, mode: "chromatic" },
    ...initial,
    target: { ...{ root: 0, mode: "chromatic" }, ...(initial?.target ?? {}) },
  };

  // Bypass branch when disabled — keep both wires up so we can toggle silently.
  const inGain = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = cfg.enabled ? 1 : 0;
  const dry = ctx.createGain(); dry.gain.value = cfg.enabled ? 0 : 1;
  source.connect(inGain);
  const shifter = makeCentsShifter(ctx);
  inGain.connect(shifter.input);
  inGain.connect(dry);
  shifter.output.connect(wet);
  const out = ctx.createGain();
  wet.connect(out);
  dry.connect(out);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  inGain.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let lastHz = 0;
  function detectHz(): number {
    analyser.getFloatTimeDomainData(buf);
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.012) return 0;
    const SR = ctx.sampleRate;
    const minOff = Math.floor(SR / 800);
    const maxOff = Math.floor(SR / 70);
    let bestOff = -1, bestCorr = 0;
    for (let off = minOff; off < maxOff; off++) {
      let c = 0;
      for (let i = 0; i < buf.length - off; i++) c += buf[i] * buf[i + off];
      if (c > bestCorr) { bestCorr = c; bestOff = off; }
    }
    if (bestOff <= 0) return 0;
    return SR / bestOff;
  }

  let lastTick = 0;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!cfg.enabled) { shifter.setCents(0); return; }
    const now = performance.now();
    if (now - lastTick < cfg.speedMs) return;
    lastTick = now;
    const hz = detectHz();
    if (!hz) { lastHz = 0; shifter.setCents(0); return; }
    lastHz = hz;
    const midi = freqToMidi(hz);
    const snapped = snapMidi(midi, cfg.target);
    const targetHz = midiToFreq(snapped);
    const cents = 1200 * Math.log2(targetHz / hz); // can be ±~150
    if (!isFinite(cents)) return;
    // Clamp to ±300 cents so wild misdetections don't yank the voice.
    const clamped = Math.max(-300, Math.min(300, cents));
    shifter.setCents(clamped * cfg.strength);
  };
  raf = requestAnimationFrame(loop);

  function applyEnabled() {
    wet.gain.setTargetAtTime(cfg.enabled ? 1 : 0, ctx.currentTime, 0.02);
    dry.gain.setTargetAtTime(cfg.enabled ? 0 : 1, ctx.currentTime, 0.02);
  }

  return {
    output: out,
    setConfig: (patch) => {
      Object.assign(cfg, patch);
      if (patch.target) cfg.target = { ...cfg.target, ...patch.target };
      applyEnabled();
    },
    setTargetKey: (key, fallback = "chromatic") => {
      cfg.target = targetFromKey(key, fallback);
    },
    getDetectedHz: () => lastHz,
    getCurrentDetune: () => shifter.getCents(),
    dispose: () => {
      cancelAnimationFrame(raf);
      shifter.dispose();
      try { source.disconnect(inGain); } catch { /* noop */ }
    },
  };
}