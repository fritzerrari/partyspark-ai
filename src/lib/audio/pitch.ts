import { PitchDetector } from "pitchy";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type ScaleId =
  | "chromatic"
  | "c-major" | "g-major" | "d-major" | "a-major" | "e-major" | "f-major"
  | "a-minor" | "e-minor" | "d-minor" | "g-minor";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const SCALES: Record<ScaleId, { label: string; root: number; notes: number[] }> = {
  "chromatic": { label: "Chromatic (alle Töne)", root: 0, notes: [0,1,2,3,4,5,6,7,8,9,10,11] },
  "c-major":   { label: "C-Dur",  root: 0,  notes: MAJOR },
  "g-major":   { label: "G-Dur",  root: 7,  notes: MAJOR },
  "d-major":   { label: "D-Dur",  root: 2,  notes: MAJOR },
  "a-major":   { label: "A-Dur",  root: 9,  notes: MAJOR },
  "e-major":   { label: "E-Dur",  root: 4,  notes: MAJOR },
  "f-major":   { label: "F-Dur",  root: 5,  notes: MAJOR },
  "a-minor":   { label: "A-Moll", root: 9,  notes: MINOR },
  "e-minor":   { label: "E-Moll", root: 4,  notes: MINOR },
  "d-minor":   { label: "D-Moll", root: 2,  notes: MINOR },
  "g-minor":   { label: "G-Moll", root: 7,  notes: MINOR },
};

export function freqToMidi(hz: number) {
  return 69 + 12 * Math.log2(hz / 440);
}
export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
export function midiToName(m: number) {
  const r = Math.round(m);
  const name = NOTE_NAMES[((r % 12) + 12) % 12];
  const oct = Math.floor(r / 12) - 1;
  return `${name}${oct}`;
}

/** Snap a midi value to the nearest in-scale note. */
export function snapToScale(midi: number, scaleId: ScaleId): number {
  const scale = SCALES[scaleId];
  const allowed = new Set(scale.notes.map((n) => (n + scale.root) % 12));
  let best = midi;
  let bestDist = Infinity;
  for (let cand = Math.round(midi) - 2; cand <= Math.round(midi) + 2; cand++) {
    if (allowed.has(((cand % 12) + 12) % 12)) {
      const d = Math.abs(cand - midi);
      if (d < bestDist) { bestDist = d; best = cand; }
    }
  }
  return best;
}

/** Live pitch detection helper bound to an AnalyserNode. */
export class LivePitchTracker {
  private detector: PitchDetector<Float32Array>;
  private buf: Float32Array;
  constructor(private analyser: AnalyserNode) {
    const size = analyser.fftSize;
    this.detector = PitchDetector.forFloat32Array(size);
    this.buf = new Float32Array(size);
  }
  read(): { hz: number; clarity: number } {
    this.analyser.getFloatTimeDomainData(this.buf);
    const view = new Float32Array(this.buf.buffer as ArrayBuffer, this.buf.byteOffset, this.buf.length);
    const [hz, clarity] = this.detector.findPitch(view, this.analyser.context.sampleRate);
    return { hz, clarity };
  }
}

/** Average pitch of a buffer (mono mix), ignoring silent / unclear frames. */
export function detectDominantMidi(buffer: AudioBuffer): number | null {
  const sr = buffer.sampleRate;
  const frame = 2048;
  const hop = 1024;
  const ch = buffer.numberOfChannels;
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / ch;
  }
  const detector = PitchDetector.forFloat32Array(frame);
  const slice = new Float32Array(frame);
  const midis: number[] = [];
  for (let i = 0; i + frame <= mono.length; i += hop) {
    slice.set(mono.subarray(i, i + frame));
    // RMS gate
    let rms = 0;
    for (let s = 0; s < frame; s++) rms += slice[s] * slice[s];
    rms = Math.sqrt(rms / frame);
    if (rms < 0.01) continue;
    const [hz, clarity] = detector.findPitch(slice, sr);
    if (clarity > 0.9 && hz > 70 && hz < 1200) {
      midis.push(freqToMidi(hz));
    }
  }
  if (midis.length === 0) return null;
  midis.sort((a, b) => a - b);
  return midis[Math.floor(midis.length / 2)]; // median
}