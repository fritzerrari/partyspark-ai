// Per-stem RMS metering: taps an AnalyserNode off each stem's GainNode
// and exposes a small `getLevels()` API for the UI to poll at ~30 fps.
import type { StemId } from "./stemSplit";

export type StemMeter = {
  getLevels: () => Record<StemId, number>; // 0..1 RMS
  dispose: () => void;
};

export function createStemMeter(
  ctx: AudioContext,
  gains: Record<StemId, GainNode>,
): StemMeter {
  const analysers: Record<StemId, AnalyserNode> = {} as Record<StemId, AnalyserNode>;
  const buffers: Record<StemId, Uint8Array> = {} as Record<StemId, Uint8Array>;
  (Object.keys(gains) as StemId[]).forEach((k) => {
    const a = ctx.createAnalyser();
    a.fftSize = 256;
    a.smoothingTimeConstant = 0.65;
    gains[k].connect(a);
    analysers[k] = a;
    buffers[k] = new Uint8Array(a.fftSize);
  });

  function getLevels(): Record<StemId, number> {
    const out: Record<StemId, number> = { drums: 0, bass: 0, vocals: 0, other: 0 };
    (Object.keys(analysers) as StemId[]).forEach((k) => {
      const a = analysers[k]; const b = buffers[k];
      a.getByteTimeDomainData(b);
      let sum = 0;
      for (let i = 0; i < b.length; i++) { const v = (b[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / b.length);
      out[k] = Math.min(1, rms * 1.8);
    });
    return out;
  }

  return {
    getLevels,
    dispose: () => {
      (Object.keys(analysers) as StemId[]).forEach((k) => {
        try { gains[k].disconnect(analysers[k]); } catch { /* noop */ }
      });
    },
  };
}