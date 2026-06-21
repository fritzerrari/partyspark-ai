// Reactive selector for "what is currently playing on the cockpit decks?".
// Used by the sing-along autotune to lock to the live key/BPM.
import { useSyncExternalStore } from "react";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { shiftKey } from "@/lib/audio/keyDelta";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";

export type NowPlaying = {
  side: "A" | "B" | null;
  title: string | null;
  artist: string | null;
  musicalKey: string | null;   // already shifted by current deck pitch
  camelot: string | null;
  bpm: number | null;          // already adjusted by current deck pitch
  pitch: number;               // playback rate of the dominant deck
};

function pickDominant(): NowPlaying {
  const s = useTwinDeck.getState();
  const a = s.A; const b = s.B;
  const aActive = !!a.track && a.isPlaying;
  const bActive = !!b.track && b.isPlaying;
  // Bias by crossfader: < 0.45 prefers A, > 0.55 prefers B, in between use loudness.
  let side: "A" | "B" | null = null;
  if (aActive && !bActive) side = "A";
  else if (bActive && !aActive) side = "B";
  else if (aActive && bActive) {
    if (s.crossfader < 0.45) side = "A";
    else if (s.crossfader > 0.55) side = "B";
    else side = (a.volume ?? 1) >= (b.volume ?? 1) ? "A" : "B";
  } else {
    // Nothing playing — still expose the last-loaded deck so the UI can preview.
    side = a.track ? "A" : b.track ? "B" : null;
  }
  if (!side) return { side: null, title: null, artist: null, musicalKey: null, camelot: null, bpm: null, pitch: 1 };
  const d = side === "A" ? a : b;
  const t = d.track;
  if (!t) return { side, title: null, artist: null, musicalKey: null, camelot: null, bpm: null, pitch: d.pitch ?? 1 };
  const pitch = d.pitch ?? 1;
  // Semitones implied by playback-rate (12 * log2(rate)).
  const semis = Math.round(12 * Math.log2(pitch));
  const liveKey = t.musicalKey ? shiftKey(t.musicalKey, semis) : null;
  const liveBpm = t.bpm ? Math.round(t.bpm * pitch) : null;
  return {
    side,
    title: t.title ?? null,
    artist: t.artist ?? null,
    musicalKey: liveKey,
    camelot: liveKey ? keyToCamelot(liveKey) : null,
    bpm: liveBpm,
    pitch,
  };
}

let cached: NowPlaying = pickDominant();
let cachedKey = "";
function getSnapshot(): NowPlaying {
  const next = pickDominant();
  const k = `${next.side}|${next.musicalKey}|${next.bpm}|${next.pitch}|${next.title}`;
  if (k !== cachedKey) { cachedKey = k; cached = next; }
  return cached;
}

function subscribe(cb: () => void): () => void {
  return useTwinDeck.subscribe(cb);
}

export function useNowPlaying(): NowPlaying {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getNowPlaying(): NowPlaying {
  return getSnapshot();
}