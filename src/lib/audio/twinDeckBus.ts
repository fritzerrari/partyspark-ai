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
import { shiftKey, semitoneShiftToKey } from "./keyDelta";
import { buildBridge, type BridgePlan } from "./bridgeBuilder";
import { mutualTempoRamp, playPedalDrone, commonTonePivot } from "./harmonicSync";
import { createStemSplit, type StemSplit, type StemId } from "./stemSplit";
import { runRecipe, pickRecipe, RECIPES, type RecipeId } from "./transitionRecipes";
import {
  runCleanRecipe, pickCleanRecipe, CLEAN_RECIPES,
  type CleanRecipeId, type TransitionPhase,
} from "./cleanDjTransitions";
import { loadRealStems, createRealStemPlayer, type RealStemPlayer, type RealStemUrls } from "./realStemPlayer";
import { scoreTransition, type TransitionQuality } from "./transitionQuality";
import { createStemMeter, type StemMeter } from "./stemMeter";
import { createLiveStretch, type LiveStretchNode } from "./liveStretch";
import { supabase } from "@/integrations/supabase/client";
import type { TransitionPlan, TransitionEvent } from "@/lib/intel/types";
import { planTransition } from "@/lib/intel/planner";
import { trackProfileFromEngine } from "@/lib/intel/fromEngineTrack";

export type DeckSide = "A" | "B";

/** Compact summary of the most recently executed transition plan (UI HUD). */
export type LastPlanInfo = {
  type: import("@/lib/intel/types").TransitionType;
  bars: number;
  score: number;
  durationSec: number;
  from: DeckSide;
  to: DeckSide;
  fallbackUsed: boolean;
  at: number;
};

/** Public DJ bus accessor (filter + 3-band EQ + gain) for transition engines. */
export type DjBus = {
  filter: BiquadFilterNode | null;
  eqLow: BiquadFilterNode | null;
  eqMid: BiquadFilterNode | null;
  eqHigh: BiquadFilterNode | null;
  gain: GainNode | null;
};

export type DeckState = {
  track: EngineTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  pitch: number;     // 0.85..1.15
  volume: number;    // user vol 0..1
  analyzing: boolean;
  analyzeProgress: number; // 0..100
  /** Perceived BPM accounting for the current playback rate (pitch). */
  effectiveBpm: number | null;
  /** Effective musical key after pitch-shift (semitones rounded). */
  effectiveKey: string | null;
  /** Semitones of effective key shift vs native (0 = unchanged). */
  keyShiftSemis: number;
  /** Bridge snippet readiness for transitioning INTO this deck. */
  bridgeReady: boolean;
  bridgeBuilding: boolean;
  bridgeNotes: string | null;
  /** Real Demucs stems status for this deck's current track. */
  stemsMode: "pseudo" | "loading" | "real";
};

type BusState = {
  A: DeckState;
  B: DeckState;
  crossfader: number; // 0..1 (0=A only, 1=B only)
  master: number;
  transitionMode: TransitionModeHint;
  transitionInFlight: boolean;
  lastTransitionNote: string | null;
  /** Live phase of an in-flight transition, for UI status. */
  transitionPhase: TransitionPhase | null;
  /** Which engine is running ("real" or "clean") or null when idle. */
  transitionEngine: "real" | "clean" | null;
  autoTimerOn: boolean;
  autoTimerSec: number;       // interval
  autoTimerCountdown: number; // seconds until next
  autoShuffle: boolean;
  pool: EngineTrack[];        // track pool for timer auto-DJ
  needsUserGesture: boolean;
  recording: boolean;
  lastRecordingUrl: string | null;
  /** Summary of the last executed AI transition plan (for UI HUD). */
  lastPlan: LastPlanInfo | null;
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
  /** Pre-render a bridge snippet for `side` locked to the OTHER deck's key+BPM. */
  buildBridgeFor: (side: DeckSide) => Promise<void>;
  /** Manual stem ride: set a single pseudo-stem on a deck (0..1.5). */
  setStem: (side: DeckSide, stem: StemId, value: number, sec?: number) => void;
  /** Reset a deck's stem split to neutral (all = 1). */
  resetStems: (side: DeckSide) => void;
  /** Run a stem-based transition recipe between two decks. */
  runStemRecipe: (from: DeckSide, to: DeckSide, id?: RecipeId, opts?: { bars?: number; teaserStem?: StemId; aggression?: "smooth" | "performance" | "emergency" }) => Promise<void>;
  /** Snapshot of current stem-gains for the UI. */
  getStemGains: (side: DeckSide) => Record<StemId, number>;
  /** Live RMS levels per stem (0..1) — for VU meters. */
  getStemLevels: (side: DeckSide) => Record<StemId, number>;
  /** Pure scorer for the pending transition between two decks. */
  getTransitionQuality: (from: DeckSide, to: DeckSide) => TransitionQuality;
  /** Moises-style Smart Mix: pick best recipe + run it with conflict mute. */
  smartMix: (from: DeckSide, to: DeckSide) => Promise<{ engine: "real" | "clean"; recipe: string } | null>;
  /** Run a Clean DJ EQ-based transition (no fake stems). */
  runCleanRecipe: (from: DeckSide, to: DeckSide, id?: CleanRecipeId, opts?: { bars?: number }) => Promise<void>;
  /** Attach real Demucs stems (4 buffers) to a deck. */
  attachRealStems: (side: DeckSide, urls: RealStemUrls) => Promise<void>;
  /** Drop back to pseudo-stems on a deck. */
  detachRealStems: (side: DeckSide) => void;
  /** Execute a deterministic transition plan (AI Music Intelligence). */
  executePlan: (plan: TransitionPlan) => Promise<void>;
  /** Build a transition plan via the planner and execute it. */
  smartMixPlan: (from: DeckSide, to: DeckSide, opts?: { force?: import("@/lib/intel/types").TransitionType; bars?: number }) => Promise<TransitionPlan | null>;
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
  analyser: AnalyserNode | null;
  stems: StemSplit | null;
  realStems: RealStemPlayer | null;
  stemMeter: StemMeter | null;
  /** Pitch-preserving live time-stretch node (SoundTouch worklet). */
  stretch: LiveStretchNode | null;
  /** Bypass node used while the async stretch node is being built. */
  stretchPlaceholder: GainNode | null;
} > = {
  A: { el: null, src: null, filter: null, gain: null, eqLow: null, eqMid: null, eqHigh: null, analyser: null, stems: null, realStems: null, stemMeter: null, stretch: null, stretchPlaceholder: null },
  B: { el: null, src: null, filter: null, gain: null, eqLow: null, eqMid: null, eqHigh: null, analyser: null, stems: null, realStems: null, stemMeter: null, stretch: null, stretchPlaceholder: null },
};
let masterGain: GainNode | null = null;
let rafId: number | null = null;
let activeDroneStop: (() => void) | null = null;
// Bridge playback graph: a one-shot BufferSource → filter → gain → master.
let bridgeGain: GainNode | null = null;
let bridgeFilter: BiquadFilterNode | null = null;
let bridgeSource: AudioBufferSourceNode | null = null;
const bridgeBuffers: Record<DeckSide, BridgePlan | null> = { A: null, B: null };

function emptyDeck(): DeckState {
  return {
    track: null, isPlaying: false, position: 0, duration: 0, pitch: 1, volume: 0.9,
    analyzing: false, analyzeProgress: 0,
    effectiveBpm: null, effectiveKey: null, keyShiftSemis: 0,
    bridgeReady: false, bridgeBuilding: false, bridgeNotes: null,
    stemsMode: "pseudo",
  };
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
    // Bridge bus
    bridgeGain = ctx.createGain();
    bridgeGain.gain.value = 0;
    bridgeFilter = ctx.createBiquadFilter();
    bridgeFilter.type = "highpass";
    // Transparent by default — only the genre-bridge flow lifts this to >100 Hz.
    bridgeFilter.frequency.value = 20;
    bridgeFilter.Q.value = 0.7;
    bridgeFilter.connect(bridgeGain);
    bridgeGain.connect(masterGain);
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
      d.analyser = ctx.createAnalyser();
      d.analyser.fftSize = 512;
      d.analyser.smoothingTimeConstant = 0.6;
      // Insert pseudo-stem split between the filter chain and the final deck gain.
      d.stems = createStemSplit(ctx);
      // Insert a placeholder gain that we later swap to a SoundTouch worklet node
      // (pitch-preserving live time-stretch). Until the worklet is registered the
      // placeholder passes audio through unchanged.
      d.stretchPlaceholder = ctx.createGain();
      d.stretchPlaceholder.gain.value = 1;
      d.src.connect(d.eqLow);
      d.eqLow.connect(d.eqMid);
      d.eqMid.connect(d.eqHigh);
      d.eqHigh.connect(d.filter);
      d.filter.connect(d.stretchPlaceholder);
      d.stretchPlaceholder.connect(d.stems.input);
      d.stems.output.connect(d.gain);
      d.gain.connect(d.analyser);
      d.analyser.connect(masterGain);
      // Per-stem meters: tap an AnalyserNode off each stem gain node.
      d.stemMeter = createStemMeter(ctx, d.stems.gains);
      // Lazily attach SoundTouch worklet for pitch-preserving stretch. Once it
      // resolves, we splice it in front of the stem split and dispose the placeholder.
      void (async () => {
        const stretch = await createLiveStretch(ctx!);
        if (!stretch || !d.filter || !d.stems || !d.stretchPlaceholder) return;
        try {
          d.filter.disconnect(d.stretchPlaceholder);
          d.stretchPlaceholder.disconnect();
          d.filter.connect(stretch.node);
          stretch.node.connect(d.stems.input);
          d.stretch = stretch;
          d.stretchPlaceholder = null;
          // Apply the current playback rate so pitch is preserved from the start.
          const rate = d.el?.playbackRate ?? 1;
          stretch.setRate(rate);
        } catch (err) {
          console.warn("[twinDeckBus] could not splice stretch node", err);
        }
      })();
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

/** Set a deck's playback rate AND keep its pitch at the original key by
 *  driving the SoundTouch worklet at the same rate. Use this everywhere
 *  instead of writing `el.playbackRate` directly. */
function setDeckRate(side: DeckSide, rate: number) {
  const d = deck[side];
  const r = Math.max(0.5, Math.min(2, rate || 1));
  if (d.el) {
    try { d.el.playbackRate = r; } catch { /* noop */ }
  }
  if (d.stretch) d.stretch.setRate(r);
}

/** Sync incoming deck's playbackRate so its perceived BPM matches outgoing. */
function syncTempo(from: DeckSide, to: DeckSide): number {
  const st = useTwinDeck.getState();
  const fb = st[from].track?.bpm;
  const tb = st[to].track?.bpm;
  const fromRate = deck[from].el?.playbackRate ?? 1;
  if (!fb || !tb) return 1;
  const ratio = tempoRatio(fb * fromRate, tb);
  // Tight clamp: ±6 % is the comfortable range where time-stretch stays
  // transparent. Beyond that the picker should choose a non-blend transition
  // (echo-out, drop-cut) rather than mangle the audio.
  const clamped = Math.max(0.94, Math.min(1.06, ratio));
  setDeckRate(to, clamped);
  useTwinDeck.setState((s) => ({ [to]: { ...s[to], pitch: clamped } } as Partial<BusState>));
  recomputeEffective(to);
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

/** Recompute perceived BPM + key based on current playbackRate / pitch. */
function recomputeEffective(side: DeckSide) {
  const st = useTwinDeck.getState();
  const t = st[side].track;
  const rate = deck[side].el?.playbackRate ?? st[side].pitch ?? 1;
  const bpm = t?.bpm ? +(t.bpm * rate).toFixed(1) : null;
  // Pitch is multiplicative on playbackRate; convert to semitones for key shift.
  const semis = Math.round(12 * Math.log2(rate));
  const newKey = t?.musicalKey ? shiftKey(t.musicalKey, semis) : null;
  useTwinDeck.setState((s) => ({
    [side]: {
      ...s[side],
      effectiveBpm: bpm,
      effectiveKey: newKey,
      keyShiftSemis: semis,
    },
  } as Partial<BusState>));
}

function applyCrossfader(state: BusState) {
  if (!deck.A.gain || !deck.B.gain) return;
  // During an active transition the planner / recipe owns the deck gains via
  // AudioParam ramps. Writing .gain.value here cancels those scheduled ramps
  // and breaks the choreography — so we no-op while a transition is running.
  if (state.transitionInFlight) return;
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

/** Smoothly glide an HTMLMediaElement.playbackRate (no AudioParam available). */
const gliderTimers = new WeakMap<HTMLMediaElement, number>();
function glidePlaybackRate(el: HTMLMediaElement, target: number, durationMs: number) {
  const prev = gliderTimers.get(el);
  if (prev) cancelAnimationFrame(prev);
  const from = el.playbackRate || 1;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / Math.max(50, durationMs));
    // ease-in-out cubic for a musical bend
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const next = from + (target - from) * ease;
    try { el.playbackRate = next; } catch { /* noop */ }
    // Mirror the live rate into the pitch-preserving stretch node, if any.
    const side: DeckSide | null = deck.A.el === el ? "A" : deck.B.el === el ? "B" : null;
    if (side && deck[side].stretch) deck[side].stretch!.setRate(next);
    if (p < 1) gliderTimers.set(el, requestAnimationFrame(step));
    else gliderTimers.delete(el);
  };
  gliderTimers.set(el, requestAnimationFrame(step));
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

/** Public: peek what the next transition would do, for UI preview. */
export function peekNextPlan(): null | {
  mode: TransitionMode;
  crossfadeSec: number;
  note: string;
  midBpm: number | null;
  keyShiftSemis: number;
  from: DeckSide;
  to: DeckSide;
  triggerInSec: number | null;
} {
  const st = useTwinDeck.getState();
  const aLoud = st.A.isPlaying && (st.crossfader < 0.5 || !st.B.isPlaying);
  const from: DeckSide = aLoud ? "A" : st.B.isPlaying ? "B" : "A";
  const to: DeckSide = from === "A" ? "B" : "A";
  const fromTrack = st[from].track;
  const toTrack = st[to].track;
  if (!fromTrack || !toTrack) return null;
  const plan = pickActualMode(st.transitionMode, fromTrack, toTrack, st[from].position);
  const midBpm = fromTrack.bpm && toTrack.bpm ? +(Math.sqrt(fromTrack.bpm * toTrack.bpm)).toFixed(1) : null;
  // semitones outgoing → incoming using existing helper math (inverse)
  const semi = (() => {
    const a = fromTrack.musicalKey ?? null;
    const b = toTrack.musicalKey ?? null;
    if (!a || !b) return 0;
    // Reuse helper imported in this file via keyDelta.
    return semitoneShiftToKey(a, b);
  })();
  const triggerInSec = st.autoTimerOn ? st.autoTimerCountdown : null;
  return { mode: plan.mode, crossfadeSec: plan.crossfadeSec, note: plan.note, midBpm, keyShiftSemis: semi, from, to, triggerInSec };
}

/** Public: access deck signals for scorers + visualizers. */
export function getDeckSignal(side: DeckSide) {
  const d = deck[side];
  const st = useTwinDeck.getState();
  const ds = st[side];
  return {
    analyser: d.analyser,
    bpm: ds.track?.bpm ?? null,
    effectiveBpm: ds.effectiveBpm,
    effectiveKey: ds.effectiveKey,
    camelot: ds.track?.camelot ?? null,
    beatGrid: ds.track?.beatGrid ?? null,
    currentTime: d.el?.currentTime ?? 0,
    playing: ds.isPlaying,
    volume: (d.gain?.gain.value ?? 0),
  };
}

/** Public: get a shared analyser node on the master bus for room-wide visualization. */
let masterAnalyser: AnalyserNode | null = null;
export function getMasterAnalyser(): AnalyserNode | null {
  ensureCtx();
  if (!ctx || !masterGain) return null;
  if (!masterAnalyser) {
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 1024;
    masterAnalyser.smoothingTimeConstant = 0.78;
    // Tap off master without affecting output
    masterGain.connect(masterAnalyser);
  }
  return masterAnalyser;
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

    // 1) Position incoming near its intro-end (drop point) if available.
    try { if (toDeck.el && plan.startAtSecOfNext > 0.5) toDeck.el.currentTime = Math.max(0, plan.startAtSecOfNext); } catch { /* noop */ }
    // 2) BPM-SYNC: match incoming playbackRate to outgoing perceived tempo (with half/double detection).
    const appliedRatio = syncTempo(from, to);
    // 3) Beat-align: snap incoming so its next downbeat hits outgoing's next downbeat.
    beatAlign(from, to);
    // 4) Start incoming silently before crossfade so EQ ramps have audio to act on.
    if (toDeck.gain) toDeck.gain.gain.value = 0;
    if (toDeck.el && toDeck.el.paused) {
      try { await toDeck.el.play(); } catch { /* user gesture needed */ }
    }
    if (ctx.state === "suspended") void ctx.resume();
    // 5) Wait until the aligned beat actually hits, then start the choreography.
    await waitForNextBeat(from);

    // Effect choreography per mode — uses 3-band EQ + filter + gain.
    const mode = plan.mode;

    // -------- GENRE-BRIDGE: a separate flow (uses pre-rendered snippet) --------
    // pitchLock reuses the bridge pipeline (pre-rendered, tempo + key locked).
    if ((mode === "genreBridge" || mode === "pitchLock") && bridgeFilter && bridgeGain) {
      // Ensure bridge is ready (build on demand if needed).
      if (!bridgeBuffers[to]) {
        try { await useTwinDeck.getState().buildBridgeFor(to); } catch { /* noop */ }
      }
      if (!bridgeBuffers[to]) {
        // No bridge possible → fall through to a crossfade.
      } else {
      const bridge = bridgeBuffers[to]!;
      // Reset the standard pre-prime EQ — bridge handles its own taper.
      rampEqGain(toDeck.eqLow, -24, 0.05);
      // The bridge plays IN TEMPO + KEY of outgoing → listener stays in groove.
      const src = ctx.createBufferSource();
      src.buffer = bridge.buffer;
      src.connect(bridgeFilter);
      bridgeSource = src;
      // Start bridge highpassed (percussion only) and silent.
      bridgeFilter.frequency.cancelScheduledValues(ctx.currentTime);
      bridgeFilter.frequency.setValueAtTime(900, ctx.currentTime);
      bridgeGain.gain.cancelScheduledValues(ctx.currentTime);
      bridgeGain.gain.setValueAtTime(0, ctx.currentTime);
      const bridgeLen = Math.max(8, bridge.durationSec);
      const sneak = Math.min(bridgeLen * 0.45, 8);
      const reveal = Math.min(bridgeLen - sneak - 2, 12);
      src.start();
      // Phase A — sneak the bridge percussion in over the outgoing groove.
      bridgeGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + sneak);
      bridgeFilter.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + sneak + reveal);
      rampEqGain(fromDeck.eqHigh, -4, sneak);
      await new Promise((r) => setTimeout(r, sneak * 1000));
      // Phase B — open the bridge fully (full-band snippet sitting in groove).
      bridgeGain.gain.linearRampToValueAtTime(0.85, ctx.currentTime + reveal * 0.5);
      rampEqGain(fromDeck.eqHigh, -8, reveal * 0.6);
      rampEqGain(fromDeck.eqMid, -4, reveal * 0.6);
      await new Promise((r) => setTimeout(r, reveal * 1000));
      // Phase C — REVEAL: bridge fades, real incoming starts at its native tempo+key.
      if (toDeck.el) {
        setDeckRate(to, 1);
        useTwinDeck.setState((s) => ({ [to]: { ...s[to], pitch: 1 } } as Partial<BusState>));
        try { if (plan.startAtSecOfNext > 0.5) toDeck.el.currentTime = plan.startAtSecOfNext; } catch { /* noop */ }
        if (toDeck.el.paused) { try { await toDeck.el.play(); } catch { /* noop */ } }
      }
      if (toDeck.gain) toDeck.gain.gain.value = 0;
      rampEqGain(toDeck.eqLow, 0, 0.6);
      rampGain(toDeck.gain, toUserVol, 1.0);
      rampGain(fromDeck.gain, 0, 1.2);
      bridgeGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
      animateCrossfader(to === "B" ? 1 : 0, 1000);
      await new Promise((r) => setTimeout(r, 1400));
      try { src.stop(); } catch { /* noop */ }
      bridgeSource = null;
      try { fromDeck.el?.pause(); } catch { /* noop */ }
      resetFilter(from); resetEq(from); resetEq(to);
      recomputeEffective(to);
      useTwinDeck.setState({
        lastTransitionNote: `${plan.note} · ${bridge.notes}`,
        transitionInFlight: false,
      });
      return;
      }
    }
    // ------------------------------------------------------------------

    // Pre-prime EQ for incoming (bass-cut to slide in cleanly).
    rampEqGain(toDeck.eqLow, -24, 0.05);
    switch (mode) {
      case "meetMiddle": {
        // Mutual tempo ramp — both decks bend toward the geometric-mean BPM,
        // incoming finishes back at its native tempo. EQ-crossfade in parallel.
        const fBpm = fromTrack.bpm ?? 120;
        const tBpm = toTrack.bpm ?? fBpm;
        // kick off mutual ramp (don't await yet — it runs alongside EQ work)
        const ramp = mutualTempoRamp(fromDeck.el, toDeck.el, fBpm, tBpm, xf * 1000);
        rampEqGain(fromDeck.eqLow, -10, xf * 0.5);
        rampGain(fromDeck.gain, 0, xf);
        rampEqGain(toDeck.eqLow, 0, xf * 0.5);
        rampGain(toDeck.gain, toUserVol, xf);
        const r = await ramp;
        // restore outgoing rate (it's about to pause anyway)
        try { if (fromDeck.el) fromDeck.el.playbackRate = 1; } catch { /* noop */ }
        useTwinDeck.setState((s) => ({
          [to]: { ...s[to], pitch: 1 },
        } as Partial<BusState>));
        recomputeEffective(to);
        // Note enriched with midpoint info for the UI.
        plan.note = `${plan.note} · mid ≈ ${r.midBpm.toFixed(1)} BPM`;
        break;
      }
      case "pedalDrone": {
        // Sustain a common-tone pad to mask the key jump, with a slow xfade.
        if (ctx && masterGain) {
          const root = commonTonePivot(fromTrack.musicalKey ?? null, toTrack.musicalKey ?? null);
          const minor = (fromTrack.musicalKey ?? "").endsWith("m") || (toTrack.musicalKey ?? "").endsWith("m");
          try { activeDroneStop?.(); } catch { /* noop */ }
          activeDroneStop = playPedalDrone(ctx, masterGain, root, {
            peakGain: 0.16,
            attackSec: Math.min(2.5, xf * 0.25),
            sustainSec: Math.max(2, xf * 0.6),
            releaseSec: Math.min(3, xf * 0.4),
            minor,
          });
        }
        // Gentle EQ-swap underneath; high-end fades, lows swap on the beat.
        rampEqGain(fromDeck.eqHigh, -6, xf * 0.5);
        rampGain(fromDeck.gain, 0, xf);
        rampEqGain(toDeck.eqLow, 0, xf * 0.6);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
      }
      case "filterSweep":
        rampFreq(fromDeck.filter, 180, xf);
        rampEqGain(fromDeck.eqHigh, -12, xf * 0.7);
        rampGain(fromDeck.gain, 0, xf);
        rampEqGain(toDeck.eqLow, 0, xf * 0.5);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
      case "reverbWash":
      case "echoTail":
        rampFreq(fromDeck.filter, 280, xf);
        rampEqGain(fromDeck.eqHigh, -8, xf * 0.6);
        rampGain(fromDeck.gain, 0, xf * 0.85);
        rampEqGain(toDeck.eqLow, 0, xf * 0.5);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
      case "loopRoll":
        if (fromDeck.filter) fromDeck.filter.type = "highpass";
        rampFreq(fromDeck.filter, 1200, xf);
        rampEqGain(fromDeck.eqLow, -24, xf * 0.4);
        rampGain(fromDeck.gain, 0, xf);
        rampEqGain(toDeck.eqLow, 0, xf * 0.4);
        rampGain(toDeck.gain, toUserVol, Math.min(2, xf * 0.5));
        break;
      case "doubleDrop":
        // Both decks at full level on the drop, then bass-swap.
        rampGain(toDeck.gain, toUserVol, 0.25);
        rampEqGain(toDeck.eqLow, 0, 0.2);
        await new Promise((r) => setTimeout(r, Math.max(800, xf * 500)));
        rampEqGain(fromDeck.eqLow, -24, xf * 0.3);
        rampGain(fromDeck.gain, 0, xf * 0.5);
        break;
      case "bassSwap": {
        // Pro-style bass swap: lift incoming highs first, swap lows on the beat, then bleed lows out.
        const half = xf * 0.5;
        // Bring incoming up — highs/mids first, lows still cut.
        rampGain(toDeck.gain, toUserVol, half);
        rampEqGain(toDeck.eqHigh, 2, half);
        // Outgoing keeps lows for now.
        await new Promise((r) => setTimeout(r, half * 1000));
        // SWAP the basses on the beat.
        await waitForNextBeat(from);
        rampEqGain(fromDeck.eqLow, -28, 0.25);
        rampEqGain(toDeck.eqLow, 0, 0.25);
        // Now fade the outgoing out entirely.
        rampEqGain(fromDeck.eqHigh, -10, half);
        rampGain(fromDeck.gain, 0, half);
        break;
      }
      case "cut":
        rampGain(fromDeck.gain, 0, 0.05);
        rampEqGain(toDeck.eqLow, 0, 0.05);
        rampGain(toDeck.gain, toUserVol, 0.05);
        break;
      case "fadeGap":
        rampGain(fromDeck.gain, 0, xf * 0.5);
        await new Promise((r) => setTimeout(r, xf * 500 + 400));
        rampEqGain(toDeck.eqLow, 0, xf * 0.4);
        rampGain(toDeck.gain, toUserVol, xf * 0.5);
        break;
      case "stinger":
      case "crossfade":
      default:
        // Harmonic crossfade with subtle low-end isolation to avoid bass clash.
        rampEqGain(fromDeck.eqLow, -10, xf * 0.5);
        rampGain(fromDeck.gain, 0, xf);
        rampEqGain(toDeck.eqLow, 0, xf * 0.6);
        rampGain(toDeck.gain, toUserVol, xf);
        break;
    }
    // Animate the visible crossfader to its target (A:0, B:1)
    animateCrossfader(to === "B" ? 1 : 0, Math.max(800, xf * 1000));
    await new Promise((r) => setTimeout(r, Math.max(900, xf * 1000) + 100));

    // Clean up: stop the now-silent from-deck, reset filter.
    try { fromDeck.el?.pause(); } catch { /* noop */ }
    try { activeDroneStop?.(); activeDroneStop = null; } catch { /* noop */ }
    resetFilter(from);
    resetEq(from);
    resetEq(to);
    if (fromDeck.gain) fromDeck.gain.gain.value = fromUserVol * (to === "B" ? Math.cos((1 * Math.PI) / 2) : Math.cos(0));

    const ratioNote = appliedRatio !== 1 ? ` · sync ×${appliedRatio.toFixed(3)}` : "";
    useTwinDeck.setState({
      lastTransitionNote: `${plan.note} · ${xf.toFixed(1)}s${ratioNote}`,
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
  transitionPhase: null,
  transitionEngine: null,
  autoTimerOn: false,
  autoTimerSec: 90,
  autoTimerCountdown: 90,
  autoShuffle: true,
  pool: [],
  needsUserGesture: false,
  recording: false,
  lastRecordingUrl: null,
  lastPlan: null,

  init() {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    applyCrossfader(get());
  },

  async loadDeck(side, track) {
    ensureCtx(); wireDeck(side);
    const d = deck[side];
    if (!d.el) return;
    // Tear down any real-stem session from the previous track on this side
    // so the new track always starts in clean pseudo mode until its own
    // Demucs stems are loaded.
    if (d.realStems) {
      try { d.realStems.dispose(); } catch { /* noop */ }
      d.realStems = null;
      if (d.stems && ctx) {
        try {
          const inputGain = (d.stems.input as GainNode).gain;
          inputGain.cancelScheduledValues(ctx.currentTime);
          inputGain.setValueAtTime(1, ctx.currentTime);
        } catch { /* noop */ }
      }
      set((s) => ({ [side]: { ...s[side], stemsMode: "pseudo" } } as Partial<BusState>));
    }
    // Fill in camelot if missing (cheap derivation)
    const enriched: EngineTrack = {
      ...track,
      camelot: track.camelot ?? keyToCamelot(track.musicalKey ?? null),
    };
    d.el.src = enriched.url;
    d.el.playbackRate = get()[side].pitch;
    set((s) => ({ [side]: {
      ...s[side], track: enriched, position: 0, duration: enriched.durationSec ?? 0,
      isPlaying: false, bridgeReady: false, bridgeNotes: null,
    } } as Partial<BusState>));
    bridgeBuffers[side] = null;
    applyCrossfader(get());
    recomputeEffective(side);
    // Lazy analysis if metadata missing
    if (!enriched.beatGrid || !enriched.bpm || !enriched.cues) {
      await get().ensureAnalysis(side).catch(() => {});
    }
    // If the other deck is playing, pre-sync this deck's tempo so it's already beat-matched.
    const other: DeckSide = side === "A" ? "B" : "A";
    if (get()[other].isPlaying && get()[other].track?.bpm && get()[side].track?.bpm) {
      syncTempo(other, side);
    }
    // Pre-build the bridge snippet so cross-genre transitions are ready instantly.
    if (get()[other].track?.bpm) {
      void get().buildBridgeFor(side).catch(() => {});
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
    recomputeEffective(side);
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
    // UNIFIED: all manual transition triggers route through Smart Mix so the
    // upper deck buttons and the StemMixer use the SAME engine. The legacy
    // `runTransition()` path stays in the codebase for the genre-bridge /
    // pitch-lock flows that pre-render a bridge snippet, but is only used
    // when the user explicitly forces a non-auto mode.
    const hint = opts?.mode ?? get().transitionMode;
    if (hint && hint !== "auto" && hint !== "random") {
      await runTransition(from, to, hint);
      return;
    }
    await get().smartMix(from, to);
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

  async buildBridgeFor(side) {
    const other: DeckSide = side === "A" ? "B" : "A";
    const st = get();
    const t = st[side].track;
    const o = st[other].track;
    if (!ctx) { ensureCtx(); }
    if (!ctx || !t || !o?.bpm) return;
    if (st[side].bridgeBuilding) return;
    set((s) => ({ [side]: { ...s[side], bridgeBuilding: true, bridgeReady: false } } as Partial<BusState>));
    try {
      const plan = await buildBridge(ctx, t, { bpm: o.bpm, musicalKey: o.musicalKey ?? null });
      bridgeBuffers[side] = plan;
      set((s) => ({ [side]: { ...s[side], bridgeBuilding: false, bridgeReady: !!plan, bridgeNotes: plan?.notes ?? null } } as Partial<BusState>));
    } catch (e) {
      console.warn("buildBridgeFor failed", e);
      set((s) => ({ [side]: { ...s[side], bridgeBuilding: false, bridgeReady: false } } as Partial<BusState>));
    }
  },

  setStem(side, stem, value, sec = 0.05) {
    ensureCtx(); wireDeck(side);
    // Pseudo-stems are additive band-filters layered on the dry signal —
    // moving them while a real stem player isn't attached colours the full
    // mix instead of isolating a stem. Refuse the write unless real stems
    // are active, so manual sliders can't quietly destroy the audio.
    const st = get();
    if (st[side].stemsMode !== "real") return;
    deck[side].stems?.setGain(stem, value, sec);
  },
  resetStems(side) {
    deck[side].stems?.reset();
  },
  getStemGains(side) {
    const s = deck[side].stems;
    if (!s) return { drums: 1, bass: 1, vocals: 1, other: 1 };
    return {
      drums: s.gains.drums.gain.value,
      bass: s.gains.bass.gain.value,
      vocals: s.gains.vocals.gain.value,
      other: s.gains.other.gain.value,
    };
  },
  getStemLevels(side) {
    const m = deck[side].stemMeter;
    if (!m) return { drums: 0, bass: 0, vocals: 0, other: 0 };
    return m.getLevels();
  },
  getTransitionQuality(from, to) {
    const st = get();
    return scoreTransition({
      fromTrack: st[from].track,
      toTrack: st[to].track,
      fromRate: deck[from].el?.playbackRate ?? st[from].pitch ?? 1,
      toRate: deck[to].el?.playbackRate ?? st[to].pitch ?? 1,
      fromMode: st[from].stemsMode,
      toMode: st[to].stemsMode,
    });
  },
  async smartMix(from, to) {
    // Ensure both decks have analysis (BPM, beatgrid, cues, key) before we
    // even score the transition — otherwise smart-mix flies blind.
    const stPre = get();
    if (!stPre[from].track?.beatGrid || !stPre[from].track?.bpm) {
      await get().ensureAnalysis(from).catch(() => {});
    }
    if (!stPre[to].track?.beatGrid || !stPre[to].track?.bpm) {
      await get().ensureAnalysis(to).catch(() => {});
    }
    // Position incoming deck at its drop/intro-end if we have a cue and the
    // deck is currently parked at 0 — so we don't blend into a silent intro.
    const toEl = deck[to].el;
    const toCues = get()[to].track?.cues;
    if (toEl && toCues && toEl.currentTime < 0.5) {
      try { toEl.currentTime = Math.max(0, toCues.introEnd || toCues.firstDrop || 0); } catch { /* noop */ }
    }
    const q = get().getTransitionQuality(from, to);
    // Only the Real-Stem engine should touch the stem buses; otherwise the
    // pseudo-band split would destroy the original audio. Anything that
    // isn't fully "real" routes to the Clean DJ engine, which rides
    // EQ/filter/gain on the dry deck signal.
    if (q.mode === "real") {
      await get().runStemRecipe(from, to, q.recommendedRecipe, {
        bars: q.bars,
        teaserStem: q.teaserStem,
        aggression: q.aggression,
      });
      return { engine: "real", recipe: q.recommendedRecipe };
    }
    const cleanId = pickCleanRecipe({
      bpmDeltaPct: q.bpmDeltaPct,
      keyCompatible: q.keyCompatible,
      fromHasVocals: (get()[from].track?.vocalMap?.some((v) => v.voiced > 0.6)) ?? false,
      toHasVocals: (get()[to].track?.vocalMap?.some((v) => v.voiced > 0.6)) ?? false,
      energyJump: (get()[to].track?.energy ?? 0.5) - (get()[from].track?.energy ?? 0.5),
    });
    await get().runCleanRecipe(from, to, cleanId, { bars: q.bars });
    return { engine: "clean", recipe: cleanId };
  },
  async runCleanRecipe(from, to, id, opts) {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    if (!ctx) return;
    const st = get();
    const fromTrack = st[from].track;
    const toTrack = st[to].track;
    if (!fromTrack || !toTrack) return;
    if (st.transitionInFlight) return;
    const fromDeck = deck[from];
    const toDeck = deck[to];
    if (!fromDeck.gain || !toDeck.gain) return;
    set({ transitionInFlight: true, transitionEngine: "clean", transitionPhase: "cue" });
    try {
      const toUserVol = st[to].volume;
      const fromUserVol = st[from].volume;
      // Make sure pseudo-stem overlays are silent so they don't colour the dry
      // signal during the transition.
      fromDeck.stems?.reset();
      toDeck.stems?.reset();
      // Start incoming silently.
      if (toDeck.el && toDeck.el.paused) {
        try { await toDeck.el.play(); } catch { /* gesture */ }
      }
      if (ctx.state === "suspended") void ctx.resume();
      const ratio = syncTempo(from, to);
      beatAlign(from, to);
      // Open outgoing to its user volume, incoming starts at 0.
      toDeck.gain.gain.cancelScheduledValues(ctx.currentTime);
      toDeck.gain.gain.setValueAtTime(0, ctx.currentTime);
      fromDeck.gain.gain.cancelScheduledValues(ctx.currentTime);
      fromDeck.gain.gain.setValueAtTime(fromUserVol, ctx.currentTime);
      await waitForNextBeat(from);
      const secPerBar = fromTrack.bpm ? (60 / fromTrack.bpm) * 4 : 2;
      const bars = Math.max(8, Math.min(24, opts?.bars ?? 16));
      const recipeId: CleanRecipeId = id ?? pickCleanRecipe({
        bpmDeltaPct: fromTrack.bpm && toTrack.bpm ? Math.abs(fromTrack.bpm - toTrack.bpm) / fromTrack.bpm : 0,
        keyCompatible: camelotCompatible(fromTrack.camelot ?? "", toTrack.camelot ?? ""),
        fromHasVocals: (fromTrack.vocalMap?.some((v) => v.voiced > 0.6)) ?? false,
        toHasVocals: (toTrack.vocalMap?.some((v) => v.voiced > 0.6)) ?? false,
        energyJump: (toTrack.energy ?? 0.5) - (fromTrack.energy ?? 0.5),
      });
      animateCrossfader(to === "B" ? 1 : 0, secPerBar * bars * 1000);
      await runCleanRecipe(recipeId, {
        ctx,
        from: {
          filter: fromDeck.filter, eqLow: fromDeck.eqLow, eqMid: fromDeck.eqMid,
          eqHigh: fromDeck.eqHigh, gain: fromDeck.gain,
        },
        to: {
          filter: toDeck.filter, eqLow: toDeck.eqLow, eqMid: toDeck.eqMid,
          eqHigh: toDeck.eqHigh, gain: toDeck.gain,
        },
        secPerBar, bars, fromUserVol, toUserVol,
        waitForBeat: () => waitForNextBeat(from),
        onPhase: (phase) => set({ transitionPhase: phase }),
      });
      try { fromDeck.el?.pause(); } catch { /* noop */ }
      recomputeEffective(to);
      const ratioNote = ratio !== 1 ? ` · sync ×${ratio.toFixed(3)}` : "";
      const label = CLEAN_RECIPES.find((r) => r.id === recipeId)?.label ?? recipeId;
      set({
        lastTransitionNote: `Clean DJ · ${label} · ${bars} bars${ratioNote}`,
        transitionInFlight: false,
        transitionPhase: null,
        transitionEngine: null,
      });
    } catch (e) {
      console.warn("clean recipe failed", e);
      set({ transitionInFlight: false, transitionPhase: null, transitionEngine: null });
    } finally {
      // Safety net: ALWAYS reset both decks' EQ + filter so a thrown error
      // can never leave a deck with a -24 dB low-shelf permanently engaged.
      try { resetEq(from); resetEq(to); resetFilter(from); resetFilter(to); } catch { /* noop */ }
    }
  },
  async runStemRecipe(from, to, id, opts) {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    if (!ctx) return;
    const st = get();
    const fromTrack = st[from].track;
    const toTrack = st[to].track;
    if (!fromTrack || !toTrack) return;
    if (st.transitionInFlight) return;
    const fromStems = deck[from].stems;
    const toStems = deck[to].stems;
    if (!fromStems || !toStems) return;
    set({ transitionInFlight: true, transitionEngine: "real", transitionPhase: "cue" });
    try {
      // BPM sync + beat align like the normal transition.
      const fromDeck = deck[from];
      const toDeck = deck[to];
      const toUserVol = st[to].volume;
      const fromUserVol = st[from].volume;
      // Start incoming if needed.
      if (toDeck.el && toDeck.el.paused) {
        try { await toDeck.el.play(); } catch { /* user gesture */ }
      }
      if (ctx.state === "suspended") void ctx.resume();
      const ratio = syncTempo(from, to);
      beatAlign(from, to);
      // Make sure deck volumes are open — recipe rides the stems, not the main gain.
      if (toDeck.gain) toDeck.gain.gain.cancelScheduledValues(ctx.currentTime);
      if (toDeck.gain) toDeck.gain.gain.setValueAtTime(toUserVol, ctx.currentTime);
      if (fromDeck.gain) fromDeck.gain.gain.cancelScheduledValues(ctx.currentTime);
      if (fromDeck.gain) fromDeck.gain.gain.setValueAtTime(fromUserVol, ctx.currentTime);
      // Reset incoming stems to "muted but ready" so the recipe can sneak them in.
      toStems.setGain("drums", 0, 0.02);
      toStems.setGain("bass", 0, 0.02);
      toStems.setGain("vocals", 0, 0.02);
      toStems.setGain("other", 0, 0.02);
      fromStems.setGain("drums", 1, 0.02);
      fromStems.setGain("bass", 1, 0.02);
      fromStems.setGain("vocals", 1, 0.02);
      fromStems.setGain("other", 1, 0.02);
      // Wait for first downbeat so the recipe's beats are aligned.
      await waitForNextBeat(from);
      // Choose recipe.
      const bpmDeltaPct = (fromTrack.bpm && toTrack.bpm) ? Math.abs(fromTrack.bpm - toTrack.bpm) / fromTrack.bpm : 0;
      const fromVoc = (fromTrack.vocalMap?.some((v) => v.voiced > 0.6)) ?? false;
      const toVoc = (toTrack.vocalMap?.some((v) => v.voiced > 0.6)) ?? false;
      const fromE = fromTrack.energy ?? 0.5;
      const toE = toTrack.energy ?? 0.5;
      const recipeId: RecipeId = id ?? pickRecipe({
        bpmDeltaPct,
        keyCompatible: camelotCompatible(fromTrack.camelot ?? "", toTrack.camelot ?? ""),
        fromHasVocals: fromVoc,
        toHasVocals: toVoc,
        energyJump: toE - fromE,
      });
      const secPerBar = fromTrack.bpm ? (60 / fromTrack.bpm) * 4 : 2;
      const bars = Math.max(8, Math.min(20, opts?.bars ?? 12));
      // Animate the visible crossfader gently — the AUDIO is fully handled by
      // stem swaps. We only nudge the UI fader near the end so it doesn't
      // become a parallel hidden master crossfade.
      animateCrossfader(to === "B" ? 1 : 0, secPerBar * bars * 1000);
      await runRecipe(recipeId, {
        ctx,
        fromStems, toStems,
        secPerBar, bars,
        waitForBeat: () => waitForNextBeat(from),
        teaserStem: opts?.teaserStem,
        aggression: opts?.aggression,
      });
      // Clean up: pause outgoing, reset its stems to neutral so it's ready to be
      // reused, restore the deck gain to user volume.
      try { fromDeck.el?.pause(); } catch { /* noop */ }
      fromStems.reset();
      // Incoming stems should all be at 1 by now; force it.
      toStems.setGain("drums", 1, 0.1);
      toStems.setGain("bass", 1, 0.1);
      toStems.setGain("vocals", 1, 0.1);
      toStems.setGain("other", 1, 0.1);
      recomputeEffective(to);
      const ratioNote = ratio !== 1 ? ` · sync ×${ratio.toFixed(3)}` : "";
      set({
        lastTransitionNote: `${RECIPES.find((r) => r.id === recipeId)?.label ?? recipeId} · ${bars} bars${ratioNote}`,
        transitionInFlight: false,
        transitionPhase: null,
        transitionEngine: null,
      });
    } catch (e) {
      console.warn("stem recipe failed", e);
      set({ transitionInFlight: false, transitionPhase: null, transitionEngine: null });
    } finally {
      // Safety net: ensure neither deck remains with a frozen EQ/filter state.
      try { resetEq(from); resetEq(to); resetFilter(from); resetFilter(to); } catch { /* noop */ }
    }
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
      recomputeEffective(side);
      // (Re)build bridge for this side now that analysis is fresh.
      const other: DeckSide = side === "A" ? "B" : "A";
      if (get()[other].track?.bpm) {
        void get().buildBridgeFor(side).catch(() => {});
      }
      // Persist to DB (best-effort)
      void persistAnalysis(t.id, a);
    } catch (e) {
      console.warn("analyze failed", e);
      set((s) => ({ [side]: { ...s[side], analyzing: false } } as Partial<BusState>));
    }
  },

  async attachRealStems(side, urls) {
    ensureCtx(); wireDeck(side);
    if (!ctx) return;
    const d = deck[side];
    if (!d.el || !d.stems) return;
    set((s) => ({ [side]: { ...s[side], stemsMode: "loading" } } as Partial<BusState>));
    try {
      // Free any previous real player.
      if (d.realStems) { d.realStems.dispose(); d.realStems = null; }
      const buffers = await loadRealStems(ctx, urls);
      const player = createRealStemPlayer(ctx, d.el, d.stems, buffers);
      d.realStems = player;
      // Mute pseudo path so we don't double-mix.
      try {
        const inputGain = (d.stems.input as GainNode).gain;
        inputGain.cancelScheduledValues(ctx.currentTime);
        inputGain.setValueAtTime(0, ctx.currentTime);
      } catch { /* noop */ }
      if (!d.el.paused) player.start();
      set((s) => ({ [side]: { ...s[side], stemsMode: "real" } } as Partial<BusState>));
    } catch (e) {
      console.warn("attachRealStems failed", e);
      set((s) => ({ [side]: { ...s[side], stemsMode: "pseudo" } } as Partial<BusState>));
    }
  },
  detachRealStems(side) {
    const d = deck[side];
    if (d.realStems) { d.realStems.dispose(); d.realStems = null; }
    if (d.stems && ctx) {
      try {
        const inputGain = (d.stems.input as GainNode).gain;
        inputGain.cancelScheduledValues(ctx.currentTime);
        inputGain.setValueAtTime(1, ctx.currentTime);
      } catch { /* noop */ }
    }
    set((s) => ({ [side]: { ...s[side], stemsMode: "pseudo" } } as Partial<BusState>));
  },

  async executePlan(plan) {
    ensureCtx(); wireDeck("A"); wireDeck("B");
    if (!ctx) return;
    const st = get();
    if (st.transitionInFlight) return;
    const fromSide = (plan.events.find((e) => e.kind === "cut" && e.action === "pause")?.deck
      ?? (plan.fromTrackId && st.A.track?.id === plan.fromTrackId ? "A" : "B")) as DeckSide;
    const toSide: DeckSide = fromSide === "A" ? "B" : "A";
    const fromDeck = deck[fromSide];
    const toDeck = deck[toSide];
    if (!fromDeck.gain || !toDeck.gain) return;
    set({
      transitionInFlight: true,
      transitionEngine: plan.fallbackUsed ? "clean" : "real",
      transitionPhase: "cue",
    });
    try {
      if (ctx.state === "suspended") void ctx.resume();
      const base = ctx.currentTime + Math.max(0, plan.startAtCtxTime - ctx.currentTime);
      // Animate the visible UI crossfader over the plan window — purely cosmetic
      // since applyCrossfader is no-op'd during transitionInFlight.
      animateCrossfader(toSide === "B" ? 1 : 0, plan.durationSec * 1000);
      // Schedule every event on the AudioContext clock.
      for (const ev of plan.events) {
        const tAt = base + Math.max(0, ev.t);
        scheduleEvent(ev, tAt, plan.durationSec);
      }
      // Lightweight phase ticks: cue → tease → layer → strip → switch → reveal.
      const phases: TransitionPhase[] = ["cue", "tease", "layer", "strip", "switch", "reveal"];
      const stepMs = (plan.durationSec * 1000) / phases.length;
      phases.forEach((p, i) => {
        setTimeout(() => {
          if (!get().transitionInFlight) return;
          set({ transitionPhase: p });
        }, i * stepMs);
      });
      // Wait for the plan to complete (real-time).
      await new Promise<void>((r) => setTimeout(r, Math.max(250, plan.durationSec * 1000 + 80)));
      recomputeEffective(toSide);
      set({
        lastTransitionNote: `Plan · ${plan.type} · ${plan.bars} bars · score ${plan.qualityScore}`,
        transitionInFlight: false,
        transitionPhase: null,
        transitionEngine: null,
        lastPlan: {
          type: plan.type,
          bars: plan.bars,
          score: plan.qualityScore,
          durationSec: plan.durationSec,
          from: fromSide,
          to: toSide,
          fallbackUsed: !!plan.fallbackUsed,
          at: performance.now(),
        },
      });
    } catch (e) {
      console.warn("executePlan failed", e);
      set({ transitionInFlight: false, transitionPhase: null, transitionEngine: null });
    } finally {
      // Always neutralise EQ/filter so a thrown plan can't leave a deck filtered.
      try { resetEq(fromSide); resetEq(toSide); resetFilter(fromSide); resetFilter(toSide); } catch { /* noop */ }
      // Snap UI crossfader to its target so the next interaction starts clean.
      try { applyCrossfader(get()); } catch { /* noop */ }
    }
  },

  async smartMixPlan(from, to, opts) {
    const st = get();
    if (!st[from].track || !st[to].track) return null;
    // Make sure both decks have fresh analysis so the plan reasons over real data.
    if (!st[from].track?.beatGrid || !st[from].track?.bpm) await get().ensureAnalysis(from).catch(() => {});
    if (!st[to].track?.beatGrid || !st[to].track?.bpm) await get().ensureAnalysis(to).catch(() => {});
    const cur = get();
    const fromTrack = cur[from].track!;
    const toTrack = cur[to].track!;
    // Position incoming at intro-end / first drop so we don't blend into silence.
    const toEl = deck[to].el;
    if (toEl && toTrack.cues && toEl.currentTime < 0.5) {
      try { toEl.currentTime = Math.max(0, toTrack.cues.introEnd || toTrack.cues.firstDrop || 0); } catch { /* noop */ }
    }
    const profileFrom = trackProfileFromEngine(fromTrack, { stemsAvailable: cur[from].stemsMode === "real" });
    const profileTo = trackProfileFromEngine(toTrack, { stemsAvailable: cur[to].stemsMode === "real" });
    if (!ctx) ensureCtx();
    if (!ctx) return null;
    // Align start to next downbeat of outgoing deck for musical timing.
    const grid = fromTrack.beatGrid ?? [];
    const fEl = deck[from].el;
    let startCtx = ctx.currentTime + 0.05;
    if (fEl && grid.length) {
      const now = fEl.currentTime;
      const next = grid.find((b) => b > now + 0.08);
      if (next != null) startCtx = ctx.currentTime + (next - now) / (fEl.playbackRate || 1);
    }
    const { plan } = planTransition({
      from: profileFrom, to: profileTo,
      fromDeck: from, toDeck: to,
      startAtCtxTime: startCtx,
      forceType: opts?.force, bars: opts?.bars,
    }, { from: cur[from].volume, to: cur[to].volume });
    await get().executePlan(plan);
    return plan;
  },

  dispose() {
    stopAutoTimer();
    if (rafId) cancelAnimationFrame(rafId);
  },
}));

/** Schedule a single TransitionEvent onto the live deck graph. */
function scheduleEvent(ev: TransitionEvent, when: number, totalDur: number) {
  if (!ctx) return;
  const target = deck[ev.deck];
  if (!target) return;
  const rampSec = Math.max(0.05, Math.min(totalDur * 0.5, totalDur / 6));
  switch (ev.kind) {
    case "gain": {
      if (ev.target === "deck") {
        const g = target.gain?.gain;
        if (!g) return;
        g.cancelScheduledValues(when);
        g.setValueAtTime(g.value, when);
        g.linearRampToValueAtTime(Math.max(0, ev.to), when + rampSec);
      } else if (ev.target === "stem" && ev.stem) {
        // Real stems only — the bus already refuses pseudo writes elsewhere.
        const stems = target.stems;
        const useState = useTwinDeck.getState()[ev.deck];
        if (useState.stemsMode !== "real" || !stems) return;
        const gainNode = stems.gains[ev.stem as StemId];
        if (!gainNode) return;
        gainNode.gain.cancelScheduledValues(when);
        gainNode.gain.setValueAtTime(gainNode.gain.value, when);
        gainNode.gain.linearRampToValueAtTime(Math.max(0, ev.to), when + rampSec);
      }
      return;
    }
    case "filter": {
      const f = target.filter;
      if (!f) return;
      if (ev.filterType === "off") {
        // Open the filter completely (transparent).
        f.frequency.cancelScheduledValues(when);
        f.frequency.setValueAtTime(f.frequency.value, when);
        f.frequency.exponentialRampToValueAtTime(22000, when + rampSec);
        // Reset type back to lowpass at the same time so a later move doesn't
        // inherit a stale highpass state.
        setTimeout(() => { try { if (f.type !== "lowpass") f.type = "lowpass"; } catch { /* noop */ } }, Math.max(0, (when - ctx!.currentTime) * 1000));
        return;
      }
      // Schedule a type change just before the frequency ramp.
      const setTypeAtMs = Math.max(0, (when - ctx.currentTime) * 1000);
      const desired = ev.filterType;
      setTimeout(() => { try { if (f.type !== desired) f.type = desired; } catch { /* noop */ } }, setTypeAtMs);
      f.frequency.cancelScheduledValues(when);
      f.frequency.setValueAtTime(f.frequency.value, when);
      if (ev.ramp === "exp") {
        f.frequency.exponentialRampToValueAtTime(Math.max(40, ev.freq), when + rampSec);
      } else {
        f.frequency.linearRampToValueAtTime(Math.max(40, ev.freq), when + rampSec);
      }
      return;
    }
    case "eq": {
      const band = ev.band === "low" ? target.eqLow : ev.band === "mid" ? target.eqMid : target.eqHigh;
      if (!band) return;
      band.gain.cancelScheduledValues(when);
      band.gain.setValueAtTime(band.gain.value, when);
      band.gain.linearRampToValueAtTime(ev.gainDb, when + rampSec);
      return;
    }
    case "tempo": {
      const el = target.el;
      if (!el) return;
      // playbackRate isn't an AudioParam — RAF-interpolate from current rate
      // to target over `rampSec` so BPM-mismatched mixes don't pitch-jump.
      const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
      const clamped = Math.max(0.88, Math.min(1.12, ev.rate));
      const glideMs = Math.max(120, rampSec * 1000 * 2.4); // longer = more musical
      setTimeout(() => { glidePlaybackRate(el, clamped, glideMs); }, delayMs);
      return;
    }
    case "cut": {
      const el = target.el;
      if (!el) return;
      const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
      setTimeout(() => {
        try {
          if (ev.action === "play") { if (el.paused) void el.play().catch(() => {}); }
          else if (ev.action === "pause") { el.pause(); }
          else if (ev.action === "seek" && typeof ev.seekTo === "number") { el.currentTime = Math.max(0, ev.seekTo); }
        } catch { /* noop */ }
      }, delayMs);
      return;
    }
    case "fx": {
      // Lightweight: emulate echoTail via a quick filter sweep on the deck filter.
      if (ev.fx === "echoTail") {
        const f = target.filter;
        if (!f) return;
        f.frequency.cancelScheduledValues(when);
        f.frequency.setValueAtTime(f.frequency.value, when);
        f.frequency.exponentialRampToValueAtTime(800, when + rampSec);
      } else if (ev.fx === "filterSweep") {
        const f = target.filter;
        if (!f) return;
        f.frequency.cancelScheduledValues(when);
        f.frequency.setValueAtTime(f.frequency.value, when);
        f.frequency.exponentialRampToValueAtTime(400, when + rampSec);
      }
      return;
    }
  }
}

/** Compatibility helper: highlight whether decks are key/BPM compatible. */
export function compatHint(a: EngineTrack | null, b: EngineTrack | null): {
  keyOk: boolean; bpmOk: boolean; bpmDelta: number | null; semitones: number;
} {
  if (!a || !b) return { keyOk: false, bpmOk: false, bpmDelta: null, semitones: 0 };
  const keyOk = camelotCompatible(a.camelot ?? "", b.camelot ?? "");
  const delta = (a.bpm && b.bpm) ? +(Math.abs(a.bpm - b.bpm)).toFixed(1) : null;
  const bpmOk = delta != null ? (a.bpm! > 0 && delta / a.bpm! <= 0.08) : false;
  const semitones = semitoneShiftToKey(a.musicalKey ?? null, b.musicalKey ?? null);
  return { keyOk, bpmOk, bpmDelta: delta, semitones };
}

/** Suppress unused warning: re-export for convenience. */
export type { TransitionModeHint };
