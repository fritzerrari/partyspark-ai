// Pure mixability engine — no audio side effects, no DOM.
// Input: two TrackProfile. Output: MixabilityReport for the planner.

import type { MixabilityReport, KeyRelation, TrackProfile } from "./types";

/** Best-fit rate to align incoming BPM to outgoing, considering half/double. */
export function tempoRatio(fromBpm: number, toBpm: number): number {
  if (!fromBpm || !toBpm) return 1;
  const candidates = [toBpm, toBpm * 2, toBpm / 2];
  let best = toBpm;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - fromBpm) / fromBpm;
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  return fromBpm / best;
}

/** Camelot distance + relation. */
export function camelotRelation(a?: string | null, b?: string | null): { delta: number; relation: KeyRelation } {
  if (!a || !b) return { delta: 0, relation: "match" };
  if (a === b) return { delta: 0, relation: "match" };
  const na = parseInt(a, 10), la = a.slice(-1).toUpperCase();
  const nb = parseInt(b, 10), lb = b.slice(-1).toUpperCase();
  if (Number.isNaN(na) || Number.isNaN(nb)) return { delta: 6, relation: "clash" };
  // wheel distance 1..12
  const raw = Math.abs(na - nb);
  const wheel = Math.min(raw, 12 - raw);
  if (la === lb && wheel <= 1) return { delta: wheel, relation: "adjacent" };
  if (na === nb && la !== lb) return { delta: 0, relation: "relative" };
  return { delta: wheel, relation: wheel <= 2 ? "adjacent" : "clash" };
}

/** Estimate seconds where both tracks would have simultaneous vocals during a
 *  symmetric crossfade window of `windowSec` around outgoing's outroStart. */
function estimateVocalOverlap(from: TrackProfile, to: TrackProfile, windowSec: number): number {
  const fStart = Math.max(0, (from.cues.outroStart ?? from.durationSec) - windowSec / 2);
  const fEnd = fStart + windowSec;
  const tStart = Math.max(0, to.cues.introEnd ?? 0);
  const tEnd = tStart + windowSec;
  let overlap = 0;
  for (let i = 0; i < Math.floor(windowSec); i++) {
    const fv = nearestVocal(from.vocalMap, fStart + i);
    const tv = nearestVocal(to.vocalMap, tStart + i);
    if (fv >= 0.45 && tv >= 0.45) overlap += 1;
  }
  return overlap;
}

function nearestVocal(map: TrackProfile["vocalMap"], t: number): number {
  if (!map?.length) return 0;
  let best = map[0];
  for (const p of map) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best.voiced;
}

/** Compute the full mixability report. */
export function computeMixability(from: TrackProfile, to: TrackProfile, opts?: { windowSec?: number }): MixabilityReport {
  const windowSec = opts?.windowSec ?? 32;
  const warnings: string[] = [];

  // BPM
  const ratio = tempoRatio(from.bpm, to.bpm);
  const shiftPct = Math.abs(ratio - 1) * 100;
  const bpmScore = Math.max(0, 100 - shiftPct * 12); // 0% → 100, 8% → ~4
  if (shiftPct > 6) warnings.push(`Tempo-Anpassung ${shiftPct.toFixed(1)}% — knapp`);

  // Key
  const { delta, relation } = camelotRelation(from.camelot, to.camelot);
  const keyScore =
    relation === "match" ? 100 :
    relation === "relative" ? 92 :
    relation === "adjacent" ? (delta === 1 ? 85 : 70) :
    Math.max(15, 60 - delta * 8);
  if (relation === "clash") warnings.push(`Tonart-Konflikt (Δ${delta} auf Camelot)`);

  // Energy
  const energyDelta = (to.overallEnergy ?? 0.5) - (from.overallEnergy ?? 0.5);
  const energyDir: "up" | "flat" | "down" =
    energyDelta > 0.08 ? "up" : energyDelta < -0.08 ? "down" : "flat";
  const energyScore = Math.max(20, 100 - Math.abs(energyDelta) * 120);

  // Vocal clash
  const overlapSec = estimateVocalOverlap(from, to, windowSec);
  const vocalScore = Math.max(0, 100 - overlapSec * 6);
  if (overlapSec > 4) warnings.push(`Vocal-Clash Risiko ~${overlapSec}s`);

  // Stems
  const both = !!(from.stemsAvailable && to.stemsAvailable);
  const stemsScore = both ? 100 : 55;
  if (!both) warnings.push("Stems nicht vollständig verfügbar — Pseudo/EQ-Modus");

  // Weighted overall
  const overall = Math.round(
    bpmScore * 0.28 +
    keyScore * 0.22 +
    energyScore * 0.18 +
    vocalScore * 0.18 +
    stemsScore * 0.14,
  );

  return {
    overall,
    bpm: { ratio, needsTempoShiftPct: shiftPct, score: Math.round(bpmScore) },
    key: { camelotDelta: delta, relation, score: Math.round(keyScore) },
    energy: { delta: +energyDelta.toFixed(3), direction: energyDir, score: Math.round(energyScore) },
    vocalClash: { overlapSeconds: overlapSec, score: Math.round(vocalScore) },
    stems: { both, score: stemsScore },
    warnings,
  };
}
