import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const Input = z.object({
  title: z.string().max(120).optional(),
  score: z.number().min(0).max(100).optional(),
  mode: z.enum(["roast", "toast"]).default("toast"),
  language: z.enum(["de", "en"]).default("de"),
  voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]).default("coral"),
});

export const generateRoastToast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = requireKey();
    const gw = createLovableAi(key);
    const model = gw("google/gemini-3-flash-preview");
    const lang = data.language === "de" ? "German" : "English";
    const persona = data.mode === "roast"
      ? "a witty, cheeky stand-up comedian giving a playful (never mean) roast"
      : "an enthusiastic best friend giving a heartfelt toast";
    const prompt = `You are ${persona}. Write 2 lively sentences in ${lang} about a karaoke performance.
Title: ${data.title ?? "untitled"}
Score: ${data.score ?? "?"}/100
Max 35 words. One emoji. Address the singer directly.`;
    const { text } = await generateText({ model, prompt });
    const line = text.trim();

    // TTS
    const ttsRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: line,
        voice: data.voice,
        response_format: "mp3",
      }),
    });
    if (!ttsRes.ok) {
      return { text: line, audioBase64: null as string | null };
    }
    const buf = new Uint8Array(await ttsRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const audioBase64 = btoa(bin);
    return { text: line, audioBase64 };
  });