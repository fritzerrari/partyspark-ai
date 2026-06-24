// Set-Planner: greedy fill of timed slots against an event-shaped energy
// curve. Uses BPM/Key/Vocal-Map already in TrackProfile + embedding for
// "klanglich vielfältig"-Constraint.
import type { EngineTrack } from "@/lib/audio/engine";
import { cosineSim } from "@/lib/audio/analyze";
import { harmonicDist, bpmFoldDelta } from "@/lib/dj/mixability";

export type EventType = "wedding" | "club" | "corporate" | "festival" | "birthday";

export const EVENT_LABELS: Record<EventType, string> = {
  wedding:   "Hochzeit",
  club:      "Club",
  corporate: "Firmenfeier",
  festival:  "Stadtfest",
  birthday:  "Geburtstag",
};

export interface PlanSlot {
  startMin: number;
  durationMin: number;
  targetEnergy: number;     // 0..1
  trackId: string | null;
  backupTrackId: string | null;
  notes?: string;
}

export interface SetPlan {
  id?: string;
  name: string;
  eventType: EventType;
  durationMin: number;
  peakAtMin: number;
  slots: PlanSlot[];
}

/** Target energy curve as f(t/duration) for each event type, returns 0..1. */
export function energyTarget(eventType: EventType, frac: number, peakFrac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  const pf = Math.max(0.1, Math.min(0.95, peakFrac));
  switch (eventType) {
    case "wedding": {
      // Soft warm-up → dinner dip → slow build → peak (pf) → wind-down
      if (f < 0.15) return 0.35 + f * 0.5;     // dinner background
      if (f < pf) return 0.4 + (f - 0.15) / (pf - 0.15) * 0.55;
      return 0.95 - (f - pf) / (1 - pf) * 0.65; // cool-down to 0.3
    }
    case "club": {
      // Steady ramp, plateau at peak, short cool-down
      if (f < pf) return 0.45 + (f / pf) * 0.5;
      if (f < pf + 0.15) return 0.95;
      return 0.95 - (f - pf - 0.15) / (1 - pf - 0.15) * 0.4;
    }
    case "corporate": {
      // Mostly background-y, mid plateau, brief peak
      if (f < pf - 0.1) return 0.4 + f * 0.3;
      if (f < pf + 0.1) return 0.85;
      return 0.6 - (f - pf - 0.1) * 0.4;
    }
    case "festival": {
      // High baseline, two peaks
      const base = 0.6;
      const wave1 = Math.exp(-((f - pf * 0.6) ** 2) / 0.015) * 0.35;
      const wave2 = Math.exp(-((f - pf) ** 2) / 0.015) * 0.4;
      return Math.min(1, base + wave1 + wave2);
    }
    case "birthday": {
      // Gentle ramp, peak, wind-down
      if (f < pf) return 0.4 + (f / pf) * 0.5;
      return 0.9 - (f - pf) / (1 - pf) * 0.55;
    }
  }
}

/** Generate empty slots of avgTrackMin (3.5 min) covering duration. */
function buildSlots(durationMin: number, peakAtMin: number, eventType: EventType): PlanSlot[] {
  const slotLen = 3.5;
  const n = Math.max(1, Math.round(durationMin / slotLen));
  const peakFrac = peakAtMin / durationMin;
  const slots: PlanSlot[] = [];
  for (let i = 0; i < n; i++) {
    const startMin = (i * durationMin) / n;
    const midFrac = (i + 0.5) / n;
    slots.push({
      startMin: +startMin.toFixed(1),
      durationMin: +(durationMin / n).toFixed(1),
      targetEnergy: +energyTarget(eventType, midFrac, peakFrac).toFixed(3),
      trackId: null,
      backupTrackId: null,
    });
  }
  return slots;
}

function trackEnergy01(t: EngineTrack): number {
  if (typeof t.energy !== "number") return 0.5;
  return t.energy > 1 ? t.energy / 100 : t.energy;
}

/** Score how well candidate fits a slot, given the previously chosen track. */
function slotScore(
  cand: EngineTrack,
  slot: PlanSlot,
  prev: EngineTrack | null,
  usedIds: Set<string>,
): number {
  if (usedIds.has(cand.id)) return -1;
  if (!cand.bpm) return -1;
  const e = trackEnergy01(cand);
  const eScore = 1 - Math.min(1, Math.abs(e - slot.targetEnergy) * 2.2);
  if (!prev) return eScore;
  const bpmD = bpmFoldDelta(prev.bpm ?? 120, cand.bpm);
  const bpmScore = Math.max(0, 1 - bpmD / 14);
  const hd = harmonicDist(prev.camelot, cand.camelot);
  const keyScore = hd <= 1 ? 1 : hd <= 2 ? 0.55 : 0.15;
  // Embedding: NOT too close (would be repetitive), NOT too far (boring jump)
  const sim = cosineSim(prev.embedding, cand.embedding);
  // Ideal sim around 0.55 — flow but not stagnation
  const embScore = 1 - Math.min(1, Math.abs(sim - 0.55) * 1.5);
  return eScore * 0.4 + bpmScore * 0.25 + keyScore * 0.2 + embScore * 0.15;
}

export interface GenerateOptions {
  name?: string;
  eventType: EventType;
  durationMin: number;
  peakAtMin?: number;
}

export function generateSetPlan(library: EngineTrack[], opts: GenerateOptions): SetPlan {
  const peakAtMin = opts.peakAtMin ?? Math.round(opts.durationMin * 0.66);
  const slots = buildSlots(opts.durationMin, peakAtMin, opts.eventType);
  const used = new Set<string>();
  let prev: EngineTrack | null = null;
  for (const slot of slots) {
    // Rank candidates for this slot
    const ranked = library
      .map((t) => ({ t, s: slotScore(t, slot, prev, used) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) continue;
    const winner = ranked[0].t;
    slot.trackId = winner.id;
    used.add(winner.id);
    // Backup: best alternative with different smartCrate to provide a Plan B
    const backup = ranked.slice(1).find((x) =>
      (x.t.smartCrate ?? "reserve") !== (winner.smartCrate ?? "reserve"),
    ) ?? ranked[1];
    if (backup) {
      slot.backupTrackId = backup.t.id;
    }
    prev = winner;
  }
  return {
    name: opts.name ?? `${EVENT_LABELS[opts.eventType]} · ${opts.durationMin} min`,
    eventType: opts.eventType,
    durationMin: opts.durationMin,
    peakAtMin,
    slots,
  };
}