// Browser-only global audio engine for PartyPilot.
// One <audio> element + AudioContext + AnalyserNode shared across the app.
// Phase 1: linear-volume crossfade, queue, progress.
// Phase 2 hooks: bpm/key, beatmatch, mood routing, harmonics.
import { create } from "zustand";

export type EngineTrack = {
  id: string;
  title: string;
  artist?: string | null;
  url: string;
  artwork?: string | null;
  durationSec?: number | null;
  bpm?: number | null;
  energy?: number | null;
};

type State = {
  current: EngineTrack | null;
  queue: EngineTrack[];
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;
  crossfadeSec: number;
  energy: number;
  mood: string;
};

type Actions = {
  loadQueue: (tracks: EngineTrack[], opts?: { autoplay?: boolean }) => void;
  appendQueue: (tracks: EngineTrack[]) => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  skip: () => Promise<void>;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  setCrossfade: (s: number) => void;
  setEnergy: (e: number) => void;
  bumpEnergy: (delta: number) => void;
  setMood: (m: string) => void;
  getAnalyser: () => AnalyserNode | null;
};

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let rafId: number | null = null;

function ensureAudio() {
  if (typeof window === "undefined") return;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.preload = "auto";
    audioEl.addEventListener("timeupdate", () => {
      useEngine.setState({
        positionSec: audioEl?.currentTime ?? 0,
        durationSec: audioEl?.duration || useEngine.getState().durationSec,
      });
    });
    audioEl.addEventListener("loadedmetadata", () => {
      useEngine.setState({ durationSec: audioEl?.duration ?? 0 });
    });
    audioEl.addEventListener("ended", () => {
      void useEngine.getState().skip();
    });
  }
}

function ensureGraph() {
  if (typeof window === "undefined" || !audioEl) return;
  if (!audioCtx) {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx && !sourceNode) {
    try {
      sourceNode = audioCtx.createMediaElementSource(audioEl);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch {
      /* may throw on second source — ignore */
    }
  }
}

function tickFade(target: number, durationMs: number) {
  if (!audioEl) return;
  if (rafId) cancelAnimationFrame(rafId);
  const start = performance.now();
  const from = audioEl.volume;
  const step = (t: number) => {
    if (!audioEl) return;
    const p = Math.min(1, (t - start) / durationMs);
    audioEl.volume = from + (target - from) * p;
    if (p < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

async function playTrack(track: EngineTrack, crossfade: boolean) {
  ensureAudio();
  if (!audioEl) return;
  if (crossfade && !audioEl.paused) {
    const fadeMs = useEngine.getState().crossfadeSec * 1000;
    tickFade(0, fadeMs);
    await new Promise((r) => setTimeout(r, fadeMs));
  }
  audioEl.src = track.url;
  audioEl.volume = crossfade ? 0 : useEngine.getState().volume;
  await audioEl.play().catch(() => {});
  ensureGraph();
  if (audioCtx?.state === "suspended") {
    void audioCtx.resume();
  }
  if (crossfade) {
    tickFade(useEngine.getState().volume, useEngine.getState().crossfadeSec * 1000);
  }
  useEngine.setState({ current: track, isPlaying: true, positionSec: 0 });
}

export const useEngine = create<State & Actions>((set, get) => ({
  current: null,
  queue: [],
  isPlaying: false,
  positionSec: 0,
  durationSec: 0,
  volume: 0.9,
  crossfadeSec: 6,
  energy: 50,
  mood: "Warm-up",

  loadQueue: (tracks, opts) => {
    if (!tracks.length) return;
    const [first, ...rest] = tracks;
    set({ queue: rest });
    if (opts?.autoplay !== false) void playTrack(first, false);
    else set({ current: first });
  },
  appendQueue: (tracks) => set({ queue: [...get().queue, ...tracks] }),
  play: async () => {
    ensureAudio();
    if (!audioEl) return;
    if (!audioEl.src && get().current) {
      await playTrack(get().current!, false);
      return;
    }
    await audioEl.play().catch(() => {});
    ensureGraph();
    if (audioCtx?.state === "suspended") void audioCtx.resume();
    set({ isPlaying: true });
  },
  pause: () => {
    audioEl?.pause();
    set({ isPlaying: false });
  },
  toggle: () => {
    if (get().isPlaying) get().pause();
    else void get().play();
  },
  skip: async () => {
    const q = get().queue;
    if (!q.length) {
      set({ isPlaying: false });
      return;
    }
    const [next, ...rest] = q;
    set({ queue: rest });
    await playTrack(next, true);
  },
  seek: (sec) => {
    if (audioEl) audioEl.currentTime = sec;
    set({ positionSec: sec });
  },
  setVolume: (v) => {
    if (audioEl) audioEl.volume = v;
    set({ volume: v });
  },
  setCrossfade: (s) => set({ crossfadeSec: s }),
  setEnergy: (e) => set({ energy: Math.max(0, Math.min(100, e)) }),
  bumpEnergy: (delta) => set({ energy: Math.max(0, Math.min(100, get().energy + delta)) }),
  setMood: (m) => set({ mood: m }),
  getAnalyser: () => analyser,
}));