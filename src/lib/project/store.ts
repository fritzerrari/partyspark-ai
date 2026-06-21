// Project Bus — global state shared across all studio modules.
// Each module reads & writes Artifacts here so output of one module
// is instantly available as input in another (Remix → Choir → Cockpit, …).
import { create } from "zustand";
import type { EngineTrack } from "@/lib/audio/engine";
import type { TrackAnalysis } from "@/lib/audio/analyze";

export type ArtifactKind =
  | "track"     // imported library track (url-backed)
  | "recording" // raw mic take (buffer-backed)
  | "vocal"     // processed vocal (autotune/choir/chain)
  | "remix"     // dance-edit
  | "mashup"
  | "fx"        // sound-designed one-shot or bed
  | "lyrics";   // text artifact

export type ProjectArtifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  /** In-memory audio buffer (live session). Cleared on refresh. */
  buffer?: AudioBuffer;
  /** Streamable URL (signed Storage URL or blob URL). */
  url?: string;
  /** Persisted Storage path, for re-loads after refresh. */
  storagePath?: string;
  bucket?: "tracks" | "recordings" | "artwork";
  /** Source artifact id (e.g. remix was built from this track). */
  sourceId?: string;
  analysis?: TrackAnalysis | null;
  /** Loose metadata bag (sections, bpm, key …). */
  meta?: Record<string, unknown>;
  createdAt: number;
};

type ProjectState = {
  name: string;
  artifacts: ProjectArtifact[];
  focusId: string | null;
  setName: (n: string) => void;
  addArtifact: (a: Omit<ProjectArtifact, "id" | "createdAt"> & { id?: string }) => string;
  updateArtifact: (id: string, patch: Partial<ProjectArtifact>) => void;
  removeArtifact: (id: string) => void;
  setFocus: (id: string | null) => void;
  clear: () => void;
  /** Convenience: convert an artifact into an EngineTrack the audio engine can load. */
  toEngineTrack: (id: string) => EngineTrack | null;
  /** Register an EngineTrack (e.g. from cockpit library) as an artifact, dedup by id. */
  addEngineTrack: (t: EngineTrack) => string;
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `art_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export const useProject = create<ProjectState>((set, get) => ({
  name: "Untitled Session",
  artifacts: [],
  focusId: null,
  setName: (n) => set({ name: n }),
  addArtifact: (a) => {
    const id = a.id ?? uid();
    const art: ProjectArtifact = { ...a, id, createdAt: Date.now() };
    set((s) => ({ artifacts: [art, ...s.artifacts].slice(0, 200), focusId: id }));
    return id;
  },
  updateArtifact: (id, patch) =>
    set((s) => ({ artifacts: s.artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  removeArtifact: (id) =>
    set((s) => ({
      artifacts: s.artifacts.filter((a) => a.id !== id),
      focusId: s.focusId === id ? null : s.focusId,
    })),
  setFocus: (id) => set({ focusId: id }),
  clear: () => set({ artifacts: [], focusId: null }),
  toEngineTrack: (id) => {
    const a = get().artifacts.find((x) => x.id === id);
    if (!a) return null;
    let url = a.url;
    if (!url && a.buffer) {
      // Lazy WAV blob URL so the engine can stream a memory-only artifact.
      try {
        const blob = audioBufferToWavBlob(a.buffer);
        url = URL.createObjectURL(blob);
      } catch { /* noop */ }
    }
    if (!url) return null;
    return {
      id: a.id,
      title: a.title,
      url,
      artist: (a.meta?.artist as string | null) ?? null,
      artwork: (a.meta?.artwork as string | null) ?? null,
      bpm: a.analysis?.bpm ?? (a.meta?.bpm as number | null) ?? null,
      energy: (a.meta?.energy as number | null) ?? null,
      camelot: a.analysis?.camelot ?? null,
      musicalKey: a.analysis?.musicalKey ?? null,
      beatGrid: a.analysis?.beatGrid ?? null,
      cues: a.analysis?.cues ?? null,
      vocalMap: a.analysis?.vocalMap ?? null,
      durationSec: a.buffer ? a.buffer.duration : ((a.meta?.durationSec as number | null) ?? null),
    };
  },
  addEngineTrack: (t) => {
    const existing = get().artifacts.find((a) => a.id === t.id);
    if (existing) return existing.id;
    const art: ProjectArtifact = {
      id: t.id,
      kind: "track",
      title: t.title,
      url: t.url,
      analysis: t.bpm ? ({
        bpm: t.bpm,
        musicalKey: t.musicalKey ?? null,
        camelot: t.camelot ?? null,
        beatGrid: t.beatGrid ?? null,
        cues: t.cues ?? null,
        vocalMap: t.vocalMap ?? null,
        energyCurve: null,
      } as unknown as TrackAnalysis) : null,
      meta: { artist: t.artist, artwork: t.artwork, durationSec: t.durationSec, bpm: t.bpm },
      createdAt: Date.now(),
    };
    set((s) => ({ artifacts: [art, ...s.artifacts].slice(0, 200) }));
    return art.id;
  },
}));

/** Tiny in-place WAV encoder so toEngineTrack() can produce a streamable URL from a buffer. */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, len - 8, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, len - 44, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Selector hook: artifacts of a given kind. */
export function useArtifactsByKind(kinds: ArtifactKind | ArtifactKind[]): ProjectArtifact[] {
  const set = Array.isArray(kinds) ? new Set(kinds) : new Set([kinds]);
  return useProject((s) => s.artifacts.filter((a) => set.has(a.kind)));
}