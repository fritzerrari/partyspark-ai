// Auto-DJ planner: given current playback state and incoming track meta,
// choose a transition type, mix-in cue, and crossfade length aligned to
// beat grids. Pure logic; the engine executes the plan.
import { camelotCompatible, nextBeatAfter } from "./analyze";
import type { TransitionMode } from "./engine";

export type TrackMeta = {
  bpm?: number | null;
  camelot?: string | null;
  beatGrid?: number[] | null;
  cues?: { introEnd: number; firstDrop: number; outroStart: number } | null;
  durationSec?: number | null;
  energy?: number | null;
};

export type MixPlan = {
  mode: TransitionMode;
  crossfadeSec: number;
  startAtSecOfNext: number;     // where in next track to begin
  triggerAtSecOfCurrent: number; // where in current track to start the transition
  bpmRatio: number;             // next.bpm / current.bpm — used for time-stretch hint
  notes: string;
};

const DEFAULT_BARS = 16; // 16 beats ≈ 4 bars

export function planMix(current: TrackMeta, next: TrackMeta, positionSec: number): MixPlan {
  const curBpm = current.bpm ?? 120;
  const nxtBpm = next.bpm ?? curBpm;
  const bpmDiff = Math.abs(curBpm - nxtBpm) / curBpm; // 0..
  const keyCompat = camelotCompatible(current.camelot ?? "", next.camelot ?? "");
  const beatSec = 60 / curBpm;

  // Trigger near outro of current track (or "now + 16 beats" if no outro known)
  const outro = current.cues?.outroStart ?? Math.max(positionSec, (current.durationSec ?? 0) - 30);
  const triggerAtSecOfCurrent = Math.max(positionSec + 2, outro);
  // Mix into next track at its intro-end if available, else 0
  const startAtSecOfNext = next.cues?.introEnd ?? 0;

  // Choose mode + length
  let mode: TransitionMode = "crossfade";
  let crossfadeSec = DEFAULT_BARS * beatSec;
  let notes = `Harmonischer Crossfade (${DEFAULT_BARS} Beats)`;

  if (bpmDiff > 0.12) {
    mode = "filterSweep";
    crossfadeSec = 8 * beatSec;
    notes = `BPM-Sprung ${curBpm.toFixed(0)} → ${nxtBpm.toFixed(0)}: Filter Sweep`;
  } else if (!keyCompat) {
    mode = "echoTail";
    crossfadeSec = 6 * beatSec;
    notes = `Tonart ${current.camelot} → ${next.camelot} nicht kompatibel: Echo Tail`;
  } else if (Math.abs((current.energy ?? 50) - (next.energy ?? 50)) > 30) {
    mode = "filterSweep";
    crossfadeSec = 12 * beatSec;
    notes = `Energie-Sprung: Filter Sweep mit Drop-Sync`;
  }

  // Snap trigger to next beat for tightness
  const triggerSnapped = current.beatGrid?.length
    ? nextBeatAfter(current.beatGrid, triggerAtSecOfCurrent)
    : triggerAtSecOfCurrent;

  return {
    mode,
    crossfadeSec: +crossfadeSec.toFixed(2),
    startAtSecOfNext,
    triggerAtSecOfCurrent: triggerSnapped,
    bpmRatio: nxtBpm / curBpm,
    notes,
  };
}