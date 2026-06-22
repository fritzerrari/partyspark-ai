// Real stem playback: 4 sample-synchronous BufferSources per deck, wired
// into the existing stem-split graph (each buffer feeds the matching
// gain node, so transition recipes can ride them just like pseudo-stems).
//
// The deck's MediaElement stays the timeline driver (currentTime / play /
// pause). When real-stem mode is active we mute the MediaElement output
// (deck.src→graph) and the pseudo-stem input, and run the buffers in lock-
// step with the element's currentTime + playbackRate.
import type { StemId, StemSplit } from "./stemSplit";

export type RealStemUrls = Record<StemId, string>;

export type RealStemPlayer = {
  buffers: Record<StemId, AudioBuffer>;
  /** Start playback synced to `el.currentTime`. */
  start: () => void;
  /** Pause (stop sources). */
  stop: () => void;
  /** Re-sync to current el.currentTime (call after seek/pitch change). */
  resync: () => void;
  isPlaying: () => boolean;
  dispose: () => void;
};

async function fetchBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch stem ${res.status}`);
  const ab = await res.arrayBuffer();
  return await ctx.decodeAudioData(ab);
}

export async function loadRealStems(
  ctx: AudioContext,
  urls: RealStemUrls,
): Promise<Record<StemId, AudioBuffer>> {
  const [drums, bass, vocals, other] = await Promise.all([
    fetchBuffer(ctx, urls.drums),
    fetchBuffer(ctx, urls.bass),
    fetchBuffer(ctx, urls.vocals),
    fetchBuffer(ctx, urls.other),
  ]);
  return { drums, bass, vocals, other };
}

/**
 * Attach the buffers to a deck. Each stem source is connected directly to its
 * corresponding gain node inside `split.gains`, so the existing recipe logic
 * (which animates those gains) keeps working without any change.
 *
 * Caller is responsible for muting the pseudo-stem input (set split.input gain
 * to 0) so we don't mix pseudo + real twice.
 */
export function createRealStemPlayer(
  ctx: AudioContext,
  el: HTMLAudioElement,
  split: StemSplit,
  buffers: Record<StemId, AudioBuffer>,
): RealStemPlayer {
  let sources: Partial<Record<StemId, AudioBufferSourceNode>> = {};
  let playing = false;

  function stop() {
    for (const s of Object.values(sources)) {
      try { s?.stop(); } catch { /* noop */ }
      try { s?.disconnect(); } catch { /* noop */ }
    }
    sources = {};
    playing = false;
  }

  function start() {
    stop();
    const t0 = ctx.currentTime + 0.02;
    const offset = Math.max(0, el.currentTime || 0);
    const rate = el.playbackRate || 1;
    (Object.keys(buffers) as StemId[]).forEach((stem) => {
      const src = ctx.createBufferSource();
      src.buffer = buffers[stem];
      src.playbackRate.value = rate;
      // route stem buffer DIRECTLY into its gain bus in the existing split
      src.connect(split.gains[stem]);
      src.start(t0, offset);
      sources[stem] = src;
    });
    playing = true;
  }

  function resync() {
    if (!playing) return;
    start();
  }

  // Keep playbackRate in sync if the deck pitch changes.
  const onRate = () => {
    if (!playing) return;
    const rate = el.playbackRate || 1;
    for (const s of Object.values(sources)) {
      if (s) s.playbackRate.value = rate;
    }
  };
  const onSeeked = () => { if (playing) resync(); };
  const onPlay = () => { if (!playing) start(); };
  const onPause = () => { if (playing) stop(); };
  el.addEventListener("ratechange", onRate);
  el.addEventListener("seeked", onSeeked);
  el.addEventListener("play", onPlay);
  el.addEventListener("pause", onPause);
  el.addEventListener("ended", onPause);

  return {
    buffers,
    start,
    stop,
    resync,
    isPlaying: () => playing,
    dispose: () => {
      stop();
      el.removeEventListener("ratechange", onRate);
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
    },
  };
}