// Real AI stem separation (Demucs htdemucs) on a HuggingFace Space.
// requestStems({trackId}) kicks off a job (signed URLs + Gradio queue),
// getStemStatus({trackId}) polls the row & HF SSE to finalize.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TrackIdInput = z.object({ trackId: z.string().uuid() });

const STEMS = ["drums", "bass", "vocals", "other"] as const;
type Stem = typeof STEMS[number];

export type StemRow = {
  trackId: string;
  status: "pending" | "processing" | "ready" | "failed";
  progress: number;
  model: string;
  eventId: string | null;
  paths: Record<Stem, string | null>;
  urls: Record<Stem, string | null>;
  error: string | null;
  updatedAt: string;
};

function emptyRow(trackId: string): StemRow {
  return {
    trackId,
    status: "pending",
    progress: 0,
    model: "htdemucs",
    eventId: null,
    paths: { drums: null, bass: null, vocals: null, other: null },
    urls: { drums: null, bass: null, vocals: null, other: null },
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

type DbRow = {
  track_id: string;
  status: StemRow["status"];
  progress: number;
  model: string;
  event_id: string | null;
  drums_path: string | null;
  bass_path: string | null;
  vocals_path: string | null;
  other_path: string | null;
  error: string | null;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

async function rowToResult(supabase: SupabaseLike, row: DbRow): Promise<StemRow> {
  const paths: Record<Stem, string | null> = {
    drums: row.drums_path, bass: row.bass_path, vocals: row.vocals_path, other: row.other_path,
  };
  const urls: Record<Stem, string | null> = { drums: null, bass: null, vocals: null, other: null };
  if (row.status === "ready") {
    for (const s of STEMS) {
      const p = paths[s];
      if (!p) continue;
      const { data } = await supabase.storage.from("stems").createSignedUrl(p, 60 * 60);
      urls[s] = data?.signedUrl ?? null;
    }
  }
  return {
    trackId: row.track_id, status: row.status, progress: row.progress, model: row.model,
    eventId: row.event_id, paths, urls, error: row.error, updatedAt: row.updated_at,
  };
}

async function loadRow(supabase: SupabaseLike, trackId: string): Promise<DbRow | null> {
  const { data } = await supabase.from("track_stems").select("*").eq("track_id", trackId).maybeSingle();
  return (data as DbRow | null) ?? null;
}

/** Read current stem status, lazily finalizing if HF Space just finished. */
export const getStemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TrackIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ownership check
    const { data: track, error: tErr } = await supabase
      .from("tracks").select("id, owner_id, storage_path").eq("id", data.trackId).maybeSingle();
    if (tErr || !track || (track as { owner_id: string }).owner_id !== userId) {
      throw new Error("Track not found");
    }
    let row = await loadRow(supabase, data.trackId);
    if (!row) {
      const r = emptyRow(data.trackId);
      return r;
    }
    // If processing & we have an event id, try to finalize (non-blocking-ish)
    if (row.status === "processing" && row.event_id) {
      const final = await pollHfResult(row.event_id, 25_000).catch((e) => ({ ok: false as const, error: String(e) }));
      if (final && "ok" in final && final.ok) {
        if (final.result.startsWith("ok")) {
          await supabase.from("track_stems").update({
            status: "ready", progress: 100,
            drums_path: `${userId}/${data.trackId}/drums.wav`,
            bass_path:   `${userId}/${data.trackId}/bass.wav`,
            vocals_path: `${userId}/${data.trackId}/vocals.wav`,
            other_path:  `${userId}/${data.trackId}/other.wav`,
            error: null,
          }).eq("track_id", data.trackId);
        } else {
          await supabase.from("track_stems").update({
            status: "failed", error: final.result.slice(0, 800),
          }).eq("track_id", data.trackId);
        }
        row = await loadRow(supabase, data.trackId);
      }
    }
    return await rowToResult(supabase, row!);
  });

/** Kick off a stem-separation job for a track. Idempotent: a ready/processing row short-circuits. */
export const requestStems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TrackIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const HF_SPACE_URL = process.env.HF_SPACE_URL;
    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_SPACE_URL) throw new Error("HF_SPACE_URL is not set — add it as a secret.");

    const { data: track } = await supabase
      .from("tracks").select("id, owner_id, storage_path").eq("id", data.trackId).maybeSingle();
    if (!track || (track as { owner_id: string }).owner_id !== userId) throw new Error("Track not found");
    const storagePath = (track as { storage_path: string | null }).storage_path;
    if (!storagePath) throw new Error("Track has no storage_path");

    const existing = await loadRow(supabase, data.trackId);
    if (existing && (existing.status === "ready" || existing.status === "processing")) {
      // If processing, optionally try to advance it.
      return await rowToResult(supabase, existing);
    }

    // Reserve row immediately so concurrent calls don't double-start
    await supabase.from("track_stems").upsert({
      track_id: data.trackId, status: "processing", progress: 5, model: "htdemucs",
      event_id: null, error: null,
      drums_path: null, bass_path: null, vocals_path: null, other_path: null,
    }, { onConflict: "track_id" });

    // Signed download URL for original
    const { data: dlSigned, error: dlErr } = await supabase.storage
      .from("tracks").createSignedUrl(storagePath, 60 * 60);
    if (dlErr || !dlSigned?.signedUrl) throw new Error("Could not create signed download URL");

    // Signed upload URLs for each stem (5 minutes)
    const uploadUrls: Record<Stem, string> = { drums: "", bass: "", vocals: "", other: "" };
    for (const stem of STEMS) {
      const path = `${userId}/${data.trackId}/${stem}.wav`;
      // Best effort: pre-delete any previous file so upsert via signed URL works cleanly.
      await supabase.storage.from("stems").remove([path]).catch(() => {});
      const { data: up, error: upErr } = await supabase.storage
        .from("stems").createSignedUploadUrl(path);
      if (upErr || !up?.signedUrl) throw new Error(`signed upload url failed for ${stem}`);
      uploadUrls[stem] = up.signedUrl;
    }

    // Kick off Gradio queue job
    const payload = {
      data: [dlSigned.signedUrl, JSON.stringify(uploadUrls)],
    };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (HF_TOKEN) headers["authorization"] = `Bearer ${HF_TOKEN}`;
    const kickoff = await fetch(`${HF_SPACE_URL.replace(/\/$/, "")}/gradio_api/call/separate`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    if (!kickoff.ok) {
      const txt = await kickoff.text().catch(() => "");
      await supabase.from("track_stems").update({
        status: "failed", error: `HF kickoff ${kickoff.status}: ${txt.slice(0, 400)}`,
      }).eq("track_id", data.trackId);
      throw new Error(`HF Space kickoff failed (${kickoff.status})`);
    }
    const kJson = (await kickoff.json().catch(() => ({}))) as { event_id?: string };
    if (!kJson.event_id) {
      await supabase.from("track_stems").update({
        status: "failed", error: "HF kickoff: no event_id returned",
      }).eq("track_id", data.trackId);
      throw new Error("HF Space returned no event_id");
    }

    await supabase.from("track_stems").update({
      event_id: kJson.event_id, progress: 10,
    }).eq("track_id", data.trackId);

    const row = await loadRow(supabase, data.trackId);
    return await rowToResult(supabase, row!);
  });

// ---- HF Gradio SSE polling helper ----
async function pollHfResult(
  eventId: string,
  maxWaitMs: number,
): Promise<{ ok: true; result: string } | { ok: false; error: string } | null> {
  const HF_SPACE_URL = process.env.HF_SPACE_URL;
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_SPACE_URL) return null;
  const headers: Record<string, string> = { accept: "text/event-stream" };
  if (HF_TOKEN) headers["authorization"] = `Bearer ${HF_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxWaitMs);
  try {
    const res = await fetch(`${HF_SPACE_URL.replace(/\/$/, "")}/gradio_api/call/separate/${eventId}`, {
      method: "GET", headers, signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let lastEvent: string | null = null;
    let lastData: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event:")) lastEvent = line.slice(6).trim();
        else if (line.startsWith("data:")) lastData = line.slice(5).trim();
        else if (line === "" && lastEvent && lastData != null) {
          if (lastEvent === "complete") {
            try {
              const arr = JSON.parse(lastData) as unknown;
              const result = Array.isArray(arr) ? String(arr[0] ?? "") : String(arr);
              return { ok: true, result };
            } catch {
              return { ok: true, result: lastData };
            }
          }
          if (lastEvent === "error") {
            return { ok: false, error: lastData };
          }
          lastEvent = null; lastData = null;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}