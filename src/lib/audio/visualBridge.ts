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
  // The AudioContext doesn't exist until the user plays the first track.
  // Poll lazily inside the loop so the bridge becomes live the moment audio
  // starts — no permanent silent fail if started before any deck plays.
  let analyser: AnalyserNode | null = getMasterAnalyser();
  let data: Uint8Array = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(0);
  let binsPerBand = analyser ? Math.max(1, Math.floor(analyser.frequencyBinCount / BANDS)) : 1;
  let last = 0;
  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (!channel) return;
    if (!analyser) {
      analyser = getMasterAnalyser();
      if (!analyser) return;
      data = new Uint8Array(analyser.frequencyBinCount);
      binsPerBand = Math.max(1, Math.floor(analyser.frequencyBinCount / BANDS));
    }
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