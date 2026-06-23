// Best-transition-point finder. Pure helpers; runs over an already analysed
// track. Scans vocal map + energy curve + beat grid and returns vocal-free,
// energy-stable phrase windows snapped to downbeats — both for mixing OUT
// of a track (outro slots) and for teasing IN a new track (intro hooks).

export type PhraseSlot = {
  /** Start time in seconds, snapped to a downbeat. */
  startSec: number;
  /** Length in bars (4 beats each). */
  bars: number;
  /** Quality 0..1 — higher is better (vocal-free, stable energy, on a phrase boundary). */
  score: number;
  /** Hint label for the UI. */
  label: string;
};

export type TransitionPoints = {
  outroSlots: PhraseSlot[];
  introHooks: PhraseSlot[];
};

type Track = {
  bpm?: number | null;
  beatGrid?: number[] | null;
  energyCurve?: number[] | null;
  vocalMap?: { t: number; voiced: number }[] | null;
  cues?: { introEnd: number; firstDrop: number; outroStart: number } | null;
  durationSec?: number | null;
};

function voicedAt(vmap: { t: number; voiced: number }[] | null | undefined, sec: number): number {
  if (!vmap?.length) return 0;
  // sample around the requested second (closest entry)
  let best = vmap[0];
  for (const p of vmap) if (Math.abs(p.t - sec) < Math.abs(best.t - sec)) best = p;
  return best.voiced;
}

function avgVoiced(vmap: Track["vocalMap"], from: number, to: number): number {
  if (!vmap?.length) return 0;
  let acc = 0, n = 0;
  for (const p of vmap) if (p.t >= from && p.t <= to) { acc += p.voiced; n++; }
  return n ? acc / n : voicedAt(vmap, (from + to) / 2);
}

function avgEnergy(curve: number[] | null | undefined, from: number, to: number): number {
  if (!curve?.length) return 0;
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(curve.length - 1, Math.floor(to));
  let acc = 0; let n = 0;
  for (let i = a; i <= b; i++) { acc += curve[i]; n++; }
  return n ? acc / n : 0;
}

function energyStability(curve: number[] | null | undefined, from: number, to: number): number {
  if (!curve?.length) return 0;
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(curve.length - 1, Math.floor(to));
  if (b <= a) return 0;
  let mean = 0;
  for (let i = a; i <= b; i++) mean += curve[i];
  mean /= (b - a + 1);
  let varSum = 0;
  for (let i = a; i <= b; i++) varSum += (curve[i] - mean) ** 2;
  const stddev = Math.sqrt(varSum / (b - a + 1));
  // stable = low variance relative to mean
  return 1 - Math.min(1, mean > 0 ? stddev / mean : 1);
}

/** Find the downbeat closest to (and >=) a target time. */
function snapToDownbeat(grid: number[] | null | undefined, target: number): number {
  if (!grid?.length) return target;
  // Downbeats every 4 beats
  for (let i = 0; i < grid.length; i += 4) {
    if (grid[i] >= target - 0.05) return grid[i];
  }
  return grid[Math.max(0, grid.length - 4)];
}

/** Walk the song, score every candidate phrase window, keep the top-K. */
function scanSlots(
  track: Track,
  opts: { kind: "outro" | "intro"; barsList: number[]; topK: number },
): PhraseSlot[] {
  const { bpm, beatGrid, energyCurve, vocalMap, cues, durationSec } = track;
  if (!bpm || !beatGrid?.length || !durationSec) return [];
  const secPerBar = (60 / bpm) * 4;
  const total = durationSec;

  // Window of interest: outro candidates live in the back half; intro hooks in the front half.
  const rangeStart = opts.kind === "outro"
    ? Math.max(cues?.firstDrop ?? total * 0.4, total * 0.35)
    : Math.max(cues?.introEnd ?? 0, beatGrid[0] ?? 0);
  const rangeEnd = opts.kind === "outro"
    ? Math.min(total, (cues?.outroStart ?? total) + secPerBar * 8)
    : Math.min(total * 0.55, (cues?.firstDrop ?? total * 0.4) + secPerBar * 16);

  const out: PhraseSlot[] = [];
  for (const bars of opts.barsList) {
    const win = bars * secPerBar;
    // Step every 2 bars over downbeats only
    for (let i = 0; i < beatGrid.length; i += 8) {
      const start = beatGrid[i];
      const end = start + win;
      if (start < rangeStart || end > rangeEnd) continue;
      const voc = avgVoiced(vocalMap, start, end);
      const en = avgEnergy(energyCurve, start, end);
      const stab = energyStability(energyCurve, start, end);
      // Outro: prefer vocal-free + stable; intro: prefer vocal-rich hook
      const vocalScore = opts.kind === "outro" ? (1 - voc) : Math.min(1, voc * 1.4);
      const energyScore = opts.kind === "outro" ? Math.min(1, en / 0.3) : Math.min(1, en / 0.25);
      const score = vocalScore * 0.5 + stab * 0.3 + energyScore * 0.2;
      out.push({
        startSec: +start.toFixed(3),
        bars,
        score: +score.toFixed(3),
        label: opts.kind === "outro"
          ? (voc < 0.25 ? "vocal-frei" : "stabil")
          : (voc > 0.5 ? "Vocal-Hook" : "Melodie-Hook"),
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.topK);
}

export function findTransitionPoints(track: Track): TransitionPoints {
  return {
    outroSlots: scanSlots(track, { kind: "outro", barsList: [8, 16, 32], topK: 4 }),
    introHooks: scanSlots(track, { kind: "intro", barsList: [4, 8, 16], topK: 4 }),
  };
}

/** Pick the best outro slot >= a deck position, else the top one overall. */
export function nextOutroSlot(track: Track, currentSec: number): PhraseSlot | null {
  const pts = findTransitionPoints(track);
  const future = pts.outroSlots.filter((s) => s.startSec >= currentSec - 1);
  return future[0] ?? pts.outroSlots[0] ?? null;
}

/** Pick the best intro hook for teasing the incoming track. */
export function bestIntroHook(track: Track): PhraseSlot | null {
  const pts = findTransitionPoints(track);
  return pts.introHooks[0] ?? null;
}
