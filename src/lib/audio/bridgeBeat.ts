// Generate a short neutral 4/4 drum loop AudioBuffer at a target BPM.
// Used when two tracks don't tempo-match — load this onto the inactive
// deck so the DJ can mix THROUGH a neutral beat instead of stretching.

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, len - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, buffer.length * numCh * 2, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Render `bars` of a basic 4/4 kick/snare/hat loop at `bpm`. */
export function makeBridgeBeatBuffer(ctx: BaseAudioContext, bpm: number, bars = 4): AudioBuffer {
  const sr = ctx.sampleRate;
  const beat = 60 / bpm;
  const dur = beat * 4 * bars;
  const buf = ctx.createBuffer(1, Math.ceil(dur * sr), sr);
  const d = buf.getChannelData(0);
  const kick = (i0: number) => {
    for (let j = 0; j < sr * 0.18; j++) {
      const tt = j / sr;
      const f = 110 * Math.exp(-tt * 18) + 45;
      if (i0 + j < d.length) d[i0 + j] += 0.9 * Math.exp(-tt * 8) * Math.sin(2 * Math.PI * f * tt);
    }
  };
  const snare = (i0: number) => {
    for (let j = 0; j < sr * 0.14; j++) {
      const tt = j / sr;
      if (i0 + j < d.length) d[i0 + j] += 0.5 * Math.exp(-tt * 22) * ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 180 * tt) * 0.3);
    }
  };
  const hat = (i0: number) => {
    for (let j = 0; j < sr * 0.04; j++) {
      const tt = j / sr;
      if (i0 + j < d.length) d[i0 + j] += 0.25 * Math.exp(-tt * 60) * (Math.random() * 2 - 1);
    }
  };
  for (let b = 0; b < 4 * bars; b++) {
    const i0 = Math.floor(b * beat * sr);
    if (b % 4 === 0 || b % 4 === 2) kick(i0);
    if (b % 4 === 1 || b % 4 === 3) snare(i0);
    hat(i0);
    hat(Math.floor((b + 0.5) * beat * sr));
  }
  let mx = 0;
  for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i]));
  if (mx > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i] / mx) * 0.8;
  return buf;
}

/** Render and return a Blob URL playable by an HTMLAudioElement. */
export function makeBridgeBeatBlobUrl(bpm: number, bars = 4): { url: string; durationSec: number } {
  const sr = 44100;
  const Ctx = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Ctx) throw new Error("OfflineAudioContext unavailable");
  const dur = (60 / bpm) * 4 * bars;
  const offline = new Ctx(1, Math.ceil(dur * sr), sr);
  const buf = makeBridgeBeatBuffer(offline, bpm, bars);
  const blob = encodeWav(buf);
  return { url: URL.createObjectURL(blob), durationSec: dur };
}