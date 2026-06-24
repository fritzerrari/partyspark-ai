// Live mix-quality scorer for the Twin-Deck cockpit.
// Polls a pair of AnalyserNodes and produces a 0..100 score:
//   - 40% phase coherence (proxied by HF correlation similarity)
//   - 25% bass-clash penalty (sum of LF energy both decks)
//   - 20% beat drift (timing alignment vs nearest downbeats)
//   - 15% key compatibility (semitone delta of effective keys)
import { camelotCompatible } from "./analyze";
import { semitoneShiftToKey } from "./keyDelta";

export type DeckSignal = {
  analyser: AnalyserNode | null;
  bpm: number | null;
  effectiveBpm: number | null;
  effectiveKey: string | null;
  camelot: string | null;
  beatGrid: number[] | null;
  currentTime: number;
  playing: boolean;
  volume: number;     // 0..1 after crossfade gain
  /** 0..1 vocal density at the current playhead. */
  vocalAt?: number;
};

export type MixScore = {
  total: number;          // 0..100
  phase: number;          // 0..100
  bassClash: number;      // 0..100 (higher = cleaner)
  beatAlign: number;      // 0..100
  keyCompat: number;      // 0..100
  vocalClash: number;     // 0..100 (higher = cleaner)
  details: string;
};

function lfEnergy(arr: Uint8Array, binFreqHz: number, cutoffHz = 150): number {
  const lastBin = Math.min(arr.length - 1, Math.floor(cutoffHz / binFreqHz));
  let sum = 0;
  for (let i = 0; i <= lastBin; i++) sum += arr[i];
  return sum / ((lastBin + 1) * 255);
}

function hfCorrelation(a: Uint8Array, b: Uint8Array): number {
  // Cosine similarity of upper-band spectra → proxy for phase/timbre alignment.
  const start = Math.floor(a.length * 0.15);
  const end = Math.floor(a.length * 0.85);
  let dot = 0, na = 0, nb = 0;
  for (let i = start; i < end; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0.5;
  return Math.max(0, Math.min(1, dot / Math.sqrt(na * nb)));
}

function nearestBeatDelta(time: number, grid: number[] | null): number {
  if (!grid || grid.length === 0) return 0;
  // Binary-search style
  let lo = 0, hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] < time) lo = mid + 1; else hi = mid;
  }
  const candidates = [grid[Math.max(0, lo - 1)], grid[lo]];
  return Math.min(...candidates.map((b) => Math.abs(b - time)));
}

export function computeMixScore(a: DeckSignal, b: DeckSignal): MixScore {
  const bothPlaying = a.playing && b.playing;
  if (!bothPlaying) {
    return { total: 0, phase: 0, bassClash: 100, beatAlign: 100, keyCompat: 100, vocalClash: 100, details: "idle" };
  }

  // ---- Spectra ----
  const N = a.analyser?.frequencyBinCount ?? 0;
  const buf = new Uint8Array(N);
  const bufB = new Uint8Array(N);
  let phase = 50;
  let bassClashScore = 100;
  if (a.analyser && b.analyser && N > 0) {
    a.analyser.getByteFrequencyData(buf);
    b.analyser.getByteFrequencyData(bufB);
    const sr = a.analyser.context.sampleRate;
    const binHz = sr / 2 / N;
    // HF coherence — high cosine sim → high phase score.
    phase = Math.round(hfCorrelation(buf, bufB) * 100);
    // Bass clash penalty: both decks loud in LF region.
    const ea = lfEnergy(buf, binHz) * a.volume;
    const eb = lfEnergy(bufB, binHz) * b.volume;
    const clash = ea * eb; // product => only bad if BOTH have bass
    bassClashScore = Math.round(Math.max(0, 100 - clash * 250));
  }

  // ---- Beat drift ----
  const dA = nearestBeatDelta(a.currentTime, a.beatGrid);
  const dB = nearestBeatDelta(b.currentTime, b.beatGrid);
  // Use the rate-adjusted beat length of A as the reference window.
  const beatLen = 60 / (a.effectiveBpm || a.bpm || 120);
  const driftRel = Math.min(1, (dA + dB) / Math.max(0.05, beatLen * 0.5));
  const beatAlign = Math.round((1 - driftRel) * 100);

  // ---- Key compat ----
  let keyCompat = 80;
  const camOK = camelotCompatible(a.camelot ?? "", b.camelot ?? "");
  const semi = Math.abs(semitoneShiftToKey(a.effectiveKey ?? null, b.effectiveKey ?? null));
  if (camOK && semi <= 1) keyCompat = 100;
  else if (semi <= 2) keyCompat = 85;
  else if (semi <= 3) keyCompat = 70;
  else if (semi <= 5) keyCompat = 45;
  else keyCompat = 25;

  // ---- Vocal clash (kckDeepak: double-vocals are the #1 amateur tell) ----
  const va = a.vocalAt ?? 0;
  const vb = b.vocalAt ?? 0;
  // 100 = no overlap, drops fast as both decks become vocal-heavy.
  const clashRisk = Math.min(1, va * vb * 1.4);
  const vocalClashScore = Math.round((1 - clashRisk) * 100);

  const total = Math.round(
    phase * 0.30 + bassClashScore * 0.22 + beatAlign * 0.20 + keyCompat * 0.12 + vocalClashScore * 0.16,
  );
  const details = `phase ${phase} · bass ${bassClashScore} · beat ${beatAlign} · key ${keyCompat} · vox ${vocalClashScore}`;
  return { total, phase, bassClash: bassClashScore, beatAlign, keyCompat, vocalClash: vocalClashScore, details };
}