// Lightweight auto-mashup: estimate BPM via energy autocorrelation,
// time-stretch track B to match A's BPM using soundtouchjs, then crossfade.
import { pitchShiftBuffer } from "./pitchShift";

/** Rough BPM estimate via onset-energy autocorrelation. Range 70–180 BPM. */
export function estimateBPM(buf: AudioBuffer): number {
  const sr = buf.sampleRate;
  const data = buf.getChannelData(0);
  const win = Math.floor(sr * 0.04); // 40ms
  const hop = Math.floor(sr * 0.02);
  const env: number[] = [];
  for (let i = 0; i + win < data.length; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) e += data[i + j] * data[i + j];
    env.push(Math.sqrt(e / win));
  }
  // Diff envelope to enhance onsets
  const onset = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? 0)));
  const fps = sr / hop;
  const minLag = Math.floor(fps * 60 / 180);
  const maxLag = Math.floor(fps * 60 / 70);
  let bestLag = minLag;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < onset.length; i++) s += onset[i] * onset[i + lag];
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  return Math.round((60 * fps) / bestLag);
}

/** Time-stretch by ratio (>1 = slower). Uses soundtouchjs with semitones=0. */
async function timeStretch(buf: AudioBuffer, ratio: number): Promise<AudioBuffer> {
  // Trick: pitch-shift by 0 semitones but use SoundTouch tempo via two-stage:
  // approximate by resampling and then pitch-correcting.
  // Simpler approach: linear resample (changes pitch), accept small pitch drift.
  if (Math.abs(ratio - 1) < 0.02) return buf;
  const sr = buf.sampleRate;
  const newLen = Math.floor(buf.length / ratio);
  const offline = new OfflineAudioContext(buf.numberOfChannels, newLen, sr);
  const out = offline.createBuffer(buf.numberOfChannels, newLen, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const frac = srcIdx - i0;
      dst[i] = (src[i0] ?? 0) * (1 - frac) + (src[i0 + 1] ?? 0) * frac;
    }
  }
  // Pitch-correct back: shift by -12*log2(ratio) semitones
  const semitones = -12 * Math.log2(ratio);
  return pitchShiftBuffer(out, semitones);
}

/** Crossfade A→B with B time-stretched to A's BPM. Returns mono/stereo buffer. */
export async function autoMashup(
  ctx: BaseAudioContext,
  a: AudioBuffer,
  b: AudioBuffer,
  options: { crossfadeSec?: number } = {},
): Promise<{ buffer: AudioBuffer; bpmA: number; bpmB: number }> {
  const bpmA = estimateBPM(a);
  const bpmB = estimateBPM(b);
  const ratio = bpmB / bpmA; // stretch B so its tempo matches A
  const bStretched = await timeStretch(b, ratio);
  const xfade = options.crossfadeSec ?? 4;
  const sr = a.sampleRate;
  const xfadeSamp = Math.floor(xfade * sr);
  const totalLen = a.length + bStretched.length - xfadeSamp;
  const out = ctx.createBuffer(2, totalLen, sr);
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  const aL = a.getChannelData(0);
  const aR = a.numberOfChannels > 1 ? a.getChannelData(1) : aL;
  const bL = bStretched.getChannelData(0);
  const bR = bStretched.numberOfChannels > 1 ? bStretched.getChannelData(1) : bL;
  for (let i = 0; i < a.length; i++) {
    const fadeOut = i > a.length - xfadeSamp ? 1 - (i - (a.length - xfadeSamp)) / xfadeSamp : 1;
    L[i] += aL[i] * fadeOut;
    R[i] += aR[i] * fadeOut;
  }
  for (let i = 0; i < bStretched.length; i++) {
    const idx = a.length - xfadeSamp + i;
    const fadeIn = i < xfadeSamp ? i / xfadeSamp : 1;
    if (idx < totalLen) {
      L[idx] += bL[i] * fadeIn;
      R[idx] += bR[i] * fadeIn;
    }
  }
  // Soft clip
  for (let i = 0; i < totalLen; i++) { L[i] = Math.tanh(L[i] * 0.9); R[i] = Math.tanh(R[i] * 0.9); }
  return { buffer: out, bpmA, bpmB };
}

export function bufferToWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const len = buf.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, len - 8, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  writeStr(36, "data"); view.setUint32(40, len - 44, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}