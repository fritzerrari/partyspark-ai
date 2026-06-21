// Harmonic adaptation helpers — both decks meet in tempo and tonality
// instead of one-sidedly snapping the incoming track. Provides three
// strategies the runner can pick from.
import { keyToPitchClass, isMinorKey } from "./keyDelta";

/**
 * Smoothly ramps an HTMLAudioElement's playbackRate from its current value
 * to `target` over `durationMs` using a cubic ease-in-out. Returns a cancel fn.
 */
export function rampPlaybackRate(
  el: HTMLAudioElement | null,
  target: number,
  durationMs: number,
): () => void {
  if (!el) return () => {};
  const from = el.playbackRate || 1;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now: number) => {
    if (cancelled) return;
    const p = Math.min(1, (now - start) / Math.max(80, durationMs));
    const v = from + (target - from) * ease(p);
    try { el.playbackRate = Math.max(0.5, Math.min(2, v)); } catch { /* noop */ }
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelled = true; cancelAnimationFrame(raf); };
}

/**
 * Mutual tempo ramp: both decks bend towards a common midpoint BPM,
 * then the incoming continues to its native tempo over the second half.
 * Returns a promise that resolves when both ramps are done.
 */
export async function mutualTempoRamp(
  fromEl: HTMLAudioElement | null,
  toEl: HTMLAudioElement | null,
  fromBpm: number,
  toBpm: number,
  durationMs: number,
): Promise<{ midBpm: number; fromRate: number; toRate: number }> {
  // Geometric mean = perceived halfway between two tempos.
  const midBpm = Math.sqrt(fromBpm * toBpm);
  const fromRateAtMid = midBpm / fromBpm;
  const toRateAtMid = midBpm / toBpm;
  // Clamp to ±10 % so we don't chipmunk.
  const cFrom = Math.max(0.9, Math.min(1.1, fromRateAtMid));
  const cTo = Math.max(0.9, Math.min(1.1, toRateAtMid));

  // Outgoing: ramp from 1 → cFrom over first half.
  rampPlaybackRate(fromEl, cFrom, durationMs * 0.5);
  // Incoming: start at cTo, ramp to 1 over full duration so it lands
  // on its native tempo by the end of the crossfade.
  if (toEl) {
    try { toEl.playbackRate = cTo; } catch { /* noop */ }
  }
  rampPlaybackRate(toEl, 1, durationMs);

  await new Promise<void>((r) => setTimeout(r, durationMs));
  return { midBpm, fromRate: cFrom, toRate: cTo };
}

/**
 * Find a common tonal pivot between two keys. Returns a MIDI note number
 * suitable as the drone root. Prefers shared pitch classes (e.g. relative
 * major/minor), falls back to the outgoing tonic.
 */
export function commonTonePivot(fromKey: string | null, toKey: string | null): number {
  const a = keyToPitchClass(fromKey);
  const b = keyToPitchClass(toKey);
  // Default: middle A (69).
  if (a == null && b == null) return 69;
  if (a == null) return 60 + (b ?? 0);
  if (b == null) return 60 + a;
  // Notes in each key's natural scale (major/minor).
  const scale = (pc: number, minor: boolean) =>
    (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((s) => (pc + s) % 12);
  const sa = scale(a, isMinorKey(fromKey));
  const sb = scale(b, isMinorKey(toKey));
  const shared = sa.filter((n) => sb.includes(n));
  // Prefer the tonic of the outgoing if present, then the 5th, then any shared.
  const tonicOut = a;
  const fifthOut = (a + 7) % 12;
  const pick = shared.includes(tonicOut)
    ? tonicOut
    : shared.includes(fifthOut)
      ? fifthOut
      : (shared[0] ?? a);
  return 48 + pick; // C3 + pc
}

function midiToFreq(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/**
 * A "pedal drone" that masks tonal jumps. Plays a 3-oscillator pad
 * (root + fifth + octave) on the given MIDI note with soft attack/release.
 * Returns a stop() function.
 */
export function playPedalDrone(
  ctx: AudioContext,
  destination: AudioNode,
  rootMidi: number,
  opts?: { peakGain?: number; attackSec?: number; sustainSec?: number; releaseSec?: number; minor?: boolean },
): () => void {
  const peak = opts?.peakGain ?? 0.18;
  const attack = opts?.attackSec ?? 2.0;
  const sustain = opts?.sustainSec ?? 6.0;
  const release = opts?.releaseSec ?? 2.5;
  const minor = !!opts?.minor;

  const now = ctx.currentTime;
  // Soft lowpass shapes the drone away from harshness.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  lp.Q.value = 0.5;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.01, peak), now + attack);
  master.gain.setValueAtTime(peak, now + attack + sustain);
  master.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release);
  lp.connect(master);
  master.connect(destination);

  const partials = [
    { semi: 0, gain: 0.65, type: "sine" as OscillatorType },
    { semi: minor ? 3 : 4, gain: 0.18, type: "triangle" as OscillatorType }, // third (tasteful color)
    { semi: 7, gain: 0.45, type: "sine" as OscillatorType },                  // perfect fifth
    { semi: 12, gain: 0.22, type: "sine" as OscillatorType },                 // octave
  ];
  const oscs: OscillatorNode[] = [];
  for (const p of partials) {
    const o = ctx.createOscillator();
    o.type = p.type;
    o.frequency.value = midiToFreq(rootMidi + p.semi);
    // Tiny detune for warmth.
    o.detune.value = (Math.random() - 0.5) * 6;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    o.connect(g);
    g.connect(lp);
    o.start(now);
    o.stop(now + attack + sustain + release + 0.1);
    oscs.push(o);
  }

  return () => {
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      for (const o of oscs) {
        try { o.stop(t + 0.6); } catch { /* noop */ }
      }
    } catch { /* noop */ }
  };
}