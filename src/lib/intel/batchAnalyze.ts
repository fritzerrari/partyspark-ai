// Batch analysis helper used by the AI Auto-DJ when tracks have not yet been
// touched in a deck. Fetches → decodes → analyzeAudio → persists to `tracks`.

import { analyzeAudio, decodeToBuffer } from "@/lib/audio/analyze";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import { supabase } from "@/integrations/supabase/client";
import type { EngineTrack } from "@/lib/audio/engine";

export interface BatchAnalyzeProgress {
  index: number;
  total: number;
  title: string;
  pct: number; // 0..100 within current track
}

/** Returns the track with bpm / key / beatGrid / cues / vocalMap filled in. */
export async function ensureAnalyzed(
  track: EngineTrack,
  onProgress?: (pct: number) => void,
): Promise<EngineTrack> {
  if (track.bpm && track.beatGrid && track.cues) return track;
  if (!track.url) throw new Error(`Track ${track.title} hat keine URL`);
  const res = await fetch(track.url);
  if (!res.ok) throw new Error(`Fetch ${res.status}`);
  const ab = await res.arrayBuffer();
  const buf = await decodeToBuffer(ab);
  const a = await analyzeAudio(buf, (_lbl, pct) => onProgress?.(pct));
  const camelot = a.camelot ?? keyToCamelot(a.musicalKey);
  // Best-effort persist (RLS may reject for tracks the user doesn't own).
  try {
    const payload: Record<string, unknown> = {
      bpm: a.bpm,
      music_key: a.musicalKey,
      beat_grid: a.beatGrid,
      energy_curve: a.energyCurve,
      cues: a.cues,
      vocal_map: a.vocalMap,
      embedding: a.embedding,
      smart_crate: a.smartCrate,
      energy: Math.round(Math.max(10, Math.min(100, a.overallEnergy * 400))),
      analyzed_at: new Date().toISOString(),
    };
    // Supabase generated types lag behind new columns; cast through any.
    await (supabase.from("tracks") as unknown as { update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> } })
      .update(payload).eq("id", track.id);
  } catch { /* ignore */ }
  return {
    ...track,
    bpm: a.bpm,
    musicalKey: a.musicalKey,
    camelot,
    beatGrid: a.beatGrid,
    cues: a.cues,
    vocalMap: a.vocalMap,
    energy: a.overallEnergy,
    embedding: a.embedding,
    smartCrate: a.smartCrate,
  };
}

/** Sequentially analyze a list of tracks. Skips already-analyzed entries. */
export async function batchAnalyze(
  tracks: EngineTrack[],
  onProgress?: (p: BatchAnalyzeProgress) => void,
): Promise<EngineTrack[]> {
  const out: EngineTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.bpm && t.beatGrid && t.cues) { out.push(t); continue; }
    try {
      const enriched = await ensureAnalyzed(t, (pct) => {
        onProgress?.({ index: i, total: tracks.length, title: t.title, pct });
      });
      out.push(enriched);
    } catch (e) {
      console.warn("batchAnalyze: skip", t.title, e);
    }
  }
  return out;
}