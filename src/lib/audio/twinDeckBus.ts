// Twin-Deck Bus — two independent audio decks (A & B) wired through one
// AudioContext with filter + gain per deck. Supports choreographed
// transitions between the two decks using the same vocabulary as the
// global Auto-DJ engine (mixPlanner + TransitionMode), plus a Timer
// auto-transition mode (every XX seconds across a track pool).
import { create } from "zustand";
import type { EngineTrack, TransitionMode, TransitionModeHint } from "./engine";
import { planMix } from "./mixPlanner";
import { analyzeAudio, decodeToBuffer, camelotCompatible } from "./analyze";
import { keyToCamelot } from "./keyToCamelot";
import { supabase } from "@/integrations/supabase/client";

export type DeckSide = "A" | "B";

export type DeckState = {
  track: EngineTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  pitch: number;     // 0.85..1.15
  volume: number;    // user vol 0..1
  analyzing: boolean;
  analyzeProgress: number; // 0..100
};

type BusState = {
  A: DeckState;
  B: DeckState;
  crossfader: number; // 0..1 (0=A only, 1=B only)
  master: number;
  transitionMode: TransitionModeHint;
  transitionInFlight: boolean;
  lastTransitionNote: string | null;
  autoTimerOn: boolean;
  autoTimerSec: number;       // interval
  autoTimerCountdown: number; // seconds until next
  autoShuffle: boolean;
  pool: EngineTrack[];        // track pool for timer auto-DJ
  needsUserGesture: boolean;
  recording: boolean;
  lastRecordingUrl: string | null;
};

type Actions = {
  init: () => void;
  loadDeck: (side: DeckSide, track: EngineTrack) => Promise<void>;
  toggle: (side: DeckSide) => Promise<void>;
  seek: (side: DeckSide, sec: number) => void;
  scrub: (side: DeckSide, deltaSec: number) => void;
  setVolume: (side: DeckSide, v: number) => void;
  setPitch: (side: DeckSide, p: number) => void;
  setCrossfader: (v: number) => void;
  setMaster: (v: number) => void;
  setTransitionMode: (m: TransitionModeHint) => void;
  sync: (from: DeckSide, to: DeckSide) => void;
  transition: (from: DeckSide, to: DeckSide, opts?: { mode?: TransitionModeHint }) => Promise<void>;
  setPool: (tracks: EngineTrack[]) => void;
  setAutoShuffle: (v: boolean) => void;
  setAutoTimerSec: (s: number) => void;
  setAutoTimerOn: (on: boolean) => void;
  /** Lazy analyze a deck's currently loaded track + persist to DB. */
  ensureAnalysis: (side: DeckSide, opts?: { force?: boolean }) => Promise<void>;
  /** One-click Auto-DJ start: loads two tracks if needed and starts playback. */
  startAutoDj: () => Promise<void>;
  stopAutoDj: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  dispose: () => void;
};

// ---- Audio graph (module-scoped singletons) ----
let ctx: AudioContext | null = null;
const deck: Record<DeckSide, {
  el: HTMLAudioElement | null;
  src: MediaElementAudioSourceNode | null;
  filter: BiquadFilterNode | null;
  gain: GainNode | null;
  eqLow: BiquadFilterNode | null;
  eqMid: BiquadFilterNode | null;
  eqHigh: BiquadFilterNode | null;
} > = {
  A: { el: null, src: null, filter: null, gain: null, eqLow: null, eqMid: null, eqHigh: null },
  B: { el: null, src: null, filter: null, gain: null, eqLow: null, eqMid: null, eqHigh: null },
};
let masterGain: GainNode | null = null;
let rafId: number | null = null;

function emptyDeck(): DeckState {
  return { track: null, isPlaying: false, position: 0, duration: 0, pitch: 1, volume: 0.9, analyzing: false, analyzeProgress: 0 };
}

function ensureCtx() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
}

function wireDeck(side: DeckSide) {
  if (!ctx || !masterGain) return;
  const d = deck[side];
  if (!d.el) {
    d.el = new Audio();
    d.el.crossOrigin = "anonymous";
    d.el.preload = "auto";
    d.el.addEventListener("timeupdate", () => {
      useTwinDeck.setState((s) => ({ [side]: { ...s[side], position: d.el?.currentTime ?? 0 } } as Partial<BusState>));
    });
    d.el.addEventListener("loadedmetadata", () => {
      useTwinDeck.setState((s) => ({ [side]: { ...s[side], duration: d.el?.duration ?? 0 } } as Partial<BusState>));
    });
    d.el.addEventListener("play", () => {
      useTwinDeck.setState((s) => ({ [side]: { ...s[side], isPlaying: true } } as Partial<BusState>));
    });
    d.el.addEventListener("pause", () => {
      useTwinDeck.setState((s) => ({ [side]: { ...s[side], isPlaying: false } } as Partial<BusState>));
    });
    d.el.addEventListener("ended", () => {
      useTwinDeck.setState((s) => ({ [side]: { ...s[side], isPlaying: false } } as Partial<BusState>));
    });
  }
  if (!d.src && d.el) {
    try {
      d.src = ctx.createMediaElementSource(d.el);
      d.eqLow = ctx.createBiquadFilter();
      d.eqLow.type = "lowshelf"; d.eqLow.frequency.value = 120; d.eqLow.gain.value = 0;
      d.eqMid = ctx.createBiquadFilter();
      d.eqMid.type = "peaking"; d.eqMid.frequency.value = 1000; d.eqMid.Q.value = 1; d.eqMid.gain.value = 0;
      d.eqHigh = ctx.createBiquadFilter();
      d.eqHigh.type = "highshelf"; d.eqHigh.frequency.value = 6000; d.eqHigh.gain.value = 0;
      d.filter = ctx.createBiquadFilter();
      d.filter.type = "lowpass";
      d.filter.frequency.value = 22000;
      d.filter.Q.value = 0.7;
      d.gain = ctx.createGain();
      d.gain.gain.value = 1;
      d.src.connect(d.eqLow);
      d.eqLow.connect(d.eqMid);
      d.eqMid.connect(d.eqHigh);
      d.eqHigh.connect(d.filter);
      d.filter.connect(d.gain);
      d.gain.connect(masterGain);
    } catch {
      /* already wired */
    }
  }
}

function rampGain(g: GainNode | null, target: number, sec: number) {
  if (!g || !ctx) return;
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(target, now + Math.max(0.05, sec));
}
function rampFreq(f: BiquadFilterNode | null, hz: number, sec: number) {
  if (!f || !ctx) return;
  const now = ctx.currentTime;
  f.frequency.cancelScheduledValues(now);
  f.frequency.setValueAtTime(f.frequency.value, now);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, hz), now + Math.max(0.05, sec));
}
function resetFilter(side: DeckSide) {
  const f = deck[side].filter;
  if (!f || !ctx) return;
  f.type = "lowpass";
  f.frequency.cancelScheduledValues(ctx.currentTime);
  f.frequency.setValueAtTime(22000, ctx.currentTime);
}
function rampEqGain(node: BiquadFilterNode | null, dB: number, sec: number) {
  if (!node || !ctx) return;
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(dB, now + Math.max(0.05, sec));
}
function resetEq(side: DeckSide) {
  const d = deck[side];
  if (!ctx) return;
  for (const n of [d.eqLow, d.eqMid, d.eqHigh]) {
    if (!n) continue;
    n.gain.cancelScheduledValues(ctx.currentTime);
    n.gain.setValueAtTime(0, ctx.currentTime);
  }
}

/** Choose effective BPM ratio considering half/double-time matches. */
function tempoRatio(fromBpm: number, toBpm: number): number {
  const candidates = [toBpm, toBpm * 2, toBpm / 2];
  let best = toBpm;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - fromBpm) / fromBpm;
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  // ratio applied to incoming playbackRate to match outgoing
  return fromBpm / best;
}

/** Sync incoming deck's playbackRate so its perceived BPM matches outgoing. */
function syncTempo(from: DeckSide, to: DeckSide): number {
  const st = useTwinDeck.getState();
  const fb = st[from].track?.bpm;
  const tb = st[to].track?.bpm;
  const fromRate = deck[from].el?.playbackRate ?? 1;
  if (!fb || !tb) return 1;
  const ratio = tempoRatio(fb * fromRate, tb);
  const clamped = Math.max(0.88, Math.min(1.12, ratio));
  if (deck[to].el) deck[to].el.playbackRate = clamped;
  useTwinDeck.setState((s) => ({ [to]: { ...s[to], pitch: clamped } } as Partial<BusState>));
  return clamped;
}

/** Align incoming deck so its next downbeat falls on outgoing's next downbeat. */
function beatAlign(from: DeckSide, to: DeckSide) {
  const st = useTwinDeck.getState();
  const fGrid = st[from].track?.beatGrid;
  const tGrid = st[to].track?.beatGrid;
  const fEl = deck[from].el;
  const tEl = deck[to].el;
  if (!fEl || !tEl) return;
  const fNow = fEl.currentTime;
  // next from-beat at least 80ms ahead so we don't miss it
  const fNext = (fGrid && fGrid.length)
    ? (fGrid.find((b) => b > fNow + 0.08) ?? fNow + 0.5)
    : fNow + 0.5;
  const dt = fNext - fNow; // seconds until alignment in wall-clock (rates are now ~equal)
  // find a downbeat-ish beat in `to` (every 4th) near startAtSec
  const tStart = tEl.currentTime;
  let tBeat = tStart;
  if (tGrid && tGrid.length) {
    // prefer downbeats (every 4 beats) closest to current position
    const downs = tGrid.filter((_, i) => i % 4 === 0);
    tBeat = downs.find((b) => b >= tStart) ?? tGrid.find((b) => b >= tStart) ?? tStart;
  }
  // we want tBeat to play `dt` seconds from now → set currentTime = tBeat - dt
  const adjusted = Math.max(0, tBeat - dt);
  try { tEl.currentTime = adjusted; } catch { /* noop */ }
}

async function waitForNextBeat(side: DeckSide, maxMs = 2000): Promise<void> {
  const st = useTwinDeck.getState();
  const grid = st[side].track?.beatGrid;
  const el = deck[side].el;
  if (!el || !grid || !grid.length) return;
  const now = el.currentTime;
  const next = grid.find((b) => b > now + 0.04);
  if (!next) return;
  const waitMs = Math.min(maxMs, Math.max(0, (next - now) * 1000 / (el.playbackRate || 1)));
  await new Promise((r) => setTimeout(r, waitMs));
}

function applyCrossfader(state: BusState) {
  if (!deck.A.gain || !deck.B.gain) return;
  const gA = Math.cos((state.crossfader * Math.PI) / 2);
  const gB = Math.sin((state.crossfader * Math.PI) / 2);
  deck.A.gain.gain.value = state.A.volume * gA;
  deck.B.gain.gain.value = state.B.volume * gB;
}

function animateCrossfader(toValue: number, durationMs: number) {
  if (rafId) cancelAnimationFrame(rafId);
  const from = useTwinDeck.getState().crossfader;
  const start = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / durationMs);
    const v = from + (toValue - from) * p;
    useTwinDeck.setState({ crossfader: v });
    if (p < 1) rafId = requestAnimationFrame(step);
    else rafId = null;
  };
  rafId = requestAnimationFrame(step);
}

let autoTimerInterval: number | null = null;
let poolCursor = 0;
const recentlyPlayedIds: string[] = [];
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let recorderStream: MediaStreamAudioDestinationNode | null = null;

function pickNextTrack(state: BusState): EngineTrack | null {
  const pool = state.pool;
  if (pool.length < 1) return null;
  const loadedIds = new Set([state.A.track?.id, state.B.track?.id].filter(Boolean) as string[]);
  const recent = new Set(recentlyPlayedIds.slice(-Math.min(4, Math.max(0, pool.length - 2))));
  const avoid = new Set<string>([...loadedIds, ...recent]);
  const candidates = pool.filter((t) => !avoid.has(t.id));
  const choosable = candidates.length > 0 ? candidates : pool.filter((t) => !loadedIds.has(t.id));
  if (choosable.length === 0) return null;
  if (state.autoShuffle) {
    return choosable[Math.floor(Math.random() * choosable.length)];
  }
  const t = choosable[poolCursor % choosable.length];
  poolCursor++;
  return t;
}

function startAutoTimer() {
  if (autoTimerInterval != null) return;
  // tick every second to update countdown; fire transition when 0
  autoTimerInterval = window.setInterval(() => {
    const st = useTwinDeck.getState();
    if (!st.autoTimerOn) return;
    if (st.transitionInFlight) return;
    // If neither deck is playing yet, do not count down — wait for cold start
    if (!st.A.isPlaying && !st.B.isPlaying) return;
    let cd = st.autoTimerCountdown - 1;
    if (cd <= 0) {
      // from = whichever deck is currently audible/playing
      const aLoud = st.A.isPlaying && (st.crossfader < 0.5 || !st.B.isPlaying);
      const from: DeckSide = aLoud ? "A" : "B";
      const to: DeckSide = from === "A" ? "B" : "A";
      const next = pickNextTrack(st);
      if (!next) { cd = st.autoTimerSec; useTwinDeck.setState({ autoTimerCountdown: cd }); return; }
      // Load incoming deck and run transition
      void (async () => {
        try {
          await useTwinDeck.getState().loadDeck(to, next);
          // Wait a tick for analysis to start; force-ensure analyzed before mix
          await useTwinDeck.getState().ensureAnalysis(to).catch(() => {});
          recentlyPlayedIds.push(next.id);
          if (recentlyPlayedIds.length > 16) recentlyPlayedIds.shift();
          await useTwinDeck.getState().transition(from, to);
        } finally {
          useTwinDeck.setState({ autoTimerCountdown: useTwinDeck.getState().autoTimerSec });
        }
      })();
      cd = st.autoTimerSec; // reset for display until transition completes
    }
    useTwinDeck.setState({ autoTimerCountdown: cd });
  }, 1000);
}
function stopAutoTimer() {
  if (autoTimerInterval != null) { clearInterval(autoTimerInterval); autoTimerInterval = null; }
}

// ---- Persist analysis to DB (best-effort) ----
async function persistAnalysis(trackId: string, a: import("./analyze").TrackAnalysis) {
  try {
    await supabase.from("tracks").update({
      bpm: a.bpm,
      music_key: a.musicalKey,
      beat_grid: a.beatGrid,
      energy_curve: a.energyCurve,
      cues: a.cues,
      vocal_map: a.vocalMap,
      analyzed_at: new Date().toISOString(),
    }).eq("id", trackId);
  } catch {
    /* offline / row not owned; ignore */
  }
}

function pickActualMode(hint: TransitionModeHint, from: EngineTrack | null, to: EngineTrack | null, posSec: number): { mode: TransitionMode; crossfadeSec: number; note: string; startAtSecOfNext: number; bpmRatio: number } {
  const plan = planMix(
    { bpm: from?.bpm, camelot: from?.camelot, beatGrid: from?.beatGrid, cues: from?.cues, durationSec: from?.durationSec, energy: from?.energy },
    { bpm: to?.bpm, camelot: to?.camelot, beatGrid: to?.beatGrid, cues: to?.cues, durationSec: to?.durationSec, energy: to?.energy },
    posSec,
    { forceMode: hint },
  );
  return { mode: plan.mode, crossfadeSec: plan.crossfadeSec, note: plan.notes, startAtSecOfNext: plan.startAtSecOfNext, bpmRatio: plan.bpmRatio };
}

async function runTransition(from: DeckSide, to: DeckSide, hint: TransitionModeHint) {
  ensureCtx(); wireDeck("A"); wireDeck("B");
  if (!ctx) return;
  const state = useTwinDeck.getState();
  const fromTrack = state[from].track;
  const toTrack = state[to].track;
  if (!fromTrack || !toTrack) return;
  if (state.transitionInFlight) return;
  useTwinDeck.setState({ transitionInFlight: true });
  try {
    const plan = pickActualMode(hint, fromTrack, toTrack, state[from].position);
    const xf = Math.max(1.5, Math.min(16, plan.crossfadeSec || 6));
    const fromDeck = deck[from];
    const toDeck = deck[to];
    const fromUserVol = state[from].volume;
    const toUserVol = state[to].volume;

    // Position incoming deck near its intro-end if available, then start it.
    try { if (toDeck.el && plan.startAtSecOfNext > 0.5) toDeck.el.currentTime = Math.max(0, plan.startAtSecOfNext); } catch { /* noop */ }
    if (toDeck.el && toDeck.el.paused) {
      try { await toDeck.el.play(); } catch { /* user gesture needed */ }
    }
    if (ctx.state === "suspended") void ctx.resume();

    // Effect choreography per mode, modulating filter + gain per deck.
    const mode = plan.mode;
    switch (mode) {
      case "filterSweep":
        rampFreq(fromDeck.filter, 180, xf);
        rampGain(fromDeck.gain, 0, xf);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
      case "reverbWash":
      case "echoTail":
        rampFreq(fromDeck.filter, 280, xf);
        rampGain(fromDeck.gain, 0, xf * 0.85);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
      case "loopRoll":
        if (fromDeck.filter) fromDeck.filter.type = "highpass";
        rampFreq(fromDeck.filter, 1200, xf);
        rampGain(fromDeck.gain, 0, xf);
        rampGain(toDeck.gain, toUserVol, Math.min(2, xf * 0.5));
        break;
      case "doubleDrop":
        rampGain(toDeck.gain, toUserVol, 0.25);
        await new Promise((r) => setTimeout(r, Math.max(800, xf * 500)));
        rampGain(fromDeck.gain, 0, xf * 0.5);
        break;
      case "bassSwap":
        if (fromDeck.filter) fromDeck.filter.type = "highpass";
        rampFreq(fromDeck.filter, 220, xf * 0.5);
        rampGain(toDeck.gain, toUserVol, xf * 0.5);
        await new Promise((r) => setTimeout(r, xf * 500));
        rampGain(fromDeck.gain, 0, xf * 0.5);
        break;
      case "cut":
        rampGain(fromDeck.gain, 0, 0.05);
        rampGain(toDeck.gain, toUserVol, 0.05);
        break;
      case "fadeGap":
        rampGain(fromDeck.gain, 0, xf * 0.5);
        await new Promise((r) => setTimeout(r, xf * 500 + 400));
        rampGain(toDeck.gain, toUserVol, xf * 0.5);
        break;
      case "stinger":
      case "crossfade":
      default:
        rampGain(fromDeck.gain, 0, xf);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
    }
    // Animate the visible crossfader to its target (A:0, B:1)
    animateCrossfader(to === "B" ? 1 : 0, Math.max(800, xf * 1000));
    await new Promise((r) => setTimeout(r, Math.max(900, xf * 1000) + 100));

    // Clean up: stop the now-silent from-deck, reset filter.
    try { fromDeck.el?.pause(); } catch { /* noop */ }
    resetFilter(from);
    if (fromDeck.gain) fromDeck.gain.gain.value = fromUserVol * (to === "B" ? Math.cos((1 * Math.PI) / 2) : Math.cos(0));

    useTwinDeck.setState({
      lastTransitionNote: `${plan.note} · ${xf.toFixed(1)}s`,
      transitionInFlight: false,
    });
  } catch (e) {
    console.warn("transition failed", e);
    useTwinDeck.setState({ transitionInFlight: false });
  }
}

export const useTwinDeck = create<BusState & Actions>((set, get) => ({
  A: emptyDeck(),
  B: emptyDeck(),
  crossfader: 0,
  master: 1,
  transitionMode: "auto",
  transitionInFlight: false,
  lastTransitionNote: null,
  autoTimerOn: false,
  autoTimerSec: 90,
  autoTimerCountdown: 90,
  autoShuffle: true,
  pool: [],
  needsUserGesture: false,
  recording: false,
  lastRecordingUrl: null,

  init() {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    applyCrossfader(get());
  },

  async loadDeck(side, track) {
    ensureCtx(); wireDeck(side);
    const d = deck[side];
    if (!d.el) return;
    // Fill in camelot if missing (cheap derivation)
    const enriched: EngineTrack = {
      ...track,
      camelot: track.camelot ?? keyToCamelot(track.musicalKey ?? null),
    };
    d.el.src = enriched.url;
    d.el.playbackRate = get()[side].pitch;
    set((s) => ({ [side]: { ...s[side], track: enriched, position: 0, duration: enriched.durationSec ?? 0, isPlaying: false } } as Partial<BusState>));
    applyCrossfader(get());
    // Lazy analysis if metadata missing
    if (!enriched.beatGrid || !enriched.bpm || !enriched.cues) {
      void get().ensureAnalysis(side);
    }
  },

  async toggle(side) {
    ensureCtx();
    const d = deck[side];
    if (!d.el || !d.el.src) return;
    if (ctx?.state === "suspended") {
      try { await ctx.resume(); } catch { /* noop */ }
    }
    if (d.el.paused) {
      try { await d.el.play(); set({ needsUserGesture: false }); }
      catch { set({ needsUserGesture: true }); }
    } else {
      d.el.pause();
    }
  },

  seek(side, sec) {
    const d = deck[side];
    if (d.el) d.el.currentTime = Math.max(0, sec);
  },
  scrub(side, delta) {
    const d = deck[side];
    if (!d.el) return;
    d.el.currentTime = Math.max(0, Math.min(d.el.duration || 0, d.el.currentTime + delta));
  },
  setVolume(side, v) {
    set((s) => ({ [side]: { ...s[side], volume: v } } as Partial<BusState>));
    applyCrossfader(get());
  },
  setPitch(side, p) {
    set((s) => ({ [side]: { ...s[side], pitch: p } } as Partial<BusState>));
    const d = deck[side];
    if (d.el) d.el.playbackRate = p;
  },
  setCrossfader(v) {
    set({ crossfader: v });
    applyCrossfader(get());
  },
  setMaster(v) {
    set({ master: v });
    if (masterGain) masterGain.gain.value = v;
  },
  setTransitionMode(m) { set({ transitionMode: m }); },

  sync(from, to) {
    const sf = get()[from].track;
    const st = get()[to].track;
    if (!sf?.bpm || !st?.bpm) return;
    const ratio = Math.max(0.85, Math.min(1.15, sf.bpm / st.bpm));
    get().setPitch(to, ratio);
  },

  async transition(from, to, opts) {
    const hint = opts?.mode ?? get().transitionMode;
    await runTransition(from, to, hint);
  },

  setPool(tracks) { set({ pool: tracks }); poolCursor = 0; },
  setAutoShuffle(v) { set({ autoShuffle: v }); },
  setAutoTimerSec(s) { set({ autoTimerSec: s, autoTimerCountdown: s }); },
  setAutoTimerOn(on) {
    set({ autoTimerOn: on, autoTimerCountdown: get().autoTimerSec });
    if (on) startAutoTimer(); else stopAutoTimer();
  },

  async startAutoDj() {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    if (ctx?.state === "suspended") { try { await ctx.resume(); } catch { /* noop */ } }
    const st = get();
    const pool = st.pool;
    if (pool.length < 2) {
      set({ needsUserGesture: false });
      return;
    }
    // Pick deck to start
    const aHas = !!st.A.track;
    const bHas = !!st.B.track;
    let firstSide: DeckSide = "A";
    if (!aHas && !bHas) {
      const t0 = pool[0];
      await get().loadDeck("A", t0);
      recentlyPlayedIds.push(t0.id);
      firstSide = "A";
    } else if (aHas) {
      firstSide = "A";
    } else {
      firstSide = "B";
    }
    // Pre-load B (or A) with next candidate
    const otherSide: DeckSide = firstSide === "A" ? "B" : "A";
    if (!get()[otherSide].track) {
      const next = pickNextTrack(get());
      if (next) {
        await get().loadDeck(otherSide, next);
        recentlyPlayedIds.push(next.id);
      }
    }
    // Snap crossfader to firstSide and play it
    set({ crossfader: firstSide === "A" ? 0 : 1 });
    applyCrossfader(get());
    if (!get()[firstSide].isPlaying) {
      try { await get().toggle(firstSide); } catch { /* noop */ }
    }
    // Kick off analysis in background for both
    void get().ensureAnalysis("A");
    void get().ensureAnalysis("B");
    // Arm the auto-timer
    set({ autoTimerOn: true, autoTimerCountdown: get().autoTimerSec });
    startAutoTimer();
  },

  stopAutoDj() {
    set({ autoTimerOn: false });
    stopAutoTimer();
  },

  async startRecording() {
    ensureCtx();
    if (!ctx || !masterGain) return;
    if (mediaRecorder) return;
    try {
      recorderStream = ctx.createMediaStreamDestination();
      masterGain.connect(recorderStream);
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      mediaRecorder = new MediaRecorder(recorderStream.stream, { mimeType: mime });
      recordedChunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.start(1000);
      set({ recording: true });
    } catch (e) {
      console.warn("recorder start failed", e);
    }
  },

  async stopRecording() {
    if (!mediaRecorder) return null;
    return new Promise<Blob | null>((resolve) => {
      mediaRecorder!.onstop = () => {
        try {
          const blob = new Blob(recordedChunks, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);
          set({ recording: false, lastRecordingUrl: url });
          if (recorderStream && masterGain) {
            try { masterGain.disconnect(recorderStream); } catch { /* noop */ }
          }
          recorderStream = null;
          mediaRecorder = null;
          recordedChunks = [];
          resolve(blob);
        } catch {
          resolve(null);
        }
      };
      mediaRecorder!.stop();
    });
  },

  async ensureAnalysis(side, opts) {
    const st = get();
    const t = st[side].track;
    if (!t?.url) return;
    if (!opts?.force && t.beatGrid && t.bpm && t.cues) return;
    set((s) => ({ [side]: { ...s[side], analyzing: true, analyzeProgress: 0 } } as Partial<BusState>));
    try {
      const res = await fetch(t.url);
      const ab = await res.arrayBuffer();
      const buf = await decodeToBuffer(ab);
      const a = await analyzeAudio(buf, (_lbl, pct) => {
        set((s) => ({ [side]: { ...s[side], analyzeProgress: pct } } as Partial<BusState>));
      });
      const camelot = a.camelot ?? keyToCamelot(a.musicalKey);
      const enriched: EngineTrack = {
        ...t,
        bpm: a.bpm,
        musicalKey: a.musicalKey,
        camelot,
        beatGrid: a.beatGrid,
        cues: a.cues,
        vocalMap: a.vocalMap,
      };
      set((s) => ({ [side]: { ...s[side], track: enriched, analyzing: false, analyzeProgress: 100 } } as Partial<BusState>));
      // Persist to DB (best-effort)
      void persistAnalysis(t.id, a);
    } catch (e) {
      console.warn("analyze failed", e);
      set((s) => ({ [side]: { ...s[side], analyzing: false } } as Partial<BusState>));
    }
  },

  dispose() {
    stopAutoTimer();
    if (rafId) cancelAnimationFrame(rafId);
  },
}));

/** Compatibility helper: highlight whether decks are key/BPM compatible. */
export function compatHint(a: EngineTrack | null, b: EngineTrack | null): {
  keyOk: boolean; bpmOk: boolean; bpmDelta: number | null;
} {
  if (!a || !b) return { keyOk: false, bpmOk: false, bpmDelta: null };
  const keyOk = camelotCompatible(a.camelot ?? "", b.camelot ?? "");
  const delta = (a.bpm && b.bpm) ? +(Math.abs(a.bpm - b.bpm)).toFixed(1) : null;
  const bpmOk = delta != null ? (a.bpm! > 0 && delta / a.bpm! <= 0.08) : false;
  return { keyOk, bpmOk, bpmDelta: delta };
}

/** Suppress unused warning: re-export for convenience. */
export type { TransitionModeHint };
