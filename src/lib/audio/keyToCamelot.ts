import { NOTE_NAMES } from "./pitch";

const CAMELOT_MAJOR: Record<number, string> = {
  0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
  6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
};
const CAMELOT_MINOR: Record<number, string> = {
  0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A",
  6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A",
};

/** Map "Am", "C", "F#m" → Camelot code (e.g. "8A"). Returns null if unparseable. */
export function keyToCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  const minor = trimmed.endsWith("m");
  const note = minor ? trimmed.slice(0, -1) : trimmed;
  const pc = (NOTE_NAMES as readonly string[]).indexOf(note);
  if (pc < 0) return null;
  return minor ? CAMELOT_MINOR[pc] : CAMELOT_MAJOR[pc];
}