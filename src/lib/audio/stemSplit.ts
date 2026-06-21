// Real-time "pseudo-stems" for a deck. We do NOT actually source-separate
// (true Demucs/Spleeter needs server-side compute and lands in Phase 2).
// Instead we feed the post-EQ signal through four parallel band-pass
// chains tuned to where each stem usually lives in the spectrum, plus a
// gentle transient pre-emphasis on the drum bus. Each output is a plain
// GainNode so the transition engine can ride them like real stems.

export type StemId = "drums" | "bass" | "vocals" | "other";

export type StemSplit = {
  input: AudioNode;            // connect deck signal here
  output: AudioNode;           // sum of all 4 stems, route to deck.gain
  gains: Record<StemId, GainNode>;
  /** Smoothly ride a stem. */
  setGain: (stem: StemId, value: number, sec?: number) => void;
  /** Reset to neutral (all stems = 1). */
  reset: () => void;
  dispose: () => void;
};

const STEM_DEFAULT: Record<StemId, number> = {
  drums: 1, bass: 1, vocals: 1, other: 1,
};

export function createStemSplit(ctx: AudioContext, source: AudioNode | null = null): StemSplit {
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (source) source.connect(input);

  // --- BASS bus: bandpass ~50–200 Hz
  const bassLow = ctx.createBiquadFilter();
  bassLow.type = "lowpass"; bassLow.frequency.value = 220; bassLow.Q.value = 0.7;
  const bassHi = ctx.createBiquadFilter();
  bassHi.type = "highpass"; bassHi.frequency.value = 35; bassHi.Q.value = 0.7;
  const bassGain = ctx.createGain(); bassGain.gain.value = STEM_DEFAULT.bass;
  input.connect(bassLow); bassLow.connect(bassHi); bassHi.connect(bassGain); bassGain.connect(output);

  // --- DRUMS bus: kick punch (lowpass ~120) + cymbals/snares (highpass > 4 kHz),
  // summed. Adds a tiny transient boost via a shelved peak ~8 kHz so hats pop.
  const drumKick = ctx.createBiquadFilter();
  drumKick.type = "bandpass"; drumKick.frequency.value = 80; drumKick.Q.value = 1.1;
  const drumHi = ctx.createBiquadFilter();
  drumHi.type = "highpass"; drumHi.frequency.value = 4200; drumHi.Q.value = 0.7;
  const drumPop = ctx.createBiquadFilter();
  drumPop.type = "peaking"; drumPop.frequency.value = 7500; drumPop.Q.value = 1.2; drumPop.gain.value = 4;
  const drumSum = ctx.createGain(); drumSum.gain.value = 1;
  input.connect(drumKick); drumKick.connect(drumSum);
  input.connect(drumHi); drumHi.connect(drumPop); drumPop.connect(drumSum);
  const drumsGain = ctx.createGain(); drumsGain.gain.value = STEM_DEFAULT.drums;
  drumSum.connect(drumsGain); drumsGain.connect(output);

  // --- VOCALS bus: presence band 250–3500 Hz with a mid lift (most lead vox sit here).
  const vocLow = ctx.createBiquadFilter();
  vocLow.type = "highpass"; vocLow.frequency.value = 250; vocLow.Q.value = 0.5;
  const vocHi = ctx.createBiquadFilter();
  vocHi.type = "lowpass"; vocHi.frequency.value = 3500; vocHi.Q.value = 0.5;
  const vocPresence = ctx.createBiquadFilter();
  vocPresence.type = "peaking"; vocPresence.frequency.value = 2200; vocPresence.Q.value = 1.0; vocPresence.gain.value = 3;
  const vocalsGain = ctx.createGain(); vocalsGain.gain.value = STEM_DEFAULT.vocals;
  input.connect(vocLow); vocLow.connect(vocHi); vocHi.connect(vocPresence); vocPresence.connect(vocalsGain); vocalsGain.connect(output);

  // --- OTHER bus: everything between bass and air, minus the vocal presence emphasis.
  // Broad bandpass 220–6500 with a slight 2 kHz dip so it doesn't double-count vocals.
  const otherLow = ctx.createBiquadFilter();
  otherLow.type = "highpass"; otherLow.frequency.value = 220; otherLow.Q.value = 0.5;
  const otherHi = ctx.createBiquadFilter();
  otherHi.type = "lowpass"; otherHi.frequency.value = 6500; otherHi.Q.value = 0.5;
  const otherDip = ctx.createBiquadFilter();
  otherDip.type = "peaking"; otherDip.frequency.value = 2200; otherDip.Q.value = 1.4; otherDip.gain.value = -2;
  const otherGain = ctx.createGain(); otherGain.gain.value = STEM_DEFAULT.other;
  input.connect(otherLow); otherLow.connect(otherHi); otherHi.connect(otherDip); otherDip.connect(otherGain); otherGain.connect(output);

  // Normalise: summing 4 parallel filters can pile up energy. Trim the output.
  output.gain.value = 0.65;

  const gains: Record<StemId, GainNode> = { drums: drumsGain, bass: bassGain, vocals: vocalsGain, other: otherGain };

  function setGain(stem: StemId, value: number, sec = 0.05) {
    const g = gains[stem];
    const v = Math.max(0, Math.min(1.5, value));
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(v, now + Math.max(0.01, sec));
  }
  function reset() {
    for (const k of Object.keys(gains) as StemId[]) setGain(k, STEM_DEFAULT[k], 0.2);
  }

  return {
    input, output, gains, setGain, reset,
    dispose: () => {
      try {
        for (const n of [bassLow, bassHi, bassGain, drumKick, drumHi, drumPop, drumSum, drumsGain, vocLow, vocHi, vocPresence, vocalsGain, otherLow, otherHi, otherDip, otherGain, input, output]) {
          n.disconnect();
        }
      } catch { /* noop */ }
    },
  };
}