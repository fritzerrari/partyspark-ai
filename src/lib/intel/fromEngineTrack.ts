import type { EngineTrack } from "@/lib/audio/engine";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import type { TrackProfile } from "./types";

/** Adapt the runtime EngineTrack (which the cockpit uses) into the
 *  canonical analysis TrackProfile expected by the intel layer.
 *  Missing fields fall back to safe defaults so the planner can still run. */
export function trackProfileFromEngine(t: EngineTrack, opts?: { stemsAvailable?: boolean; stemUrls?: TrackProfile["stemUrls"] }): TrackProfile {
  const bpm = t.bpm ?? 120;
  const beatGrid = t.beatGrid ?? [];
  const firstBeat = beatGrid[0] ?? 0;
  const cues = t.cues ?? { introEnd: 0, firstDrop: 0, outroStart: t.durationSec ?? 0 };
  const vocalMap = (t.vocalMap ?? []).map((v) => ({ t: v.t, voiced: v.voiced }));
  const energyMean = typeof t.energy === "number" ? Math.max(0, Math.min(1, t.energy)) : 0.5;
  // Synth a coarse energy curve if we don't have one (1 sample/sec, flat at mean).
  const dur = Math.max(1, Math.round(t.durationSec ?? 1));
  const energyCurve = Array.from({ length: dur }, (_, i) => ({ t: i, e: energyMean }));
  return {
    id: t.id,
    sourceUrl: t.url,
    durationSec: t.durationSec ?? 0,
    bpm,
    bpmConfidence: 0.8,
    firstBeat,
    beatGrid,
    musicalKey: t.musicalKey ?? "C",
    camelot: t.camelot ?? keyToCamelot(t.musicalKey ?? null) ?? "8B",
    cues,
    energyCurve,
    vocalMap,
    overallEnergy: energyMean,
    stemsAvailable: !!opts?.stemsAvailable,
    stemUrls: opts?.stemUrls,
    updatedAt: new Date().toISOString(),
  };
}
