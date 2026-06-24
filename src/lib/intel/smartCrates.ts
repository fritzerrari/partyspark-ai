// Smart-crate helpers. Auto-assignment happens during analysis;
// this module provides labels + filter helpers for the UI.
import type { EngineTrack } from "@/lib/audio/engine";

export type SmartCrate = "warmup" | "filler" | "peak" | "cooldown" | "reserve";

export const CRATE_ORDER: SmartCrate[] = ["warmup", "filler", "peak", "cooldown", "reserve"];

export const CRATE_LABELS: Record<SmartCrate, string> = {
  warmup:   "Warm-up",
  filler:   "Floor-Filler",
  peak:     "Peak-Time",
  cooldown: "Cool-down",
  reserve:  "Reserve",
};

export const CRATE_COLORS: Record<SmartCrate, string> = {
  warmup:   "var(--neon-cyan)",
  filler:   "var(--neon-lime)",
  peak:     "var(--neon-magenta)",
  cooldown: "var(--neon-amber)",
  reserve:  "#888",
};

/** Group tracks into 5 crates. Honors user_tags override if "crate:xxx" tag present. */
export function groupByCrate(tracks: EngineTrack[]): Record<SmartCrate, EngineTrack[]> {
  const out: Record<SmartCrate, EngineTrack[]> = {
    warmup: [], filler: [], peak: [], cooldown: [], reserve: [],
  };
  for (const t of tracks) {
    const override = (t.userTags ?? []).find((x) => x.startsWith("crate:"))?.slice(6) as SmartCrate | undefined;
    const c = (override && CRATE_ORDER.includes(override)) ? override : ((t.smartCrate as SmartCrate | null | undefined) ?? "reserve");
    out[c].push(t);
  }
  return out;
}

/** Filter tracks to one crate. */
export function filterByCrate(tracks: EngineTrack[], crate: SmartCrate | "all"): EngineTrack[] {
  if (crate === "all") return tracks;
  return groupByCrate(tracks)[crate];
}