// AI Auto-DJ — pure orderer + offline mix renderer.
//
// - orderPlaylist: greedy ordering of TrackProfiles by mixability score
//   with a mild "smooth energy curve" bias.
// - planMixSet: builds a MixSet with one TransitionPlan per adjacent pair.
// - renderMixToWav: renders a MixSet into a single 16-bit PCM WAV blob using
//   OfflineAudioContext, executing the gain/filter/eq/tempo events from each
//   plan. Stem-targeted events are skipped (offline render uses full mixdowns).

import type { MixSet, TrackProfile, TransitionEvent, TransitionPlan, TransitionType } from "./types";
import { computeMixability } from "./mixability";
import { planTransition } from "./planner";
import { Mp3Encoder } from "@breezystack/lamejs";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Playlist ordering

/** Greedy nearest-neighbour ordering that maximises mixability +
 *  prefers gentle energy progression. Starts from the lowest-energy track. */
export function orderPlaylist(tracks: TrackProfile[]): TrackProfile[] {
  if (tracks.length <= 2) return [...tracks];
  const remaining = [...tracks];
  remaining.sort((a, b) => (a.overallEnergy ?? 0.5) - (b.overallEnergy ?? 0.5));
  const ordered: TrackProfile[] = [remaining.shift()!];
  while (remaining.length) {
    const prev = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const r = computeMixability(prev, remaining[i]);
      // Reward smooth energy continuation, mild penalty for big jumps.
      const dE = Math.abs((remaining[i].overallEnergy ?? 0.5) - (prev.overallEnergy ?? 0.5));
      const s = r.overall - dE * 25;
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MixSet builder

export interface PlanMixSetOptions {
  /** Force a single transition type for every join. */
  forceType?: TransitionType;
  /** Bars per transition. */
  bars?: number;
  /** Reorder by mixability first. Default true. */
  reorder?: boolean;
}

/** Build a MixSet: ordered tracks + per-join TransitionPlan. */
export function planMixSet(input: TrackProfile[], opts: PlanMixSetOptions = {}): MixSet {
  const order = opts.reorder === false ? [...input] : orderPlaylist(input);
  const plans: TransitionPlan[] = [];
  // Offline: events use plan-relative time, so startAtCtxTime is 0 here.
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i], b = order[i + 1];
    const { plan } = planTransition(
      {
        from: a, to: b,
        fromDeck: i % 2 === 0 ? "A" : "B",
        toDeck: i % 2 === 0 ? "B" : "A",
        startAtCtxTime: 0,
        forceType: opts.forceType,
        bars: opts.bars,
      },
      { from: 1, to: 1 },
    );
    plans.push(plan);
  }
  const meanScore = plans.length
    ? Math.round(plans.reduce((s, p) => s + p.qualityScore, 0) / plans.length)
    : 0;
  return { tracks: order, plans, meanScore, createdAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Offline renderer

export interface RenderProgress {
  stage: "fetch" | "decode" | "render" | "encode";
  trackIndex?: number;
  pct: number; // 0..100
}

export interface RenderOptions {
  sampleRate?: number;            // default 44100
  onProgress?: (p: RenderProgress) => void;
  /** Seconds of head-room appended after the last track. */
  tailPaddingSec?: number;
}

/** Render the MixSet into a single WAV blob via OfflineAudioContext.
 *  Uses two virtual decks (A/B) so adjacent crossfades can overlap. */
export async function renderMixToWav(set: MixSet, opts: RenderOptions = {}): Promise<Blob> {
  if (!set.tracks.length) throw new Error("MixSet has no tracks");
  const sampleRate = opts.sampleRate ?? 44100;
  const tail = opts.tailPaddingSec ?? 2;

  // 1. Fetch + decode every track. We need a temporary online AudioContext
  //    just for decodeAudioData; OfflineAudioContext.decodeAudioData also
  //    exists and is used here to avoid creating an output device.
  const tempCtx = new OfflineAudioContext(2, sampleRate, sampleRate);
  const buffers: AudioBuffer[] = [];
  for (let i = 0; i < set.tracks.length; i++) {
    opts.onProgress?.({ stage: "fetch", trackIndex: i, pct: (i / set.tracks.length) * 50 });
    const res = await fetch(set.tracks[i].sourceUrl);
    if (!res.ok) throw new Error(`Fetch failed for track ${i}`);
    const ab = await res.arrayBuffer();
    const buf = await tempCtx.decodeAudioData(ab.slice(0));
    buffers.push(buf);
  }
  opts.onProgress?.({ stage: "decode", pct: 55 });

  // 2. Lay out start times for each track on a virtual A/B deck timeline.
  //    Track i plays on deck (i % 2 === 0 ? A : B). Track i+1 starts
  //    (durationOf_i_at_rate − overlap) seconds after track i started.
  //    Plans declare durationSec = overlap.
  type Lay = { startSec: number; rate: number; durationSec: number; deck: "A" | "B" };
  const layouts: Lay[] = [];
  let cursor = 0;
  let curRate = 1;
  for (let i = 0; i < set.tracks.length; i++) {
    const deck: "A" | "B" = i % 2 === 0 ? "A" : "B";
    const buf = buffers[i];
    const playSec = buf.duration / curRate;
    layouts.push({ startSec: cursor, rate: curRate, durationSec: playSec, deck });
    if (i < set.tracks.length - 1) {
      const plan = set.plans[i];
      const overlap = Math.min(plan.durationSec, playSec * 0.95);
      cursor = cursor + Math.max(0, playSec - overlap);
      // Tempo glide ends at the incoming-track's natural rate (we apply the
      // ratio from this plan's mixability to the next track).
      const next = set.tracks[i + 1];
      if (next.bpm && set.tracks[i].bpm) {
        // outgoing bpm * curRate = incoming bpm * nextRate → nextRate = (out*rate)/in
        curRate = (set.tracks[i].bpm * curRate) / next.bpm;
        // half/double snap
        while (curRate < 0.75) curRate *= 2;
        while (curRate > 1.35) curRate /= 2;
        curRate = Math.max(0.88, Math.min(1.12, curRate));
      }
    }
  }
  const totalSec = layouts[layouts.length - 1].startSec + layouts[layouts.length - 1].durationSec + tail;

  // 3. Build the real offline graph.
  const octx = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);
  type DeckNodes = {
    gain: GainNode;
    eqLow: BiquadFilterNode;
    eqMid: BiquadFilterNode;
    eqHigh: BiquadFilterNode;
    filter: BiquadFilterNode;
  };
  const decks: Record<"A" | "B", DeckNodes> = {
    A: makeDeck(octx),
    B: makeDeck(octx),
  };
  const master = octx.createGain();
  master.gain.value = 0.92;
  decks.A.gain.connect(master);
  decks.B.gain.connect(master);
  master.connect(octx.destination);

  // 4. Schedule each track + the events from the plan that ENDS it (outgoing
  //    deck) and the plan that STARTS the next track (incoming deck).
  for (let i = 0; i < set.tracks.length; i++) {
    const lay = layouts[i];
    const src = octx.createBufferSource();
    src.buffer = buffers[i];
    src.playbackRate.value = lay.rate;
    // Route through this deck's chain.
    const d = decks[lay.deck];
    src.connect(d.eqLow);
    src.start(lay.startSec);
    // Initial deck gain = 1 for first track on deck A, 0 for everything else
    // until the plan ramps it up. We reset just before this track starts so
    // the previous plan's ramp doesn't leak.
    d.gain.gain.setValueAtTime(i === 0 ? 1 : (lay.deck === "A" && layouts[0].deck === "A" ? d.gain.gain.value : 1), Math.max(0, lay.startSec - 0.001));
  }

  // Reset everything to neutral at t=0 so we have a known baseline.
  resetDeck(decks.A, 0);
  resetDeck(decks.B, 0);
  // First track plays at full gain immediately.
  decks[layouts[0].deck].gain.gain.setValueAtTime(1, 0);

  // 5. Apply plan events on each join. Plan events are plan-relative; we
  //    anchor them to (start of outgoing track + outgoing duration - overlap).
  for (let i = 0; i < set.plans.length; i++) {
    const plan = set.plans[i];
    const outLay = layouts[i];
    const inLay = layouts[i + 1];
    const anchor = inLay.startSec; // crossfade begins when next track starts
    // Make sure the incoming deck's gain starts at 0 before the plan opens it.
    decks[inLay.deck].gain.gain.setValueAtTime(0, Math.max(0, anchor - 0.001));
    // Compute a per-event ramp length = time until the NEXT event on the same
    // parameter (deck + param). Otherwise every move uses 1/6 of the whole
    // plan and discrete recipe steps smear into a slow crossfade.
    const evs = plan.events.map((ev, idx) => ({ ev, idx, t: Math.max(0, ev.t) }));
    const paramKey = (ev: TransitionEvent): string | null => {
      if (ev.kind === "gain")   return ev.target === "deck" ? `g:${ev.deck}` : null;
      if (ev.kind === "filter") return `f:${ev.deck}`;
      if (ev.kind === "eq")     return `e:${ev.deck}:${ev.band}`;
      return null;
    };
    for (const cur of evs) {
      const key = paramKey(cur.ev);
      let nextT = plan.durationSec;
      if (key) {
        for (const o of evs) {
          if (o.idx === cur.idx) continue;
          if (paramKey(o.ev) !== key) continue;
          if (o.t > cur.t && o.t < nextT) nextT = o.t;
        }
      }
      const rampSec = Math.max(0.04, nextT - cur.t);
      const tAt = anchor + cur.t;
      applyEventOffline(cur.ev, tAt, rampSec, decks, inLay.deck, outLay.deck);
    }
    // Defensive: after the plan window, ensure outgoing is silent and incoming is full.
    const after = anchor + plan.durationSec + 0.01;
    decks[outLay.deck].gain.gain.setValueAtTime(0, after);
    decks[inLay.deck].gain.gain.setValueAtTime(1, after);
    resetEqAt(decks[outLay.deck], after);
    resetFilterAt(decks[outLay.deck], after);
  }

  // 6. Render & encode to WAV.
  opts.onProgress?.({ stage: "render", pct: 60 });
  const rendered = await octx.startRendering();
  opts.onProgress?.({ stage: "encode", pct: 95 });
  const wav = encodeWav(rendered);
  opts.onProgress?.({ stage: "encode", pct: 100 });
  return new Blob([wav], { type: "audio/wav" });
}

function makeDeck(ctx: BaseAudioContext): {
  gain: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  filter: BiquadFilterNode;
} {
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = "lowshelf"; eqLow.frequency.value = 120; eqLow.gain.value = 0;
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.Q.value = 1; eqMid.gain.value = 0;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = "highshelf"; eqHigh.frequency.value = 6000; eqHigh.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 22000; filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(filter); filter.connect(gain);
  return { gain, eqLow, eqMid, eqHigh, filter };
}

function resetDeck(d: { gain: GainNode; eqLow: BiquadFilterNode; eqMid: BiquadFilterNode; eqHigh: BiquadFilterNode; filter: BiquadFilterNode }, t: number) {
  d.gain.gain.setValueAtTime(0, t);
  resetEqAt(d, t);
  resetFilterAt(d, t);
}
function resetEqAt(d: { eqLow: BiquadFilterNode; eqMid: BiquadFilterNode; eqHigh: BiquadFilterNode }, t: number) {
  d.eqLow.gain.setValueAtTime(0, t);
  d.eqMid.gain.setValueAtTime(0, t);
  d.eqHigh.gain.setValueAtTime(0, t);
}
function resetFilterAt(d: { filter: BiquadFilterNode }, t: number) {
  d.filter.frequency.setValueAtTime(22000, t);
}

function applyEventOffline(
  ev: TransitionEvent,
  when: number,
  rampSec: number,
  decks: Record<"A" | "B", ReturnType<typeof makeDeck>>,
  _inDeck: "A" | "B",
  _outDeck: "A" | "B",
) {
  const d = decks[ev.deck];
  switch (ev.kind) {
    case "gain": {
      // Stem events skipped offline (no per-stem source).
      if (ev.target !== "deck") return;
      const g = d.gain.gain;
      g.setValueAtTime(g.value, when);
      if (ev.ramp === "exp") g.exponentialRampToValueAtTime(Math.max(0.0001, ev.to), when + rampSec);
      else g.linearRampToValueAtTime(Math.max(0, ev.to), when + rampSec);
      return;
    }
    case "filter": {
      d.filter.type = ev.filterType === "off" ? "lowpass" : ev.filterType;
      const f = d.filter.frequency;
      f.setValueAtTime(f.value, when);
      const target = ev.filterType === "off" ? 22000 : Math.max(40, ev.freq);
      if (ev.ramp === "exp") f.exponentialRampToValueAtTime(target, when + rampSec);
      else f.linearRampToValueAtTime(target, when + rampSec);
      return;
    }
    case "eq": {
      const node = ev.band === "low" ? d.eqLow : ev.band === "mid" ? d.eqMid : d.eqHigh;
      node.gain.setValueAtTime(node.gain.value, when);
      node.gain.linearRampToValueAtTime(ev.gainDb, when + rampSec);
      return;
    }
    // tempo/cut/fx: tempo handled via layout pre-resampling; cut/fx no-op offline.
    default: return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WAV encoder (16-bit PCM, interleaved stereo)

function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = Math.min(2, buf.numberOfChannels);
  const sampleRate = buf.sampleRate;
  const frames = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let p = 0;
  const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
  writeStr("RIFF");
  view.setUint32(p, 36 + dataSize, true); p += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(p, 16, true); p += 4;
  view.setUint16(p, 1, true); p += 2;            // PCM
  view.setUint16(p, numCh, true); p += 2;
  view.setUint32(p, sampleRate, true); p += 4;
  view.setUint32(p, sampleRate * blockAlign, true); p += 4;
  view.setUint16(p, blockAlign, true); p += 2;
  view.setUint16(p, 16, true); p += 2;
  writeStr("data");
  view.setUint32(p, dataSize, true); p += 4;

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MP3 export (lamejs, 192 kbps stereo)

/** Same as renderMixToWav but encodes the rendered AudioBuffer to MP3.
 *  Returns an audio/mpeg Blob suitable for download. */
export async function renderMixToMp3(
  set: MixSet,
  opts: RenderOptions & { kbps?: number } = {},
): Promise<Blob> {
  // Reuse the WAV pipeline up to the encode step, then transcode.
  // (We re-implement render here so we keep the AudioBuffer in scope.)
  if (!set.tracks.length) throw new Error("MixSet has no tracks");
  const wavBlob = await renderMixToWav(set, opts);
  // Decode WAV back to AudioBuffer so we have a clean source for lamejs.
  const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("AudioContext not available");
  const decodeCtx = new Ctx();
  let buf: AudioBuffer;
  try {
    const ab = await wavBlob.arrayBuffer();
    buf = await decodeCtx.decodeAudioData(ab.slice(0));
  } finally {
    try { await decodeCtx.close(); } catch { /* noop */ }
  }
  opts.onProgress?.({ stage: "encode", pct: 50 });
  const mp3 = encodeMp3(buf, opts.kbps ?? 192, (p) => {
    opts.onProgress?.({ stage: "encode", pct: 50 + p * 0.5 });
  });
  return new Blob(mp3 as unknown as BlobPart[], { type: "audio/mpeg" });
}

function encodeMp3(buf: AudioBuffer, kbps: number, onProgress?: (pct: number) => void): Uint8Array[] {
  const numCh = Math.min(2, buf.numberOfChannels);
  const sampleRate = buf.sampleRate;
  const encoder = new Mp3Encoder(numCh, sampleRate, kbps);
  const left = floatToInt16(buf.getChannelData(0));
  const right = numCh > 1 ? floatToInt16(buf.getChannelData(1)) : left;
  const chunkSize = 1152;
  const out: Uint8Array[] = [];
  const total = left.length;
  for (let i = 0; i < total; i += chunkSize) {
    const l = left.subarray(i, i + chunkSize);
    const r = right.subarray(i, i + chunkSize);
    const mp3buf = numCh > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (mp3buf.length > 0) out.push(new Uint8Array(mp3buf));
    if (i % (chunkSize * 64) === 0) onProgress?.(i / total);
  }
  const flush = encoder.flush();
  if (flush.length > 0) out.push(new Uint8Array(flush));
  onProgress?.(1);
  return out;
}

function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    let s = f[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}