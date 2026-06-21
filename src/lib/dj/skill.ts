// Local DJ skill progression — localStorage-backed badge tracker.
import { toast } from "sonner";

export type Badge = "rookie" | "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type SkillState = {
  mixes: number;
  sumScore: number;
  bestScore: number;
  perfectCount: number;
  badge: Badge;
  updatedAt: number;
};

const KEY = "partypilot.dj_skill.v1";

const TIERS: { badge: Badge; minMixes: number; minAvg: number }[] = [
  { badge: "diamond",  minMixes: 500, minAvg: 85 },
  { badge: "platinum", minMixes: 200, minAvg: 80 },
  { badge: "gold",     minMixes: 75,  minAvg: 72 },
  { badge: "silver",   minMixes: 25,  minAvg: 65 },
  { badge: "bronze",   minMixes: 5,   minAvg: 50 },
  { badge: "rookie",   minMixes: 0,   minAvg: 0  },
];

function load(): SkillState {
  if (typeof window === "undefined") {
    return { mixes: 0, sumScore: 0, bestScore: 0, perfectCount: 0, badge: "rookie", updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SkillState;
  } catch { /* noop */ }
  return { mixes: 0, sumScore: 0, bestScore: 0, perfectCount: 0, badge: "rookie", updatedAt: 0 };
}

function save(s: SkillState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dj-skill-changed", { detail: s }));
  }
}

function tierFor(mixes: number, avg: number): Badge {
  for (const t of TIERS) {
    if (mixes >= t.minMixes && avg >= t.minAvg) return t.badge;
  }
  return "rookie";
}

export function getSkill(): SkillState { return load(); }

export function recordMixSkill(avg: number, peak: number) {
  if (avg <= 0) return;
  const prev = load();
  const next: SkillState = {
    mixes: prev.mixes + 1,
    sumScore: prev.sumScore + avg,
    bestScore: Math.max(prev.bestScore, peak),
    perfectCount: prev.perfectCount + (avg >= 88 ? 1 : 0),
    badge: prev.badge,
    updatedAt: Date.now(),
  };
  const newAvg = next.sumScore / next.mixes;
  const newBadge = tierFor(next.mixes, newAvg);
  next.badge = newBadge;
  save(next);
  if (newBadge !== prev.badge) {
    try { toast.success(`🏆 ${newBadge.toUpperCase()} DJ unlocked!`); } catch { /* no toaster */ }
  }
}

export function subscribeSkill(cb: (s: SkillState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => cb((e as CustomEvent<SkillState>).detail);
  window.addEventListener("dj-skill-changed", h);
  return () => window.removeEventListener("dj-skill-changed", h);
}