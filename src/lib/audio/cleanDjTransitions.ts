// Clean DJ Transitions — used when at least one deck does NOT have real
// Demucs stems. We do NOT touch the pseudo-stem bands here because those
// bands cannot truly isolate vocals/bass; trying to "swap" them on the
// fly destroys the original audio. Instead, every move below operates on
// the deck's own EQ/filter/gain so the original song stays musically
// intact and the transition still feels like a virtuoso DJ performance.
//
// Vocabulary used by the recipes:
//   * "Tease"    = briefly raise incoming volume with a heavy lowcut so the
//                  listener hears the top of the next song through a filter,
//                  then pull it back. Signals what's coming next.
//   * "Layer"    = open incoming highs over outgoing lows on a bar boundary.
//   * "Strip"    = pull outgoing low-shelf (bass kill) or high-shelf so the
//                  outgoing song thins out without dying.
//   * "Switch"   = bass swap on the downbeat — outgoing low-shelf to -∞,
//                  incoming low-shelf to 0, both simultaneously.
//   * "Reveal"   = open incoming fully, fade outgoing all the way out.

import type { DjBus } from "./twinDeckBus";

export type CleanRecipeId =
  | "djEqSwap"      // classic bass-low swap, 16 bars
  | "filterBuild"   // outgoing lowpass-down, incoming highpass-up
  | "hookTease"     // tease incoming hook through a filter, then full swap
  | "drumTopBlend"  // strip outgoing lows, leave drums/tops, then trade
  | "dropCut"       // emergency: short tense build → hard cut on downbeat
  | "echoOut";      // outgoing fades into delay tail, incoming opens dry

export const CLEAN_RECIPES: { id: CleanRecipeId; label: string; hint: string }[] = [
  { id: "djEqSwap",     label: "EQ Bass-Swap",     hint: "Klassischer Profi-Bass-Swap auf dem Downbeat" },
  { id: "filterBuild",  label: "Filter Build",     hint: "Outgoing lowpass down, incoming highpass up" },
  { id: "hookTease",    label: "Hook Tease",       hint: "Kurzer Filter-Vorgeschmack auf den neuen Track" },
  { id: "drumTopBlend", label: "Drum Top Blend",   hint: "Bass weg, Highs zusammen, dann sauberer Switch" },
  { id: "dropCut",      label: "Drop Cut",         hint: "Kurzer Build, harter Cut auf dem Drop" },
  { id: "echoOut",      label: "Echo Out",         hint: "Outgoing in Delay-Tail, incoming öffnet trocken" },
];

export type CleanRecipeCtx = {
  ctx: AudioContext;
  from: DjBus;
  to: DjBus;
  /** seconds per bar (4 beats), driven by the outgoing track */
  secPerBar: number;
  /** how many bars the transition occupies */
  bars: number;
  /** user volume for each deck after the swap completes */
  fromUserVol: number;
  toUserVol: number;
  /** suspend until next downbeat */
  waitForBeat?: () => Promise<void>;
  /** optional phase reporter for the UI */
  onPhase?: (phase: TransitionPhase) => void;
};

export type TransitionPhase =
  | "cue" | "tease" | "layer" | "strip" | "switch" | "reveal" | "done";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const bars = (c: CleanRecipeCtx, n: number) =>
  wait(Math.max(0, n) * c.secPerBar * 1000);

function rampGain(g: GainNode | null, target: number, sec: number, ctx: AudioContext) {
  if (!g) return;
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(target, now + Math.max(0.04, sec));
}
function rampEq(node: BiquadFilterNode | null, dB: number, sec: number, ctx: AudioContext) {
  if (!node) return;
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(dB, now + Math.max(0.04, sec));
}
function rampFreq(f: BiquadFilterNode | null, hz: number, sec: number, ctx: AudioContext) {
  if (!f) return;
  const now = ctx.currentTime;
  f.frequency.cancelScheduledValues(now);
  f.frequency.setValueAtTime(f.frequency.value, now);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, hz), now + Math.max(0.04, sec));
}
function resetFilter(f: BiquadFilterNode | null, ctx: AudioContext) {
  if (!f) return;
  f.frequency.cancelScheduledValues(ctx.currentTime);
  f.frequency.setValueAtTime(22000, ctx.currentTime);
}
function resetEq(b: DjBus, ctx: AudioContext) {
  for (const n of [b.eqLow, b.eqMid, b.eqHigh]) {
    if (!n) continue;
    n.gain.cancelScheduledValues(ctx.currentTime);
    n.gain.setValueAtTime(0, ctx.currentTime);
  }
}

/* ----------------------------------------------------------------------- */
/* 1. EQ Bass-Swap — cornerstone DJ move. Long build, hard swap.           */
/* ----------------------------------------------------------------------- */
async function djEqSwap(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  // PHASE 1 — Cue: incoming starts silent, lows killed, highs open.
  c.onPhase?.("cue");
  rampEq(to.eqLow, -24, 0.1, ctx);
  rampGain(to.gain, 0, 0.1, ctx);
  // PHASE 2 — Tease: 1 bar of incoming highs sneaking in through a high-shelf cut.
  c.onPhase?.("tease");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.55, c.secPerBar * 0.8, ctx);
  await bars(c, 1);
  // Pull back so the listener registers it as a *preview*, not the song yet.
  rampGain(to.gain, c.toUserVol * 0.15, c.secPerBar * 0.5, ctx);
  rampEq(from.eqHigh, -2, c.secPerBar * 0.5, ctx);
  await bars(c, 1);

  // PHASE 3 — Layer: incoming highs sit under outgoing mid/low for 4 bars.
  c.onPhase?.("layer");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.75, c.secPerBar * 2, ctx);
  rampEq(from.eqHigh, -6, c.secPerBar * 2, ctx);
  await bars(c, 4);

  // PHASE 4 — Strip: kill outgoing mids gradually, hold bass for one more bar.
  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqMid, -8, c.secPerBar * 1.5, ctx);
  rampEq(from.eqHigh, -12, c.secPerBar * 1.5, ctx);
  await bars(c, 2);

  // PHASE 5 — Switch: bass swap on the downbeat.
  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqLow, -24, 0.08, ctx);
  rampEq(to.eqLow, 0, 0.08, ctx);
  rampGain(to.gain, c.toUserVol, c.secPerBar * 0.5, ctx);
  rampGain(from.gain, 0, c.secPerBar * 1.5, ctx);
  await bars(c, 2);

  // PHASE 6 — Reveal.
  c.onPhase?.("reveal");
  const rest = Math.max(0, c.bars - 10);
  await bars(c, rest);
  c.onPhase?.("done");
}

/* ----------------------------------------------------------------------- */
/* 2. Filter Build — outgoing lowpass closes, incoming highpass opens.     */
/* ----------------------------------------------------------------------- */
async function filterBuild(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  c.onPhase?.("cue");
  rampEq(to.eqLow, -18, 0.1, ctx);
  rampGain(to.gain, 0, 0.1, ctx);

  c.onPhase?.("tease");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.5, c.secPerBar, ctx);
  await bars(c, 1);
  rampGain(to.gain, c.toUserVol * 0.2, c.secPerBar * 0.5, ctx);
  await bars(c, 1);

  c.onPhase?.("layer");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.7, c.secPerBar * 2, ctx);
  await bars(c, 2);

  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(from.filter, 240, c.secPerBar * 3, ctx);
  rampEq(from.eqLow, -8, c.secPerBar * 3, ctx);
  await bars(c, 3);

  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(from.filter, 120, c.secPerBar * 1.5, ctx);
  rampEq(to.eqLow, 0, 0.1, ctx);
  rampGain(to.gain, c.toUserVol, c.secPerBar * 1, ctx);
  rampGain(from.gain, 0, c.secPerBar * 1.5, ctx);
  await bars(c, 2);

  c.onPhase?.("reveal");
  resetFilter(from.filter, ctx);
  const rest = Math.max(0, c.bars - 9);
  await bars(c, rest);
  c.onPhase?.("done");
}

/* ----------------------------------------------------------------------- */
/* 3. Hook Tease — bring the new hook through a filter, pull it back,      */
/*    then commit on the next phrase.                                      */
/* ----------------------------------------------------------------------- */
async function hookTease(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  c.onPhase?.("cue");
  rampGain(to.gain, 0, 0.1, ctx);
  rampEq(to.eqLow, -24, 0.1, ctx);
  rampEq(to.eqMid, -6, 0.1, ctx);

  // First tease: 1 bar of incoming through heavy filter.
  c.onPhase?.("tease");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(to.filter, 900, 0.2, ctx);
  rampGain(to.gain, c.toUserVol * 0.65, c.secPerBar * 0.6, ctx);
  await bars(c, 1);
  rampGain(to.gain, 0, c.secPerBar * 0.4, ctx);
  await bars(c, 1);

  // Outgoing stays clean for 2 bars so the listener returns to the groove.
  c.onPhase?.("layer");
  await bars(c, 2);

  // Second tease, louder, slightly opened filter.
  c.onPhase?.("tease");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(to.filter, 1600, c.secPerBar, ctx);
  rampGain(to.gain, c.toUserVol * 0.8, c.secPerBar * 0.6, ctx);
  rampEq(from.eqHigh, -3, c.secPerBar, ctx);
  await bars(c, 2);

  // Strip outgoing tops.
  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqHigh, -10, c.secPerBar, ctx);
  rampEq(from.eqMid, -6, c.secPerBar, ctx);
  await bars(c, 2);

  // Switch: open incoming fully + kill outgoing lows.
  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(to.filter, 22000, c.secPerBar * 0.5, ctx);
  rampEq(to.eqMid, 0, c.secPerBar * 0.3, ctx);
  rampEq(to.eqLow, 0, 0.08, ctx);
  rampEq(from.eqLow, -24, 0.08, ctx);
  rampGain(to.gain, c.toUserVol, c.secPerBar * 0.6, ctx);
  rampGain(from.gain, 0, c.secPerBar * 1.5, ctx);
  await bars(c, 2);

  c.onPhase?.("reveal");
  const rest = Math.max(0, c.bars - 10);
  await bars(c, rest);
  c.onPhase?.("done");
}

/* ----------------------------------------------------------------------- */
/* 4. Drum-Top Blend — bass-kill both, ride the tops together for a few    */
/*    bars, then trade. Safe move when one or both songs have busy vocals. */
/* ----------------------------------------------------------------------- */
async function drumTopBlend(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  c.onPhase?.("cue");
  rampEq(to.eqLow, -24, 0.1, ctx);
  rampEq(to.eqMid, -4, 0.1, ctx);
  rampGain(to.gain, 0, 0.1, ctx);

  c.onPhase?.("tease");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.45, c.secPerBar, ctx);
  await bars(c, 1);
  rampGain(to.gain, c.toUserVol * 0.2, c.secPerBar * 0.5, ctx);
  await bars(c, 1);

  // Strip outgoing bass, raise incoming tops with no bass yet.
  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqLow, -18, c.secPerBar * 2, ctx);
  rampGain(to.gain, c.toUserVol * 0.7, c.secPerBar * 2, ctx);
  await bars(c, 3);

  // Switch: bass swap, both gains rebalance.
  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqLow, -24, 0.08, ctx);
  rampEq(to.eqLow, 0, 0.08, ctx);
  rampEq(to.eqMid, 0, c.secPerBar * 0.5, ctx);
  rampGain(to.gain, c.toUserVol, c.secPerBar * 0.8, ctx);
  rampGain(from.gain, 0, c.secPerBar * 2, ctx);
  await bars(c, 2);

  c.onPhase?.("reveal");
  const rest = Math.max(0, c.bars - 8);
  await bars(c, rest);
  c.onPhase?.("done");
}

/* ----------------------------------------------------------------------- */
/* 5. Drop Cut — short, dramatic. Used when BPM/Key are way off.           */
/* ----------------------------------------------------------------------- */
async function dropCut(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  c.onPhase?.("cue");
  rampGain(to.gain, 0, 0.1, ctx);
  rampEq(to.eqLow, -24, 0.1, ctx);

  // Tense build — outgoing filter sweeps down + high-shelf rises.
  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampFreq(from.filter, 320, c.secPerBar * 4, ctx);
  rampEq(from.eqHigh, 3, c.secPerBar * 4, ctx);
  await bars(c, 4);

  // Last bar — half-bar hush.
  rampGain(from.gain, c.fromUserVol * 0.25, c.secPerBar * 0.5, ctx);
  await bars(c, 1);

  // Hard cut on the downbeat.
  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(from.gain, 0, 0.04, ctx);
  rampEq(to.eqLow, 0, 0.04, ctx);
  rampGain(to.gain, c.toUserVol, 0.04, ctx);

  c.onPhase?.("reveal");
  const rest = Math.max(0, c.bars - 6);
  await bars(c, rest);
  resetFilter(from.filter, ctx);
  c.onPhase?.("done");
}

/* ----------------------------------------------------------------------- */
/* 6. Echo Out — outgoing fades into a delay tail, incoming opens dry.     */
/* ----------------------------------------------------------------------- */
async function echoOut(c: CleanRecipeCtx) {
  const { ctx, from, to } = c;
  c.onPhase?.("cue");
  rampEq(to.eqLow, -24, 0.1, ctx);
  rampGain(to.gain, 0, 0.1, ctx);

  c.onPhase?.("layer");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(to.gain, c.toUserVol * 0.6, c.secPerBar * 2, ctx);
  await bars(c, 3);

  c.onPhase?.("strip");
  if (c.waitForBeat) await c.waitForBeat();
  rampEq(from.eqHigh, -8, c.secPerBar * 2, ctx);
  rampFreq(from.filter, 600, c.secPerBar * 2, ctx);
  await bars(c, 2);

  c.onPhase?.("switch");
  if (c.waitForBeat) await c.waitForBeat();
  rampGain(from.gain, 0, c.secPerBar * 2, ctx);
  rampEq(to.eqLow, 0, 0.1, ctx);
  rampGain(to.gain, c.toUserVol, c.secPerBar * 1, ctx);
  await bars(c, 2);

  c.onPhase?.("reveal");
  resetFilter(from.filter, ctx);
  const rest = Math.max(0, c.bars - 9);
  await bars(c, rest);
  c.onPhase?.("done");
}

const TABLE: Record<CleanRecipeId, (c: CleanRecipeCtx) => Promise<void>> = {
  djEqSwap, filterBuild, hookTease, drumTopBlend, dropCut, echoOut,
};

export async function runCleanRecipe(id: CleanRecipeId, c: CleanRecipeCtx) {
  try {
    await TABLE[id](c);
  } finally {
    // Restore EQ on both decks so future transitions start from neutral.
    resetEq(c.from, c.ctx);
    resetEq(c.to, c.ctx);
    resetFilter(c.from.filter, c.ctx);
    resetFilter(c.to.filter, c.ctx);
  }
}

/** Pick a Clean DJ recipe from track relationships. */
export function pickCleanRecipe(opts: {
  bpmDeltaPct: number;
  keyCompatible: boolean;
  fromHasVocals: boolean;
  toHasVocals: boolean;
  energyJump: number;
}): CleanRecipeId {
  if (opts.bpmDeltaPct > 0.12) return "dropCut";
  if (opts.bpmDeltaPct > 0.07 || !opts.keyCompatible) return "filterBuild";
  if (opts.fromHasVocals && opts.toHasVocals) return "drumTopBlend";
  if (opts.energyJump > 0.25) return "hookTease";
  if (opts.energyJump < -0.2) return "echoOut";
  return "djEqSwap";
}