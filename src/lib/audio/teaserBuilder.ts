// Teaser Builder — render a short hook from the INCOMING track, morphed
// from the live deck's BPM/key back to the incoming track's native values.
// Sits as a layered, filtered preview over the outgoing groove so the
// listener gets a "pro DJ" vorhören before the real reveal.

import type { EngineTrack } from "./engine";
import { decodeToBuffer } from "./analyze";
import { semitoneShiftToKey } from "./keyDelta";
import { bestIntroHook } from "@/lib/intel/transitionPoints";
import { morphRender } from "./morphEngine";

export type TeaserPlan = {
  buffer: AudioBuffer;
  /** Where in the incoming track we grabbed the hook. */
  hookStartSec: number;
  hookBars: number;
  /** Pitch glide (semitones live→native). */
  semisFrom: number;
  semisTo: number;
  /** Tempo glide (tempo ratio live→native). */
  tempoFrom: number;
  tempoTo: number;
  notes: string;
};

function sliceBuffer(buf: AudioBuffer, fromSec: number, durSec: number): AudioBuffer {
  const sr = buf.sampleRate;
  const fromSamp = Math.max(0, Math.floor(fromSec * sr));
  const len = Math.min(buf.length - fromSamp, Math.max(1, Math.floor(durSec * sr)));
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const out = new Ctx(buf.numberOfChannels, len, sr).createBuffer(buf.numberOfChannels, len, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[fromSamp + i];
  }
  return out;
}

/**
 * Build a teaser: takes the best intro-hook from `incoming`, starts it
 * locked to live deck's BPM/key, then glides back to incoming's native
 * BPM/key over the snippet's length.
 */
export async function buildTeaser(
  incoming: EngineTrack,
  live: { bpm: number; musicalKey?: string | null },
  opts?: { bars?: number },
): Promise<TeaserPlan | null> {
  if (!incoming.url || !incoming.bpm) return null;
  const res = await fetch(incoming.url);
  const ab = await res.arrayBuffer();
  const decoded = await decodeToBuffer(ab);

  const hook = bestIntroHook({
    bpm: incoming.bpm,
    beatGrid: incoming.beatGrid ?? null,
    energyCurve: null,
    vocalMap: incoming.vocalMap ?? null,
    cues: incoming.cues ?? null,
    durationSec: incoming.durationSec ?? decoded.duration,
  });
  const bars = opts?.bars ?? hook?.bars ?? 4;
  const startSec = hook?.startSec ?? (incoming.cues?.introEnd ?? 0);
  const lenSec = (bars * 4 * 60) / incoming.bpm;

  const slice = sliceBuffer(decoded, startSec, lenSec);

  // We want the snippet to START at LIVE bpm/key and END at INCOMING native.
  // tempo ratio = liveBpm/incomingBpm at start → 1 at end.
  const tempoFrom = live.bpm / incoming.bpm;
  const tempoTo = 1;
  // semis: at start we shift the incoming up/down to live's key; at end 0.
  const semisRaw = semitoneShiftToKey(incoming.musicalKey ?? null, live.musicalKey ?? null);
  const semisFrom = Math.max(-6, Math.min(6, semisRaw));
  const semisTo = 0;

  const buffer = await morphRender(slice, {
    semisFrom, semisTo, tempoFrom, tempoTo, steps: 8,
  });

  return {
    buffer,
    hookStartSec: startSec,
    hookBars: bars,
    semisFrom, semisTo, tempoFrom, tempoTo,
    notes: `Teaser ${bars} Takte · pitch ${semisFrom >= 0 ? "+" : ""}${semisFrom.toFixed(1)}→0 st · tempo ×${tempoFrom.toFixed(3)}→1`,
  };
}
