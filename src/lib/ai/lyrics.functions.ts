import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const Input = z.object({
  topic: z.string().min(2).max(200),
  style: z.string().max(80).optional(),
  artistVibe: z.string().max(80).optional(),
  mood: z.enum(["party", "love", "sad", "funny", "epic", "chill"]).default("party"),
  language: z.enum(["de", "en"]).default("de"),
  structure: z.enum(["verse-chorus", "verse-chorus-bridge", "freestyle"]).default("verse-chorus"),
});

export const writeLyrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const gw = createLovableAi(requireKey());
    const model = gw("google/gemini-3-flash-preview");
    const lang = data.language === "de" ? "German" : "English";
    const prompt = `You are a hit songwriter. Write a karaoke-friendly song in ${lang}.
Topic: ${data.topic}
Mood: ${data.mood}
${data.style ? `Style: ${data.style}` : ""}
${data.artistVibe ? `Vibe like: ${data.artistVibe}` : ""}
Structure: ${data.structure}

Rules:
- Label sections in CAPS like [VERSE 1], [CHORUS], [BRIDGE].
- Singable lines, easy rhymes, max ~24 lines total.
- No intro, no commentary. Lyrics only.`;
    const { text } = await generateText({ model, prompt });
    return { lyrics: text.trim() };
  });