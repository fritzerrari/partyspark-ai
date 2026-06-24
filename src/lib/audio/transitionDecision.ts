import type { EngineTrack } from "./engine";
import { camelotCompatible } from "./analyze";
import { CLEAN_RECIPES, pickCleanRecipe, type CleanRecipeId } from "./cleanDjTransitions";
import { RECIPES, pickRecipe, type RecipeId } from "./transitionRecipes";
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
  return engine === "real"
    ? RECIPES.find((r) => r.id === recipe)?.label ?? recipe
    : CLEAN_RECIPES.find((r) => r.id === recipe)?.label ?? recipe;
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
  const bothReal = fromMode === "real" && toMode === "real";

  // Do not stretch songs aggressively. Professional Auto-DJ only nudges tempo
  // when the match is already close; otherwise it uses cut/echo/bridge recipes.
  const rawRate = fromBpm && toBpm ? tempoSyncRate(fromBpm, toBpm) : 1;
  // Real-stem playback uses separate AudioBufferSource nodes; changing their
  // playbackRate would also change pitch. So stem recipes never tempo-stretch.
  const syncAllowed = toMode !== "real" && Math.abs(rawRate - 1) <= 0.025;
  const syncRate = syncAllowed ? Math.max(0.975, Math.min(1.025, rawRate)) : 1;

  const reasons: string[] = [];
  if (!syncAllowed && bpmDeltaPct > 0.025) reasons.push("kein aggressives Tempo-Stretching");
  if (vocalClash) reasons.push("Vocal-Clash erkannt");
  if (keyCompatible) reasons.push("Tonarten kompatibel");
  else if (fromTrack && toTrack) reasons.push("Tonarten riskant");
  if (Math.abs(energyJump) > 0.15) reasons.push(energyJump > 0 ? "Energie steigt" : "Energie fällt");
  reasons.push(bothReal ? "echte Stems aktiv" : "Clean-DJ auf Originalsignal");

  const aggression: TransitionDecision["aggression"] =
    bpmDeltaPct > 0.1 || (!keyCompatible && bpmDeltaPct > 0.04) ? "emergency"
    : vocalClash || Math.abs(energyJump) > 0.18 ? "performance"
    : "smooth";
  const bars = aggression === "emergency" ? 8 : aggression === "performance" ? 12 : 16;
  const teaserStem: StemId = vocalClash ? "drums" : toHasVocals ? "vocals" : energyJump > 0.15 ? "drums" : "other";

  if (bothReal) {
    let recipe = pickRecipe({ bpmDeltaPct, keyCompatible, fromHasVocals, toHasVocals, energyJump });
    if (bpmDeltaPct > 0.12 || (!keyCompatible && bpmDeltaPct > 0.06)) recipe = "dropSwitch";
    else if (vocalClash) recipe = "vocalOutDrumsIn";
    else if (keyCompatible && bpmDeltaPct <= 0.04) recipe = "bassSwap";
    else if (energyJump > 0.2) recipe = "dropSwitch";
    else if (!keyCompatible || bpmDeltaPct > 0.06) recipe = "drumBridge";

    const breakdown = scoreSixFactor({
      fromTrack, toTrack, fromMode, toMode, recipe,
      bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, energyJump,
    });
    return { engine: "real", recipe, recipeLabel: labelFor("real", recipe), score: breakdown.total, bars, teaserStem, aggression, syncRate, syncAllowed, bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, reasons, breakdown };
  }

  let recipe = pickCleanRecipe({ bpmDeltaPct, keyCompatible: !!keyCompatible, fromHasVocals, toHasVocals, energyJump });
  if (bpmDeltaPct > 0.12) recipe = energyJump > 0.1 ? "dropCut" : "echoOut";
  else if (vocalClash) recipe = "echoOut";
  else if (!keyCompatible || bpmDeltaPct > 0.07) recipe = "filterBuild";
  else if (energyJump > 0.18) recipe = "hookTease";

  const breakdown = scoreSixFactor({
    fromTrack, toTrack, fromMode, toMode, recipe,
    bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, energyJump,
  });
  return { engine: "clean", recipe, recipeLabel: labelFor("clean", recipe), score: breakdown.total, bars, teaserStem, aggression, syncRate, syncAllowed, bpmDeltaPct, keyCompatible: !!keyCompatible, vocalClash, reasons, breakdown };
}