// 6-Faktor Transition-Scorer — inspired by kckDeepak/AI-DJ-Mixing-System
// and Chunduri-Aditya/ai-remixmate. Replaces the older 4-weight composite
// in transitionDecision.ts with a transparent breakdown so the UI can show
// WHY a transition scored X.

import type { EngineTrack } from "./engine";
import { camelotCompatible } from "./analyze";

export type SixFactorBreakdown = {
  bpm: number;        // 0..100
  key: number;        // 0..100 (directional Camelot)
  vocals: number;     // 0..100 (clash penalty)
  energy: number;     // 0..100 (directional preference)
  stems: number;      // 0..100 (real > pseudo)
  typeBonus: number;  // 0..100 (recipe×context fit)
  total: number;      // 0..100 (weighted)
};

const WEIGHTS = {
  bpm: 0.22,
  key: 0.18,
  vocals: 0.18,
  energy: 0.14,
  stems: 0.12,
  typeBonus: 0.16,
};

type StemMode = "pseudo" | "loading" | "real";

/** Energy in 0..1 regardless of source field convention. */
function energy01(track: EngineTrack | null | undefined): number {
  const e = track?.energy ?? 0.5;
  return e > 1 ? e / 100 : e;
}

/** Directional Camelot proximity: same key = 100, +1 perfect-fifth lift = 95,
 *  relative maj/min = 92, ±2 = 70, opposite = 15. Penalises drops more than
 *  lifts (downward energy is harder to sell). */
function camelotScore(a?: string | null, b?: string | null, energyDelta = 0): number {
  if (!a || !b) return 60;
  if (a === b) return 100;
  const na = parseInt(a, 10), la = a.slice(-1).toUpperCase();
  const nb = parseInt(b, 10), lb = b.slice(-1).toUpperCase();
  if (Number.isNaN(na) || Number.isNaN(nb)) return camelotCompatible(a, b) ? 80 : 35;
  const raw = Math.abs(na - nb);
  const wheel = Math.min(raw, 12 - raw);
  // Same letter (both maj or both min)
  if (la === lb) {
    if (wheel === 0) return 100;
    if (wheel === 1) {
      // +1 = perfect fifth up (energy lift) → great; −1 = fourth down (drop)
      const signedUp = (nb - na + 12) % 12 === 1;
      return signedUp ? 96 : (energyDelta >= 0 ? 88 : 78);
    }
    if (wheel === 2) return 70;
    return Math.max(15, 60 - wheel * 6);
  }
  // Different letter — relative maj/min swap only smooth when on same number.
  if (na === nb) return 92;
  return Math.max(15, 55 - wheel * 5);
}

/** Recipe×context bonus. Some recipes only shine when the data matches them. */
function typeBonusScore(recipe: string, ctx: {
  bpmDeltaPct: number;
  keyCompatible: boolean;
  vocalClash: boolean;
  energyJump: number;
  bothReal: boolean;
}): number {
  let s = 70;
  if (recipe === "bassSwap" && ctx.keyCompatible && ctx.bpmDeltaPct <= 0.04) s = 100;
  else if (recipe === "vocalOutDrumsIn" && ctx.vocalClash) s = 95;
  else if (recipe === "dropSwitch" && ctx.energyJump > 0.18) s = 92;
  else if (recipe === "drumBridge" && (!ctx.keyCompatible || ctx.bpmDeltaPct > 0.05)) s = 88;
  else if (recipe === "echoOut" && (ctx.vocalClash || ctx.bpmDeltaPct > 0.08)) s = 90;
  else if (recipe === "filterBuild" && !ctx.keyCompatible) s = 85;
  else if (recipe === "hookTease" && ctx.energyJump > 0.15) s = 86;
  else if (recipe === "dropCut" && ctx.bpmDeltaPct > 0.1) s = 84;
  // Penalty if the recipe needs stems we don't have.
  if (!ctx.bothReal && (recipe === "bassSwap" || recipe === "vocalOutDrumsIn" || recipe === "dropSwitch")) {
    s -= 18;
  }
  return Math.max(0, Math.min(100, s));
}

/** Energy direction preference: +3..+15% is the sweet spot (lift); flat
 *  is fine; large drops or sudden spikes get penalised. */
function energyScore(delta: number): number {
  const abs = Math.abs(delta);
  if (delta > 0.03 && delta < 0.18) return 100;           // gentle lift
  if (delta >= -0.03 && delta <= 0.03) return 90;          // hold
  if (delta < 0) return Math.max(40, 90 - abs * 220);      // drops harder
  return Math.max(50, 100 - (abs - 0.18) * 180);           // spike penalty
}

function bpmScore(bpmDeltaPct: number): number {
  // 0% → 100, 3% → 90, 6% → 70, 10% → 40, >12% → 10
  if (bpmDeltaPct <= 0.005) return 100;
  if (bpmDeltaPct <= 0.03) return 100 - (bpmDeltaPct - 0.005) * 400;
  if (bpmDeltaPct <= 0.06) return 90 - (bpmDeltaPct - 0.03) * 666;
  if (bpmDeltaPct <= 0.1) return 70 - (bpmDeltaPct - 0.06) * 750;
  return Math.max(10, 40 - (bpmDeltaPct - 0.1) * 200);
}

function vocalsScore(vocalClash: boolean, recipe: string): number {
  if (!vocalClash) return 100;
  // Recipes that intentionally mute one vocal layer survive a clash.
  if (recipe === "vocalOutDrumsIn" || recipe === "echoOut" || recipe === "drumBridge") return 78;
  return 45;
}

function stemsScore(fromMode: StemMode, toMode: StemMode): number {
  if (fromMode === "real" && toMode === "real") return 100;
  if (fromMode === "real" || toMode === "real") return 78;
  return 55;
}

/** Compute a transparent 6-factor score for a chosen recipe + track pair. */
export function scoreSixFactor(opts: {
  fromTrack: EngineTrack | null;
  toTrack: EngineTrack | null;
  fromMode: StemMode;
  toMode: StemMode;
  recipe: string;
  bpmDeltaPct: number;
  keyCompatible: boolean;
  vocalClash: boolean;
  energyJump: number;
}): SixFactorBreakdown {
  const bpm = bpmScore(opts.bpmDeltaPct);
  const key = camelotScore(opts.fromTrack?.camelot, opts.toTrack?.camelot, opts.energyJump);
  const vocals = vocalsScore(opts.vocalClash, opts.recipe);
  const eng = energyScore(opts.energyJump);
  const stems = stemsScore(opts.fromMode, opts.toMode);
  const bothReal = opts.fromMode === "real" && opts.toMode === "real";
  const typeBonus = typeBonusScore(opts.recipe, {
    bpmDeltaPct: opts.bpmDeltaPct,
    keyCompatible: opts.keyCompatible,
    vocalClash: opts.vocalClash,
    energyJump: opts.energyJump,
    bothReal,
  });
  const total = Math.round(
    bpm * WEIGHTS.bpm +
    key * WEIGHTS.key +
    vocals * WEIGHTS.vocals +
    eng * WEIGHTS.energy +
    stems * WEIGHTS.stems +
    typeBonus * WEIGHTS.typeBonus,
  );
  return {
    bpm: Math.round(bpm),
    key: Math.round(key),
    vocals: Math.round(vocals),
    energy: Math.round(eng),
    stems: Math.round(stems),
    typeBonus: Math.round(typeBonus),
    total: Math.max(0, Math.min(100, total)),
  };
}