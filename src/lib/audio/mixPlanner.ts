// Auto-DJ planner: given current playback state and incoming track meta,
// choose a transition type, mix-in cue, and crossfade length aligned to
// beat grids. Pure logic; the engine executes the plan.
import { camelotCompatible, nextBeatAfter } from "./analyze";
import type { TransitionMode } from "./engine";
import { semitoneShiftToKey } from "./keyDelta";

export type TrackMeta = {
  bpm?: number | null;
  camelot?: string | null;
  beatGrid?: number[] | null;
  cues?: {
    introEnd: number;
    firstDrop: number;
    outroStart: number;
    introPoints?: number[];
    outroPoints?: number[];
  } | null;
  durationSec?: number | null;
  energy?: number | null;
  /** Voiced-probability map (0..1) sampled per second from analyze.ts. */
  vocalMap?: { t: number; voiced: number }[] | null;
};

export type MixPlan = {
  mode: TransitionMode;
  crossfadeSec: number;
  startAtSecOfNext: number;     // where in next track to begin
  triggerAtSecOfCurrent: number; // where in current track to start the transition
  bpmRatio: number;             // next.bpm / current.bpm — used for time-stretch hint
  notes: string;
  /** true if the trigger was snapped to a phrase (8-bar) boundary. */
  phraseSnapped?: boolean;
  /** Seconds the trigger was pushed forward to clear an active vocal segment. */
  vocalDeferSec?: number;
};

const DEFAULT_BARS = 16; // 16 beats ≈ 4 bars

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random-virtuoso selector — used when transitionMode === "random". */
function pickRandomMode(
  current: TrackMeta,
  next: TrackMeta,
): { mode: TransitionMode; bars: number; notes: string } {
  const curBpm = current.bpm ?? 120;
  const nxtBpm = next.bpm ?? curBpm;
  const bpmDiff = Math.abs(curBpm - nxtBpm) / curBpm;
  const keyCompat = camelotCompatible(current.camelot ?? "", next.camelot ?? "");
  const haveCues = !!(current.cues && next.cues);
  const candidates: { mode: TransitionMode; bars: number; weight: number; notes: string }[] = [];
  if (bpmDiff <= 0.03 && keyCompat && haveCues) {
    candidates.push({ mode: "doubleDrop", bars: 8, weight: 3, notes: "Double-Drop auf Cue" });
    candidates.push({ mode: "bassSwap",   bars: 16, weight: 3, notes: "Bass-Swap (Lo-Cut → Lo-Boost)" });
    candidates.push({ mode: "loopRoll",   bars: 4, weight: 2, notes: "Loop-Roll → Drop" });
    candidates.push({ mode: "crossfade",  bars: 16, weight: 1, notes: "Sauberer harmonischer Crossfade" });
  } else if (bpmDiff <= 0.06 && keyCompat) {
    candidates.push({ mode: "crossfade",  bars: 16, weight: 3, notes: "Harmonischer Crossfade" });
    candidates.push({ mode: "loopRoll",   bars: 4, weight: 2, notes: "Loop-Roll Transition" });
    candidates.push({ mode: "echoTail",   bars: 8, weight: 1, notes: "Echo-Tail Übergang" });
  } else if (bpmDiff > 0.12) {
    candidates.push({ mode: "filterSweep", bars: 8, weight: 3, notes: "BPM-Sprung: Filter-Sweep" });
    candidates.push({ mode: "reverbWash",  bars: 8, weight: 2, notes: "BPM-Sprung: Reverb-Wash" });
    candidates.push({ mode: "echoTail",    bars: 6, weight: 1, notes: "BPM-Sprung: Echo-Tail" });
  } else {
    candidates.push({ mode: "echoTail",   bars: 8, weight: 2, notes: "Echo-Tail (Key-Wechsel)" });
    candidates.push({ mode: "loopRoll",   bars: 4, weight: 2, notes: "Loop-Roll" });
    candidates.push({ mode: "filterSweep", bars: 8, weight: 1, notes: "Filter-Sweep" });
  }
  // weighted pick
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of candidates) { r -= c.weight; if (r <= 0) return c; }
  return pick(candidates);
}

export function planMix(
  current: TrackMeta,
  next: TrackMeta,
  positionSec: number,
  opts?: { forceMode?: TransitionMode | "auto" | "random" },
): MixPlan {
  const curBpm = current.bpm ?? 120;
  const nxtBpm = next.bpm ?? curBpm;
  const bpmDiff = Math.abs(curBpm - nxtBpm) / curBpm; // 0..
  const keyCompat = camelotCompatible(current.camelot ?? "", next.camelot ?? "");
  const beatSec = 60 / curBpm;
  const semiAbs = Math.abs(semitoneShiftToKey((current as { musicalKey?: string | null }).musicalKey ?? null, (next as { musicalKey?: string | null }).musicalKey ?? null));

  // Trigger near outro of current track. Prefer smart vocal-free out-point
  // if findTransitionPoints supplied any; otherwise fall back to outroStart.
  const smartOut = current.cues?.outroPoints?.find((t) => t >= positionSec + 2);
  const outro = smartOut ?? current.cues?.outroStart ?? Math.max(positionSec, (current.durationSec ?? 0) - 30);
  const triggerAtSecOfCurrent = Math.max(positionSec + 2, outro);
  // Mix into next track at its smart intro-point (vocal-free, rising energy)
  // if available, else cue introEnd, else 0.
  const startAtSecOfNext = next.cues?.introPoints?.[0] ?? next.cues?.introEnd ?? 0;

  // Choose mode + length
  let mode: TransitionMode = "crossfade";
  let bars = DEFAULT_BARS;
  let notes = `Harmonischer Crossfade (${DEFAULT_BARS} Beats)`;
  const force = opts?.forceMode ?? "auto";

  if (force === "random") {
    const r = pickRandomMode(current, next);
    mode = r.mode; bars = r.bars; notes = `🎲 ${r.notes}`;
  } else if (force !== "auto") {
    mode = force as TransitionMode;
    bars = mode === "doubleDrop" ? 8
      : mode === "loopRoll" ? 4
      : mode === "bassSwap" ? 16
      : mode === "genreBridge" ? 32
      : mode === "pitchLock" ? 16
      : mode === "meetMiddle" ? 16
      : mode === "pedalDrone" ? 12
      : 8;
    notes = `Manuell: ${mode}`;
  } else if (bpmDiff > 0.18) {
    // Cross-genre territory: slow country → fast reggae. Use a pre-rendered
    // bridge snippet locked to the outgoing key+tempo so the listener stays
    // grooving while the new material sneaks in.
    mode = "genreBridge";
    bars = 24;
    notes = `Genre-Bridge ${curBpm.toFixed(0)}→${nxtBpm.toFixed(0)} BPM · ${current.camelot ?? "?"}→${next.camelot ?? "?"}`;
  } else if (semiAbs >= 4 && bpmDiff <= 0.06) {
    // Big tonal jump but tempos close → mask with a sustained pedal-drone.
    mode = "pedalDrone";
    bars = 12;
    notes = `Pedal-Drone Pivot ${current.camelot ?? "?"}→${next.camelot ?? "?"} (Δ${semiAbs}st)`;
  } else if (!keyCompat && bpmDiff <= 0.12) {
    // Tempos OK, keys clash → pre-shift incoming snippet to outgoing key.
    mode = "pitchLock";
    bars = 16;
    notes = `Pitch-Lock Pre-Shift ${current.camelot ?? "?"}→${next.camelot ?? "?"} (Δ${semiAbs}st)`;
  } else if (bpmDiff >= 0.04 && bpmDiff <= 0.12 && keyCompat) {
    // Mid BPM gap, keys friendly → mutual tempo bend.
    mode = "meetMiddle";
    bars = 16;
    notes = `Meet-in-Middle ${curBpm.toFixed(0)}↔${nxtBpm.toFixed(0)} BPM`;
  } else if (bpmDiff <= 0.03 && keyCompat && current.cues && next.cues) {
    // Profi-Move: perfekt kompatibel → doubleDrop oder bassSwap
    const r = Math.random();
    if (r < 0.45)      { mode = "doubleDrop"; bars = 8;  notes = `Double-Drop: Outro+Drop sync (${curBpm.toFixed(0)} BPM)`; }
    else if (r < 0.8)  { mode = "bassSwap";   bars = 16; notes = `Bass-Swap, Tonart ${current.camelot}→${next.camelot}`; }
    else               { mode = "loopRoll";   bars = 4;  notes = `Loop-Roll in den Drop`; }
  } else if (bpmDiff > 0.12) {
    const r = Math.random();
    if (r < 0.55) { mode = "filterSweep"; bars = 8; notes = `BPM-Sprung ${curBpm.toFixed(0)}→${nxtBpm.toFixed(0)}: Filter Sweep`; }
    else          { mode = "reverbWash";  bars = 8; notes = `BPM-Sprung: Reverb-Wash + Filter`; }
  } else if (!keyCompat) {
    mode = Math.random() < 0.5 ? "echoTail" : "loopRoll";
    bars = mode === "loopRoll" ? 4 : 6;
    notes = `Tonart ${current.camelot}→${next.camelot} inkompatibel: ${mode}`;
  } else if (Math.abs((current.energy ?? 50) - (next.energy ?? 50)) > 30) {
    mode = "loopRoll"; bars = 4;
    notes = `Energie-Sprung: Loop-Roll Build-up`;
  }

  const crossfadeSec = bars * beatSec;

  // Snap trigger to next beat for tightness
  const triggerSnapped = current.beatGrid?.length
    ? nextBeatAfter(current.beatGrid, triggerAtSecOfCurrent)
    : triggerAtSecOfCurrent;

  // Clamp playback-rate ratio so musical pitch doesn't get destroyed
  const rawRatio = nxtBpm / curBpm;
  const bpmRatio = Math.max(0.92, Math.min(1.08, rawRatio));

  return {
    mode,
    crossfadeSec: +crossfadeSec.toFixed(2),
    startAtSecOfNext,
    triggerAtSecOfCurrent: triggerSnapped,
    bpmRatio,
    notes,
  };
}