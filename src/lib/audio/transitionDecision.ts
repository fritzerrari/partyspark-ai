import type { EngineTrack } from "./engine";
import { camelotCompatible } from "./analyze";
import { CLEAN_RECIPES, type CleanRecipeId } from "./cleanDjTransitions";
import type { RecipeId } from "./transitionRecipes";
import type { StemId } from "./stemSplit";
import { scoreSixFactor, type SixFactorBreakdown } from "./sixFactorScore";

type StemMode = "pseudo" | "loading" | "real";

export type TransitionDecision = {
  engine: "real" | "clean";
  recipe: RecipeId | CleanRecipeId;
  recipeLabel: string;
  score: number;
  bars: number;
  teaserStem: StemId;
  aggression: "smooth" | "performance" | "emergency";
  syncRate: number;
  syncAllowed: boolean;
  bpmDeltaPct: number;
  keyCompatible: boolean;
  vocalClash: boolean;
  reasons: string[];
  /** Per-factor breakdown driving the score (UI HUD). */
  breakdown?: SixFactorBreakdown;
};

function hasVocals(track: EngineTrack | null | undefined): boolean {
  return !!track?.vocalMap?.some((v) => v.voiced > 0.58);
}

function energyOf(track: EngineTrack | null | undefined): number {
  const e = track?.energy ?? 0.5;
  return e > 1 ? e / 100 : e;
}

function tempoSyncRate(fromBpm: number, toBpm: number): number {
  const candidates = [toBpm, toBpm * 2, toBpm / 2].filter((v) => v > 0);
  const best = candidates.reduce((winner, candidate) => {
    const cur = Math.abs(candidate - fromBpm);
    const prev = Math.abs(winner - fromBpm);
    return cur < prev ? candidate : winner;
  }, toBpm);
  return fromBpm / best;
}

function labelFor(engine: "real" | "clean", recipe: RecipeId | CleanRecipeId): string {
  return engine === "clean"
    ? CLEAN_RECIPES.find((r) => r.id === recipe)?.label ?? recipe
    : recipe;
}

export function decideTransition(opts: {
  fromTrack: EngineTrack | null;
  toTrack: EngineTrack | null;
  fromMode: StemMode;
  toMode: StemMode;
}): TransitionDecision {
  const { fromTrack, toTrack, fromMode, toMode } = opts;
  const fromBpm = fromTrack?.bpm ?? 0;
  const toBpm = toTrack?.bpm ?? 0;
  const bpmDeltaPct = fromBpm && toBpm ? Math.abs(fromBpm - toBpm) / fromBpm : 0;
  const keyCompatible = fromTrack && toTrack
    ? camelotCompatible(fromTrack.camelot ?? "", toTrack.camelot ?? "")
    : false;
  const fromHasVocals = hasVocals(fromTrack);
  const toHasVocals = hasVocals(toTrack);
  const vocalClash = fromHasVocals && toHasVocals;
  const energyJump = energyOf(toTrack) - energyOf(fromTrack);
  const realStemsAvailable = fromMode === "real" && toMode === "real";

  // Tempo sync: glide the incoming deck up to the outgoing master tempo for
  // the duration of the crossfade, then drift slowly back to its original
  // rate afterwards. Clamp ±6 % so we don't audibly mangle the audio; outside
  // that window we fall back to a pure EQ/echo swap with no rate change.
  const rawRate = fromBpm && toBpm ? tempoSyncRate(fromBpm, toBpm) : 1;
  const syncAllowed = Math.abs(rawRate - 1) <= 0.06;
  const syncRate = syncAllowed ? Math.max(0.94, Math.min(1.06, rawRate)) : 1;

  const reasons: string[] = [];
  if (!syncAllowed && Math.abs(rawRate - 1) > 0.06) reasons.push("BPM-Spreizung zu groß, kein Stretch");
  else if (syncAllowed && Math.abs(syncRate - 1) > 0.002) reasons.push(`Sync ×${syncRate.toFixed(3)} mit Rück-Glide`);
  else reasons.push("BPM bereits matched");
  if (vocalClash) reasons.push("Vocal-Clash erkannt");
  if (keyCompatible) reasons.push("Tonarten kompatibel");
  else if (fromTrack && toTrack) reasons.push("Tonarten riskant");
  if (Math.abs(energyJump) > 0.15) reasons.push(energyJump > 0 ? "Energie steigt" : "Energie fällt");
  if (realStemsAvailable) reasons.push("Stems bleiben bewusst unberührt");
  reasons.push("stabiler Clean-Blend");

  const aggression: TransitionDecision["aggression"] =
    bpmDeltaPct > 0.1 || (!keyCompatible && bpmDeltaPct > 0.04) ? "emergency"
    : vocalClash || Math.abs(energyJump) > 0.18 ? "performance"
    : "smooth";
  const bars = aggression === "emergency" ? 8 : 12;
  const teaserStem: StemId = vocalClash ? "drums" : toHasVocals ? "vocals" : energyJump > 0.15 ? "drums" : "other";
  const recipe: CleanRecipeId = (bpmDeltaPct > 0.12 || (!keyCompatible && bpmDeltaPct > 0.06) || vocalClash)
    ? "echoOut"
    : "djEqSwap";

  const breakdown = scoreSixFactor({
    fromTrack, toTrack, fromMode, toMode, recipe,
    bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, energyJump,
  });
  return { engine: "clean", recipe, recipeLabel: labelFor("clean", recipe), score: breakdown.total, bars, teaserStem, aggression, syncRate, syncAllowed, bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, reasons, breakdown };
}