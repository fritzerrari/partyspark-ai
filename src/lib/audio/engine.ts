// Browser-only global audio engine for PartyPilot.
// One <audio> element + AudioContext + AnalyserNode shared across the app.
// Phase 1: linear-volume crossfade, queue, progress.
// Phase 2 hooks: bpm/key, beatmatch, mood routing, harmonics.
import { create } from "zustand";
import type { MixPlan } from "./mixPlanner";

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

export type TransitionMode =
  | "crossfade"
  | "cut"
  | "fadeGap"
  | "filterSweep"
  | "echoTail"
  | "stinger"
  | "loopRoll"
  | "doubleDrop"
  | "bassSwap"
  | "reverbWash"
  | "genreBridge"
  | "meetMiddle"
  | "pitchLock"
  | "pedalDrone";

/** Mode hint accepted by the UI selector — "auto" lets planMix decide,
 *  "random" picks a virtuoso transition each time. */
export type TransitionModeHint = TransitionMode | "auto" | "random";

export const TRANSITION_LABELS: Record<TransitionModeHint, string> = {
  auto:        "Auto (Profi-DJ)",
  random:      "🎲 Random Virtuoso",
  crossfade:   "Crossfade",
  cut:         "Cut (hart)",
  fadeGap:     "Fade + Gap",
  filterSweep: "Filter Sweep",
  echoTail:    "Echo Tail",
  stinger:     "Stinger",
  loopRoll:    "Loop-Roll → Drop",
  doubleDrop:  "Double-Drop",
  bassSwap:    "Bass-Swap",
  reverbWash:  "Reverb-Wash",
  genreBridge: "Genre-Bridge (cross-genre)",
  meetMiddle:  "Meet-in-the-Middle (Tempo-Bend)",
  pitchLock:   "Pitch-Lock Pre-Shift",
  pedalDrone:  "Tonal Pedal-Drone",
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
  transitionMode: TransitionModeHint;
  stingerUrl: string | null;
  autoDj: boolean;
  pendingPlan: MixPlan | null;
  lastPlanNotes: string | null;
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
  setTransitionMode: (m: TransitionModeHint) => void;
  setStingerUrl: (url: string | null) => void;
  setAutoDj: (on: boolean) => void;
  getAudioElement: () => HTMLAudioElement | null;
  getAudioContext: () => AudioContext | null;
  getMasterNode: () => AudioNode | null;
  nextBeatTime: (fromSec?: number) => number;
  /** Force-rebuild the upcoming Auto-DJ plan (e.g. after queue or track change). */
  rebuildPlan: () => void;
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
// --- Deck B (used during Auto-DJ transitions) ---
let audioElB: HTMLAudioElement | null = null;
let sourceNodeB: MediaElementAudioSourceNode | null = null;
let filterNodeB: BiquadFilterNode | null = null;
let gainA: GainNode | null = null;
let gainB: GainNode | null = null;
let stretchB: import("./liveStretch").LiveStretchNode | null = null;
let autoSchedTimer: number | null = null;
let transitionInFlight = false;

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
      gainA = audioCtx.createGain();
      gainA.gain.value = 1;
      // source → filter → gainA → analyser → postGain → destination
      sourceNode.connect(filterNode);
      filterNode.connect(gainA);
      gainA.connect(analyser);
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

/** Lazily build the Deck-B graph (separate <audio> + nodes) for true overlap. */
function ensureDeckB() {
  if (typeof window === "undefined") return;
  if (!audioElB) {
    audioElB = new Audio();
    audioElB.crossOrigin = "anonymous";
    audioElB.preload = "auto";
    // Mirror any rate change into the pitch-preserving stretch node so the
    // incoming track keeps its musical key during BPM-sync.
    audioElB.addEventListener("ratechange", () => {
      const r = audioElB?.playbackRate ?? 1;
      if (stretchB) stretchB.setRate(r);
    });
  }
  if (!audioCtx) return;
  if (sourceNodeB || !postGain) return;
  try {
    sourceNodeB = audioCtx.createMediaElementSource(audioElB);
    filterNodeB = audioCtx.createBiquadFilter();
    filterNodeB.type = "lowpass";
    filterNodeB.frequency.value = 22000;
    gainB = audioCtx.createGain();
    gainB.gain.value = 0;
    // Source → filter → [stretch worklet (lazy)] → gain → postGain
    const passthrough = audioCtx.createGain();
    sourceNodeB.connect(filterNodeB);
    filterNodeB.connect(passthrough);
    passthrough.connect(gainB);
    gainB.connect(postGain);
    // Lazily attach the SoundTouch worklet so Deck B preserves pitch when
    // playbackRate is changed for BPM sync. Falls back to direct pass-through
    // if the worklet can't be loaded.
    void (async () => {
      try {
        const { createLiveStretch } = await import("./liveStretch");
        const st = await createLiveStretch(audioCtx!);
        if (!st || !filterNodeB || !gainB) return;
        filterNodeB.disconnect(passthrough);
        passthrough.disconnect();
        filterNodeB.connect(st.node);
        st.node.connect(gainB);
        stretchB = st;
        if (audioElB) stretchB.setRate(audioElB.playbackRate || 1);
      } catch (err) {
        console.warn("[engine] could not attach Deck-B stretch node", err);
      }
    })();
  } catch {
    /* second source may throw — ignore */
  }
}

function rampGain(g: GainNode | null, target: number, sec: number) {
  if (!g || !audioCtx) return;
  const now = audioCtx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(target, now + Math.max(0.05, sec));
}

function rampFilterOn(f: BiquadFilterNode | null, hz: number, sec: number) {
  if (!f || !audioCtx) return;
  const now = audioCtx.currentTime;
  f.frequency.cancelScheduledValues(now);
  f.frequency.setValueAtTime(f.frequency.value, now);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, hz), now + Math.max(0.05, sec));
}

async function executeAutoTransition(plan: MixPlan, nextTrack: EngineTrack) {
  if (!audioEl || !audioCtx || !gainA) return;
  ensureDeckB();
  if (!audioElB || !gainB) return;
  transitionInFlight = true;
  const targetVol = useEngine.getState().volume;
  audioElB.src = nextTrack.url;
  try { audioElB.currentTime = Math.max(0, plan.startAtSecOfNext); } catch { /* noop */ }
  audioElB.playbackRate = plan.bpmRatio;
  audioElB.volume = 1;
  gainB.gain.value = 0;
  await audioElB.play().catch(() => {});
  const xf = Math.max(0.6, plan.crossfadeSec);

  // Mode-specific effect choreography
  switch (plan.mode) {
    case "filterSweep":
      rampFilterOn(filterNode, 180, xf);
      rampGain(gainA, 0, xf);
      rampGain(gainB, targetVol, xf);
      break;
    case "reverbWash":
      await setFeedback(0.6);
      rampFilterOn(filterNode, 250, xf);
      rampGain(gainA, 0, xf);
      rampGain(gainB, targetVol, xf);
      break;
    case "echoTail":
      await setFeedback(0.55);
      rampGain(gainA, 0, xf * 0.8);
      rampGain(gainB, targetVol, xf);
      break;
    case "loopRoll": {
      // emulate a beat-loop tail: HPF rise on A while B fades in fast
      if (filterNode) filterNode.type = "highpass";
      rampFilterOn(filterNode, 1200, xf);
      rampGain(gainA, 0, xf);
      rampGain(gainB, targetVol, Math.min(2, xf * 0.5));
      break;
    }
    case "doubleDrop":
      // hard sync: keep both at full level briefly, then drop A
      rampGain(gainB, targetVol, 0.2);
      await new Promise((r) => setTimeout(r, Math.max(800, xf * 500)));
      rampGain(gainA, 0, xf * 0.5);
      break;
    case "bassSwap":
      // A: low-cut (HPF), B: full → after xf, swap
      if (filterNode) filterNode.type = "highpass";
      rampFilterOn(filterNode, 220, xf * 0.5);
      rampGain(gainB, targetVol, xf * 0.5);
      await new Promise((r) => setTimeout(r, xf * 500));
      rampGain(gainA, 0, xf * 0.5);
      break;
    case "cut":
      rampGain(gainA, 0, 0.05);
      rampGain(gainB, targetVol, 0.05);
      break;
    case "fadeGap":
      rampGain(gainA, 0, xf * 0.5);
      await new Promise((r) => setTimeout(r, xf * 500 + 400));
      rampGain(gainB, targetVol, xf * 0.5);
      break;
    case "stinger": {
      rampGain(gainA, 0, 0.3);
      const url = useEngine.getState().stingerUrl;
      if (url) await playStinger(url);
      rampGain(gainB, targetVol, 0.3);
      break;
    }
    case "crossfade":
    default:
      rampGain(gainA, 0, xf);
      rampGain(gainB, targetVol, xf);
      break;
  }

  await new Promise((r) => setTimeout(r, Math.max(800, xf * 1000) + 100));

  // Cleanup A side
  try { audioEl.pause(); } catch { /* noop */ }
  if (filterNode) {
    filterNode.type = "lowpass";
    if (audioCtx) {
      filterNode.frequency.cancelScheduledValues(audioCtx.currentTime);
      filterNode.frequency.setValueAtTime(22000, audioCtx.currentTime);
    }
  }
  await setFeedback(0);

  // Swap: move B's source URL into A, snap A to B's playhead, hand audio back to deck A
  const handoffTime = audioElB.currentTime;
  const wasPlaying = !audioElB.paused;
  try { audioElB.pause(); } catch { /* noop */ }
  audioEl.src = nextTrack.url;
  try { audioEl.currentTime = handoffTime; } catch { /* noop */ }
  audioEl.volume = targetVol;
  if (gainA) gainA.gain.value = 1;
  if (gainB) gainB.gain.value = 0;
  if (wasPlaying) await audioEl.play().catch(() => {});

  // Pop queue, update state, build next plan
  const st = useEngine.getState();
  const [, ...rest] = st.queue;
  useEngine.setState({
    current: nextTrack,
    queue: rest,
    isPlaying: true,
    positionSec: handoffTime,
    lastPlanNotes: plan.notes,
    pendingPlan: null,
  });
  transitionInFlight = false;
  // Build the plan for the *next* transition
  setTimeout(() => useEngine.getState().rebuildPlan(), 250);
}

function startAutoScheduler() {
  if (autoSchedTimer != null) return;
  autoSchedTimer = window.setInterval(() => {
    const st = useEngine.getState();
    if (!st.autoDj || transitionInFlight) return;
    if (!st.current || st.queue.length === 0) return;
    if (!st.pendingPlan) {
      // build a plan if none exists
      st.rebuildPlan();
      return;
    }
    const plan = st.pendingPlan;
    const dur = st.durationSec || (st.current.durationSec ?? 0);
    const safeTrigger = Math.min(plan.triggerAtSecOfCurrent, Math.max(0, dur - plan.crossfadeSec - 0.5));
    if (st.positionSec >= safeTrigger && st.positionSec > 1) {
      const next = st.queue[0];
      if (next) void executeAutoTransition(plan, next);
    }
  }, 250);
}

function stopAutoScheduler() {
  if (autoSchedTimer != null) {
    clearInterval(autoSchedTimer);
    autoSchedTimer = null;
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
  const hint = state.transitionMode;
  const mode: TransitionMode =
    !crossfade
      ? "cut"
      : hint === "auto" || hint === "random"
        ? "crossfade"
        : (hint as TransitionMode);
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
  if (gainA) gainA.gain.value = 1;
  if (audioCtx?.state === "suspended") void audioCtx.resume();
  if (startSilent) {
    tickFade(targetVol, Math.max(400, fadeMs));
  }
  useEngine.setState({ current: track, isPlaying: true, positionSec: 0 });
  // Rebuild plan whenever a new track starts
  setTimeout(() => useEngine.getState().rebuildPlan(), 200);
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
  transitionMode: "auto",
  stingerUrl: null,
  autoDj: false,
  pendingPlan: null,
  lastPlanNotes: null,

  loadQueue: (tracks, opts) => {
    if (!tracks.length) return;
    const [first, ...rest] = tracks;
    set({ queue: rest });
    if (opts?.autoplay !== false) void playTrack(first, false);
    else set({ current: first });
    setTimeout(() => useEngine.getState().rebuildPlan(), 250);
  },
  appendQueue: (tracks) => {
    set({ queue: [...get().queue, ...tracks] });
    setTimeout(() => useEngine.getState().rebuildPlan(), 100);
  },
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
          { bpm: state.current.bpm, camelot: state.current.camelot, beatGrid: state.current.beatGrid, cues: state.current.cues, durationSec: state.durationSec, energy: state.current.energy, vocalMap: state.current.vocalMap },
          { bpm: next.bpm, camelot: next.camelot, cues: next.cues, durationSec: next.durationSec, energy: next.energy },
          state.positionSec,
          { forceMode: state.transitionMode },
        );
        set({ crossfadeSec: plan.crossfadeSec, lastPlanNotes: plan.notes });
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
  setTransitionMode: (m) => {
    set({ transitionMode: m });
    setTimeout(() => useEngine.getState().rebuildPlan(), 50);
  },
  setStingerUrl: (url) => set({ stingerUrl: url }),
  setAutoDj: (on) => {
    set({ autoDj: on });
    if (on) { startAutoScheduler(); setTimeout(() => useEngine.getState().rebuildPlan(), 100); }
    else    { stopAutoScheduler(); set({ pendingPlan: null }); }
  },
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
  rebuildPlan: () => {
    const st = get();
    const next = st.queue[0];
    if (!st.current || !next) { set({ pendingPlan: null }); return; }
    void (async () => {
      try {
        const { planMix } = await import("./mixPlanner");
        const plan = planMix(
          { bpm: st.current!.bpm, camelot: st.current!.camelot, beatGrid: st.current!.beatGrid, cues: st.current!.cues, durationSec: st.durationSec, energy: st.current!.energy, vocalMap: st.current!.vocalMap },
          { bpm: next.bpm, camelot: next.camelot, cues: next.cues, durationSec: next.durationSec, energy: next.energy },
          st.positionSec,
          { forceMode: st.transitionMode },
        );
        set({ pendingPlan: plan });
      } catch { /* noop */ }
    })();
  },
}));