// AI Remix: build a dance-edit from a source AudioBuffer.
// Structure: Intro (LP sweep up) → Body → Break (HP + echo) → Drop (full) → Outro (fade).
import { estimateBPM } from "./mashup";
import { pitchShiftBuffer } from "./pitchShift";

export type RemixStyle = "house" | "techno" | "disco";
export type RemixOptions = { targetBpm?: number; lengthSec?: 60 | 90 | 120; style?: RemixStyle };

/** Slice a region from a source buffer, clamped to its length. */
function slice(ctx: BaseAudioContext, src: AudioBuffer, startSec: number, lenSec: number): AudioBuffer {
  const sr = src.sampleRate;
  const startSamp = Math.max(0, Math.floor(startSec * sr));
  const lenSamp = Math.min(src.length - startSamp, Math.floor(lenSec * sr));
  const out = ctx.createBuffer(src.numberOfChannels, Math.max(1, lenSamp), sr);
  for (let c = 0; c < src.numberOfChannels; c++) {
    out.getChannelData(c).set(src.getChannelData(c).subarray(startSamp, startSamp + lenSamp));
  }
  return out;
}

/** Linear-resample to a ratio (>1 = shorter/faster). Pitch shifts; we correct after. */
function resample(ctx: BaseAudioContext, buf: AudioBuffer, ratio: number): AudioBuffer {
  if (Math.abs(ratio - 1) < 0.01) return buf;
  const sr = buf.sampleRate;
  const newLen = Math.max(1, Math.floor(buf.length / ratio));
  const out = ctx.createBuffer(buf.numberOfChannels, newLen, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c); const d = out.getChannelData(c);
    for (let i = 0; i < newLen; i++) {
      const idx = i * ratio; const i0 = Math.floor(idx); const f = idx - i0;
      d[i] = (s[i0] ?? 0) * (1 - f) + (s[i0 + 1] ?? 0) * f;
    }
  }
  return out;
}

async function timeStretch(ctx: BaseAudioContext, buf: AudioBuffer, ratio: number): Promise<AudioBuffer> {
  if (Math.abs(ratio - 1) < 0.02) return buf;
  const resampled = resample(ctx, buf, ratio);
  return pitchShiftBuffer(ctx, resampled, -12 * Math.log2(ratio));
}

/** Build a dance-edit. Plays back the source through filter automation and echo break. */
export async function buildRemix(source: AudioBuffer, opts: RemixOptions = {}): Promise<{ buffer: AudioBuffer; sourceBpm: number; targetBpm: number }> {
  const targetBpm = opts.targetBpm ?? 128;
  const totalSec = opts.lengthSec ?? 90;
  const sourceBpm = estimateBPM(source) || targetBpm;

  const sr = source.sampleRate;
  const offline = new OfflineAudioContext(2, Math.floor((totalSec + 4) * sr), sr);

  // Time-stretch source to target BPM
  const ratio = sourceBpm / targetBpm; // ratio>1 means source is faster — shorten? actually we want source slower to reach lower BPM
  const stretched = await timeStretch(offline, source, ratio);

  // Pick 3 chunks of the stretched material: A (early), B (middle), C (late)
  const stretchedDur = stretched.length / sr;
  const chunkLen = Math.min(8, stretchedDur / 3);
  const chunkA = slice(offline, stretched, 0, chunkLen);
  const chunkB = slice(offline, stretched, stretchedDur / 2 - chunkLen / 2, chunkLen);
  const chunkC = slice(offline, stretched, Math.max(0, stretchedDur - chunkLen), chunkLen);

  // Section timing: 25% intro, 40% body, 10% break, 20% drop, 5% outro
  const intro = totalSec * 0.25;
  const body = totalSec * 0.40;
  const brk = totalSec * 0.10;
  const drop = totalSec * 0.20;
  const outro = totalSec * 0.05;

  // Master gain + filter
  const out = offline.createGain(); out.gain.value = 1;
  const filt = offline.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = 0.7;
  filt.frequency.setValueAtTime(300, 0);
  filt.frequency.exponentialRampToValueAtTime(18000, intro);                                    // intro sweep up
  filt.frequency.setValueAtTime(18000, intro + body);
  filt.type = "lowpass"; // keep as lowpass; second filter for break highpass
  filt.connect(out); out.connect(offline.destination);

  // Helper: loop a chunk for N seconds with gain automation
  function scheduleLoop(chunk: AudioBuffer, startSec: number, durSec: number, gain: number, dest: AudioNode) {
    const loops = Math.ceil(durSec / (chunk.length / sr));
    for (let i = 0; i < loops; i++) {
      const src = offline.createBufferSource(); src.buffer = chunk;
      const g = offline.createGain(); g.gain.value = gain;
      src.connect(g); g.connect(dest);
      src.start(startSec + i * (chunk.length / sr));
      src.stop(startSec + durSec + 0.1);
    }
  }

  // Intro
  scheduleLoop(chunkA, 0, intro, 0.7, filt);
  // Body
  scheduleLoop(chunkB, intro, body, 0.95, filt);
  // Break: highpass + feedback delay
  const hp = offline.createBiquadFilter(); hp.type = "highpass";
  hp.frequency.setValueAtTime(200, intro + body);
  hp.frequency.exponentialRampToValueAtTime(2000, intro + body + brk);
  const delay = offline.createDelay(2); delay.delayTime.value = 60 / targetBpm / 2;
  const fb = offline.createGain(); fb.gain.value = 0.5;
  delay.connect(fb); fb.connect(delay);
  const breakBus = offline.createGain(); breakBus.gain.value = 0.8;
  breakBus.connect(hp); hp.connect(out);
  breakBus.connect(delay); delay.connect(out);
  scheduleLoop(chunkB, intro + body, brk, 0.7, breakBus);
  // Drop
  scheduleLoop(chunkC, intro + body + brk, drop, 1.0, filt);
  // Outro fade
  const outroBus = offline.createGain();
  outroBus.gain.setValueAtTime(1, intro + body + brk + drop);
  outroBus.gain.linearRampToValueAtTime(0, totalSec);
  outroBus.connect(out);
  scheduleLoop(chunkC, intro + body + brk + drop, outro, 0.8, outroBus);

  const rendered = await offline.startRendering();
  return { buffer: rendered, sourceBpm, targetBpm };
}