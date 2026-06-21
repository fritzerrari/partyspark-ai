// Pairwise transition scoring and smart playlist re-ordering.
// Pure logic — operates on TrackMeta-like input + optional vocal/energy maps.
import { camelotCompatible } from "./analyze";
import type { TrackMeta } from "./mixPlanner";
import type { TransitionMode } from "./engine";

export type ScoreableTrack = TrackMeta & {
  id: string;
  title?: string;
  vocalMap?: { t: number; voiced: number }[] | null;
  energyCurve?: number[] | null;
  introPoints?: number[] | null;
  outroPoints?: number[] | null;
};

export type TransitionEdge = {
  fromId: string;
  toId: string;
  score: number;
  bpmScore: number;
  keyScore: number;
  energyScore: number;
  cueScore: number;
  vocalScore: number;
  recommendedMode: TransitionMode;
  note: string;
};

const W = { bpm: 0.30, key: 0.25, energy: 0.15, cue: 0.20, vocal: 0.10 };

function bpmScore(a?: number | null, b?: number | null): number {
  if (!a || !b) return 50;
  const candidates = [b, b * 2, b / 2];
  let best = 0;
  for (const c of candidates) {
    const diff = Math.abs(a - c) / a;
    const s = diff <= 0.02 ? 100 : Math.max(0, 100 - diff * 600);
    if (s > best) best = s;
  }
  return best;
}

function keyScore(a?: string | null, b?: string | null): number {
  if (!a || !b) return 50;
  if (a === b) return 100;
  if (camelotCompatible(a, b)) return 85;
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) {
    const d = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
    if (d <= 2) return 60;
    if (d <= 3) return 45;
  }
  return 25;
}

function energyScore(a?: number | null, b?: number | null): number {
  if (a == null || b == null) return 60;
  const d = b - a;
  const ad = Math.abs(d);
  if (ad <= 15) return 100;
  if (d > 0) return Math.max(40, 100 - (ad - 15) * 1.5);
  return Math.max(0, 100 - (ad - 15) * 3);
}

function cueScore(from: ScoreableTrack, to: ScoreableTrack): number {
  const hasOutro = !!(from.cues?.outroStart || from.outroPoints?.length);
  const hasIntro = !!(to.cues?.introEnd != null || to.introPoints?.length);
  if (hasOutro && hasIntro) return 100;
  if (hasOutro || hasIntro) return 65;
  return 40;
}

function voicedAt(map: { t: number; voiced: number }[] | null | undefined, sec: number): number {
  if (!map?.length) return 0;
  const i = Math.max(0, Math.min(map.length - 1, Math.round(sec)));
  return map[i]?.voiced ?? 0;
}

function vocalClashScore(from: ScoreableTrack, to: ScoreableTrack): number {
  const fOut = from.outroPoints?.[0] ?? from.cues?.outroStart ?? Math.max(0, (from.durationSec ?? 180) - 30);
  const tIn = to.introPoints?.[0] ?? to.cues?.introEnd ?? 0;
  const fV = voicedAt(from.vocalMap, fOut);
  const tV = voicedAt(to.vocalMap, tIn);
  if (fV < 0.2 && tV < 0.2) return 100;
  if (fV < 0.4 && tV < 0.4) return 75;
  if (fV > 0.7 && tV > 0.7) return 15;
  return 55;
}

export function scoreTransition(from: ScoreableTrack, to: ScoreableTrack): TransitionEdge {
  const bs = bpmScore(from.bpm, to.bpm);
  const ks = keyScore(from.camelot, to.camelot);
  const es = energyScore(from.energy, to.energy);
  const cs = cueScore(from, to);
  const vs = vocalClashScore(from, to);
  const score = Math.round(W.bpm * bs + W.key * ks + W.energy * es + W.cue * cs + W.vocal * vs);
  const dBpm = from.bpm && to.bpm ? Math.abs(from.bpm - to.bpm) / from.bpm : 0;
  let mode: TransitionMode = "crossfade";
  if (dBpm > 0.18 || (ks < 50 && dBpm > 0.08)) mode = "genreBridge";
  else if (dBpm <= 0.03 && ks >= 85) mode = "bassSwap";
  else if (dBpm > 0.12) mode = "filterSweep";
  else if (ks < 50) mode = "echoTail";
  const note = `BPM Δ${((from.bpm ?? 0) - (to.bpm ?? 0)).toFixed(0)} · Key ${from.camelot ?? "?"}→${to.camelot ?? "?"} · Vocal ${vs >= 75 ? "clean" : vs >= 50 ? "ok" : "clash"}`;
  return {
    fromId: from.id, toId: to.id,
    score, bpmScore: Math.round(bs), keyScore: Math.round(ks),
    energyScore: Math.round(es), cueScore: Math.round(cs), vocalScore: Math.round(vs),
    recommendedMode: mode, note,
  };
}

export type ReorderResult = {
  orderedIds: string[];
  totalScore: number;
  avgScore: number;
  edges: TransitionEdge[];
};

export function reorderPlaylist(tracks: ScoreableTrack[], startId?: string): ReorderResult {
  if (tracks.length < 2) {
    return { orderedIds: tracks.map((t) => t.id), totalScore: 0, avgScore: 0, edges: [] };
  }
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const start = startId && byId.has(startId)
    ? byId.get(startId)!
    : [...tracks].sort((a, b) => (a.energy ?? 50) - (b.energy ?? 50))[0];

  const used = new Set<string>([start.id]);
  const order: ScoreableTrack[] = [start];
  while (order.length < tracks.length) {
    const last = order[order.length - 1];
    let bestNext: ScoreableTrack | null = null;
    let bestScore = -1;
    for (const t of tracks) {
      if (used.has(t.id)) continue;
      const s = scoreTransition(last, t).score;
      if (s > bestScore) { bestScore = s; bestNext = t; }
    }
    if (!bestNext) break;
    used.add(bestNext.id);
    order.push(bestNext);
  }

  const totalOf = (arr: ScoreableTrack[]) => {
    let s = 0;
    for (let i = 0; i < arr.length - 1; i++) s += scoreTransition(arr[i], arr[i + 1]).score;
    return s;
  };
  let total = totalOf(order);
  let improved = true;
  let iter = 0;
  while (improved && iter < 200) {
    improved = false;
    iter++;
    for (let i = 1; i < order.length - 1 && !improved; i++) {
      for (let j = i + 1; j < order.length && !improved; j++) {
        const reversed = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const newTotal = totalOf(reversed);
        if (newTotal > total + 0.5) {
          for (let k = 0; k < order.length; k++) order[k] = reversed[k];
          total = newTotal;
          improved = true;
        }
      }
    }
  }

  const edges: TransitionEdge[] = [];
  for (let i = 0; i < order.length - 1; i++) edges.push(scoreTransition(order[i], order[i + 1]));
  return {
    orderedIds: order.map((t) => t.id),
    totalScore: Math.round(total),
    avgScore: Math.round(total / Math.max(1, order.length - 1)),
    edges,
  };
}

export type TransitionPoints = { introPoints: number[]; outroPoints: number[] };

export function findTransitionPoints(
  beatGrid: number[],
  vocalMap: { t: number; voiced: number }[],
  energyCurve: number[],
  cues: { introEnd: number; outroStart: number; firstDrop?: number },
  durationSec: number,
): TransitionPoints {
  if (!beatGrid?.length) return { introPoints: [cues.introEnd], outroPoints: [cues.outroStart] };
  const downs: number[] = [];
  for (let i = 0; i < beatGrid.length; i += 4) downs.push(beatGrid[i]);
  const vAt = (sec: number) => {
    if (!vocalMap?.length) return 0;
    const i = Math.max(0, Math.min(vocalMap.length - 1, Math.round(sec)));
    return vocalMap[i]?.voiced ?? 0;
  };
  const eAt = (sec: number) => {
    if (!energyCurve?.length) return 0;
    const i = Math.max(0, Math.min(energyCurve.length - 1, Math.round(sec)));
    return energyCurve[i] ?? 0;
  };

  const outroLo = Math.max(cues.outroStart - 16, (cues.firstDrop ?? 0) + 16);
  const outroHi = Math.max(outroLo, durationSec - 8);
  const outScored: { t: number; s: number }[] = [];
  for (const t of downs) {
    if (t < outroLo || t > outroHi) continue;
    const v = vAt(t);
    const e = eAt(t);
    const eAfter = eAt(t + 8);
    outScored.push({ t, s: 100 - v * 60 + Math.max(0, 40 - Math.abs(e - eAfter) * 200) });
  }
  outScored.sort((a, b) => b.s - a.s);

  const introLo = Math.max(0, cues.introEnd - 4);
  const introHi = Math.min(durationSec, cues.introEnd + 48);
  const inScored: { t: number; s: number }[] = [];
  for (const t of downs) {
    if (t < introLo || t > introHi) continue;
    const v = vAt(t);
    const e = eAt(t);
    const eAfter = eAt(t + 8);
    inScored.push({ t, s: 100 - v * 60 + Math.min(40, Math.max(0, (eAfter - e) * 300)) });
  }
  inScored.sort((a, b) => b.s - a.s);

  const dedupe = (arr: { t: number; s: number }[], gap = 8) => {
    const out: number[] = [];
    for (const c of arr) {
      if (out.every((x) => Math.abs(x - c.t) > gap)) out.push(+c.t.toFixed(2));
      if (out.length >= 3) break;
    }
    return out;
  };

  const outroPoints = dedupe(outScored);
  const introPoints = dedupe(inScored);
  return {
    introPoints: introPoints.length ? introPoints : [cues.introEnd],
    outroPoints: outroPoints.length ? outroPoints : [cues.outroStart],
  };
}
