// "Choreographies" that ride pseudo-stems instead of dumb gain fades.
// A recipe receives a stem split for the outgoing AND incoming deck and
// returns an async function that performs the transition. Recipes are
// phrase-based: every move sits on a bar boundary, the incoming track is
// always TEASED with a single stem before any blend, vocals never clash
// long, and at least one drum bus stays alive in the middle of the move
// so the dancefloor never loses the groove.

import type { StemSplit } from "./stemSplit";
import type { StemId } from "./stemSplit";

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
  /** Which stem to use for the first teaser preview (Smart Mix sets this). */
  teaserStem?: StemId;
  /** Performance aggression — affects ramp slopes & teaser strength. */
  aggression?: "smooth" | "performance" | "emergency";
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Force outgoing vocals to silence within 100 ms to prevent vocal clash. */
function muteVocalConflict(c: RecipeCtx) {
  c.fromStems.setGain("vocals", 0, 0.1);
}

/** Wait N bars (musical time). */
function bars(c: RecipeCtx, n: number) {
  return wait(Math.max(0, n) * c.secPerBar * 1000);
}

/** Set every incoming stem to silent. */
function silenceIncoming(c: RecipeCtx) {
  c.toStems.setGain("drums", 0, 0.04);
  c.toStems.setGain("bass", 0, 0.04);
  c.toStems.setGain("vocals", 0, 0.04);
  c.toStems.setGain("other", 0, 0.04);
}

/** Set a full "scene" (all 4 stems) for a deck in one go. */
function setScene(s: StemSplit, scene: Partial<Record<StemId, number>>, sec: number) {
  (Object.keys(scene) as StemId[]).forEach((k) => s.setGain(k, scene[k] ?? 0, sec));
}

/**
 * Quick "tease" of a single incoming stem: bring it in, hold briefly,
 * then pull it back so the listener notices the next track without it
 * turning into a permanent layer. Used by every recipe in the first
 * 2 bars so transitions never sound like a dumb fade.
 */
async function teaseStem(c: RecipeCtx, stem: StemId, opts?: { peak?: number; up?: number; hold?: number; down?: number }) {
  const peak = opts?.peak ?? (c.aggression === "performance" ? 0.9 : c.aggression === "emergency" ? 1.0 : 0.7);
  const up   = opts?.up   ?? Math.min(c.secPerBar * 0.5, 1.0);
  const hold = opts?.hold ?? c.secPerBar * 0.9;
  const down = opts?.down ?? Math.min(c.secPerBar * 0.4, 0.8);
  c.toStems.setGain(stem, peak, up);
  await wait(up * 1000 + hold * 1000);
  c.toStems.setGain(stem, 0.0, down);
  await wait(down * 1000);
}

/** Hold a groove floor: at least one drum bus stays >= floor through a window. */
function holdGroove(c: RecipeCtx, side: "from" | "to", floor = 0.4) {
  const s = side === "from" ? c.fromStems : c.toStems;
  s.setGain("drums", Math.max(floor, s.gains.drums.gain.value), 0.15);
}

/* -------------------------------------------------------------------------- */
/* The 6 recipes — all stem-only, beat-aligned, drums-stable                  */
/* -------------------------------------------------------------------------- */

/** 1. Vocal-Out / Drums-In — tease a single incoming part, then trade. */
async function vocalOutDrumsIn(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE — single incoming part as preview.
  const teaser: StemId = c.teaserStem ?? "drums";
  await teaseStem(c, teaser, { peak: 0.85 });

  // PHASE B (2 bars): groove layer — incoming drums sit under outgoing.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.75, c.secPerBar);
  c.fromStems.setGain("vocals", 0.25, c.secPerBar * 1.5); // duck early
  await bars(c, 2);

  // PHASE C (2 bars): stripdown outgoing — kill vocals + other, keep drums+bass.
  if (c.waitForBeat) await c.waitForBeat();
  muteVocalConflict(c);
  c.fromStems.setGain("other", 0.0, c.secPerBar);
  c.toStems.setGain("other", 0.5, c.secPerBar * 1.5); // sneak melody hint
  holdGroove(c, "from", 0.6);
  await bars(c, 2);

  // PHASE D (2 bars): DOWNBEAT SWITCH — bass + drums hand off.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.15);
  c.toStems.setGain("bass", 1.0, 0.15);
  c.fromStems.setGain("drums", 0.0, c.secPerBar * 1.2);
  c.toStems.setGain("drums", 1.0, 0.2);
  c.toStems.setGain("other", 1.0, c.secPerBar);
  await bars(c, 2);

  // PHASE E (remaining): REVEAL — incoming vocals open up.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  const rest = Math.max(0, c.bars - 7);
  await bars(c, rest);
}

/** 2. Bass Swap — cornerstone DJ move with a real preview phase. */
async function bassSwap(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE incoming highs/melody alone.
  await teaseStem(c, c.teaserStem ?? "other", { peak: 0.7 });

  // PHASE B (3 bars): incoming drums + highs sit in, NO bass yet, outgoing bass still rules.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.85, c.secPerBar * 1.5);
  c.toStems.setGain("other", 0.7, c.secPerBar * 1.5);
  c.fromStems.setGain("other", 0.4, c.secPerBar * 1.5); // strip outgoing melody to make room
  await bars(c, 3);

  // PHASE C (instant): HARD bass swap on the downbeat — the iconic move.
  if (c.waitForBeat) await c.waitForBeat();
  muteVocalConflict(c);
  c.fromStems.setGain("bass", 0.0, 0.04);
  c.toStems.setGain("bass", 1.0, 0.04);

  // PHASE D (3 bars): outgoing fades to drums-only, then dies; incoming reveals vocals.
  c.fromStems.setGain("other", 0.0, c.secPerBar);
  c.fromStems.setGain("vocals", 0.0, 0.1);
  await bars(c, 1);
  c.fromStems.setGain("drums", 0.0, c.secPerBar * 2);
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  c.toStems.setGain("drums", 1.0, c.secPerBar * 0.5);
  c.toStems.setGain("other", 1.0, c.secPerBar);
  const rest = Math.max(0, c.bars - 7);
  await bars(c, rest);
}

/** 3. Drum Bridge — drums-only bridge that hides tempo/key gaps. */
async function drumBridge(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE a non-tonal element first — drums or perc only.
  await teaseStem(c, "drums", { peak: 0.55 });

  // PHASE B (3 bars): collapse outgoing to drums-only stripdown.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("vocals", 0.0, c.secPerBar * 0.8);
  c.fromStems.setGain("other", 0.0, c.secPerBar);
  c.fromStems.setGain("bass", 0.0, c.secPerBar * 1.2);
  c.fromStems.setGain("drums", 1.0, 0.1);
  await bars(c, 3);

  // PHASE C (4 bars): both decks ride drums together (rhythm-stable bridge).
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.95, c.secPerBar);
  await bars(c, 2);
  // Mid-bridge: hand drums fully to incoming.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("drums", 0.0, c.secPerBar * 1.5);
  c.toStems.setGain("drums", 1.0, 0.2);
  await bars(c, 2);

  // PHASE D (rest): reveal incoming melody/bass/vocals one bar at a time.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("bass", 1.0, c.secPerBar * 0.5);
  await bars(c, 1);
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("other", 1.0, c.secPerBar);
  await bars(c, 1);
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  const rest = Math.max(0, c.bars - 10);
  await bars(c, rest);
}

/** 4. Acapella Intro — outgoing vocals float over incoming instrumental. */
async function acapellaIntro(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE incoming drums under outgoing full mix.
  await teaseStem(c, "drums", { peak: 0.6 });

  // PHASE B (2 bars): outgoing strips down to vocals only.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("drums", 0.0, c.secPerBar);
  c.fromStems.setGain("bass", 0.0, c.secPerBar);
  c.fromStems.setGain("other", 0.2, c.secPerBar);
  c.fromStems.setGain("vocals", 1.0, 0.1);
  await bars(c, 2);

  // PHASE C (3 bars): incoming instrumental bed builds (drums + bass + other).
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.9, c.secPerBar);
  c.toStems.setGain("bass", 0.85, c.secPerBar * 1.5);
  c.toStems.setGain("other", 0.7, c.secPerBar * 1.5);
  await bars(c, 3);

  // PHASE D (downbeat trade): swap vocals.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("vocals", 0.0, c.secPerBar * 0.8);
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  c.fromStems.setGain("other", 0.0, c.secPerBar);
  c.toStems.setGain("other", 1.0, c.secPerBar);
  const rest = Math.max(0, c.bars - 6);
  await bars(c, rest);
}

/** 5. Instrumental Bed — outgoing instrumental as bed, incoming vocal hints. */
async function instrumentalBed(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE incoming vocal alone as preview.
  await teaseStem(c, c.teaserStem ?? "vocals", { peak: 0.75 });

  // PHASE B (2 bars): outgoing strips vocals, instrumental becomes the bed.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("vocals", 0.0, c.secPerBar);
  c.fromStems.setGain("other", 0.85, c.secPerBar);
  await bars(c, 2);

  // PHASE C (3 bars): incoming melody + drums sneak in, NO bass clash yet.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("drums", 0.6, c.secPerBar * 1.5);
  c.toStems.setGain("other", 0.6, c.secPerBar * 1.5);
  await bars(c, 3);

  // PHASE D (instant): bass swap + reveal incoming vocals.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, 0.1);
  c.toStems.setGain("bass", 1.0, 0.1);
  c.toStems.setGain("drums", 1.0, c.secPerBar);
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  c.toStems.setGain("other", 1.0, c.secPerBar);

  // PHASE E: bleed outgoing.
  c.fromStems.setGain("other", 0.0, c.secPerBar * 2);
  c.fromStems.setGain("drums", 0.0, c.secPerBar * 2);
  const rest = Math.max(0, c.bars - 6);
  await bars(c, rest);
}

/** 6. Drop Switch — build with tease, then explode on the drop. */
async function dropSwitch(c: RecipeCtx) {
  silenceIncoming(c);
  // PHASE A (1 bar): TEASE single incoming element to flag the next track.
  await teaseStem(c, c.teaserStem ?? "vocals", { peak: 0.8, hold: c.secPerBar * 0.6 });

  // PHASE B (2 bars): incoming hi-hats / melody sneak in, outgoing strips back.
  if (c.waitForBeat) await c.waitForBeat();
  c.toStems.setGain("other", 0.55, c.secPerBar);
  c.fromStems.setGain("vocals", 0.3, c.secPerBar);
  c.fromStems.setGain("other", 0.4, c.secPerBar);
  await bars(c, 2);

  // PHASE C (2 bars): RISER — kill outgoing bass, leave drums + melody hint.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("bass", 0.0, c.secPerBar * 0.7);
  c.fromStems.setGain("vocals", 0.0, c.secPerBar * 0.5);
  c.toStems.setGain("drums", 0.3, c.secPerBar); // hint at incoming kit
  await bars(c, 1);
  // Final hush before drop: cut almost everything for half a bar.
  c.fromStems.setGain("drums", 0.15, c.secPerBar * 0.4);
  c.fromStems.setGain("other", 0.0, c.secPerBar * 0.4);
  c.toStems.setGain("drums", 0.0, c.secPerBar * 0.4);
  c.toStems.setGain("other", 0.0, c.secPerBar * 0.4);
  await bars(c, 1);

  // PHASE D: DROP — bass + drums slam in simultaneously on the downbeat.
  if (c.waitForBeat) await c.waitForBeat();
  c.fromStems.setGain("drums", 0.0, 0.04);
  c.fromStems.setGain("bass", 0.0, 0.04);
  c.fromStems.setGain("other", 0.0, 0.1);
  c.fromStems.setGain("vocals", 0.0, 0.04);
  c.toStems.setGain("drums", 1.0, 0.04);
  c.toStems.setGain("bass", 1.0, 0.04);

  // PHASE E: melody + vocals open behind the drop.
  c.toStems.setGain("other", 1.0, c.secPerBar);
  c.toStems.setGain("vocals", 1.0, c.secPerBar);
  const rest = Math.max(0, c.bars - 6);
  await bars(c, rest);
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