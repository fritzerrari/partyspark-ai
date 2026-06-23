// Morph Engine — render an AudioBuffer where pitch (semitones) and tempo
// (rate) glide linearly from a start value to an end value over the entire
// length. Implemented as offline chunk-by-chunk SoundTouch processing with
// equal-power crossfades at the seams so seams aren't audible.

import { SoundTouch, SimpleFilter } from "soundtouchjs";

export type MorphOptions = {
  /** Starting pitch shift in semitones. */
  semisFrom: number;
  /** Ending pitch shift in semitones. */
  semisTo: number;
  /** Starting tempo ratio (1 = unchanged, 1.05 = 5% faster). */
  tempoFrom: number;
  /** Ending tempo ratio. */
  tempoTo: number;
  /** Number of segments to render. More = smoother, slower. Default 8. */
  steps?: number;
};

function processSeg(buf: AudioBuffer, ctx: BaseAudioContext, semitones: number, tempo: number): AudioBuffer {
  const left = buf.getChannelData(0);
  const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
  const st = new SoundTouch();
  st.pitchSemitones = semitones;
  st.tempo = tempo;
  st.rate = 1;
  class Source {
    position = 0;
    extract(target: Float32Array, numFrames: number, position: number) {
      const start = position;
      const end = Math.min(start + numFrames, left.length);
      let w = 0;
      for (let i = start; i < end; i++) {
        target[w * 2] = left[i];
        target[w * 2 + 1] = right[i];
        w++;
      }
      return w;
    }
  }
  const filter = new SimpleFilter(new Source(), st);
  const BLOCK = 4096;
  const collected: number[] = [];
  const tmp = new Float32Array(BLOCK * 2);
  let n = 0;
  do {
    n = filter.extract(tmp, BLOCK);
    for (let i = 0; i < n * 2; i++) collected.push(tmp[i]);
  } while (n > 0);
  const out = ctx.createBuffer(2, Math.max(1, collected.length / 2), buf.sampleRate);
  const oL = out.getChannelData(0);
  const oR = out.getChannelData(1);
  for (let i = 0; i < out.length; i++) {
    oL[i] = collected[i * 2] ?? 0;
    oR[i] = collected[i * 2 + 1] ?? 0;
  }
  return out;
}

function sliceBuffer(ctx: BaseAudioContext, buf: AudioBuffer, fromSamp: number, toSamp: number): AudioBuffer {
  const len = Math.max(1, toSamp - fromSamp);
  const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[fromSamp + i] ?? 0;
  }
  return out;
}

/** Concat segments with a short equal-power crossfade (10 ms). */
function concatXfade(ctx: BaseAudioContext, segs: AudioBuffer[], xfadeSec = 0.01): AudioBuffer {
  if (!segs.length) return ctx.createBuffer(2, 1, 44100);
  const sr = segs[0].sampleRate;
  const xf = Math.floor(xfadeSec * sr);
  let total = 0;
  for (let i = 0; i < segs.length; i++) total += segs[i].length - (i === 0 ? 0 : xf);
  const out = ctx.createBuffer(2, Math.max(1, total), sr);
  const oL = out.getChannelData(0);
  const oR = out.getChannelData(1);
  let pos = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const sL = s.getChannelData(0);
    const sR = s.numberOfChannels > 1 ? s.getChannelData(1) : sL;
    const start = i === 0 ? 0 : xf;
    for (let n = start; n < s.length; n++) {
      const dst = pos + (n - start);
      let gIn = 1, gOut = 0;
      if (i > 0 && n < xf) {
        const t = n / xf;
        gIn = Math.sin((Math.PI / 2) * t);
        gOut = Math.cos((Math.PI / 2) * t);
        oL[dst] = (oL[dst] ?? 0) * gOut + sL[n] * gIn;
        oR[dst] = (oR[dst] ?? 0) * gOut + sR[n] * gIn;
      } else {
        oL[dst] = sL[n];
        oR[dst] = sR[n];
      }
    }
    pos += s.length - start;
  }
  return out;
}

/** Render `buf` with linearly morphing pitch & tempo from start → end. */
export async function morphRender(buf: AudioBuffer, opts: MorphOptions): Promise<AudioBuffer> {
  const steps = Math.max(2, Math.min(16, opts.steps ?? 8));
  const sr = buf.sampleRate;
  const totalSamp = buf.length;
  const segSamp = Math.floor(totalSamp / steps);
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  // Render context big enough for the morphed output. We don't know exact
  // length up front (tempo varies), so size for the slowest tempo + slack.
  const slowest = Math.min(opts.tempoFrom, opts.tempoTo);
  const lenEstimate = Math.ceil((totalSamp / Math.max(0.1, slowest)) + sr);
  const offCtx = new Ctx(2, lenEstimate, sr);
  const segs: AudioBuffer[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const semis = opts.semisFrom + (opts.semisTo - opts.semisFrom) * t;
    const tempo = opts.tempoFrom + (opts.tempoTo - opts.tempoFrom) * t;
    const from = i * segSamp;
    const to = i === steps - 1 ? totalSamp : (i + 1) * segSamp;
    const slice = sliceBuffer(offCtx, buf, from, to);
    segs.push(processSeg(slice, offCtx, semis, tempo));
  }
  return concatXfade(offCtx, segs, 0.012);
}
