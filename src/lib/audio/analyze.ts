// Client-side audio analysis: BPM, beat-grid, musical key, energy curve,
// hot-cues, vocal-presence map. Runs on a decoded AudioBuffer. Pure JS.
import { estimateBPM } from "./mashup";
import { NOTE_NAMES } from "./pitch";
import { findTrimPoints, correctBpmFold } from "./proTransition";

export type TrackAnalysis = {
  bpm: number;
  musicalKey: string;        // e.g. "Am", "C", "F#m"
  camelot: string;           // e.g. "8A"
  beatGrid: number[];        // beat timestamps in seconds (downbeats every 4)
  firstBeat: number;         // offset to first detected beat
  energyCurve: number[];     // RMS per second
  cues: {
    introEnd: number;        // sec
    firstDrop: number;       // sec — peak energy region start
    outroStart: number;      // sec
  };
  vocalMap: { t: number; voiced: number }[]; // per-second 0..1
  /** 24-dim L2-normalized fingerprint vector (cosine-similarity ready). */
  embedding: number[];
  /** Auto-assigned bucket: warmup | filler | peak | cooldown | reserve. */
  smartCrate: SmartCrate;
  /** Overall mean energy 0..1 (convenience, derived from energyCurve). */
  overallEnergy: number;
  /** Mean vocal density 0..1 (derived from vocalMap). */
  vocalDensity: number;
  /** First sample > −60 dBFS — real start of audible audio. */
  trimInSec: number;
  /** Last sample > −60 dBFS — real end of audible audio. */
  trimOutSec: number;
  /** Integrated loudness in LUFS (ITU-R BS.1770 K-weighted, gated approximation).
   *  Negative numbers — −14 LUFS ≈ Spotify target. */
  lufsIntegrated: number;
  /** Gain (dB) to apply on playback so this track sits at −14 LUFS. */
  loudnessGainDb: number;
  /** Buildup/drop events derived from the energy curve. Caller can trigger
   *  filter risers or stutter-cuts at the marked time stamps. */
  energyEvents: { t: number; kind: "buildup" | "drop"; strength: number }[];
};

export type SmartCrate = "warmup" | "filler" | "peak" | "cooldown" | "reserve";

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Camelot wheel mapping: pitch-class + mode -> camelot code
const CAMELOT_MAJOR: Record<number, string> = {
  0:"8B",1:"3B",2:"10B",3:"5B",4:"12B",5:"7B",6:"2B",7:"9B",8:"4B",9:"11B",10:"6B",11:"1B",
};
const CAMELOT_MINOR: Record<number, string> = {
  0:"5A",1:"12A",2:"7A",3:"2A",4:"9A",5:"4A",6:"11A",7:"6A",8:"1A",9:"8A",10:"3A",11:"10A",
};

function rms(arr: Float32Array, start: number, len: number): number {
  let s = 0;
  const end = Math.min(arr.length, start + len);
  for (let i = start; i < end; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

/** Pick the most musical BPM octave: try ½×, 1×, 2× and prefer the value
 *  closest to a 110 BPM "house default", which dramatically reduces the
 *  classic half/double-time mis-reads from naive autocorrelation. */
function correctBpmOctave(raw: number): number {
  if (!raw || !isFinite(raw)) return 120;
  const candidates = [raw / 2, raw, raw * 2].filter((c) => c >= 70 && c <= 180);
  if (!candidates.length) {
    // Force into [70, 180] by doubling/halving repeatedly
    let x = raw;
    while (x < 70) x *= 2;
    while (x > 180) x /= 2;
    return x;
  }
  // Prefer the candidate nearest the "musical sweet spot" 100..130
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = Math.abs(c - 115);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Find first significant onset to anchor the beat grid. */
function findFirstBeat(env: number[], fps: number, bpm: number): number {
  const beatSamp = Math.round((60 / bpm) * fps);
  const limit = Math.min(env.length, beatSamp * 16);
  // sliding sum over 1 beat window vs surrounding mean
  let bestI = 0;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const v = env[i];
    if (v > bestScore) { bestScore = v; bestI = i; }
  }
  return bestI / fps;
}

/** Build beat-grid timestamps from BPM + first beat over total duration. */
function buildBeatGrid(durationSec: number, bpm: number, firstBeat: number): number[] {
  const period = 60 / bpm;
  const out: number[] = [];
  for (let t = firstBeat; t < durationSec; t += period) out.push(+t.toFixed(4));
  return out;
}

/** Estimate key with Krumhansl-Schmuckler over a chromagram. */
function detectKey(buf: AudioBuffer): { key: string; camelot: string; pitchClass: number; mode: "maj" | "min" } {
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  // Goertzel chroma summed across 4 octaves (C2..B5) so sub-bass driven
  // mixes don't anchor the key to whatever instrument sits in C4..B4.
  const chroma = new Float32Array(12);
  const win = 4096;
  const hop = 4096;
  const octaves = [36, 48, 60, 72]; // MIDI roots: C2, C3, C4, C5
  for (let pc = 0; pc < 12; pc++) {
    let total = 0;
    let frames = 0;
    for (const root of octaves) {
      const f = 440 * Math.pow(2, ((root + pc) - 69) / 12);
      const k = Math.round((win * f) / sr);
      if (k <= 0 || k >= win / 2) continue;
      const w0 = (2 * Math.PI * k) / win;
      const coeff = 2 * Math.cos(w0);
      for (let pos = 0; pos + win < ch.length; pos += hop) {
        let s1 = 0, s2 = 0;
        for (let n = 0; n < win; n++) {
          const s0 = ch[pos + n] + coeff * s1 - s2;
          s2 = s1; s1 = s0;
        }
        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        total += Math.max(0, power);
        frames++;
        if (frames > 240) break;
      }
    }
    chroma[pc] = total / Math.max(1, frames);
  }
  // Normalize
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  // Correlate against rotated profiles
  let best = { score: -Infinity, pc: 0, mode: "maj" as "maj" | "min" };
  for (let rot = 0; rot < 12; rot++) {
    let majScore = 0, minScore = 0;
    for (let i = 0; i < 12; i++) {
      const c = chroma[(i + rot) % 12];
      majScore += c * MAJOR_PROFILE[i];
      minScore += c * MINOR_PROFILE[i];
    }
    if (majScore > best.score) best = { score: majScore, pc: rot, mode: "maj" };
    if (minScore > best.score) best = { score: minScore, pc: rot, mode: "min" };
  }
  const noteName = NOTE_NAMES[best.pc];
  const key = best.mode === "maj" ? noteName : `${noteName}m`;
  const camelot = best.mode === "maj" ? CAMELOT_MAJOR[best.pc] : CAMELOT_MINOR[best.pc];
  return { key, camelot, pitchClass: best.pc, mode: best.mode };
}

/** Per-second energy curve (RMS) for cue detection. */
function energyCurve(buf: AudioBuffer): number[] {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const sec = Math.floor(ch.length / sr);
  const out: number[] = [];
  for (let s = 0; s < sec; s++) out.push(+rms(ch, s * sr, sr).toFixed(4));
  return out;
}

/** Heuristic cues: intro-end (energy crosses 0.6 of peak), first drop (peak region), outro. */
function findCues(curve: number[]): { introEnd: number; firstDrop: number; outroStart: number } {
  if (!curve.length) return { introEnd: 0, firstDrop: 0, outroStart: 0 };
  const peak = Math.max(...curve);
  const thresh = peak * 0.55;
  const introEnd = curve.findIndex((v) => v >= thresh);
  // First drop: first sustained (>=4s) region above 0.8*peak
  const dropThresh = peak * 0.78;
  let firstDrop = introEnd;
  for (let i = introEnd; i < curve.length - 4; i++) {
    if (curve[i] >= dropThresh && curve[i+1] >= dropThresh && curve[i+2] >= dropThresh && curve[i+3] >= dropThresh) {
      firstDrop = i; break;
    }
  }
  // Outro: last region above 0.5*peak
  let outroStart = curve.length - 1;
  for (let i = curve.length - 1; i >= 0; i--) {
    if (curve[i] >= peak * 0.5) { outroStart = i; break; }
  }
  outroStart = Math.max(outroStart - 8, 0);
  return { introEnd: Math.max(0, introEnd), firstDrop, outroStart };
}

/** Vocal-presence per second via mid-band energy ratio + spectral flux.
 *  Vocals concentrate energy in 200–3400 Hz and modulate quickly (formants,
 *  consonants). We compute, per 1-second window:
 *   - bandRatio:  energy in 200–3400 Hz / total energy   (biquad bandpass)
 *   - flux:       short-time spectral change inside the band (consonant cue)
 *   - centroid:   spectral centroid pulled toward vocal range
 *  Then map to 0..1 with a calibrated logistic so realistic vocal-heavy
 *  tracks land around 0.5–0.9 instead of <0.05.
 */
function vocalMap(buf: AudioBuffer): { t: number; voiced: number }[] {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const out: { t: number; voiced: number }[] = [];

  // Biquad bandpass 200–3400 Hz (RBJ cookbook, bandwidth ≈ 3 oct)
  const f0 = 800;
  const Q = 0.55;
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const cw = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;

  const stepSamp = sr; // 1s windows
  const subWin = Math.floor(sr * 0.04); // 40ms sub-windows for flux
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let pos = 0; pos + stepSamp < ch.length; pos += stepSamp) {
    let bandE = 0;
    let totalE = 0;
    const subEnergies: number[] = [];
    let subAcc = 0;
    let subCount = 0;
    for (let n = 0; n < stepSamp; n++) {
      const x = ch[pos + n];
      const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      bandE += y * y;
      totalE += x * x;
      subAcc += y * y;
      subCount++;
      if (subCount >= subWin) {
        subEnergies.push(Math.sqrt(subAcc / subCount));
        subAcc = 0; subCount = 0;
      }
    }
    if (totalE < 1e-6) { out.push({ t: +(pos / sr).toFixed(2), voiced: 0 }); continue; }
    const bandRatio = Math.min(1, bandE / totalE);
    // Flux: mean absolute diff of sub-window envelopes, normalized
    let flux = 0;
    for (let i = 1; i < subEnergies.length; i++) flux += Math.abs(subEnergies[i] - subEnergies[i - 1]);
    const meanSub = subEnergies.reduce((a, b) => a + b, 0) / Math.max(1, subEnergies.length);
    const fluxNorm = meanSub > 1e-6 ? Math.min(1, flux / (subEnergies.length * meanSub)) : 0;
    // Combine: bandRatio dominates, flux gives the "speech-like modulation" boost
    const raw = bandRatio * 0.75 + fluxNorm * 0.45;
    // Logistic re-shape so a vocal-heavy pop track hits ~0.7
    const voiced = 1 / (1 + Math.exp(-(raw - 0.35) * 6));
    out.push({ t: +(pos / sr).toFixed(2), voiced: +voiced.toFixed(3) });
  }
  return out;
}

/** Run the full analysis. Yields between heavy steps to keep UI responsive. */
export async function analyzeAudio(buf: AudioBuffer, onProgress?: (label: string, pct: number) => void): Promise<TrackAnalysis> {
  const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

  onProgress?.("BPM", 10);
  const raw = estimateBPM(buf) || 120;
  const folded = correctBpmOctave(raw);
  // If we have a sibling/metadata hint later, the caller can override via
  // correctBpmFold(). For now keep the octave-corrected value.
  const bpm = folded;
  await yieldUI();

  onProgress?.("Energy", 30);
  const curve = energyCurve(buf);
  await yieldUI();

  onProgress?.("Beat grid", 50);
  // Onset envelope for first-beat detection (re-uses RMS hopping)
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const hop = Math.floor(sr * 0.02);
  const win = Math.floor(sr * 0.04);
  const env: number[] = [];
  for (let i = 0; i + win < ch.length; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) e += ch[i + j] * ch[i + j];
    env.push(Math.sqrt(e / win));
  }
  const firstBeat = findFirstBeat(env, sr / hop, bpm);
  const beatGrid = buildBeatGrid(buf.length / sr, bpm, firstBeat);
  await yieldUI();

  onProgress?.("Tonart", 70);
  const k = detectKey(buf);
  await yieldUI();

  onProgress?.("Vocal-Map", 88);
  const cues = findCues(curve);
  const vmap = vocalMap(buf);
  await yieldUI();

  onProgress?.("Fingerprint", 96);
  const overallEnergy = curve.length ? curve.reduce((a, b) => a + b, 0) / curve.length : 0;
  const vocalDensity = vmap.length ? vmap.reduce((a, p) => a + p.voiced, 0) / vmap.length : 0;
  const embedding = computeEmbedding(curve, vmap, bpm, k.pitchClass, k.mode);
  const smartCrate = assignSmartCrate(bpm, overallEnergy, vocalDensity);
  // Mixxx-style −60 dBFS silence trim for the real blend window.
  const trim = findTrimPoints(buf, -60);
  // ITU-R BS.1770-ish K-weighted integrated loudness.
  const lufs = measureLufs(buf);
  // Target: −14 LUFS (streaming-platform reference). Clamp ±9 dB so a
  // very quiet/very loud master doesn't blow up the live output.
  const loudnessGainDb = Math.max(-9, Math.min(9, -14 - lufs));
  const energyEvents = detectEnergyEvents(curve);
  onProgress?.("Fertig", 100);

  return {
    bpm: +bpm.toFixed(2),
    musicalKey: k.key,
    camelot: k.camelot,
    beatGrid,
    firstBeat,
    energyCurve: curve,
    cues,
    vocalMap: vmap,
    embedding,
    smartCrate,
    overallEnergy: +overallEnergy.toFixed(3),
    vocalDensity: +vocalDensity.toFixed(3),
    trimInSec: trim.trimInSec,
    trimOutSec: trim.trimOutSec,
    lufsIntegrated: +lufs.toFixed(2),
    loudnessGainDb: +loudnessGainDb.toFixed(2),
    energyEvents,
  };
}

/** Detect buildups and drops from a per-second RMS curve.
 *  - Buildup: a sustained positive 1st-derivative window (Savitzky-Golay
 *    smoothing, 5-sample window) immediately followed by a peak.
 *  - Drop: peak that follows a buildup, normalised against track maximum.
 *  Strength is the normalised magnitude of the energy step, 0..1. */
function detectEnergyEvents(curve: number[]): { t: number; kind: "buildup" | "drop"; strength: number }[] {
  if (curve.length < 8) return [];
  // 5-tap Savitzky-Golay smoother (coeffs [-3,12,17,12,-3]/35) → derivative
  // approximation via simple diff afterwards.
  const smooth: number[] = new Array(curve.length).fill(0);
  for (let i = 0; i < curve.length; i++) {
    const a = curve[Math.max(0, i - 2)];
    const b = curve[Math.max(0, i - 1)];
    const c = curve[i];
    const d = curve[Math.min(curve.length - 1, i + 1)];
    const e = curve[Math.min(curve.length - 1, i + 2)];
    smooth[i] = (-3 * a + 12 * b + 17 * c + 12 * d - 3 * e) / 35;
  }
  const peak = Math.max(...smooth) || 1;
  const events: { t: number; kind: "buildup" | "drop"; strength: number }[] = [];
  let buildupStart = -1;
  let buildupPeak = 0;
  for (let i = 1; i < smooth.length; i++) {
    const slope = smooth[i] - smooth[i - 1];
    if (slope > 0.0035) {
      if (buildupStart < 0) buildupStart = i;
      if (smooth[i] > buildupPeak) buildupPeak = smooth[i];
    } else if (buildupStart >= 0) {
      // Buildup ended; is it followed by a drop above 75 % of track peak?
      const ended = i;
      const lengthSec = ended - buildupStart;
      if (lengthSec >= 3 && buildupPeak >= peak * 0.65) {
        const strength = +(buildupPeak / peak).toFixed(3);
        events.push({ t: buildupStart, kind: "buildup", strength });
        events.push({ t: ended, kind: "drop", strength });
      }
      buildupStart = -1;
      buildupPeak = 0;
    }
  }
  return events;
}

/** ITU-R BS.1770 K-weighted mean-square → LUFS.
 *  We approximate the K-weighting curve with:
 *    - 2nd-order highpass @ 38 Hz   (stage-1, removes rumble)
 *    - high-shelf @ 1500 Hz +4 dB   (stage-2, RLB pre-filter)
 *  Gating: 400 ms blocks at 75 % overlap, absolute gate −70 LUFS,
 *  then relative gate −10 LU below the ungated mean (BS.1770-4).
 *  Mono fold (channel 0) — close enough for relative loudness matching. */
function measureLufs(buf: AudioBuffer): number {
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  // Stage 1: HPF biquad @ 38 Hz, Q = 0.5
  const fc1 = 38, Q1 = 0.5;
  const w1 = (2 * Math.PI * fc1) / sr;
  const a1 = Math.sin(w1) / (2 * Q1);
  const cw1 = Math.cos(w1);
  const b0_1 = (1 + cw1) / 2, b1_1 = -(1 + cw1), b2_1 = (1 + cw1) / 2;
  const a0_1 = 1 + a1, a1_1 = -2 * cw1, a2_1 = 1 - a1;
  // Stage 2: high-shelf @ 1500 Hz, +4 dB, S = 1
  const A = Math.pow(10, 4 / 40);
  const w2 = (2 * Math.PI * 1500) / sr;
  const cw2 = Math.cos(w2), sw2 = Math.sin(w2);
  const a2 = sw2 / 2 * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2);
  // Robbie formula (RBJ shelving):
  const beta = 2 * Math.sqrt(A) * a2 || 0.5;
  const b0_2 = A * ((A + 1) + (A - 1) * cw2 + beta);
  const b1_2 = -2 * A * ((A - 1) + (A + 1) * cw2);
  const b2_2 = A * ((A + 1) + (A - 1) * cw2 - beta);
  const a0_2 = (A + 1) - (A - 1) * cw2 + beta;
  const a1_2 = 2 * ((A - 1) - (A + 1) * cw2);
  const a2_2 = (A + 1) - (A - 1) * cw2 - beta;

  const blockSize = Math.floor(sr * 0.4);  // 400 ms
  const hop = Math.floor(sr * 0.1);        // 100 ms (75 % overlap)
  const meanSquares: number[] = [];
  let x1a = 0, x2a = 0, y1a = 0, y2a = 0;
  let x1b = 0, x2b = 0, y1b = 0, y2b = 0;
  const filt = new Float32Array(blockSize);
  let bufIdx = 0;

  // Running fill of a circular block; flush when full at every hop.
  let sinceFlush = 0;
  let acc = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    const sA = (b0_1 * x + b1_1 * x1a + b2_1 * x2a - a1_1 * y1a - a2_1 * y2a) / a0_1;
    x2a = x1a; x1a = x; y2a = y1a; y1a = sA;
    const sB = (b0_2 * sA + b1_2 * x1b + b2_2 * x2b - a1_2 * y1b - a2_2 * y2b) / a0_2;
    x2b = x1b; x1b = sA; y2b = y1b; y1b = sB;
    filt[bufIdx] = sB;
    bufIdx = (bufIdx + 1) % blockSize;
    acc += sB * sB;
    sinceFlush++;
    if (sinceFlush >= hop && i >= blockSize) {
      let sum = 0;
      for (let n = 0; n < blockSize; n++) sum += filt[n] * filt[n];
      meanSquares.push(sum / blockSize);
      sinceFlush = 0;
    }
  }
  if (!meanSquares.length) return -23;
  const toLufs = (ms: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
  // Absolute gate −70 LUFS
  const gateAbs = meanSquares.filter((ms) => toLufs(ms) > -70);
  if (!gateAbs.length) return -70;
  const meanAbs = gateAbs.reduce((a, b) => a + b, 0) / gateAbs.length;
  // Relative gate at −10 LU below ungated mean
  const relThresh = Math.pow(10, (toLufs(meanAbs) - 10 + 0.691) / 10);
  const gateRel = gateAbs.filter((ms) => ms > relThresh);
  if (!gateRel.length) return toLufs(meanAbs);
  const meanRel = gateRel.reduce((a, b) => a + b, 0) / gateRel.length;
  return toLufs(meanRel);
}

/** Re-export for callers that want to fold a detected BPM against a
 *  metadata or sibling-track hint. */
export { correctBpmFold } from "./proTransition";

/** 24-dim L2-normalized fingerprint, derived from cheap features only.
 *  Layout:
 *   [0..7]  energy curve octile means (coarse structure)
 *   [8]     energy mean
 *   [9]     energy std
 *   [10]    energy peak position (0..1)
 *   [11..13] vocal mean / std / fraction-above-0.5
 *   [14..15] key as sin/cos of pitch class
 *   [16]    mode (0 minor / 1 major)
 *   [17]    bpm bucket 60..180 → 0..1
 *   [18]    half-time bias (slow start vs fast end)
 *   [19..23] reserved zeros (room for future mel bands)
 */
function computeEmbedding(
  curve: number[],
  vmap: { t: number; voiced: number }[],
  bpm: number,
  pitchClass: number,
  mode: "maj" | "min",
): number[] {
  const v: number[] = new Array(24).fill(0);
  if (curve.length) {
    // Octile means
    const n = curve.length;
    for (let i = 0; i < 8; i++) {
      const a = Math.floor((i * n) / 8);
      const b = Math.floor(((i + 1) * n) / 8);
      let s = 0; let c = 0;
      for (let j = a; j < b; j++) { s += curve[j]; c++; }
      v[i] = c ? s / c : 0;
    }
    const mean = curve.reduce((a, b) => a + b, 0) / n;
    let varSum = 0; let peakIdx = 0; let peakVal = -1;
    for (let i = 0; i < n; i++) {
      varSum += (curve[i] - mean) ** 2;
      if (curve[i] > peakVal) { peakVal = curve[i]; peakIdx = i; }
    }
    v[8] = mean;
    v[9] = Math.sqrt(varSum / n);
    v[10] = n > 1 ? peakIdx / (n - 1) : 0;
    const firstHalf = curve.slice(0, Math.floor(n / 2));
    const secondHalf = curve.slice(Math.floor(n / 2));
    const fh = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
    const sh = secondHalf.reduce((a, b) => a + b, 0) / Math.max(1, secondHalf.length);
    v[18] = sh - fh; // positive = builds over time
  }
  if (vmap.length) {
    const vm = vmap.reduce((a, p) => a + p.voiced, 0) / vmap.length;
    let vv = 0; let above = 0;
    for (const p of vmap) { vv += (p.voiced - vm) ** 2; if (p.voiced >= 0.5) above++; }
    v[11] = vm;
    v[12] = Math.sqrt(vv / vmap.length);
    v[13] = above / vmap.length;
  }
  const angle = (pitchClass / 12) * 2 * Math.PI;
  v[14] = Math.sin(angle);
  v[15] = Math.cos(angle);
  v[16] = mode === "maj" ? 1 : 0;
  v[17] = Math.max(0, Math.min(1, (bpm - 60) / 120));
  // L2 normalize
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < v.length; i++) v[i] = +(v[i] / mag).toFixed(5);
  return v;
}

/** Rule-based crate assignment from cheap stats. User can override later. */
export function assignSmartCrate(bpm: number, energy: number, vocalDensity: number): SmartCrate {
  if (bpm < 95 || energy < 0.06) return "cooldown";
  if (bpm >= 124 && energy >= 0.13) return "peak";
  if (bpm >= 116 && energy >= 0.10) return "filler";
  if (bpm >= 95 && bpm < 116) return "warmup";
  // Vocal-heavy mid-tempo songs serve as floor-fillers regardless of energy
  if (vocalDensity > 0.55 && bpm >= 100) return "filler";
  return "reserve";
}

/** Cosine similarity in [-1..1] (returns 0 for missing embeddings). */
export function cosineSim(a?: number[] | null, b?: number[] | null): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/** Decode a blob/file into an AudioBuffer with a short-lived ctx. */
export async function decodeToBuffer(src: Blob | ArrayBuffer): Promise<AudioBuffer> {
  const ab = src instanceof Blob ? await src.arrayBuffer() : src;
  const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    .AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("AudioContext not available");
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(ab.slice(0));
  await ctx.close();
  return buf;
}

/** Find next beat time after `fromSec` using the grid. */
export function nextBeatAfter(grid: number[], fromSec: number): number {
  if (!grid?.length) return fromSec;
  for (const b of grid) if (b > fromSec + 0.02) return b;
  return grid[grid.length - 1];
}

/** True if the song is vocally "busy" at given sec (>=0.35 voiced score). */
export function isVoiced(vmap: { t: number; voiced: number }[] | null | undefined, sec: number): boolean {
  if (!vmap?.length) return false;
  let best = vmap[0];
  for (const p of vmap) if (Math.abs(p.t - sec) < Math.abs(best.t - sec)) best = p;
  return best.voiced >= 0.35;
}

/** Camelot compatibility: same code, ±1 number, or relative maj/min. */
export function camelotCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const na = parseInt(a, 10), la = a.slice(-1);
  const nb = parseInt(b, 10), lb = b.slice(-1);
  if (la === lb && Math.abs(na - nb) % 12 <= 1) return true;
  if (na === nb && la !== lb) return true;
  return false;
}