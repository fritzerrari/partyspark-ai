// Transition Planner — converts two TrackProfile + a MixabilityReport into a
// deterministic, AudioContext-time-relative TransitionPlan (JSON).
// Execution layer reads the plan and schedules AudioParam ramps. No audio
// side effects happen here.

import type {
  TrackProfile, TransitionPlan, TransitionType, TransitionEvent,
  MixabilityReport, DeckSide,
} from "./types";
import { computeMixability, tempoRatio } from "./mixability";

export interface PlannerInput {
  from: TrackProfile;
  to: TrackProfile;
  fromDeck: DeckSide;       // usually "A"
  toDeck: DeckSide;         // usually "B"
  /** AudioContext.currentTime when execution will start. */
  startAtCtxTime: number;
  /** Force a specific transition type (manual mix buttons). */
  forceType?: TransitionType;
  /** Override bar count (default chosen by planner). */
  bars?: number;
}

const TYPE_ID = () => `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Pick the best transition type from the mixability report. */
export function pickTransitionType(rep: MixabilityReport, from: TrackProfile, to: TrackProfile): TransitionType {
  const fromVocals = from.vocalMap.some((v) => v.voiced > 0.55);
  const toVocals = to.vocalMap.some((v) => v.voiced > 0.55);

  // Hard incompatibilities → short, surgical moves.
  if (rep.bpm.needsTempoShiftPct > 8 || rep.key.relation === "clash") {
    return rep.energy.direction === "up" ? "dropSwitch" : "echoExit";
  }
  // Big vocal collision risk → strip vocals on outgoing.
  if (rep.vocalClash.overlapSeconds > 4 && rep.stems.both) return "vocalOut";
  if (rep.vocalClash.overlapSeconds > 4) return "echoExit";

  // Energy jumps up → build with bass swap on phrase grid.
  if (rep.energy.direction === "up" && rep.energy.delta > 0.15) return "energyRamp";

  // Both have strong drums + good BPM match → drum bridge feels musical.
  if (rep.bpm.needsTempoShiftPct < 2 && rep.stems.both) return "drumBridge";

  // Incoming starts with acapella-ish intro (low energy + voiced).
  if (toVocals && (to.cues.introEnd ?? 0) > 8 && rep.stems.both) return "acapellaIntro";

  // Default smooth blend.
  return rep.stems.both ? "bassSwap" : "instrumentalBed";
}

/** Bar count heuristic from the score (better score → longer blend). */
function pickBars(rep: MixabilityReport, type: TransitionType): number {
  if (type === "dropSwitch") return 1;
  if (type === "echoExit") return 4;
  if (type === "acapellaIntro") return 8;
  if (rep.overall >= 80) return 32;
  if (rep.overall >= 65) return 16;
  if (rep.overall >= 45) return 12;
  return 8;
}

function secPerBar(bpm: number): number {
  return bpm > 0 ? (60 / bpm) * 4 : 2;
}

/** Build the event list for a given transition type. All event times are
 *  relative to plan.startAtCtxTime (0 = start). */
function buildEvents(type: TransitionType, ctx: {
  fromDeck: DeckSide; toDeck: DeckSide;
  bars: number; spb: number; rate: number;
  hasStems: boolean;
  fromUserVol: number; toUserVol: number;
}): TransitionEvent[] {
  const { fromDeck, toDeck, bars, spb, rate, hasStems, fromUserVol, toUserVol } = ctx;
  const dur = bars * spb;
  const e: TransitionEvent[] = [];

  // Always: cue + tempo sync on incoming, start playback.
  e.push({ t: 0, kind: "tempo", deck: toDeck, rate });
  e.push({ t: 0, kind: "cut", deck: toDeck, action: "play" });
  e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: 0, ramp: "lin" });
  e.push({ t: 0, kind: "gain", target: "deck", deck: fromDeck, to: fromUserVol, ramp: "lin" });

  const half = dur / 2;

  switch (type) {
    case "bassSwap": {
      // 0..1/4: open incoming highs+mids, kill incoming lows.
      e.push({ t: 0, kind: "eq", deck: toDeck, band: "low", gainDb: -24 });
      e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      // mid: swap bass on a phrase boundary
      e.push({ t: half, kind: "eq", deck: fromDeck, band: "low", gainDb: -24 });
      e.push({ t: half, kind: "eq", deck: toDeck, band: "low", gainDb: 0 });
      // tail: fade outgoing
      e.push({ t: dur - spb * 2, kind: "eq", deck: fromDeck, band: "high", gainDb: -12 });
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "vocalOut": {
      if (hasStems) {
        // Pull outgoing vocals first, then full crossfade.
        e.push({ t: 0, kind: "gain", target: "stem", deck: fromDeck, stem: "vocals", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      } else {
        e.push({ t: 0, kind: "eq", deck: fromDeck, band: "mid", gainDb: -10 });
        e.push({ t: half, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      }
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "drumBridge": {
      if (hasStems) {
        e.push({ t: 0, kind: "gain", target: "stem", deck: fromDeck, stem: "bass", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: fromDeck, stem: "other", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: fromDeck, stem: "vocals", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "drums", to: 1, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "bass", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "other", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "vocals", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
        // reveal incoming
        e.push({ t: half, kind: "gain", target: "stem", deck: toDeck, stem: "bass", to: 1, ramp: "lin" });
        e.push({ t: half + spb * 2, kind: "gain", target: "stem", deck: toDeck, stem: "other", to: 1, ramp: "lin" });
        e.push({ t: dur - spb, kind: "gain", target: "stem", deck: toDeck, stem: "vocals", to: 1, ramp: "lin" });
      } else {
        e.push({ t: 0, kind: "eq", deck: fromDeck, band: "mid", gainDb: -8 });
        e.push({ t: 0, kind: "eq", deck: fromDeck, band: "low", gainDb: -6 });
        e.push({ t: half, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      }
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "instrumentalBed": {
      e.push({ t: 0, kind: "filter", deck: toDeck, filterType: "highpass", freq: 200, ramp: "exp" });
      e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol * 0.7, ramp: "lin" });
      e.push({ t: half, kind: "filter", deck: toDeck, filterType: "off", freq: 20, ramp: "exp" });
      e.push({ t: half, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "echoExit": {
      e.push({ t: 0, kind: "fx", deck: fromDeck, fx: "echoTail", amount: 0.6 });
      e.push({ t: spb, kind: "filter", deck: fromDeck, filterType: "lowpass", freq: 800, ramp: "exp" });
      e.push({ t: spb * 2, kind: "filter", deck: fromDeck, filterType: "lowpass", freq: 200, ramp: "exp" });
      e.push({ t: spb * 3, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: spb * 3, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "dropSwitch": {
      e.push({ t: 0, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      e.push({ t: 0, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "acapellaIntro": {
      if (hasStems) {
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "drums", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "bass", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "other", to: 0, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "stem", deck: toDeck, stem: "vocals", to: 1, ramp: "lin" });
        e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
        e.push({ t: half, kind: "gain", target: "stem", deck: toDeck, stem: "drums", to: 1, ramp: "lin" });
        e.push({ t: dur - spb, kind: "gain", target: "stem", deck: toDeck, stem: "bass", to: 1, ramp: "lin" });
        e.push({ t: dur - spb, kind: "gain", target: "stem", deck: toDeck, stem: "other", to: 1, ramp: "lin" });
      } else {
        e.push({ t: 0, kind: "filter", deck: toDeck, filterType: "highpass", freq: 400, ramp: "exp" });
        e.push({ t: half, kind: "filter", deck: toDeck, filterType: "off", freq: 20, ramp: "exp" });
      }
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
    case "energyRamp": {
      e.push({ t: 0, kind: "filter", deck: toDeck, filterType: "lowpass", freq: 500, ramp: "exp" });
      e.push({ t: 0, kind: "gain", target: "deck", deck: toDeck, to: toUserVol, ramp: "lin" });
      e.push({ t: half, kind: "filter", deck: toDeck, filterType: "lowpass", freq: 5000, ramp: "exp" });
      e.push({ t: dur - spb, kind: "filter", deck: toDeck, filterType: "off", freq: 20, ramp: "exp" });
      e.push({ t: dur - spb, kind: "eq", deck: fromDeck, band: "high", gainDb: -12 });
      e.push({ t: dur, kind: "gain", target: "deck", deck: fromDeck, to: 0, ramp: "lin" });
      e.push({ t: dur, kind: "cut", deck: fromDeck, action: "pause" });
      break;
    }
  }
  return e;
}

function rationaleFor(type: TransitionType, rep: MixabilityReport, bars: number): string {
  const parts: string[] = [];
  parts.push(`${type} · ${bars} bars · score ${rep.overall}`);
  if (rep.bpm.needsTempoShiftPct > 0.5) parts.push(`tempo ${rep.bpm.needsTempoShiftPct.toFixed(1)}%`);
  parts.push(`key ${rep.key.relation}`);
  if (rep.vocalClash.overlapSeconds > 1) parts.push(`vocal-clash ${rep.vocalClash.overlapSeconds}s`);
  if (!rep.stems.both) parts.push("clean-dj fallback");
  return parts.join(" · ");
}

/** Generate a deterministic transition plan. */
export function planTransition(input: PlannerInput, userVols: { from: number; to: number } = { from: 1, to: 1 }): {
  plan: TransitionPlan; report: MixabilityReport;
} {
  const { from, to, fromDeck, toDeck, startAtCtxTime, forceType } = input;
  const report = computeMixability(from, to);
  const type = forceType ?? pickTransitionType(report, from, to);
  const bars = input.bars ?? pickBars(report, type);
  const rate = tempoRatio(from.bpm, to.bpm);
  const spb = secPerBar(from.bpm || to.bpm || 120);
  const dur = bars * spb;

  const events = buildEvents(type, {
    fromDeck, toDeck, bars, spb, rate,
    hasStems: report.stems.both,
    fromUserVol: userVols.from, toUserVol: userVols.to,
  });

  const plan: TransitionPlan = {
    id: TYPE_ID(),
    type,
    fromTrackId: from.id,
    toTrackId: to.id,
    startAtCtxTime,
    durationSec: dur,
    bars,
    tempoGlide: rate !== 1 ? { fromBpm: from.bpm, toBpm: to.bpm, bars: Math.min(4, bars) } : undefined,
    keyShiftSemitones: Math.round(12 * Math.log2(rate)),
    fallbackUsed: !report.stems.both,
    qualityScore: report.overall,
    events: events.sort((a, b) => a.t - b.t),
    rationale: rationaleFor(type, report, bars),
  };
  return { plan, report };
}
