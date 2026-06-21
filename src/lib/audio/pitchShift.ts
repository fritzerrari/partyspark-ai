// Offline pitch-shift using soundtouchjs (SoundTouch + SimpleFilter).
import { SoundTouch, SimpleFilter } from "soundtouchjs";

class BufferSource {
  position = 0;
  constructor(public buffer: { left: Float32Array; right: Float32Array }) {}
  extract(target: Float32Array, numFrames: number, position: number) {
    const { left, right } = this.buffer;
    const start = position;
    const end = Math.min(start + numFrames, left.length);
    let written = 0;
    for (let i = start; i < end; i++) {
      target[written * 2] = left[i];
      target[written * 2 + 1] = right[i];
      written++;
    }
    return written;
  }
}

/** Shift an AudioBuffer by `semitones` (e.g., +2, -1.5). Returns a new AudioBuffer. */
export async function pitchShiftBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  semitones: number,
): Promise<AudioBuffer> {
  const left = input.getChannelData(0);
  const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;

  const st = new SoundTouch();
  st.pitchSemitones = semitones;
  st.tempo = 1;
  st.rate = 1;

  const source = new BufferSource({ left: new Float32Array(left), right: new Float32Array(right) });
  const filter = new SimpleFilter(source, st);

  const BLOCK = 4096;
  const interleaved: number[] = [];
  const tmp = new Float32Array(BLOCK * 2);
  let framesExtracted = 0;
  do {
    framesExtracted = filter.extract(tmp, BLOCK);
    for (let i = 0; i < framesExtracted * 2; i++) interleaved.push(tmp[i]);
  } while (framesExtracted > 0);

  const outFrames = interleaved.length / 2;
  const out = ctx.createBuffer(2, outFrames, input.sampleRate);
  const outL = out.getChannelData(0);
  const outR = out.getChannelData(1);
  for (let i = 0; i < outFrames; i++) {
    outL[i] = interleaved[i * 2];
    outR[i] = interleaved[i * 2 + 1];
  }
  return out;
}

/** Encode an AudioBuffer to WAV (16-bit PCM). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  const writeString = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, len - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, len - 44, true);
  let off = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}