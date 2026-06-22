/**
 * Bridge from the AudioContext (cockpit window) to any number of visualizer
 * windows (e.g. on a beamer) via BroadcastChannel. AudioContext nodes can't
 * be shared across windows — so we sample the master analyser at ~30fps and
 * post compact frequency frames.
 */
import { getMasterAnalyser } from "@/lib/audio/twinDeckBus";

export type VisualFrame = {
  t: number;
  freq: number[]; // downsampled bands (0..1)
  level: number;  // average level 0..1
  bass: number;   // low-band energy 0..1
  mid: number;
  high: number;
};

const CHANNEL = "partypilot-visual";
const BANDS = 64;

let raf = 0;
let channel: BroadcastChannel | null = null;
let refCount = 0;

export function startVisualBridge(): () => void {
  refCount++;
  if (raf) return stop;
  if (typeof window === "undefined") return stop;
  channel = new BroadcastChannel(CHANNEL);
  const analyser = getMasterAnalyser();
  if (!analyser) return stop;
  const N = analyser.frequencyBinCount;
  const data = new Uint8Array(N);
  const binsPerBand = Math.max(1, Math.floor(N / BANDS));
  let last = 0;
  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (!analyser || !channel) return;
    if (t - last < 33) return; // ~30fps
    last = t;
    analyser.getByteFrequencyData(data);
    const freq: number[] = new Array(BANDS);
    let sumAll = 0;
    for (let i = 0; i < BANDS; i++) {
      let s = 0;
      for (let j = 0; j < binsPerBand; j++) s += data[i * binsPerBand + j];
      const v = s / binsPerBand / 255;
      freq[i] = v;
      sumAll += v;
    }
    const third = Math.floor(BANDS / 3);
    const avg = (from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += freq[i];
      return s / (to - from);
    };
    const frame: VisualFrame = {
      t,
      freq,
      level: sumAll / BANDS,
      bass: avg(0, third),
      mid: avg(third, third * 2),
      high: avg(third * 2, BANDS),
    };
    try { channel.postMessage(frame); } catch { /* closed */ }
  }
  raf = requestAnimationFrame(tick);
  return stop;
}

function stop() {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  try { channel?.close(); } catch { /* noop */ }
  channel = null;
}

export function subscribeVisual(cb: (f: VisualFrame) => void): () => void {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => cb(e.data as VisualFrame);
  return () => { try { ch.close(); } catch { /* noop */ } };
}