// Generative accompaniment layers — drums, bass, pluck, pad — rendered
// offline via OfflineAudioContext. Goal: musically convincing "glue" that
// locks to the live BPM/key AND harmonically leads into the incoming key
// over the last bar (cadence). All layers share:
//   • 8-th note swing (configurable)
//   • shaped ADSR envelopes (no clicky exp ramps)
//   • Karplus-Strong pluck for real plucked-string timbre
//   • soft tanh saturation + master HP on the sum so it sits under the deck

import { keyToPitchClass, isMinorKey } from "./keyDelta";

export type LayerKind = "drums" | "bass" | "pluck" | "pad";

export type LayerOptions = {
  bpm: number;
  bars: number;
  /** Live key like "Am", "C#m", "F". Anchors harmonic layers at start. */
  key?: string | null;
  /** Target key the bridge resolves to (incoming track). When set, the last
   *  bar performs a cadence (V → I in the target key). */
  targetKey?: string | null;
  /** Drum pattern variant. */
  drumStyle?: "four-floor" | "breakbeat" | "halftime";
  /** Chord-progression degrees relative to live key root. Defaults pick
   *  themselves based on minor/major + targetKey. */
  progression?: number[];
  /** Overall amplitude (0..1). */
  level?: number;
  /** 0..0.25 — micro-delay on off-8ths for groove. Default 0.08. */
  swing?: number;
};

// ---- music helpers --------------------------------------------------------

function mtof(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }

function scaleSemitones(minor: boolean): number[] {
  return minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
}

/** Triad (root, third, fifth) for a given scale degree (0..6). */
function triadAt(rootPc: number, minor: boolean, degree: number): number[] {
  const sc = scaleSemitones(minor);
  const d = ((degree % 7) + 7) % 7;
  return [0, 2, 4].map((step) => rootPc + sc[(d + step) % 7] + Math.floor((d + step) / 7) * 12);
}

/** Build a bar-by-bar chord plan that ends with a V→I cadence in targetKey
 *  whenever targetKey is provided and differs from key. Otherwise loops a
 *  pleasant I–VI–IV–V (major) / i–VI–III–VII (minor). */
function chordPlan(opts: LayerOptions): { roots: number[]; thirds: number[]; fifths: number[] } {
  const livePc = keyToPitchClass(opts.key) ?? 9; // A
  const minor = isMinorKey(opts.key);
  const tgtPc = keyToPitchClass(opts.targetKey ?? opts.key);
  const tgtMinor = isMinorKey(opts.targetKey ?? opts.key);
  const bars = Math.max(2, opts.bars);
  const degsHome = opts.progression ?? (minor ? [0, 5, 3, 4] : [0, 5, 3, 4]); // i VI IV V / I vi IV V

  const roots: number[] = [];
  const thirds: number[] = [];
  const fifths: number[] = [];

  for (let b = 0; b < bars; b++) {
    // Last 1–2 bars: cadence into target. V (bar n-1) → I (bar n).
    const isLast = b === bars - 1;
    const isPenult = b === bars - 2 && bars >= 3;
    let pc: number; let modeMinor: boolean; let degree: number;
    if (isLast && tgtPc != null) {
      pc = tgtPc; modeMinor = tgtMinor; degree = 0; // I/i in target
    } else if (isPenult && tgtPc != null) {
      // V chord of target: root = tgtPc + 7 (major), regardless of mode
      pc = (tgtPc + 7) % 12; modeMinor = false; degree = 0;
    } else {
      pc = livePc; modeMinor = minor; degree = degsHome[b % degsHome.length];
    }
    const tri = triadAt(pc, modeMinor, degree);
    roots.push(tri[0]); thirds.push(tri[1]); fifths.push(tri[2]);
  }
  return { roots, thirds, fifths };
}

/** Small soft-knee tanh saturator. */
function shape(s: number, drive = 1.6): number {
  return Math.tanh(s * drive) / Math.tanh(drive);
}

// ---- drum hits ------------------------------------------------------------

function scheduleKick(ctx: OfflineAudioContext, t: number, level: number) {
  // Sub body + click transient
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.4);

  // Click body
  const clickLen = Math.floor(0.012 * ctx.sampleRate);
  const cb = ctx.createBuffer(1, clickLen, ctx.sampleRate);
  const cd = cb.getChannelData(0);
  for (let i = 0; i < clickLen; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
  const cs = ctx.createBufferSource(); cs.buffer = cb;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
  const cg = ctx.createGain(); cg.gain.value = level * 0.45;
  cs.connect(hp).connect(cg).connect(ctx.destination);
  cs.start(t);
}

function scheduleSnare(ctx: OfflineAudioContext, t: number, level: number, ghost = false) {
  const dur = ghost ? 0.06 : 0.16;
  const bufLen = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.4);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.value = level * (ghost ? 0.18 : 0.55);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);

  if (!ghost) {
    // Tonal body around 200 Hz for weight
    const osc = ctx.createOscillator();
    osc.type = "triangle"; osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.05);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(level * 0.35, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(og).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.1);
  }
}

function scheduleHat(ctx: OfflineAudioContext, t: number, level: number, open = false) {
  const dur = open ? 0.22 : 0.04;
  const bufLen = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, open ? 1.8 : 2.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
  const g = ctx.createGain(); g.gain.value = level * (open ? 0.22 : 0.18);
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t);
}

// ---- layer renderers ------------------------------------------------------

function renderDrums(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const totalBeats = opts.bars * 4;
  const level = opts.level ?? 0.7;
  const style = opts.drumStyle ?? "halftime";
  const swing = opts.swing ?? 0.08;
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatSec;
    // KICK
    if (style === "four-floor") scheduleKick(ctx, t, level);
    else if (style === "halftime") { if (b % 4 === 0) scheduleKick(ctx, t, level); }
    else { if (b % 4 === 0 || b % 4 === 2 || b % 8 === 3) scheduleKick(ctx, t, level * 0.9); }
    // SNARE on 2 & 4 (halftime: only 3 of every 8)
    if (style === "halftime") {
      if (b % 8 === 4) scheduleSnare(ctx, t, level);
    } else if (b % 4 === 1 || b % 4 === 3) {
      scheduleSnare(ctx, t, level);
      // ghost 16th before next downbeat
      if (Math.random() < 0.35) scheduleSnare(ctx, t + beatSec * 0.75, level, true);
    }
    // HATS — 8ths with swing on off-8th, open on last 8th of every 2 bars
    for (let h = 0; h < 2; h++) {
      const tt = t + h * (beatSec / 2) + (h === 1 ? swing * (beatSec / 2) : 0);
      const isLastEighth = b === totalBeats - 1 && h === 1;
      scheduleHat(ctx, tt, level * (h === 1 ? 0.85 : 0.6), isLastEighth || (b % 8 === 7 && h === 1));
    }
  }
}

function renderBass(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.45;
  const swing = opts.swing ?? 0.08;
  const plan = chordPlan(opts);

  // Rhythmic root pattern (8th notes): root - rest - oct - rest - root - fifth - root - rest
  // expressed as offsets from root in semitones, null = rest.
  const pattern: (number | null)[] = [0, null, 12, null, 0, 7, 0, null];

  for (let bar = 0; bar < opts.bars; bar++) {
    const rootMidi = 36 + (plan.roots[bar] % 12); // C2 region
    const fifthOffset = (plan.fifths[bar] - plan.roots[bar]); // typically 7
    for (let step = 0; step < 8; step++) {
      const off = pattern[step];
      if (off == null) continue;
      const swung = (step % 2 === 1) ? swing * (beatSec / 2) : 0;
      const t = bar * 4 * beatSec + step * (beatSec / 2) + swung;
      const semis = off === 7 ? fifthOffset : off; // mirror fifth to actual chord fifth
      const midi = rootMidi + semis;
      const f = mtof(midi);
      const noteDur = beatSec * 0.45;

      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      osc.type = "sawtooth"; osc.frequency.value = f;
      sub.type = "sine"; sub.frequency.value = f * 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      // filter envelope: opens briefly on attack
      lp.frequency.setValueAtTime(180, t);
      lp.frequency.exponentialRampToValueAtTime(950, t + 0.02);
      lp.frequency.exponentialRampToValueAtTime(260, t + noteDur);
      lp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level, t + 0.008);
      g.gain.exponentialRampToValueAtTime(level * 0.55, t + noteDur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(lp); sub.connect(lp); lp.connect(g).connect(ctx.destination);
      osc.start(t); sub.start(t);
      osc.stop(t + noteDur + 0.02); sub.stop(t + noteDur + 0.02);
    }
  }
}

/** Karplus-Strong plucked-string voice. Sounds like a nylon/electric pluck. */
function scheduleKarplus(ctx: OfflineAudioContext, t: number, freq: number, dur: number, level: number) {
  const sr = ctx.sampleRate;
  const N = Math.max(8, Math.floor(sr / freq));
  const totalLen = Math.floor(dur * sr);
  const buf = ctx.createBuffer(1, totalLen, sr);
  const out = buf.getChannelData(0);
  // initial noise burst
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1);
  let idx = 0;
  const damping = 0.5; // lower = brighter, higher = darker
  const decay = Math.exp(-1.8 / (freq * dur * 0.5)); // longer note = slower decay
  for (let i = 0; i < totalLen; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % N];
    const next = (a * (1 - damping) + b * damping) * decay * 0.996;
    out[i] = a;
    ring[idx] = next;
    idx = (idx + 1) % N;
  }
  // Apply ADSR-ish envelope on top
  for (let i = 0; i < totalLen; i++) {
    const env = i < 64 ? i / 64 : 1;
    const tail = i > totalLen - 256 ? Math.max(0, (totalLen - i) / 256) : 1;
    out[i] *= env * tail * 0.6;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = level;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120;
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t);
}

function renderPluck(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.32;
  const swing = opts.swing ?? 0.08;
  const plan = chordPlan(opts);
  // 8-step ascending-then-descending arpeggio over chord tones
  const arpIdx = [0, 1, 2, 1, 2, 1, 0, 1];
  for (let bar = 0; bar < opts.bars; bar++) {
    const chord = [plan.roots[bar], plan.thirds[bar], plan.fifths[bar]]
      .map((pc) => 60 + (pc % 12)); // around C4
    for (let step = 0; step < 8; step++) {
      const swung = (step % 2 === 1) ? swing * (beatSec / 2) : 0;
      const t = bar * 4 * beatSec + step * (beatSec / 2) + swung;
      const midi = chord[arpIdx[step]] + (step >= 4 ? 12 : 0);
      const f = mtof(midi);
      const dur = beatSec * 0.9;
      const accent = (step === 0 || step === 4) ? 1.0 : 0.7;
      scheduleKarplus(ctx, t, f, dur, level * accent);
    }
  }
}

function renderPad(ctx: OfflineAudioContext, opts: LayerOptions) {
  const beatSec = 60 / opts.bpm;
  const level = opts.level ?? 0.20;
  const plan = chordPlan(opts);
  // Sustained detuned saw triad per bar, common-tone voice leading
  for (let bar = 0; bar < opts.bars; bar++) {
    const t0 = bar * 4 * beatSec;
    const t1 = (bar + 1) * 4 * beatSec;
    const chord = [plan.roots[bar], plan.thirds[bar], plan.fifths[bar]]
      .map((pc) => 60 + (pc % 12)); // octave 4
    for (const midi of chord) {
      for (const det of [-7, 0, 7] as const) { // cents detune via Hz scale
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const f = mtof(midi) * Math.pow(2, det / 1200);
        osc.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.Q.value = 0.7;
        // filter shape: opens slowly over the bar then closes
        lp.frequency.setValueAtTime(600, t0);
        lp.frequency.linearRampToValueAtTime(2200, t0 + (t1 - t0) * 0.6);
        lp.frequency.linearRampToValueAtTime(700, t1);
        const g = ctx.createGain();
        const peak = level / 3; // 3 voices per chord
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.25);
        g.gain.setValueAtTime(peak, t1 - 0.18);
        g.gain.linearRampToValueAtTime(0.0001, t1 - 0.005);
        osc.connect(lp).connect(g).connect(ctx.destination);
        osc.start(t0); osc.stop(t1 + 0.01);
      }
    }
  }
}

// ---- public API -----------------------------------------------------------

function applySoftLimiter(buf: AudioBuffer): AudioBuffer {
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = shape(d[i], 1.4) * 0.85;
  }
  return buf;
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
  const rendered = await ctx.startRendering();
  return applySoftLimiter(rendered);
}

/** Render and sum multiple layers into a single buffer with soft limiting. */
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
    // light HP to keep the deck's low end clean
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 40;
    src.connect(hp).connect(ctx.destination);
    src.start(0);
  }
  const summed = await ctx.startRendering();
  return applySoftLimiter(summed);
}