// "Choreographies" that ride pseudo-stems instead of dumb gain fades.
// A recipe receives a stem split for the outgoing AND incoming deck and
// returns an async function that performs the transition.

import type { StemSplit } from "./stemSplit";

export type RecipeId =
  | "stemSwap"      // pro-style: vox out → drums in → bass swap on the drop
  | "vocalTease"    // drop outgoing vocals, sneak incoming drums under, then full swap
  | "drumRolldown"  // outgoing drums roll out, incoming drums roll in, melody crossfades
  | "echoOut"       // outgoing dives into reverb/echo; incoming full-band reveal
  | "filterMorph";  // outgoing low-pass collapse + incoming high-pass open

export const RECIPES: { id: RecipeId; label: string; hint: string }[] = [
  { id: "stemSwap",     label: "Stem Swap",      hint: "Vox + Bass + Drums werden einzeln getauscht" },
  { id: "vocalTease",   label: "Vocal Tease",    hint: "Outgoing-Vox raus, Incoming-Drums sneaken" },
  { id: "drumRolldown", label: "Drum Rolldown",  hint: "Beats werden über 8 Bars getauscht" },
  { id: "echoOut",      label: "Echo Out",       hint: "Outgoing fällt in Hall, Incoming kommt voll rein" },
  { id: "filterMorph",  label: "Filter Morph",   hint: "Tiefpass-Kollaps + Hochpass-Reveal" },
];

export type RecipeCtx = {
  ctx: AudioContext;
  fromStems: StemSplit;
  toStems: StemSplit;
  /** seconds per bar (4 beats). */
  secPerBar: number;
  /** how many bars the transition occupies. */
  bars: number;
  /** Suspend until next downbeat callback. */
  waitForBeat?: () => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pro stem-swap: 4 phases over `bars`. The listener doesn't notice for ~6 bars. */
async function stemSwap(c: RecipeCtx) {
  const phase = c.secPerBar * c.bars / 4;     // each phase = bars/4
  const ph = Math.max(1.2, phase);
  // Phase 1: incoming sneaks in (drums + other under outgoing). Vocals & bass still outgoing.
  c.toStems.setGain("drums", 0.9, ph);
  c.toStems.setGain("other", 0.7, ph);
  c.toStems.setGain("bass", 0.0, 0.05);
  c.toStems.setGain("vocals", 0.0, 0.05);
  c.fromStems.setGain("vocals", 0.8, ph);
  await wait(ph * 1000);

  // Phase 2: vocal swap. Outgoing-Vox out, incoming-Vox in on the bar.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("vocals", 0.0, ph * 0.4);
  c.toStems.setGain("vocals", 1.0, ph * 0.4);
  await wait(ph * 1000);

  // Phase 3: BASS SWAP — the cornerstone DJ move, exact on the downbeat.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.15);
  c.toStems.setGain("bass", 1.0, 0.15);
  c.fromStems.setGain("drums", 0.0, ph * 0.5);
  c.fromStems.setGain("other", 0.0, ph * 0.6);
  await wait(ph * 1000);

  // Phase 4: clean ride-out of outgoing remnants.
  c.fromStems.setGain("vocals", 0.0, ph);
  c.toStems.setGain("drums", 1.0, ph * 0.5);
  c.toStems.setGain("other", 1.0, ph * 0.5);
  await wait(ph * 1000);
}

async function vocalTease(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Outgoing vocals duck for 2 bars while incoming drums tease underneath.
  c.fromStems.setGain("vocals", 0.1, bar * 0.5);
  c.toStems.setGain("drums", 0.6, bar);
  c.toStems.setGain("other", 0.0, 0.05);
  c.toStems.setGain("vocals", 0.0, 0.05);
  c.toStems.setGain("bass", 0.0, 0.05);
  await wait(bar * 2 * 1000);

  // Reveal: bass-swap on the next bar, incoming everything in.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.2);
  c.toStems.setGain("bass", 1.0, 0.2);
  c.toStems.setGain("other", 1.0, bar);
  c.toStems.setGain("vocals", 1.0, bar);
  c.fromStems.setGain("drums", 0.0, bar * 1.5);
  c.fromStems.setGain("vocals", 0.0, bar * 1.5);
  c.fromStems.setGain("other", 0.0, bar * 1.5);
  await wait(bar * (c.bars - 2) * 1000);
}

async function drumRolldown(c: RecipeCtx) {
  const total = c.secPerBar * c.bars;
  // Hats/snares trade first, kick stays on outgoing until 60%.
  c.toStems.setGain("drums", 1.0, total * 0.5);
  c.fromStems.setGain("drums", 0.0, total * 0.5);
  await wait(total * 500); // 50%
  if (c.waitForBeat) await c.waitForBeat();
  // Bass swap + melody fade
  c.fromStems.setGain("bass", 0.0, 0.2);
  c.toStems.setGain("bass", 1.0, 0.2);
  c.fromStems.setGain("other", 0.0, total * 0.4);
  c.fromStems.setGain("vocals", 0.0, total * 0.4);
  c.toStems.setGain("other", 1.0, total * 0.4);
  c.toStems.setGain("vocals", 1.0, total * 0.4);
  await wait(total * 500);
}

async function echoOut(c: RecipeCtx) {
  const total = c.secPerBar * c.bars;
  // Outgoing collapses: lose bass + drums fast, only echoed mids remain.
  c.fromStems.setGain("bass", 0.0, c.secPerBar);
  c.fromStems.setGain("drums", 0.0, c.secPerBar * 1.5);
  c.fromStems.setGain("other", 0.4, c.secPerBar * 2);
  c.fromStems.setGain("vocals", 0.2, c.secPerBar * 2);
  // Incoming reveals on the bar.
  c.toStems.setGain("drums", 1.0, c.secPerBar);
  c.toStems.setGain("other", 1.0, c.secPerBar);
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("bass", 1.0, 0.2);
  c.fromStems.setGain("other", 0.0, total * 0.5);
  c.fromStems.setGain("vocals", 0.0, total * 0.5);
  await wait(total * 1000);
}

async function filterMorph(c: RecipeCtx) {
  const total = c.secPerBar * c.bars;
  // Outgoing: kill highs first, then mids, then everything → just sub.
  c.fromStems.setGain("vocals", 0.0, total * 0.4);
  c.fromStems.setGain("other", 0.0, total * 0.6);
  c.fromStems.setGain("drums", 0.0, total * 0.8);
  // Incoming: start from highs only, open into full band.
  c.toStems.setGain("vocals", 0.4, total * 0.4);
  c.toStems.setGain("other", 0.7, total * 0.6);
  c.toStems.setGain("drums", 1.0, total * 0.5);
  c.toStems.setGain("bass", 0.0, 0.05);
  await wait(total * 700);
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.2);
  c.toStems.setGain("bass", 1.0, 0.2);
  c.toStems.setGain("vocals", 1.0, total * 0.3);
  c.toStems.setGain("other", 1.0, total * 0.3);
  await wait(total * 300);
}

const TABLE: Record<RecipeId, (c: RecipeCtx) => Promise<void>> = {
  stemSwap, vocalTease, drumRolldown, echoOut, filterMorph,
};

export async function runRecipe(id: RecipeId, c: RecipeCtx) {
  return TABLE[id](c);
}

/** Pick a recipe that best fits track relationships. */
export function pickRecipe(opts: {
  bpmDeltaPct: number;     // |from-to|/from
  keyCompatible: boolean;
  fromHasVocals: boolean;
  toHasVocals: boolean;
  energyJump: number;      // toEnergy - fromEnergy in [-1..1]
}): RecipeId {
  // Tight key + tight BPM → full stem swap is the gold standard.
  if (opts.keyCompatible && opts.bpmDeltaPct < 0.06) return "stemSwap";
  // Outgoing has vocals & incoming doesn't (or vice versa) → vocal-tease.
  if (opts.fromHasVocals !== opts.toHasVocals) return "vocalTease";
  // Big energy jump up → drum rolldown to build tension.
  if (opts.energyJump > 0.25) return "drumRolldown";
  // Tempo gap too wide for natural keylock → filter morph hides it.
  if (opts.bpmDeltaPct > 0.12) return "filterMorph";
  // Default: echo-out reveal.
  return "echoOut";
}