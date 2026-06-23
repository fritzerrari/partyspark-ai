// Pure scorer — how well does `candidate` mix with `live`?
// Mirrors the PartySpark prototype's matchScore so the playlist sort
// stays musically sensible without re-running the heavy analysis layer.
import type { EngineTrack } from "@/lib/audio/engine";

/** Octave-aware BPM distance (treats 60↔120 as a perfect match). */
export function bpmFoldDelta(a: number, b: number): number {
  if (!a || !b) return 999;
  const cands = [b, b * 2, b / 2].filter((v) => v > 0);
  return cands.reduce((best, c) => Math.min(best, Math.abs(c - a)), Infinity);
}

/** Camelot harmonic distance. 0 = same, 1 = perfect-mix (relative or adjacent),
 *  2 = 2 steps, 3+ = clash. */
export function harmonicDist(a?: string | null, b?: string | null): number {
  if (!a || !b) return 9;
  if (a === b) return 0;
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  const la = a.slice(-1), lb = b.slice(-1);
  if (na === nb && la !== lb) return 1;        // relative major/minor
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  if (la === lb && d === 1) return 1;
  if (la === lb && d === 2) return 2;
  return 3 + d * 0.1;
}

/** 0..100 — higher = better mix candidate for `live`. */
export function matchScore(live: EngineTrack | null | undefined, cand: EngineTrack): number {
  if (!live) return 50;
  const bpmDelta = (live.bpm && cand.bpm) ? bpmFoldDelta(live.bpm, cand.bpm) : 6;
  // 100 at 0 BPM diff, 0 at 12+ BPM diff.
  const bpmScore = Math.max(0, 100 - (bpmDelta / 12) * 100);
  const hd = harmonicDist(live.camelot, cand.camelot);
  const keyScore = hd <= 1 ? 100 : hd <= 2 ? 65 : Math.max(0, 100 - hd * 25);
  const le = typeof live.energy === "number" ? (live.energy > 1 ? live.energy / 100 : live.energy) : 0.5;
  const ce = typeof cand.energy === "number" ? (cand.energy > 1 ? cand.energy / 100 : cand.energy) : 0.5;
  const energyScore = Math.max(0, 100 - Math.abs(le - ce) * 120);
  return Math.round(bpmScore * 0.45 + keyScore * 0.4 + energyScore * 0.15);
}

export type MixabilityTag = "green" | "amber" | "red";
export function scoreToTag(score: number): MixabilityTag {
  if (score >= 70) return "green";
  if (score >= 45) return "amber";
  return "red";
}

/** Returns true if the BPM gap is big enough to recommend a bridge beat. */
export function needsBridge(live?: EngineTrack | null, cand?: EngineTrack | null): boolean {
  if (!live?.bpm || !cand?.bpm) return false;
  const delta = bpmFoldDelta(live.bpm, cand.bpm);
  return (delta / live.bpm) > 0.08;
}