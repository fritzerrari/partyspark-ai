// Pure tempo stretch via SoundTouchJS — no linear resample, no aliasing.
// `tempo > 1` → faster (shorter); `tempo < 1` → slower (longer).
// Pitch is preserved when `semitones = 0`. Pass `semitones != 0` to shift pitch too.
import { SoundTouch, SimpleFilter } from "soundtouchjs";

class StereoSource {
  position = 0;
  constructor(public left: Float32Array, public right: Float32Array) {}
  extract(target: Float32Array, numFrames: number, position: number): number {
    const end = Math.min(position + numFrames, this.left.length);
    let w = 0;
    for (let i = position; i < end; i++) {
      target[w * 2] = this.left[i];
      target[w * 2 + 1] = this.right[i];
      w++;
    }
    return w;
  }
}

/** High-quality time/pitch shift of an AudioBuffer.
 *  `tempo` is a multiplier (1 = same speed); `semitones` shifts pitch independently. */
export async function stretchBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  tempo: number,
  semitones = 0,
): Promise<AudioBuffer> {
  if (Math.abs(tempo - 1) < 0.005 && Math.abs(semitones) < 0.01) return input;
  const left = new Float32Array(input.getChannelData(0));
  const right = input.numberOfChannels > 1 ? new Float32Array(input.getChannelData(1)) : left;

  const st = new SoundTouch();
  st.tempo = tempo;
  st.pitchSemitones = semitones;
  st.rate = 1;

  const filter = new SimpleFilter(new StereoSource(left, right), st);
  const BLOCK = 4096;
  const tmp = new Float32Array(BLOCK * 2);
  const chunks: Float32Array[] = [];
  let totalFrames = 0;
  let extracted = 0;
  // yield periodically for UI responsiveness
  let blocks = 0;
  do {
    extracted = filter.extract(tmp, BLOCK);
    if (extracted > 0) {
      const slice = new Float32Array(extracted * 2);
      slice.set(tmp.subarray(0, extracted * 2));
      chunks.push(slice);
      totalFrames += extracted;
    }
    blocks++;
    if (blocks % 24 === 0) await new Promise<void>((r) => setTimeout(r, 0));
  } while (extracted > 0);

  const out = ctx.createBuffer(2, totalFrames, input.sampleRate);
  const outL = out.getChannelData(0);
  const outR = out.getChannelData(1);
  let cursor = 0;
  for (const chunk of chunks) {
    const frames = chunk.length / 2;
    for (let i = 0; i < frames; i++) {
      outL[cursor + i] = chunk[i * 2];
      outR[cursor + i] = chunk[i * 2 + 1];
    }
    cursor += frames;
  }
  return out;
}