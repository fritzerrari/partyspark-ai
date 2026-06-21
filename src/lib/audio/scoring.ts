// Vocal scoring: pitch accuracy + stability from an AudioBuffer using YIN.
import { PitchDetector } from "pitchy";
import { snapToScale, type ScaleId } from "./pitch";

export type VocalScore = {
  pitchAccuracy: number;   // 0..100 — how close to nearest scale note
  stability: number;       // 0..100 — how steady the held notes are
  energy: number;          // 0..100 — RMS-based loudness consistency
  overall: number;         // 0..100 — weighted blend
  voicedRatio: number;     // 0..1   — fraction of frames with clear pitch
  samples: { t: number; midi: number; cents: number; clarity: number }[];
};

const FRAME_SIZE = 2048;
const HOP = 1024;

function midiFromFreq(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function rms(arr: Float32Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / arr.length);
}

export function analyzeRecording(buf: AudioBuffer, scaleId: ScaleId = "chromatic"): VocalScore {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
  const samples: VocalScore["samples"] = [];
  const rmsValues: number[] = [];

  for (let pos = 0; pos + FRAME_SIZE <= ch.length; pos += HOP) {
    const frame = ch.subarray(pos, pos + FRAME_SIZE);
    const energy = rms(frame);
    rmsValues.push(energy);
    if (energy < 0.01) continue; // silence
    const [freq, clarity] = detector.findPitch(frame, sr);
    if (clarity < 0.85 || freq < 60 || freq > 1200) continue;
    const midiF = midiFromFreq(freq);
    samples.push({
      t: pos / sr,
      midi: midiF,
      cents: 0, // filled below
      clarity,
    });
  }

  if (samples.length < 5) {
    return { pitchAccuracy: 0, stability: 0, energy: 0, overall: 0, voicedRatio: 0, samples: [] };
  }

  // Pitch accuracy: average |cents| from nearest in-scale note
  let centsSum = 0;
  for (const s of samples) {
    const target = snapToScale(Math.round(s.midi), scaleId);
    const cents = (s.midi - target) * 100;
    s.cents = cents;
    centsSum += Math.min(50, Math.abs(cents));
  }
  const avgCents = centsSum / samples.length; // 0..50
  const pitchAccuracy = Math.max(0, 100 - avgCents * 2);

  // Stability: low frame-to-frame midi variance during voiced regions
  let diffSum = 0;
  for (let i = 1; i < samples.length; i++) diffSum += Math.abs(samples[i].midi - samples[i - 1].midi);
  const avgDiff = diffSum / (samples.length - 1);
  const stability = Math.max(0, 100 - avgDiff * 25);

  // Energy consistency: low coefficient-of-variation on RMS (above noise floor)
  const loud = rmsValues.filter((v) => v > 0.01);
  const mean = loud.reduce((a, b) => a + b, 0) / Math.max(1, loud.length);
  const variance = loud.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, loud.length);
  const cv = Math.sqrt(variance) / Math.max(0.001, mean);
  const energy = Math.max(0, Math.min(100, 100 - cv * 50));

  const voicedRatio = samples.length / Math.max(1, Math.floor(ch.length / HOP));
  const overall = Math.round(pitchAccuracy * 0.55 + stability * 0.25 + energy * 0.2);

  return {
    pitchAccuracy: Math.round(pitchAccuracy),
    stability: Math.round(stability),
    energy: Math.round(energy),
    overall,
    voicedRatio,
    samples,
  };
}

export function scoreLabel(s: number): string {
  if (s >= 90) return "Legendär 🌟";
  if (s >= 80) return "Stark 🔥";
  if (s >= 70) return "Solide 👏";
  if (s >= 55) return "Spaßig 🎤";
  if (s >= 40) return "Mutig 💪";
  return "Mit Herz 💖";
}