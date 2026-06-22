// Stem bus for a deck. Two very different modes share the same graph:
//
//   * Clean / Pseudo mode (no real Demucs stems):
//       The deck's signal passes through a DRY path at unity gain so the
//       original audio is NEVER destroyed. The 4 spectral band-pass paths
//       are wired in parallel but their gains START AT 0, so by default
//       they are silent. They act as additive band-boost overlays driven
//       by manual stem sliders; transitions on a pseudo deck must NOT
//       ride them — they should ride EQ/filter on the deck instead
//       (see cleanDjTransitions).
//
//   * Real-stem mode:
//       The deck's MediaElement input is muted (input gain → 0, which
//       also mutes the dry path and the band overlays). The real
//       Demucs buffers feed each `gains[stem]` directly, so animating
//       those gains from 0..1 controls the actual separated stems.
//
// This split is the reason the previous build sounded like two destroyed
// songs fading into each other: every deck was being routed through the
// 4 band-pass rebuild as its *only* signal path. We now keep an honest
// dry path so the original audio quality is preserved.

export type StemId = "drums" | "bass" | "vocals" | "other";

export type StemSplit = {
  input: AudioNode;            // connect deck signal here
  output: AudioNode;           // sum of all 4 stems, route to deck.gain
  gains: Record<StemId, GainNode>;
  /** Smoothly ride a stem. */
  setGain: (stem: StemId, value: number, sec?: number) => void;
  /** Reset to neutral — overlays silent in pseudo mode, real stems full. */
  reset: () => void;
  dispose: () => void;
};

// Default = 0 (silent overlays). Real-stem mode animates these up.
const STEM_DEFAULT: Record<StemId, number> = {
  drums: 0, bass: 0, vocals: 0, other: 0,
};

export function createStemSplit(ctx: AudioContext, source: AudioNode | null = null): StemSplit {
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (source) source.connect(input);

  // --- DRY pass-through: keeps the original deck signal intact in pseudo mode.
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(output);

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

  // Output is unity — the dry path already carries the full signal.
  output.gain.value = 1;

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
    // restore dry to unity
    const now = ctx.currentTime;
    dry.gain.cancelScheduledValues(now);
    dry.gain.setValueAtTime(dry.gain.value, now);
    dry.gain.linearRampToValueAtTime(1, now + 0.2);
  }

  return {
    input, output, gains, setGain, reset,
    dispose: () => {
      try {
        for (const n of [dry, bassLow, bassHi, bassGain, drumKick, drumHi, drumPop, drumSum, drumsGain, vocLow, vocHi, vocPresence, vocalsGain, otherLow, otherHi, otherDip, otherGain, input, output]) {
          n.disconnect();
        }
      } catch { /* noop */ }
    },
  };
}

/**
 * Mute the dry path on a split (used when entering real-stem mode so the
 * MediaElement signal is replaced by the real stem buffers).
 * Re-exposed via the split's `input` gain because that's the simplest
 * single-knob mute: setting input=0 silences both dry and the 4 bandpass
 * paths in one move.
 */
export function muteDry(split: StemSplit, sec = 0.05): void {
  const g = (split.input as GainNode).gain;
  const ctx = (split.input as GainNode).context as AudioContext;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + Math.max(0.01, sec));
}

export function openDry(split: StemSplit, sec = 0.05): void {
  const g = (split.input as GainNode).gain;
  const ctx = (split.input as GainNode).context as AudioContext;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(1, now + Math.max(0.01, sec));
}