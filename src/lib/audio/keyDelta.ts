// Helpers for musical-key arithmetic across the chromatic scale.
// Supports key strings like "Am", "C", "F#m", "Bbm", "Db" and Camelot codes.
import { NOTE_NAMES } from "./pitch";

const PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function keyToPitchClass(key: string | null | undefined): number | null {
  if (!key) return null;
  const k = key.trim();
  // strip trailing 'm' for minor; case-insensitive note letter
  const m = k.match(/^([A-Ga-g])([#b]?)(m)?$/);
  if (!m) return null;
  const note = m[1].toUpperCase() + (m[2] ?? "");
  return PC[note] ?? null;
}

export function isMinorKey(key: string | null | undefined): boolean {
  return !!key?.trim().endsWith("m");
}

/**
 * Compute the shortest semitone shift to transpose `from` → `to`.
 * Result ∈ (-6..+6]. Returns 0 when either key is unknown.
 * Also picks the relative major/minor (±3 semitones) if it gives a shorter shift.
 */
export function semitoneShiftToKey(from: string | null | undefined, to: string | null | undefined): number {
  const a = keyToPitchClass(from);
  const b = keyToPitchClass(to);
  if (a == null || b == null) return 0;
  const aMinor = isMinorKey(from);
  const bMinor = isMinorKey(to);
  // Direct shift in pitch-class space, choose shortest signed delta.
  const candidates = new Set<number>();
  const direct = ((b - a + 18) % 12) - 6;
  candidates.add(direct);
  // Relative-mode option: minor <-> major shares notes with +/-3 semitones offset.
  if (aMinor !== bMinor) {
    candidates.add(((b - a + 3 + 18) % 12) - 6);
    candidates.add(((b - a - 3 + 18) % 12) - 6);
  }
  let best = direct;
  let bestAbs = Math.abs(direct);
  for (const c of candidates) {
    if (Math.abs(c) < bestAbs) { best = c; bestAbs = Math.abs(c); }
  }
  return best;
}

/** Apply a semitone shift to a key string, preserving major/minor mode. */
export function shiftKey(key: string | null | undefined, semitones: number): string | null {
  const pc = keyToPitchClass(key);
  if (pc == null) return null;
  const minor = isMinorKey(key);
  const newPc = ((pc + semitones) % 12 + 12) % 12;
  return NOTE_NAMES[newPc] + (minor ? "m" : "");
}