import { supabase } from "@/integrations/supabase/client";
import { analyzeAudio, decodeToBuffer } from "@/lib/audio/analyze";
import { findTransitionPoints } from "@/lib/audio/transitionScore";

export type UploadProgress = {
  index: number;
  total: number;
  file: string;
  phase: "upload" | "analyze" | "save" | "done" | "error";
  error?: string;
};

export async function uploadTracks(
  files: File[],
  userId: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${Date.now()}-${safe}`;
    try {
      onProgress?.({ index: i, total: files.length, file: file.name, phase: "upload" });
      const { error: upErr } = await supabase.storage.from("tracks").upload(path, file, {
        contentType: file.type || "audio/mpeg",
      });
      if (upErr) throw upErr;

      const dur = await new Promise<number>((resolve) => {
        const a = new Audio(URL.createObjectURL(file));
        a.addEventListener("loadedmetadata", () => resolve(Math.round(a.duration)));
        a.addEventListener("error", () => resolve(0));
      });

      onProgress?.({ index: i, total: files.length, file: file.name, phase: "analyze" });
      let analysisFields: Record<string, unknown> = { energy: 60, mood: "Build" };
      try {
        const buf = await decodeToBuffer(file);
        const a = await analyzeAudio(buf);
        const tp = findTransitionPoints(a.beatGrid, a.vocalMap, a.energyCurve, a.cues, buf.duration);
        analysisFields = {
          bpm: a.bpm,
          music_key: a.musicalKey,
          energy: Math.round(Math.max(10, Math.min(100, a.overallEnergy * 400))),
          mood: "Build",
          beat_grid: a.beatGrid,
          energy_curve: a.energyCurve,
          cues: { ...a.cues, ...tp },
          vocal_map: a.vocalMap,
          embedding: a.embedding,
          smart_crate: a.smartCrate,
          analyzed_at: new Date().toISOString(),
        } as Record<string, unknown>;
      } catch (e) {
        console.warn("Analyse fehlgeschlagen", e);
      }

      onProgress?.({ index: i, total: files.length, file: file.name, phase: "save" });
      const title = file.name.replace(/\.[^.]+$/, "");
      await (supabase.from("tracks") as unknown as { insert: (v: Record<string, unknown>) => Promise<unknown> })
        .insert({
          owner_id: userId,
          title,
          artist: "You",
          storage_path: path,
          duration_sec: dur,
          ...analysisFields,
        });
      ok++;
      onProgress?.({ index: i, total: files.length, file: file.name, phase: "done" });
    } catch (err) {
      onProgress?.({
        index: i, total: files.length, file: file.name, phase: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return ok;
}

export function isAudioFile(f: File): boolean {
  if (f.type.startsWith("audio/")) return true;
  return /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name);
}