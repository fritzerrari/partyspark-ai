// Offline "bridge snippet" renderer for genre-bridging transitions.
// Takes the intro of the incoming track, applies offline pitch+tempo shift
// with SoundTouch to lock it to the outgoing track's BPM and key, and
// returns an AudioBuffer plus useful metadata. The bridge is played as a
// layered, filtered preview that lives ON the outgoing groove so the
// listener doesn't notice the genre change until the real reveal.
import { SoundTouch, SimpleFilter } from "soundtouchjs";
import { decodeToBuffer } from "./analyze";
import type { EngineTrack } from "./engine";
import { semitoneShiftToKey } from "./keyDelta";

export type BridgePlan = {
  buffer: AudioBuffer;
  /** Semitones the snippet was pitched (negative = down). */
  semitones: number;
  /** Tempo ratio applied (outgoingBPM / incomingBPM, possibly half/double). */
  tempo: number;
  /** Length of the rendered snippet in seconds. */
  durationSec: number;
  /** Description for the UI. */
  notes: string;
};

/** Pick the tempo ratio that lands closest to the outgoing BPM,
 *  considering half-time and double-time matches. */
function bestTempoRatio(outBpm: number, inBpm: number): { ratio: number; mode: "1x" | "0.5x" | "2x" } {
  const cands: { ratio: number; mode: "1x" | "0.5x" | "2x" }[] = [
    { ratio: outBpm / inBpm,       mode: "1x"   },
    { ratio: outBpm / (inBpm / 2), mode: "0.5x" },
    { ratio: outBpm / (inBpm * 2), mode: "2x"   },
  ];
  // Choose the one whose ratio is closest to 1.0 (least artifact)
  cands.sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)));
  return cands[0];
}

function processSoundTouch(buf: AudioBuffer, ctx: BaseAudioContext, semitones: number, tempo: number): AudioBuffer {
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
  const interleaved: number[] = [];
  const tmp = new Float32Array(BLOCK * 2);
  let n = 0;
  do {
    n = filter.extract(tmp, BLOCK);
    for (let i = 0; i < n * 2; i++) interleaved.push(tmp[i]);
  } while (n > 0);
  const out = ctx.createBuffer(2, interleaved.length / 2, buf.sampleRate);
  const outL = out.getChannelData(0);
  const outR = out.getChannelData(1);
  for (let i = 0; i < out.length; i++) {
    outL[i] = interleaved[i * 2];
    outR[i] = interleaved[i * 2 + 1];
  }
  return out;
}

/**
 * Build a bridge snippet from `incoming`, locked to `outgoing`'s BPM and key.
 * snippetSec defaults to 16 bars at outgoing tempo.
 */
export async function buildBridge(
  ctx: BaseAudioContext,
  incoming: EngineTrack,
  outgoing: { bpm: number; musicalKey?: string | null },
  opts?: { snippetBars?: number },
): Promise<BridgePlan | null> {
  if (!incoming.url || !incoming.bpm) return null;
  const res = await fetch(incoming.url);
  const ab = await res.arrayBuffer();
  const decoded = await decodeToBuffer(ab);

  const { ratio: tempoMatch, mode } = bestTempoRatio(outgoing.bpm, incoming.bpm);
  // SoundTouch tempo > 1 = faster. We want the snippet to BECOME outgoing tempo,
  // so we need to stretch incoming by the inverse… actually tempo in SoundTouch
  // multiplies playback speed: tempo=2 plays twice as fast. So if outgoing is
  // faster than incoming we set tempo = outgoing/incoming (i.e. tempoMatch).
  const tempo = tempoMatch;

  const semis = semitoneShiftToKey(incoming.musicalKey ?? null, outgoing.musicalKey ?? null);
  // Clamp to safe musical range (avoid 12-semitone chipmunk shifts).
  const semitones = Math.max(-6, Math.min(6, semis));

  // Snippet source location: prefer the drop/intro-end of incoming.
  const introEnd = incoming.cues?.introEnd ?? 0;
  const bars = opts?.snippetBars ?? 16;
  // Length needed BEFORE tempo-shift = bars*4 beats at incoming.bpm.
  const lenSecSrc = (bars * 4 * 60) / incoming.bpm;
  const startSamp = Math.floor(introEnd * decoded.sampleRate);
  const endSamp = Math.min(decoded.length, startSamp + Math.floor(lenSecSrc * decoded.sampleRate));

  // Slice the source into a new buffer.
  const slice = ctx.createBuffer(decoded.numberOfChannels, endSamp - startSamp, decoded.sampleRate);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const src = decoded.getChannelData(c);
    const dst = slice.getChannelData(c);
    for (let i = 0; i < dst.length; i++) dst[i] = src[startSamp + i];
  }

  const rendered = processSoundTouch(slice, ctx, semitones, tempo);
  return {
    buffer: rendered,
    semitones,
    tempo,
    durationSec: rendered.length / rendered.sampleRate,
    notes: `Bridge: ${semitones >= 0 ? "+" : ""}${semitones} st · tempo ×${tempo.toFixed(3)}${mode !== "1x" ? ` (${mode})` : ""}`,
  };
}