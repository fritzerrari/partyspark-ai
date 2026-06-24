// Continuous phase-lock controller — Web Audio analogue of Mixxx
// bpmcontrol.cpp:calcSyncAdjustment(). Runs a 30 Hz loop that measures the
// drift between two decks' beat grids and nudges the follower's playbackRate
// by a clamped ±5 % to keep both phases aligned over a long blend.
import { beatDriftMs } from "./proTransition";

export type PhaseLockHandle = {
  stop: () => void;
  /** Latest measured drift in ms (B − A). Read by HUD components. */
  getDrift: () => number;
  /** Latest applied rate correction factor (1.0 = no change). */
  getRate: () => number;
};

export type PhaseLockOpts = {
  /** Leader deck (its grid + position). */
  leader: {
    grid: number[] | null | undefined;
    getPosition: () => number;
    getRate: () => number;
  };
  /** Follower deck — playbackRate is mutated. */
  follower: {
    grid: number[] | null | undefined;
    getPosition: () => number;
    getRate: () => number;
    /** Apply a new rate to the follower (will be clamped). */
    setRate: (r: number) => void;
  };
  /** Proportional gain. Mixxx uses 0.7; we default lower for HTML-audio jitter. */
  kP?: number;
  /** Max absolute rate adjustment per tick (±). */
  maxAdjust?: number;
  /** Train-wreck guard — bail out if drift exceeds this. */
  trainWreckMs?: number;
  /** If true, only measure drift, never apply rate correction. */
  measureOnly?: boolean;
  /** Polling interval in ms. */
  intervalMs?: number;
};

/** Start the lock. Caller MUST invoke handle.stop() when the transition ends. */
export function startPhaseLock(opts: PhaseLockOpts): PhaseLockHandle {
  const {
    leader,
    follower,
    kP = 0.4,
    maxAdjust = 0.05,
    trainWreckMs = 200,
    measureOnly = false,
    intervalMs = 33,
  } = opts;

  let drift = 0;
  let appliedRate = follower.getRate();
  const baseRate = appliedRate;
  let killed = false;

  const tick = () => {
    if (killed) return;
    drift = beatDriftMs(
      leader.grid,
      leader.getPosition(),
      leader.getRate(),
      follower.grid,
      follower.getPosition(),
      follower.getRate(),
    );
    if (Math.abs(drift) > trainWreckMs) {
      // Bail out — bigger problem than a P-controller can fix.
      killed = true;
      return;
    }
    if (!measureOnly) {
      // Negative drift = follower lags → speed up. Positive = leads → slow down.
      const driftSec = drift / 1000;
      const beatLen = 0.5; // ~120 BPM reference; sign matters, not magnitude
      const err = driftSec / beatLen;
      const adjust = Math.max(-maxAdjust, Math.min(maxAdjust, -err * kP));
      const target = baseRate * (1 + adjust);
      // Damping: blend toward target to avoid audible rate jumps.
      appliedRate = appliedRate * 0.85 + target * 0.15;
      follower.setRate(appliedRate);
    }
  };

  const handle = window.setInterval(tick, intervalMs);
  return {
    stop: () => {
      killed = true;
      clearInterval(handle);
    },
    getDrift: () => drift,
    getRate: () => appliedRate,
  };
}

// Global registry — only one active lock at a time (per pair of decks).
let activeLock: PhaseLockHandle | null = null;
let liveDriftMs = 0;
const listeners = new Set<(ms: number) => void>();

export function publishLiveDrift(ms: number) {
  liveDriftMs = ms;
  for (const l of listeners) l(ms);
}

export function getLiveDrift(): number {
  return liveDriftMs;
}

export function subscribeLiveDrift(fn: (ms: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function registerActiveLock(h: PhaseLockHandle | null) {
  if (activeLock && activeLock !== h) activeLock.stop();
  activeLock = h;
}

export function stopActiveLock() {
  if (activeLock) {
    activeLock.stop();
    activeLock = null;
  }
}