import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const GenInput = z.object({
  vibe: z.enum(["hype", "smooth", "funny", "romantic", "crowd-surf"]).default("hype"),
  language: z.enum(["de", "en"]).default("de"),
  context: z.string().max(400).optional(),
  lastTrack: z.string().max(200).optional(),
  nextTrack: z.string().max(200).optional(),
});

export const generateHypeLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    const gw = createLovableAi(requireKey());
    const model = gw("google/gemini-3-flash-preview");

    const vibeMap: Record<string, string> = {
      hype: "high-energy, hype, exciting",
      smooth: "smooth, chill, professional radio DJ",
      funny: "playful, witty, light humour",
      romantic: "warm, intimate, romantic",
      "crowd-surf": "wild, shouty, crowd-pumping",
    };

    const lang = data.language === "de" ? "German" : "English";
    const system = `You are a charismatic party DJ MC. Write exactly ONE short announcement (max 25 words) in ${lang}. Tone: ${vibeMap[data.vibe]}. No quotes, no emojis, no markdown. Just the spoken line.`;
    const user = [
      data.context ? `Context: ${data.context}` : null,
      data.lastTrack ? `Just played: ${data.lastTrack}` : null,
      data.nextTrack ? `Coming up: ${data.nextTrack}` : null,
    ].filter(Boolean).join("\n") || "Generic crowd hype.";

    const { text } = await generateText({
      model,
      system,
      prompt: user,
    });

    const clean = text.trim().replace(/^["'`]+|["'`]+$/g, "");

    // Save to history
    await context.supabase.from("party_host_lines").insert({
      user_id: context.userId,
      text: clean,
      vibe: data.vibe,
      language: data.language,
      voice: "alloy",
    });

    return { text: clean };
  });

export const listHostLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("party_host_lines")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });

export const deleteHostLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("party_host_lines").delete().eq("id", data.id);
    return { ok: true };
  });