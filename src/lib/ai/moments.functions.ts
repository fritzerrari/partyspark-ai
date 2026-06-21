import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

export const listMoments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ recordingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("recording_moments")
      .select("*")
      .eq("recording_id", data.recordingId)
      .order("start_sec", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const analyzeRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ recordingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rec, error: recErr } = await supabase
      .from("recordings")
      .select("id, storage_path, duration_sec, owner_id")
      .eq("id", data.recordingId)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!rec) throw new Error("Recording not found");
    if (rec.owner_id !== userId) throw new Error("Forbidden");

    // Signed URL for the audio file
    const { data: signed, error: sErr } = await supabase.storage
      .from("recordings")
      .createSignedUrl(rec.storage_path, 600);
    if (sErr || !signed) throw sErr ?? new Error("Sign failed");

    // 1. Fetch audio and transcribe
    const audioRes = await fetch(signed.signedUrl);
    if (!audioRes.ok) throw new Error("Audio fetch failed");
    const audioBlob = await audioRes.blob();

    const fd = new FormData();
    fd.append("model", "openai/gpt-4o-mini-transcribe");
    fd.append("file", audioBlob, "recording.webm");
    fd.append("response_format", "json");

    const key = requireKey();
    const trRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Lovable-API-Key": key },
      body: fd,
    });
    if (!trRes.ok) {
      const t = await trRes.text().catch(() => "");
      throw new Error(`Transcription failed: ${trRes.status} ${t}`);
    }
    const trJson = (await trRes.json()) as { text?: string };
    const transcript = (trJson.text ?? "").trim();

    const durationSec = rec.duration_sec ?? 0;

    // 2. Ask Gemini to extract highlights (returns JSON)
    const gw = createLovableAi(key);
    const model = gw("google/gemini-3-flash-preview");

    const system = `You extract memorable highlight moments from a party recording transcript. Return strict JSON ONLY, no prose, no markdown fences. Schema: {"moments":[{"start_sec":number,"end_sec":number,"kind":"laugh|sing_along|cheer|drop|talk|toast","caption":"short German caption (max 80 chars)","score":number 0..1}]}. Return 3-8 moments. Duration of the recording is ${durationSec || "unknown"} seconds. Spread the moments across the timeline. If you can't tell exact timestamps, estimate evenly. Each moment should be 8-20 seconds long.`;

    const { text } = await generateText({
      model,
      system,
      prompt: transcript ? `Transcript:\n${transcript.slice(0, 8000)}` : "No transcript available — propose evenly spaced placeholder highlights based on duration.",
    });

    let parsed: { moments?: Array<{ start_sec: number; end_sec: number; kind: string; caption: string; score?: number }> } = {};
    try {
      const jsonStr = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { moments: [] };
    }

    const moments = (parsed.moments ?? []).filter((m) => typeof m.start_sec === "number" && typeof m.end_sec === "number");

    // Replace existing
    await supabase.from("recording_moments").delete().eq("recording_id", data.recordingId);

    if (moments.length) {
      await supabase.from("recording_moments").insert(
        moments.map((m) => ({
          recording_id: data.recordingId,
          owner_id: userId,
          start_sec: Math.max(0, m.start_sec),
          end_sec: Math.max(m.start_sec + 1, m.end_sec),
          kind: m.kind || "talk",
          caption: m.caption?.slice(0, 200) ?? null,
          score: typeof m.score === "number" ? Math.min(1, Math.max(0, m.score)) : 0.5,
        })),
      );
    }

    return { count: moments.length, transcript: transcript.slice(0, 500) };
  });

export const getRecordingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ recordingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("recordings")
      .select("storage_path, owner_id")
      .eq("id", data.recordingId)
      .maybeSingle();
    if (error) throw error;
    if (!rec || rec.owner_id !== context.userId) throw new Error("Forbidden");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("recordings")
      .createSignedUrl(rec.storage_path, 3600);
    if (sErr || !signed) throw sErr ?? new Error("Sign failed");
    return { url: signed.signedUrl };
  });