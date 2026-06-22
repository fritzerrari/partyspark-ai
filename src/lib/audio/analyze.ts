// Client-side audio analysis: BPM, beat-grid, musical key, energy curve,
// hot-cues, vocal-presence map. Runs on a decoded AudioBuffer. Pure JS.
import { estimateBPM } from "./mashup";
import { NOTE_NAMES } from "./pitch";

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
};

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

/** Vocal-presence per second via spectral flatness inverse + mid-band energy.
 *  Voiced regions have low flatness + energy in 200-3000 Hz. */
function vocalMap(buf: AudioBuffer): { t: number; voiced: number }[] {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const win = 4096;
  // Bandpass via simple IIR (cheap): we approximate by Goertzel on 4 tones in 250..2500 Hz range.
  const tones = [300, 700, 1500, 2500];
  const out: { t: number; voiced: number }[] = [];
  const stepSec = 1;
  const stepSamp = sr * stepSec;
  for (let pos = 0; pos + win < ch.length; pos += stepSamp) {
    // Mid-band energy
    let band = 0;
    for (const f of tones) {
      const k = Math.round((win * f) / sr);
      const w0 = (2 * Math.PI * k) / win;
      const coeff = 2 * Math.cos(w0);
      let s1 = 0, s2 = 0;
      for (let n = 0; n < win; n++) {
        const s0 = ch[pos + n] + coeff * s1 - s2;
        s2 = s1; s1 = s0;
      }
      band += s1 * s1 + s2 * s2 - coeff * s1 * s2;
    }
    // Total energy
    let total = 0;
    for (let n = 0; n < win; n++) total += ch[pos + n] * ch[pos + n];
    const ratio = total > 1e-6 ? Math.min(1, band / (total * 1000)) : 0;
    out.push({ t: +(pos / sr).toFixed(2), voiced: +ratio.toFixed(3) });
  }
  return out;
}

/** Run the full analysis. Yields between heavy steps to keep UI responsive. */
export async function analyzeAudio(buf: AudioBuffer, onProgress?: (label: string, pct: number) => void): Promise<TrackAnalysis> {
  const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

  onProgress?.("BPM", 10);
  const raw = estimateBPM(buf) || 120;
  const bpm = correctBpmOctave(raw);
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
  };
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