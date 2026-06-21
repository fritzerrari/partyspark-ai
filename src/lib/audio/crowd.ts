// Procedural crowd-reaction generator. Combines filtered noise (room bed)
// with optional TTS shouts to make Cheer / Laugh / Applaud / Boo / "Oooh" beds.
import { makeImpulseResponse } from "./reverbImpulse";

export type CrowdPreset = "cheer" | "laugh" | "applause" | "boo" | "ooh";

const CROWD_NOISE_PROFILE: Record<CrowdPreset, { bp: number; q: number; bursts: number; burstDur: [number, number]; baseGain: number; }> = {
  cheer:     { bp: 1400, q: 0.6, bursts: 80, burstDur: [0.05, 0.4], baseGain: 0.35 },
  laugh:     { bp: 1100, q: 1.0, bursts: 60, burstDur: [0.08, 0.35], baseGain: 0.3 },
  applause:  { bp: 4000, q: 0.5, bursts: 180, burstDur: [0.005, 0.02], baseGain: 0.4 },
  boo:       { bp: 350,  q: 1.2, bursts: 30, burstDur: [0.3, 0.9], baseGain: 0.35 },
  ooh:       { bp: 600,  q: 1.5, bursts: 10, burstDur: [0.8, 1.8], baseGain: 0.3 },
};

/** Render a procedural crowd bed of given duration. */
export async function renderCrowdBed(preset: CrowdPreset, durationSec = 4): Promise<AudioBuffer> {
  const sr = 44100;
  const profile = CROWD_NOISE_PROFILE[preset];
  const ctx = new OfflineAudioContext(2, Math.floor(durationSec * sr) + sr, sr);

  // 1) Stereo noise bed
  const bedBuf = ctx.createBuffer(2, Math.floor(durationSec * sr), sr);
  for (let c = 0; c < 2; c++) {
    const ch = bedBuf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.08;
  }
  const bedSrc = ctx.createBufferSource(); bedSrc.buffer = bedBuf;
  const bedFilt = ctx.createBiquadFilter(); bedFilt.type = "bandpass"; bedFilt.frequency.value = profile.bp; bedFilt.Q.value = profile.q;
  const bedGain = ctx.createGain(); bedGain.gain.value = profile.baseGain;

  // 2) Bursts: short transient events scattered across stereo
  for (let b = 0; b < profile.bursts; b++) {
    const start = Math.random() * (durationSec - 0.1);
    const dur = profile.burstDur[0] + Math.random() * (profile.burstDur[1] - profile.burstDur[0]);
    const burstBuf = ctx.createBuffer(1, Math.floor(dur * sr), sr);
    const bch = burstBuf.getChannelData(0);
    for (let i = 0; i < bch.length; i++) {
      const env = Math.min(1, i / (sr * 0.005)) * Math.max(0, 1 - i / bch.length);
      bch[i] = (Math.random() * 2 - 1) * env;
    }
    const bs = ctx.createBufferSource(); bs.buffer = burstBuf;
    const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.frequency.value = profile.bp * (0.7 + Math.random() * 0.6); bf.Q.value = profile.q + Math.random() * 1.5;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
    const bg = ctx.createGain(); bg.gain.value = 0.2 + Math.random() * 0.5;
    bs.connect(bf); bf.connect(pan); pan.connect(bg); bg.connect(ctx.destination);
    bs.start(start);
  }

  // 3) Reverb tail
  const conv = ctx.createConvolver(); conv.buffer = makeImpulseResponse(ctx, preset === "applause" ? "room" : "hall");
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  bedSrc.connect(bedFilt); bedFilt.connect(bedGain);
  bedGain.connect(ctx.destination);
  bedGain.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
  bedSrc.start();

  return await ctx.startRendering();
}