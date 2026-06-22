// Pure scorer for a stem-based transition. Used by the Smart Mix button
// (to auto-pick a recipe) and by the UI quality panel.
import type { EngineTrack } from "./engine";
import { camelotCompatible } from "./analyze";
import type { RecipeId } from "./transitionRecipes";
import { pickRecipe } from "./transitionRecipes";

export type TransitionQuality = {
  /** 0..100 overall mix-quality score. */
  score: number;
  bpmScore: number;       // 0..100
  keyScore: number;       // 0..100
  energyScore: number;    // 0..100
  vocalConflict: number;  // 0..100 (lower = more risk)
  bpmDeltaPct: number;    // |from-to|/from after pitch
  bpmDelta: number;       // absolute BPM diff (post-pitch)
  keyCompatible: boolean;
  warnings: string[];
  recommendedRecipe: RecipeId;
  /** "real" if BOTH decks have real stems; "hybrid" if one; else "pseudo". */
  mode: "real" | "hybrid" | "pseudo";
};

function hasVocals(t: EngineTrack | null | undefined): boolean {
  return !!t?.vocalMap?.some((v) => v.voiced > 0.6);
}

export function scoreTransition(opts: {
  fromTrack: EngineTrack | null;
  toTrack: EngineTrack | null;
  fromRate: number;
  toRate: number;
  fromMode: "pseudo" | "loading" | "real";
  toMode: "pseudo" | "loading" | "real";
}): TransitionQuality {
  const { fromTrack, toTrack, fromRate, toRate, fromMode, toMode } = opts;
  const warnings: string[] = [];

  const fb = (fromTrack?.bpm ?? 0) * (fromRate || 1);
  const tb = (toTrack?.bpm ?? 0) * (toRate || 1);
  const bpmDelta = fb && tb ? +Math.abs(fb - tb).toFixed(2) : 0;
  const bpmDeltaPct = fb && tb ? Math.abs(fb - tb) / fb : 0;

  // BPM score: 100 at 0%, 0 at 12% delta.
  const bpmScore = Math.max(0, Math.round(100 - (bpmDeltaPct / 0.12) * 100));
  if (bpmDeltaPct > 0.08) {
    warnings.push(
      `BPM-Differenz ${bpmDelta.toFixed(1)} (${(bpmDeltaPct * 100).toFixed(1)}%) — Drum Bridge nutzen oder Pitch anpassen.`,
    );
  }

  const keyCompatible = fromTrack && toTrack
    ? camelotCompatible(fromTrack.camelot ?? "", toTrack.camelot ?? "")
    : false;
  const keyScore = keyCompatible ? 100 : 40;
  if (fromTrack && toTrack && !keyCompatible) {
    warnings.push(
      `Tonart ${fromTrack.camelot ?? "?"} → ${toTrack.camelot ?? "?"} nicht Camelot-kompatibel — Acapella Intro oder Drum Bridge.`,
    );
  }

  const fromE = fromTrack?.energy ?? 0.5;
  const toE = toTrack?.energy ?? 0.5;
  const energyJump = toE - fromE;
  const energyScore = Math.max(0, Math.round(100 - Math.abs(energyJump) * 80));

  const fromVoc = hasVocals(fromTrack);
  const toVoc = hasVocals(toTrack);
  const vocalConflict = fromVoc && toVoc ? 50 : 100;
  if (fromVoc && toVoc) warnings.push("Beide Tracks haben Vocals — Engine duckt Outgoing-Vox automatisch.");

  const mode: TransitionQuality["mode"] =
    fromMode === "real" && toMode === "real" ? "real"
    : fromMode === "real" || toMode === "real" ? "hybrid"
    : "pseudo";

  // Pseudo mode caps the achievable score so the UI never lies about quality.
  const modeCap = mode === "real" ? 1 : mode === "hybrid" ? 0.85 : 0.7;

  const score = Math.round(
    (bpmScore * 0.35 + keyScore * 0.3 + energyScore * 0.15 + vocalConflict * 0.2) * modeCap,
  );

  const recommendedRecipe = pickRecipe({
    bpmDeltaPct,
    keyCompatible,
    fromHasVocals: fromVoc,
    toHasVocals: toVoc,
    energyJump,
  });

  return {
    score, bpmScore, keyScore, energyScore, vocalConflict,
    bpmDeltaPct, bpmDelta, keyCompatible, warnings, recommendedRecipe, mode,
  };
}