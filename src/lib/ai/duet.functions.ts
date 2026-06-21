import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireKey } from "./gateway.server";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"] as const;

const Input = z.object({
  line: z.string().min(2).max(400),
  voice: z.enum(VOICES).default("ballad"),
  instructions: z.string().max(300).optional(),
  speed: z.number().min(0.5).max(1.5).default(1.0),
});

export const speakDuetLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = requireKey();
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.line,
        voice: data.voice,
        response_format: "mp3",
        speed: data.speed,
        instructions: data.instructions ?? "Sing this lyric with melodic phrasing, warm tone, expressive vibrato — like a duet partner harmonising softly.",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Duet TTS failed: ${res.status} ${t}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const C = 0x8000;
    for (let i = 0; i < buf.length; i += C) bin += String.fromCharCode(...buf.subarray(i, i + C));
    return { audioBase64: btoa(bin) };
  });