import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireKey } from "./gateway.server";

const Input = z.object({
  audioBase64: z.string().min(100),
  format: z.enum(["webm", "mp4", "mp3", "wav", "m4a", "ogg"]).default("webm"),
});

export const identifySong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = requireKey();
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You identify songs from short audio clips. Respond ONLY with compact JSON {\"title\":string,\"artist\":string,\"year\":string,\"genre\":string,\"confidence\":\"low\"|\"medium\"|\"high\"}. If unsure, return best guess with low confidence.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this song." },
              { type: "input_audio", input_audio: { data: data.audioBase64, format: data.format } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`SongID failed: ${res.status} ${t}`);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = String(raw).replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { result: parsed as { title: string; artist: string; year: string; genre: string; confidence: string } };
    } catch {
      return { result: { title: "Unknown", artist: "Unknown", year: "", genre: "", confidence: "low" }, raw: cleaned };
    }
  });