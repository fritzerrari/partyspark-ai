// "Choreographies" that ride pseudo-stems instead of dumb gain fades.
// A recipe receives a stem split for the outgoing AND incoming deck and
// returns an async function that performs the transition.

import type { StemSplit } from "./stemSplit";

export type RecipeId =
  | "vocalOutDrumsIn" // outgoing vocals duck, incoming drums fade in on the bar
  | "bassSwap"        // hard bass-bus swap on the downbeat
  | "drumBridge"      // collapse to drums-only bridge, reveal incoming
  | "acapellaIntro"   // ride outgoing vocals over incoming instrumental bed
  | "instrumentalBed" // outgoing instrumental bed under incoming full mix
  | "dropSwitch";     // both ride to the drop, swap bass+drums simultaneously

export const RECIPES: { id: RecipeId; label: string; hint: string }[] = [
  { id: "vocalOutDrumsIn", label: "Vocal-Out / Drums-In", hint: "Outgoing-Vox raus, Incoming-Drums rein auf dem Bar" },
  { id: "bassSwap",        label: "Bass Swap",            hint: "Bass-Bus hart auf dem Downbeat tauschen" },
  { id: "drumBridge",      label: "Drum Bridge",          hint: "Beide auf Drums-Only-Brücke, dann Reveal" },
  { id: "acapellaIntro",   label: "Acapella Intro",       hint: "Outgoing-Vox über Incoming-Instrumental" },
  { id: "instrumentalBed", label: "Instrumental Bed",     hint: "Outgoing-Instrumental als Bett unter Incoming" },
  { id: "dropSwitch",      label: "Drop Switch",          hint: "Bass+Drums gleichzeitig auf dem Drop" },
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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Force outgoing vocals to silence within 100 ms to prevent vocal clash. */
function muteVocalConflict(c: RecipeCtx) {
  c.fromStems.setGain("vocals", 0, 0.1);
}

/* -------------------------------------------------------------------------- */
/* The 6 recipes — all stem-only, beat-aligned, drums-stable                  */
/* -------------------------------------------------------------------------- */

/** 1. Vocal-Out / Drums-In — Moises-classic */
async function vocalOutDrumsIn(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1 (2 bars): duck outgoing vocals, sneak incoming drums underneath.
  c.fromStems.setGain("vocals", 0.0, bar * 1.5);
  c.toStems.setGain("drums", 0.85, bar * 2);
  c.toStems.setGain("bass", 0, 0.05);
  c.toStems.setGain("other", 0, 0.05);
  c.toStems.setGain("vocals", 0, 0.05);
  await wait(bar * 2 * 1000);

  // Phase 2 (downbeat): bass + other reveal on incoming, outgoing instrumental fades.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("bass", 1.0, 0.2);
  c.toStems.setGain("other", 1.0, bar);
  c.fromStems.setGain("bass", 0.0, bar);
  c.fromStems.setGain("other", 0.0, bar * 1.5);
  await wait(bar * 2 * 1000);

  // Phase 3: incoming vocals in, outgoing drums out.
  c.toStems.setGain("vocals", 1.0, bar);
  c.fromStems.setGain("drums", 0.0, bar * 2);
  await wait(bar * (c.bars - 4) * 1000);
}

/** 2. Bass Swap — the cornerstone DJ move */
async function bassSwap(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1 (3 bars): incoming highs + drums in, bass still on outgoing.
  c.toStems.setGain("drums", 0.9, bar * 2);
  c.toStems.setGain("other", 0.8, bar * 2);
  c.toStems.setGain("vocals", 0.0, 0.05);
  c.toStems.setGain("bass", 0.0, 0.05);
  await wait(bar * 3 * 1000);

  // Phase 2 — HARD bass swap on downbeat.
  if (c.waitForBeat) await c.waitForBeat();
  muteVocalConflict(c);
  c.fromStems.setGain("bass", 0.0, 0.05);
  c.toStems.setGain("bass", 1.0, 0.05);
  await wait(bar * 1 * 1000);

  // Phase 3 — bleed outgoing out, vocals in.
  c.fromStems.setGain("other", 0.0, bar * 2);
  c.fromStems.setGain("drums", 0.0, bar * 2);
  c.toStems.setGain("vocals", 1.0, bar);
  c.toStems.setGain("drums", 1.0, bar);
  c.toStems.setGain("other", 1.0, bar);
  await wait(bar * (c.bars - 4) * 1000);
}

/** 3. Drum Bridge — drums-only segue to hide tempo/key gap */
async function drumBridge(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1: collapse outgoing to drums-only.
  c.fromStems.setGain("vocals", 0.0, bar);
  c.fromStems.setGain("other", 0.0, bar * 1.2);
  c.fromStems.setGain("bass", 0.0, bar * 1.5);
  c.fromStems.setGain("drums", 1.0, 0.1);
  c.toStems.setGain("drums", 0.0, 0.05);
  c.toStems.setGain("bass", 0, 0.05);
  c.toStems.setGain("other", 0, 0.05);
  c.toStems.setGain("vocals", 0, 0.05);
  await wait(bar * 2 * 1000);

  // Phase 2: layer incoming drums for 2 bars (drums on BOTH = rhythm-stable).
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.9, bar);
  await wait(bar * 2 * 1000);

  // Phase 3: hand drums to incoming, reveal melody + bass.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("drums", 0.0, bar * 1.5);
  c.toStems.setGain("drums", 1.0, 0.2);
  c.toStems.setGain("bass", 1.0, bar * 0.5);
  c.toStems.setGain("other", 1.0, bar);
  c.toStems.setGain("vocals", 1.0, bar);
  await wait(bar * (c.bars - 4) * 1000);
}

/** 4. Acapella Intro — outgoing vocals over incoming instrumental */
async function acapellaIntro(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1: outgoing collapses to vocals only.
  c.fromStems.setGain("drums", 0.0, bar);
  c.fromStems.setGain("bass", 0.0, bar);
  c.fromStems.setGain("other", 0.2, bar);
  c.fromStems.setGain("vocals", 1.0, 0.1);
  // Incoming starts as instrumental bed: drums + bass + other, no vocals.
  c.toStems.setGain("drums", 0.9, bar * 1.5);
  c.toStems.setGain("bass", 0.9, bar * 1.5);
  c.toStems.setGain("other", 0.8, bar * 1.5);
  c.toStems.setGain("vocals", 0.0, 0.05);
  await wait(bar * 3 * 1000);

  // Phase 2 (downbeat): trade vocals.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("vocals", 0.0, bar);
  c.toStems.setGain("vocals", 1.0, bar);
  c.fromStems.setGain("other", 0.0, bar);
  c.toStems.setGain("drums", 1.0, bar);
  c.toStems.setGain("bass", 1.0, bar);
  c.toStems.setGain("other", 1.0, bar);
  await wait(bar * (c.bars - 3) * 1000);
}

/** 5. Instrumental Bed — outgoing instrumental holds while incoming reveals */
async function instrumentalBed(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1: kill outgoing vocals, keep instrumental.
  c.fromStems.setGain("vocals", 0.0, bar);
  c.fromStems.setGain("drums", 1.0, 0.1);
  c.fromStems.setGain("bass", 1.0, 0.1);
  c.fromStems.setGain("other", 0.85, bar);
  // Incoming sneaks the full mix in slowly.
  c.toStems.setGain("vocals", 0.3, bar * 2);
  c.toStems.setGain("other", 0.3, bar * 2);
  c.toStems.setGain("drums", 0.0, 0.05);
  c.toStems.setGain("bass", 0.0, 0.05);
  await wait(bar * 3 * 1000);

  // Phase 2: bass swap + reveal incoming.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.15);
  c.toStems.setGain("bass", 1.0, 0.15);
  c.toStems.setGain("drums", 1.0, bar);
  c.toStems.setGain("vocals", 1.0, bar);
  c.toStems.setGain("other", 1.0, bar);
  // Phase 3: bleed outgoing.
  c.fromStems.setGain("other", 0.0, bar * 2);
  c.fromStems.setGain("drums", 0.0, bar * 2);
  await wait(bar * (c.bars - 3) * 1000);
}

/** 6. Drop Switch — simultaneous bass+drums swap on the drop */
async function dropSwitch(c: RecipeCtx) {
  const bar = c.secPerBar;
  // Phase 1: both rides building tension. Outgoing drops bass to "tease".
  c.fromStems.setGain("vocals", 0.4, bar);
  c.fromStems.setGain("bass", 0.4, bar);
  c.toStems.setGain("other", 0.5, bar);
  c.toStems.setGain("vocals", 0.0, 0.05);
  c.toStems.setGain("bass", 0.0, 0.05);
  c.toStems.setGain("drums", 0.0, 0.05);
  await wait(bar * 2 * 1000);

  // Pre-drop riser bar — both very quiet, all eyes on the drop.
  c.fromStems.setGain("drums", 0.2, bar * 0.8);
  c.fromStems.setGain("bass", 0.0, bar * 0.8);
  c.fromStems.setGain("other", 0.2, bar * 0.8);
  c.fromStems.setGain("vocals", 0.0, bar * 0.5);
  await wait(bar * 1 * 1000);

  // DROP — bass + drums swap simultaneously on the downbeat.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("drums", 0.0, 0.05);
  c.fromStems.setGain("bass", 0.0, 0.05);
  c.toStems.setGain("drums", 1.0, 0.05);
  c.toStems.setGain("bass", 1.0, 0.05);

  // Phase 3: melody + vocals crossfade behind the drop.
  c.fromStems.setGain("other", 0.0, bar);
  c.fromStems.setGain("vocals", 0.0, bar);
  c.toStems.setGain("other", 1.0, bar);
  c.toStems.setGain("vocals", 1.0, bar);
  await wait(bar * (c.bars - 3) * 1000);
}

const TABLE: Record<RecipeId, (c: RecipeCtx) => Promise<void>> = {
  vocalOutDrumsIn, bassSwap, drumBridge, acapellaIntro, instrumentalBed, dropSwitch,
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
  // Tempo / key way off → drum bridge hides it.
  if (opts.bpmDeltaPct > 0.10 || !opts.keyCompatible) return "drumBridge";
  // Both have vocals → avoid vocal clash with bass-swap.
  if (opts.fromHasVocals && opts.toHasVocals) return "bassSwap";
  // Outgoing vocals, incoming instrumental → acapella ride.
  if (opts.fromHasVocals && !opts.toHasVocals) return "acapellaIntro";
  // Outgoing instrumental, incoming vocals → instrumental bed under.
  if (!opts.fromHasVocals && opts.toHasVocals) return "instrumentalBed";
  // Big energy jump up → drop switch builds the climax.
  if (opts.energyJump > 0.25) return "dropSwitch";
  // Default — clean Moises-style vocal-out / drums-in.
  return "vocalOutDrumsIn";
}