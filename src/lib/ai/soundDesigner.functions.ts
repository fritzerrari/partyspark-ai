import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAi, requireKey } from "./gateway.server";

const Input = z.object({
  prompt: z.string().min(3).max(200),
});

const ParamsSchema = z.object({
  oscType: z.enum(["sine", "square", "sawtooth", "triangle", "noise"]),
  freqStart: z.number().min(20).max(20000),
  freqEnd: z.number().min(20).max(20000),
  duration: z.number().min(0.05).max(6),
  attack: z.number().min(0).max(2),
  decay: z.number().min(0).max(2),
  sustain: z.number().min(0).max(1),
  release: z.number().min(0).max(3),
  filterType: z.enum(["lowpass", "highpass", "bandpass", "none"]),
  filterFreq: z.number().min(20).max(20000),
  filterQ: z.number().min(0.1).max(20),
  filterSweepTo: z.number().min(20).max(20000).optional(),
  lfoRate: z.number().min(0).max(50),
  lfoDepth: z.number().min(0).max(800),
  distortion: z.number().min(0).max(1),
  reverb: z.enum(["none", "room", "hall", "plate", "cathedral"]),
  reverbMix: z.number().min(0).max(1),
});

export const designSound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const gw = createLovableAi(requireKey());
    const model = gw("google/gemini-3-flash-preview");
    const system = `You are a sound designer. Translate the user's description into JSON parameters for a Web Audio synth.
Respond with ONLY compact JSON (no code fences) matching this exact schema:
{"oscType":"sine|square|sawtooth|triangle|noise","freqStart":number,"freqEnd":number,"duration":number,"attack":number,"decay":number,"sustain":number,"release":number,"filterType":"lowpass|highpass|bandpass|none","filterFreq":number,"filterQ":number,"filterSweepTo":number,"lfoRate":number,"lfoDepth":number,"distortion":number,"reverb":"none|room|hall|plate|cathedral","reverbMix":number}

Guidance:
- Laser/zap: sawtooth, freqStart 1500→200, fast decay, distortion 0.4, reverb plate
- UFO/sci-fi: sine, lfoRate 6, lfoDepth 200, reverb cathedral
- Bass drop: sine, freqStart 200→40, duration 0.8, distortion 0.5
- Glass break: noise, highpass 4000, short release
- Whoosh: noise, bandpass 1200, filterSweepTo 200, duration 1.2
- Drum kick: sine, freqStart 150→50, attack 0.001, decay 0.15, sustain 0
Keep duration ≤ 4 seconds. No commentary.`;
    const { text } = await generateText({ model, system, prompt: data.prompt });
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = ParamsSchema.parse(JSON.parse(cleaned));
      return { params: parsed };
    } catch (e) {
      throw new Error(`Sound-Designer hat ungültiges JSON geliefert: ${(e as Error).message}`);
    }
  });