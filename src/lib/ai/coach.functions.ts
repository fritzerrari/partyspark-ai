import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const Input = z.object({
  title: z.string().max(120).optional(),
  pitchAccuracy: z.number().min(0).max(100),
  stability: z.number().min(0).max(100),
  energy: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  language: z.enum(["de", "en"]).default("de"),
});

export const generateCoachFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const gw = createLovableAi(requireKey());
    const model = gw("google/gemini-3-flash-preview");
    const lang = data.language === "de" ? "German" : "English";
    const prompt = `You are a fun, encouraging karaoke coach. Write 2 short sentences in ${lang} reacting to this performance.
Title: ${data.title ?? "untitled"}
Pitch accuracy: ${data.pitchAccuracy}/100
Stability: ${data.stability}/100
Energy: ${data.energy}/100
Overall: ${data.overall}/100

Be specific about strengths and one playful tip. Use one emoji. Max 35 words total.`;
    const { text } = await generateText({ model, prompt });
    return { feedback: text.trim() };
  });