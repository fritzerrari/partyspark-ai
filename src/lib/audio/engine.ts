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
  camelot?: string | null;
  musicalKey?: string | null;
  beatGrid?: number[] | null;
  cues?: { introEnd: number; firstDrop: number; outroStart: number } | null;
  vocalMap?: { t: number; voiced: number }[] | null;
};

export type TransitionMode = "crossfade" | "cut" | "fadeGap" | "filterSweep" | "echoTail" | "stinger";

export const TRANSITION_LABELS: Record<TransitionMode, string> = {
  crossfade:   "Crossfade",
  cut:         "Cut (hart)",
  fadeGap:     "Fade + Gap",
  filterSweep: "Filter Sweep",
  echoTail:    "Echo Tail",
  stinger:     "Stinger",
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
  transitionMode: TransitionMode;
  stingerUrl: string | null;
  autoDj: boolean;
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
  setTransitionMode: (m: TransitionMode) => void;
  setStingerUrl: (url: string | null) => void;
  setAutoDj: (on: boolean) => void;
  getAudioElement: () => HTMLAudioElement | null;
  getAudioContext: () => AudioContext | null;
  getMasterNode: () => AudioNode | null;
  nextBeatTime: (fromSec?: number) => number;
};

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let filterNode: BiquadFilterNode | null = null;
let delayNode: DelayNode | null = null;
let delayFb: GainNode | null = null;
let delayReturn: GainNode | null = null;
let postGain: GainNode | null = null;
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
      filterNode = audioCtx.createBiquadFilter();
      filterNode.type = "lowpass";
      filterNode.frequency.value = 22000;
      filterNode.Q.value = 0.7;
      delayNode = audioCtx.createDelay(1.5);
      delayNode.delayTime.value = 0.32;
      delayFb = audioCtx.createGain();
      delayFb.gain.value = 0;
      delayReturn = audioCtx.createGain();
      delayReturn.gain.value = 0;
      postGain = audioCtx.createGain();
      // source → filter → analyser → postGain → destination
      sourceNode.connect(filterNode);
      filterNode.connect(analyser);
      analyser.connect(postGain);
      postGain.connect(audioCtx.destination);
      // delay tap (feedback loop), normally muted via delayReturn
      filterNode.connect(delayNode);
      delayNode.connect(delayFb);
      delayFb.connect(delayNode);
      delayNode.connect(delayReturn);
      delayReturn.connect(postGain);
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

async function rampFilter(targetHz: number, durationMs: number) {
  if (!filterNode || !audioCtx) return;
  const now = audioCtx.currentTime;
  filterNode.frequency.cancelScheduledValues(now);
  filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
  filterNode.frequency.exponentialRampToValueAtTime(Math.max(40, targetHz), now + durationMs / 1000);
  await new Promise((r) => setTimeout(r, durationMs));
}

async function setFeedback(value: number) {
  if (delayFb && delayReturn && audioCtx) {
    delayFb.gain.setTargetAtTime(value, audioCtx.currentTime, 0.05);
    delayReturn.gain.setTargetAtTime(value > 0 ? 1 : 0, audioCtx.currentTime, 0.05);
  }
}

function playStinger(url: string): Promise<void> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
    // safety timeout
    setTimeout(resolve, 5000);
  });
}

async function playTrack(track: EngineTrack, crossfade: boolean) {
  ensureAudio();
  if (!audioEl) return;
  const state = useEngine.getState();
  const targetVol = state.volume;
  const fadeMs = state.crossfadeSec * 1000;
  const mode: TransitionMode = crossfade ? state.transitionMode : "cut";
  const wasPlaying = crossfade && !audioEl.paused;

  if (wasPlaying) {
    ensureGraph();
    if (mode === "cut") {
      // no fade
    } else if (mode === "fadeGap") {
      tickFade(0, Math.max(400, fadeMs * 0.5));
      await new Promise((r) => setTimeout(r, Math.max(400, fadeMs * 0.5)));
      await new Promise((r) => setTimeout(r, 800));
    } else if (mode === "filterSweep") {
      void rampFilter(150, Math.max(800, fadeMs));
      tickFade(0, Math.max(800, fadeMs));
      await new Promise((r) => setTimeout(r, Math.max(800, fadeMs)));
    } else if (mode === "echoTail") {
      await setFeedback(0.55);
      tickFade(0, Math.max(800, fadeMs));
      await new Promise((r) => setTimeout(r, Math.max(800, fadeMs)));
      await setFeedback(0);
    } else if (mode === "stinger") {
      tickFade(0, 400);
      await new Promise((r) => setTimeout(r, 400));
      if (state.stingerUrl) await playStinger(state.stingerUrl);
    } else {
      // crossfade (default)
      tickFade(0, fadeMs);
      await new Promise((r) => setTimeout(r, fadeMs));
    }
  }

  // reset filter for incoming track
  if (filterNode && audioCtx) {
    filterNode.frequency.cancelScheduledValues(audioCtx.currentTime);
    filterNode.frequency.setValueAtTime(22000, audioCtx.currentTime);
  }

  audioEl.src = track.url;
  const startSilent = wasPlaying && mode !== "cut";
  audioEl.volume = startSilent ? 0 : targetVol;
  await audioEl.play().catch(() => {});
  ensureGraph();
  if (audioCtx?.state === "suspended") void audioCtx.resume();
  if (startSilent) {
    tickFade(targetVol, Math.max(400, fadeMs));
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
  transitionMode: "crossfade",
  stingerUrl: null,
  autoDj: false,

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
    // Auto-DJ: pick smarter transition based on track metadata
    const state = get();
    if (state.autoDj && state.current) {
      try {
        const { planMix } = await import("./mixPlanner");
        const plan = planMix(
          { bpm: state.current.bpm, camelot: state.current.camelot, beatGrid: state.current.beatGrid, cues: state.current.cues, durationSec: state.durationSec, energy: state.current.energy },
          { bpm: next.bpm, camelot: next.camelot, cues: next.cues, durationSec: next.durationSec, energy: next.energy },
          state.positionSec,
        );
        set({ transitionMode: plan.mode, crossfadeSec: plan.crossfadeSec });
      } catch { /* fall back to current mode */ }
    }
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
  setTransitionMode: (m) => set({ transitionMode: m }),
  setStingerUrl: (url) => set({ stingerUrl: url }),
  setAutoDj: (on) => set({ autoDj: on }),
  getAudioElement: () => audioEl,
  getAudioContext: () => audioCtx,
  getMasterNode: () => postGain,
  nextBeatTime: (fromSec) => {
    const cur = get().current;
    const pos = fromSec ?? get().positionSec;
    const grid = cur?.beatGrid ?? null;
    if (!grid?.length) return pos;
    for (const b of grid) if (b > pos + 0.02) return b;
    return grid[grid.length - 1];
  },
}));