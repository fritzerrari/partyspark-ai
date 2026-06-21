// Offline post-processing for karaoke vocals: harmonies, choir, presets.
import { pitchShiftBuffer } from "./pitchShift";
import { makeImpulseResponse, type ReverbPreset } from "./reverbImpulse";

export type Interval = "third" | "fifth" | "octaveUp" | "octaveDown";
const INTERVAL_HT: Record<Interval, number> = {
  third: 4,
  fifth: 7,
  octaveUp: 12,
  octaveDown: -12,
};

export type VocalPreset = "stadion" | "whisper" | "tpain" | "telephone" | "megafon";

/** Mix multiple buffers (assumed same SR & length) with per-buffer gains. */
function mixBuffers(ctx: BaseAudioContext, layers: { buf: AudioBuffer; gain: number; pan?: number }[]): AudioBuffer {
  const sr = layers[0].buf.sampleRate;
  const len = Math.max(...layers.map((l) => l.buf.length));
  const out = ctx.createBuffer(2, len, sr);
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  for (const layer of layers) {
    const ch0 = layer.buf.getChannelData(0);
    const ch1 = layer.buf.numberOfChannels > 1 ? layer.buf.getChannelData(1) : ch0;
    const pan = layer.pan ?? 0;
    const lGain = layer.gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const rGain = layer.gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < ch0.length; i++) {
      L[i] += ch0[i] * lGain;
      R[i] += ch1[i] * rGain;
    }
  }
  // Soft-clip to avoid digital clipping
  for (let i = 0; i < len; i++) {
    L[i] = Math.tanh(L[i] * 0.9);
    R[i] = Math.tanh(R[i] * 0.9);
  }
  return out;
}

export async function applyHarmonies(
  ctx: BaseAudioContext,
  dry: AudioBuffer,
  intervals: Interval[],
  mix = 0.35,
): Promise<AudioBuffer> {
  const layers: { buf: AudioBuffer; gain: number; pan?: number }[] = [{ buf: dry, gain: 1 }];
  const pans = [-0.5, 0.5, -0.3, 0.3];
  let i = 0;
  for (const interval of intervals) {
    const shifted = await pitchShiftBuffer(ctx, dry, INTERVAL_HT[interval]);
    layers.push({ buf: shifted, gain: mix, pan: pans[i % pans.length] });
    i++;
  }
  return mixBuffers(ctx, layers);
}

export async function applyChoir(
  ctx: BaseAudioContext,
  dry: AudioBuffer,
  voices = 8,
): Promise<AudioBuffer> {
  const sr = dry.sampleRate;
  const layers: { buf: AudioBuffer; gain: number; pan?: number }[] = [{ buf: dry, gain: 0.6 }];
  for (let v = 0; v < voices; v++) {
    const detuneCents = (Math.random() - 0.5) * 20; // ±10 cents
    const semitones = detuneCents / 100;
    const shifted = await pitchShiftBuffer(ctx, dry, semitones);
    // Pad with mini-delay (5-30ms)
    const delaySec = 0.005 + Math.random() * 0.025;
    const delaySamples = Math.floor(delaySec * sr);
    const padded = ctx.createBuffer(2, shifted.length + delaySamples, sr);
    const srcL = shifted.getChannelData(0);
    const srcR = shifted.numberOfChannels > 1 ? shifted.getChannelData(1) : srcL;
    const pL = padded.getChannelData(0);
    const pR = padded.getChannelData(1);
    for (let i = 0; i < srcL.length; i++) {
      pL[i + delaySamples] = srcL[i];
      pR[i + delaySamples] = srcR[i];
    }
    const pan = (v / (voices - 1)) * 2 - 1; // -1..1
    layers.push({ buf: padded, gain: 0.25, pan });
  }
  return mixBuffers(ctx, layers);
}

/** Apply a fixed vocal preset via OfflineAudioContext rendering. */
export async function applyPreset(dry: AudioBuffer, preset: VocalPreset): Promise<AudioBuffer> {
  const sr = dry.sampleRate;
  const tail = preset === "stadion" || preset === "tpain" ? 3.0 : 1.0;
  const ctx = new OfflineAudioContext(2, dry.length + Math.floor(sr * tail), sr);
  const src = ctx.createBufferSource();
  src.buffer = dry;

  const input = ctx.createGain();
  const out = ctx.createGain();
  out.connect(ctx.destination);

  src.connect(input);

  switch (preset) {
    case "stadion": {
      const dry1 = ctx.createGain(); dry1.gain.value = 0.7;
      const rev = ctx.createConvolver(); rev.buffer = makeImpulseResponse(ctx, "cathedral");
      const revG = ctx.createGain(); revG.gain.value = 0.55;
      const slap = ctx.createDelay(); slap.delayTime.value = 0.14;
      const slapG = ctx.createGain(); slapG.gain.value = 0.35;
      input.connect(dry1); dry1.connect(out);
      input.connect(rev); rev.connect(revG); revG.connect(out);
      input.connect(slap); slap.connect(slapG); slapG.connect(out);
      break;
    }
    case "whisper": {
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 250;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -32; comp.ratio.value = 6;
      const rev = ctx.createConvolver(); rev.buffer = makeImpulseResponse(ctx, "room");
      const dry1 = ctx.createGain(); dry1.gain.value = 0.85;
      const revG = ctx.createGain(); revG.gain.value = 0.3;
      input.connect(hp); hp.connect(comp);
      comp.connect(dry1); dry1.connect(out);
      comp.connect(rev); rev.connect(revG); revG.connect(out);
      break;
    }
    case "tpain": {
      // Hard-tune via pitchShift offline first, then doubler + reverb
      const tuned = await pitchShiftBuffer(ctx, dry, 0); // placeholder neutral; real tune done externally
      const tunedSrc = ctx.createBufferSource(); tunedSrc.buffer = tuned;
      tunedSrc.connect(input);
      const dbl = ctx.createDelay(); dbl.delayTime.value = 0.03;
      const dblG = ctx.createGain(); dblG.gain.value = 0.6;
      const rev = ctx.createConvolver(); rev.buffer = makeImpulseResponse(ctx, "plate");
      const revG = ctx.createGain(); revG.gain.value = 0.35;
      input.connect(out);
      input.connect(dbl); dbl.connect(dblG); dblG.connect(out);
      input.connect(rev); rev.connect(revG); revG.connect(out);
      tunedSrc.start();
      break;
    }
    case "telephone": {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 1500; bp.Q.value = 1.2;
      const gain = ctx.createGain(); gain.gain.value = 1.4;
      input.connect(bp); bp.connect(gain); gain.connect(out);
      break;
    }
    case "megafon": {
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1024) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      ws.curve = curve;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 1800; bp.Q.value = 2;
      input.connect(ws); ws.connect(bp); bp.connect(out);
      break;
    }
  }

  src.start();
  return await ctx.startRendering();
}

export const REVERB_PRESETS: ReverbPreset[] = ["room", "hall", "plate", "cathedral"];