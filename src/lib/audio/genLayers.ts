// Generative accompaniment layers — drums, bass, pluck, pad/riser — all
// rendered offline via OfflineAudioContext, locked to the live key & BPM.
// Used by the Director to "tarnen" the moment a transition starts so the
// listener hears continuity instead of a gap.

import { keyToPitchClass, isMinorKey } from "./keyDelta";

export type LayerKind = "drums" | "bass" | "pluck" | "pad";

export type LayerOptions = {
  bpm: number;
  bars: number;
  /** Live key like "Am", "C#m", "F". Used to anchor harmonic layers. */
  key?: string | null;
  /** Drum pattern variant. */
  drumStyle?: "four-floor" | "breakbeat" | "halftime";
  /** Pluck progression — degrees in the scale. Defaults to I–V–vi–IV. */
  progression?: number[];
  /** Overall amplitude (0..1). */
  level?: number;
};

function rootMidi(key: string | null | undefined): number {
  const pc = keyToPitchClass(key);
  // Default A2 (45) so the bass sits low without booming
  if (pc == null) return 45;
  return 36 + pc; // C2..B2 region
}

function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleSemitones(minor: boolean): number[] {
  return minor
    ? [0, 2, 3, 5, 7, 8, 10] // natural minor
    : [0, 2, 4, 5, 7, 9, 11]; // major
}

function scheduleKick(ctx: OfflineAudioContext, t: number, level: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}

function scheduleSnare(ctx: OfflineAudioContext, t: number, level: number) {
  const dur = 0.18;
  const bufLen = Math.floor(ctx.sampleRate * dur);
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = level * 0.5;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
}

function scheduleHat(ctx: OfflineAudioContext, t: number, level: number, open = false) {
  const dur = open ? 0.18 : 0.05;
  const bufLen = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.value = level * 0.3;
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t);
}

function renderDrums(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const totalBeats = opts.bars * 4;
  const level = opts.level ?? 0.7;
  const style = opts.drumStyle ?? "four-floor";
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatSec;
    // KICK
    if (style === "four-floor") scheduleKick(ctx, t, level);
    else if (style === "halftime") { if (b % 4 === 0) scheduleKick(ctx, t, level); }
    else { if (b % 4 === 0 || b % 4 === 2 || (b % 8 === 3)) scheduleKick(ctx, t, level * 0.9); }
    // SNARE on 2 & 4
    if (b % 4 === 1 || b % 4 === 3) scheduleSnare(ctx, t, level);
    // HATS — 8ths, accent on offbeat
    for (let h = 0; h < 2; h++) {
      const tt = t + h * (beatSec / 2);
      scheduleHat(ctx, tt, level * (h === 1 ? 1 : 0.6), b % 8 === 7 && h === 1);
    }
  }
}

function renderBass(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.4;
  const minor = isMinorKey(opts.key);
  const root = rootMidi(opts.key);
  const scale = scaleSemitones(minor);
  // 8-step root-walk: tonic, fifth, sixth, fourth (I–V–vi–IV-ish)
  const degs = (opts.progression ?? [0, 4, 5, 3]);
  const totalBars = opts.bars;
  for (let bar = 0; bar < totalBars; bar++) {
    const deg = degs[bar % degs.length];
    const midi = root + scale[deg % scale.length];
    const f = mtof(midi);
    const t0 = bar * 4 * beatSec;
    // Sustain a whole note with a quick attack/release
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = "triangle"; osc.frequency.value = f;
    sub.type = "sine"; sub.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 240; lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.04);
    g.gain.setValueAtTime(level, t0 + 4 * beatSec - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4 * beatSec - 0.01);
    osc.connect(lp); sub.connect(lp); lp.connect(g).connect(ctx.destination);
    osc.start(t0); sub.start(t0);
    osc.stop(t0 + 4 * beatSec); sub.stop(t0 + 4 * beatSec);
  }
}

function renderPluck(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.22;
  const minor = isMinorKey(opts.key);
  const root = rootMidi(opts.key) + 24; // up two octaves for pluck range
  const scale = scaleSemitones(minor);
  const degs = (opts.progression ?? [0, 4, 5, 3]);
  const arp = [0, 2, 4, 2]; // 3-note arp pattern inside each chord
  const totalBars = opts.bars;
  for (let bar = 0; bar < totalBars; bar++) {
    const deg = degs[bar % degs.length];
    for (let step = 0; step < 8; step++) {
      const t = bar * 4 * beatSec + step * (beatSec / 2);
      const tone = scale[(deg + arp[step % arp.length]) % scale.length];
      const midi = root + tone;
      const f = mtof(midi);
      const osc = ctx.createOscillator();
      osc.type = "triangle"; osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    }
  }
}

function renderPad(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.18;
  const minor = isMinorKey(opts.key);
  const root = rootMidi(opts.key) + 12; // one octave up
  const scale = scaleSemitones(minor);
  const chord = [scale[0], scale[2], scale[4]];
  const totalSec = opts.bars * 4 * beatSec;
  // Noise riser layered with sustained triad
  for (const tone of chord) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth"; osc.frequency.value = mtof(root + tone);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(600, 0);
    lp.frequency.exponentialRampToValueAtTime(4500, totalSec);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(level, 0.4);
    g.gain.setValueAtTime(level, totalSec - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, totalSec - 0.01);
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.start(0); osc.stop(totalSec);
  }
  // Noise riser
  const noiseLen = Math.floor(ctx.sampleRate * totalSec);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(i / noiseLen, 2);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4000;
  const ng = ctx.createGain(); ng.gain.value = level * 0.7;
  src.connect(hp).connect(ng).connect(ctx.destination);
  src.start(0);
}

/** Render one layer kind to a buffer, locked to BPM and key. */
export async function renderLayer(kind: LayerKind, opts: LayerOptions): Promise<AudioBuffer> {
  const sr = 44100;
  const beatSec = 60 / opts.bpm;
  const totalSec = opts.bars * 4 * beatSec + 0.5;
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const ctx = new Ctx(2, Math.floor(totalSec * sr), sr);
  if (kind === "drums") renderDrums(ctx, opts);
  else if (kind === "bass") renderBass(ctx, opts);
  else if (kind === "pluck") renderPluck(ctx, opts);
  else if (kind === "pad") renderPad(ctx, opts);
  return await ctx.startRendering();
}

/** Render and sum multiple layers into a single buffer. */
export async function renderLayerStack(kinds: LayerKind[], opts: LayerOptions): Promise<AudioBuffer> {
  const bufs = await Promise.all(kinds.map((k) => renderLayer(k, opts)));
  if (!bufs.length) {
    const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
    return new Ctx(2, 1, 44100).startRendering();
  }
  const sr = bufs[0].sampleRate;
  const len = Math.max(...bufs.map((b) => b.length));
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const ctx = new Ctx(2, len, sr);
  for (const b of bufs) {
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(0);
  }
  return await ctx.startRendering();
}
