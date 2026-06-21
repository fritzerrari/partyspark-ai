import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const Input = z.object({ scene: z.string().min(2).max(200) });

export const pickCrowdPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const gw = createLovableAi(requireKey());
    const model = gw("google/gemini-3-flash-preview");
    const { text } = await generateText({
      model,
      system: `You pick one crowd-reaction preset for a moment at a party. Reply with ONLY compact JSON: {"preset":"cheer|laugh|applause|boo|ooh","duration":number(2–8),"reason":"max 8 words"}.`,
      prompt: `Scene: ${data.scene}`,
    });
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as { preset: "cheer" | "laugh" | "applause" | "boo" | "ooh"; duration: number; reason: string };
      return parsed;
    } catch {
      return { preset: "cheer" as const, duration: 4, reason: "default" };
    }
  });