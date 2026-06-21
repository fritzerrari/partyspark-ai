import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireKey } from "./gateway.server";

const Input = z.object({
  title: z.string().min(1).max(120),
  vibe: z.string().max(80).optional(),
  score: z.number().min(0).max(100).optional(),
});

/** Generate a square cover image via Gemini Flash Image. Returns a data URL. */
export const generateCoverArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = requireKey();
    const vibe = data.vibe?.trim() || "party karaoke vibrant neon";
    const prompt = `Bold square album cover artwork for a karaoke recording titled "${data.title}". Style: ${vibe}. Vibrant neon disco lights, dynamic composition, expressive abstract energy, glowing accents, no text, no watermark, no logo. Square 1:1.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cover generation failed: ${res.status} ${txt}`);
    }

    const json = await res.json() as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("No image in response");
    return { dataUrl: url };
  });