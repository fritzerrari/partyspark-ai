// Generate synthetic reverb impulse responses (no asset downloads).
export type ReverbPreset = "room" | "hall" | "plate" | "cathedral";

const PRESETS: Record<ReverbPreset, { duration: number; decay: number; predelay: number }> = {
  room:       { duration: 0.6, decay: 2.0, predelay: 0.005 },
  hall:       { duration: 2.2, decay: 2.5, predelay: 0.020 },
  plate:      { duration: 1.4, decay: 3.5, predelay: 0.002 },
  cathedral:  { duration: 4.5, decay: 1.8, predelay: 0.030 },
};

export function makeImpulseResponse(ctx: BaseAudioContext, preset: ReverbPreset): AudioBuffer {
  const { duration, decay, predelay } = PRESETS[preset];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (duration + predelay));
  const buf = ctx.createBuffer(2, len, sr);
  const preDelaySamples = Math.floor(predelay * sr);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      if (i < preDelaySamples) { data[i] = 0; continue; }
      const t = (i - preDelaySamples) / sr;
      const env = Math.pow(1 - t / duration, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}