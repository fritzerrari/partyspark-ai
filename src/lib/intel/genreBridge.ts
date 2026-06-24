// Genre-Bridge: when two tracks sit far apart in the embedding space or
// have a big BPM jump, find 1–3 intermediate tracks from the library that
// connect them smoothly. Inspired by Deej-AI's "join-the-dots" idea.
import type { EngineTrack } from "@/lib/audio/engine";
import { cosineSim } from "@/lib/audio/analyze";
import { bpmFoldDelta, harmonicDist } from "@/lib/dj/mixability";

export interface BridgeNeed {
  needed: boolean;
  reason: string;
  embeddingDist: number;
  bpmDelta: number;
}

export function diagnoseBridge(a?: EngineTrack | null, b?: EngineTrack | null): BridgeNeed {
  if (!a || !b) return { needed: false, reason: "—", embeddingDist: 0, bpmDelta: 0 };
  const sim = cosineSim(a.embedding, b.embedding);
  const embeddingDist = 1 - sim;
  const bpmDelta = a.bpm && b.bpm ? bpmFoldDelta(a.bpm, b.bpm) : 0;
  const reasons: string[] = [];
  if (embeddingDist > 0.45) reasons.push("klanglich weit");
  if (a.bpm && b.bpm && bpmDelta / a.bpm > 0.09) reasons.push(`+${bpmDelta.toFixed(0)} BPM`);
  if (harmonicDist(a.camelot, b.camelot) >= 3) reasons.push("Tonart-Konflikt");
  return {
    needed: reasons.length > 0,
    reason: reasons.join(" · ") || "passt",
    embeddingDist,
    bpmDelta,
  };
}

/** Score a candidate as a bridge hop between a and b at fractional position p (0..1). */
function bridgeScore(cand: EngineTrack, a: EngineTrack, b: EngineTrack, p: number): number {
  if (!cand.embedding?.length || !a.embedding?.length || !b.embedding?.length) return -1;
  if (cand.id === a.id || cand.id === b.id) return -1;
  // Closeness to interpolated point in embedding space (cheap: weighted avg cosine)
  const simA = cosineSim(cand.embedding, a.embedding);
  const simB = cosineSim(cand.embedding, b.embedding);
  const targetSim = (1 - p) * 1 + p * simB; // not used directly; we want cand to be CLOSE to both
  void targetSim;
  // Want cand to bridge: high simA at p=0, high simB at p=1, both decent in middle
  const positional = (1 - p) * simA + p * simB; // 0..1ish

  // BPM should sit between a.bpm and b.bpm
  let bpmScore = 0.5;
  if (a.bpm && b.bpm && cand.bpm) {
    const target = a.bpm + (b.bpm - a.bpm) * p;
    bpmScore = Math.max(0, 1 - Math.abs(cand.bpm - target) / 20);
  }

  // Key compatibility to neighbours
  const kA = harmonicDist(a.camelot, cand.camelot);
  const kB = harmonicDist(cand.camelot, b.camelot);
  const keyScore = (kA <= 1 ? 1 : kA <= 2 ? 0.5 : 0) * 0.5
                 + (kB <= 1 ? 1 : kB <= 2 ? 0.5 : 0) * 0.5;

  return positional * 0.5 + bpmScore * 0.3 + keyScore * 0.2;
}

/** Find up to `count` bridge tracks ordered as path A → bridge1 → … → B. */
export function findBridge(
  a: EngineTrack,
  b: EngineTrack,
  library: EngineTrack[],
  count: 1 | 2 | 3 = 1,
): EngineTrack[] {
  const pool = library.filter((t) => t.id !== a.id && t.id !== b.id && t.embedding?.length);
  if (!pool.length) return [];
  const path: EngineTrack[] = [];
  let used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const p = (i + 1) / (count + 1);
    let best: EngineTrack | null = null;
    let bestScore = -1;
    for (const cand of pool) {
      if (used.has(cand.id)) continue;
      const score = bridgeScore(cand, a, b, p);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (best) { path.push(best); used.add(best.id); }
  }
  return path;
}