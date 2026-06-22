// AI Music Intelligence — shared data model.
// All times are in seconds unless otherwise noted. AudioContext-relative
// times live in TransitionPlan.startAtCtxTime / TransitionEvent.t.

export type Stem = "vocals" | "drums" | "bass" | "other";

export type EnergyPoint = { t: number; e: number }; // 0..1
export type VocalPoint = { t: number; voiced: number }; // 0..1
export type PhraseMarker = { t: number; bar: number; kind?: "intro" | "verse" | "chorus" | "drop" | "breakdown" | "outro" };

export interface TrackCues {
  introEnd: number;
  firstDrop: number;
  outroStart: number;
  drops?: number[];        // additional drop timestamps
  breakdowns?: number[];   // breakdown timestamps
}

/** Canonical per-track profile, produced by the analysis layer. */
export interface TrackProfile {
  id: string;
  sourceUrl: string;
  durationSec: number;

  // Tempo & rhythm
  bpm: number;
  bpmConfidence: number;       // 0..1
  firstBeat: number;           // seconds
  beatGrid: number[];          // beat timestamps (downbeats every 4)
  phrases?: PhraseMarker[];    // 8/16/32-bar markers

  // Harmony
  musicalKey: string;          // e.g. "Am", "C", "F#m"
  camelot: string;             // e.g. "8A"

  // Structure
  cues: TrackCues;
  energyCurve: EnergyPoint[];  // per second 0..1, normalised
  vocalMap: VocalPoint[];      // per second 0..1
  overallEnergy: number;       // 0..1 mean

  // Stems
  stemsAvailable: boolean;
  stemUrls?: Partial<Record<Stem, string>>;

  updatedAt: string;           // ISO timestamp
}

// ───── Mixability ─────────────────────────────────────────────────────────

export type KeyRelation = "match" | "adjacent" | "relative" | "clash";

export interface MixabilityReport {
  overall: number;             // 0..100
  bpm: {
    ratio: number;             // effective rate applied to incoming
    needsTempoShiftPct: number; // |ratio-1| as percent
    score: number;             // 0..100
  };
  key: {
    camelotDelta: number;
    relation: KeyRelation;
    score: number;
  };
  energy: {
    delta: number;             // toTrack - fromTrack
    direction: "up" | "flat" | "down";
    score: number;
  };
  vocalClash: {
    overlapSeconds: number;
    score: number;
  };
  stems: {
    both: boolean;
    score: number;
  };
  warnings: string[];
}

// ───── Transition Plan ────────────────────────────────────────────────────

export type TransitionType =
  | "vocalOut"
  | "drumBridge"
  | "bassSwap"
  | "instrumentalBed"
  | "echoExit"
  | "dropSwitch"
  | "acapellaIntro"
  | "energyRamp";

export type DeckSide = "A" | "B";

export type TransitionEvent =
  | { t: number; kind: "gain"; target: "deck" | "stem"; deck: DeckSide; stem?: Stem; to: number; ramp: "lin" | "exp" }
  | { t: number; kind: "filter"; deck: DeckSide; filterType: "lowpass" | "highpass" | "off"; freq: number; ramp: "lin" | "exp" }
  | { t: number; kind: "eq"; deck: DeckSide; band: "low" | "mid" | "high"; gainDb: number }
  | { t: number; kind: "tempo"; deck: DeckSide; rate: number; ramp?: "lin" }
  | { t: number; kind: "cut"; deck: DeckSide; action: "play" | "pause" | "seek"; seekTo?: number }
  | { t: number; kind: "fx"; deck: DeckSide; fx: "echoTail" | "filterSweep"; amount?: number };

export interface TransitionPlan {
  id: string;
  type: TransitionType;
  fromTrackId: string;
  toTrackId: string;
  /** AudioContext.currentTime offset where execution starts. */
  startAtCtxTime: number;
  /** Total length of the transition window in seconds. */
  durationSec: number;
  /** Bars used (musical length), informational. */
  bars: number;
  tempoGlide?: { fromBpm: number; toBpm: number; bars: number };
  keyShiftSemitones?: number;
  /** Whether the plan was authored against pseudo (no real stems) mode. */
  fallbackUsed: boolean;
  /** Compatibility score from the mixability report, 0..100. */
  qualityScore: number;
  /** Sample-accurate, AudioContext-time-relative events. */
  events: TransitionEvent[];
  /** Human-readable summary for the UI. */
  rationale: string;
}

/** Auto-DJ result: ordered tracks plus prebuilt transition plans. */
export interface MixSet {
  tracks: TrackProfile[];
  plans: TransitionPlan[];
  meanScore: number;
  createdAt: string;
}
