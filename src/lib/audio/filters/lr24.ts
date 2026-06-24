// Linkwitz-Riley 24 dB/oct cross-over building blocks.
// A 24 dB LR filter = two cascaded 12 dB Butterworth biquads at the same Fc.
// Used in Mixxx (enginefilterlinkwitzriley.cpp) for clean bass-kill /
// bass-swap transitions — keeps phase coherent so the kicks don't smear.

export type LR24 = {
  input: BiquadFilterNode;
  output: BiquadFilterNode;
  setFrequency: (hz: number, atTime?: number, rampSec?: number) => void;
  dispose: () => void;
};

/** Build a 4th-order Linkwitz-Riley high-pass at `fc`.
 *  Use to surgically remove sub-bass below the cross-over point during a
 *  bass-swap, without the muddy 6 dB ringing of a single biquad. */
export function createLR24Highpass(ctx: AudioContext, fc = 90): LR24 {
  return cascade(ctx, "highpass", fc);
}

/** 4th-order Linkwitz-Riley low-pass. Symmetric counterpart of the highpass —
 *  feed the bass-only stem through this while the highpass owns the rest. */
export function createLR24Lowpass(ctx: AudioContext, fc = 90): LR24 {
  return cascade(ctx, "lowpass", fc);
}

function cascade(ctx: AudioContext, type: BiquadFilterType, fc: number): LR24 {
  const a = ctx.createBiquadFilter();
  const b = ctx.createBiquadFilter();
  for (const n of [a, b]) {
    n.type = type;
    n.frequency.value = fc;
    // Q = 1/sqrt(2) → Butterworth response; two in series → LR 24 dB.
    n.Q.value = Math.SQRT1_2;
  }
  a.connect(b);
  return {
    input: a,
    output: b,
    setFrequency(hz, atTime, rampSec) {
      const t = atTime ?? ctx.currentTime;
      const ramp = Math.max(0.001, rampSec ?? 0.05);
      for (const n of [a, b]) {
        n.frequency.cancelScheduledValues(t);
        n.frequency.setValueAtTime(n.frequency.value, t);
        n.frequency.exponentialRampToValueAtTime(Math.max(20, hz), t + ramp);
      }
    },
    dispose() {
      try { a.disconnect(); } catch { /* noop */ }
      try { b.disconnect(); } catch { /* noop */ }
    },
  };
}