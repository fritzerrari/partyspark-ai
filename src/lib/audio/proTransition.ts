// Pro-DJ transition helpers — pure, no audio-graph side effects.
// Adapted from Mixxx (autodjprocessor / bpmcontrol) and kckDeepak/AI-DJ-Mixing-System.

/** Build equal-power crossfader curves: cos(t·π/2) out, sin(t·π/2) in.
 *  Fixes the −3 dB loudness dip of a linear crossfade. */
export function equalPowerCurves(steps = 128): { out: Float32Array; in: Float32Array } {
  const outArr = new Float32Array(steps);
  const inArr = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    outArr[i] = Math.cos((t * Math.PI) / 2);
    inArr[i] = Math.sin((t * Math.PI) / 2);
  }
  return { out: outArr, in: inArr };
}

/** Schedule an equal-power gain ramp on a GainNode from its current value to `target`.
 *  Falls back to a linear ramp if setValueCurveAtTime is unavailable. */
export function epRampGain(
  ctx: AudioContext,
  g: GainNode,
  target: number,
  durationSec: number,
): void {
  const now = ctx.currentTime;
  const start = g.gain.value;
  const dur = Math.max(0.05, durationSec);
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(start, now);
  const N = 128;
  const curve = new Float32Array(N);
  if (target >= start) {
    // ramping up: sin curve scaled between start and target
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      curve[i] = start + (target - start) * Math.sin((t * Math.PI) / 2);
    }
  } else {
    // ramping down: cos curve
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      curve[i] = target + (start - target) * Math.cos((t * Math.PI) / 2);
    }
  }
  try {
    g.gain.setValueCurveAtTime(curve, now, dur);
  } catch {
    g.gain.linearRampToValueAtTime(target, now + dur);
  }
}

/** Find first/last sample above −60 dBFS using a 50 ms-hop RMS scan.
 *  Mirrors Mixxx's AnalyzerSilence N60dBSound cue, used to trim dead air
 *  at track edges so the real blend window starts on actual sound. */
export function findTrimPoints(
  buf: AudioBuffer,
  dbFloor = -60,
): { trimInSec: number; trimOutSec: number } {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const dur = buf.length / sr;
  const hop = Math.floor(sr * 0.05); // 50 ms
  const win = hop;
  const linFloor = Math.pow(10, dbFloor / 20);
  let first = -1;
  let last = -1;
  for (let i = 0; i + win < ch.length; i += hop) {
    let s = 0;
    for (let n = 0; n < win; n++) {
      const v = ch[i + n];
      s += v * v;
    }
    const rms = Math.sqrt(s / win);
    if (rms > linFloor) {
      if (first < 0) first = i / sr;
      last = (i + win) / sr;
    }
  }
  return {
    trimInSec: first < 0 ? 0 : +first.toFixed(3),
    trimOutSec: last < 0 ? +dur.toFixed(3) : +last.toFixed(3),
  };
}

/** 2×/0.5×/1.5× BPM auto-correction against a metadata or sibling hint.
 *  Picks the ratio that brings the detected BPM closest to the hint. */
export function correctBpmFold(detected: number, hint?: number | null): number {
  if (!detected || !isFinite(detected)) return hint ?? 120;
  if (!hint || !isFinite(hint)) return detected;
  const ratios = [1, 2, 0.5, 1.5, 0.75, 2 / 3];
  let best = detected;
  let bestDelta = Math.abs(detected - hint);
  for (const r of ratios) {
    const candidate = detected / r;
    if (candidate < 60 || candidate > 200) continue;
    const d = Math.abs(candidate - hint);
    if (d < bestDelta) {
      bestDelta = d;
      best = candidate;
    }
  }
  // If even the best candidate is >10 % off the hint, trust the hint.
  if (bestDelta / hint > 0.1) return hint;
  return best;
}

/** Normalised cross-correlation between two mono windows, peak ≤ maxLagSamples.
 *  Returns { lagSamples, peakCorr } so the caller can:
 *   - shift the incoming track by lagSamples to land sub-beat-aligned
 *   - invert polarity if peakCorr < −0.3 (phase cancellation against kick) */
export function crossCorrelatePhase(
  a: Float32Array,
  b: Float32Array,
  maxLagSamples: number,
): { lagSamples: number; peakCorr: number } {
  const N = Math.min(a.length, b.length);
  if (N < 32 || maxLagSamples < 1) return { lagSamples: 0, peakCorr: 0 };
  // Pre-compute denominators (energy) of each segment for normalization.
  const energyA = energy(a, 0, N);
  let bestLag = 0;
  let bestVal = -Infinity;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
    let dot = 0;
    const sA = Math.max(0, lag);
    const sB = Math.max(0, -lag);
    const len = N - Math.abs(lag);
    for (let i = 0; i < len; i++) dot += a[sA + i] * b[sB + i];
    const denom = Math.sqrt(energyA * energy(b, sB, len)) || 1;
    const norm = dot / denom;
    if (norm > bestVal) {
      bestVal = norm;
      bestLag = lag;
    }
  }
  return { lagSamples: bestLag, peakCorr: bestVal };
}

function energy(arr: Float32Array, start: number, len: number): number {
  let s = 0;
  const end = Math.min(arr.length, start + len);
  for (let i = start; i < end; i++) s += arr[i] * arr[i];
  return s || 1e-9;
}

/** Compute live beat-drift in ms between two decks given their beat grids and
 *  current playback positions. Returns the smallest signed delta to the nearest
 *  beat pair (i.e., how far B lags or leads A). */
export function beatDriftMs(
  gridA: number[] | null | undefined,
  posA: number,
  rateA: number,
  gridB: number[] | null | undefined,
  posB: number,
  rateB: number,
): number {
  if (!gridA?.length || !gridB?.length) return 0;
  const phaseA = nearestPhase(gridA, posA);
  const phaseB = nearestPhase(gridB, posB);
  if (phaseA == null || phaseB == null) return 0;
  // Effective beat-fraction distance, then convert to ms via the slower beat.
  let phaseDelta = phaseB - phaseA;
  if (phaseDelta > 0.5) phaseDelta -= 1;
  if (phaseDelta < -0.5) phaseDelta += 1;
  const beatLenA = avgBeatLen(gridA) / Math.max(0.5, rateA);
  return phaseDelta * beatLenA * 1000;
}

function nearestPhase(grid: number[], t: number): number | null {
  if (!grid.length) return null;
  // Binary search for the surrounding beats.
  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const next = grid[lo];
  const prev = grid[Math.max(0, lo - 1)];
  const len = Math.max(1e-3, next - prev);
  return Math.max(0, Math.min(1, (t - prev) / len));
}

function avgBeatLen(grid: number[]): number {
  if (grid.length < 2) return 0.5;
  return (grid[grid.length - 1] - grid[0]) / (grid.length - 1);
}

/** Vocal-overlap risk in [0..1]. 1 = both decks have vocals in the blend window. */
export function vocalOverlapRisk(
  vmapA: { t: number; voiced: number }[] | null | undefined,
  posA: number,
  vmapB: { t: number; voiced: number }[] | null | undefined,
  posB: number,
): number {
  const va = sampleVocal(vmapA, posA);
  const vb = sampleVocal(vmapB, posB);
  return Math.min(1, va * vb * 1.4);
}

function sampleVocal(
  map: { t: number; voiced: number }[] | null | undefined,
  sec: number,
): number {
  if (!map?.length) return 0;
  // Map is dense (1 entry / sec) so index ≈ floor(sec).
  const i = Math.max(0, Math.min(map.length - 1, Math.round(sec)));
  return map[i]?.voiced ?? 0;
}