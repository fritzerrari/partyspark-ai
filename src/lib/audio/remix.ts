// AI Remix v2 — analysis-aware dance edit.
// Uses real time-stretch (no aliasing), picks instrumental sections for loops,
// preserves vocal phrases as whole blocks, and masters through a brick-wall limiter.
import { estimateBPM } from "./mashup";
import { stretchBuffer } from "./timestretch";
import { masterBuffer } from "./master";
import { analyzeAudio, type TrackAnalysis } from "./analyze";

export type RemixStyle = "house" | "techno" | "disco" | "tropical" | "drum-and-bass";
export type RemixOptions = {
  targetBpm?: number;
  lengthSec?: 60 | 90 | 120 | 150;
  style?: RemixStyle;
  /** If you already analyzed the source elsewhere, pass it to skip a re-analyze. */
  analysis?: TrackAnalysis;
  onProgress?: (label: string, pct: number) => void;
};

function slice(ctx: BaseAudioContext, src: AudioBuffer, startSec: number, lenSec: number): AudioBuffer {
  const sr = src.sampleRate;
  const startSamp = Math.max(0, Math.floor(startSec * sr));
  const lenSamp = Math.min(src.length - startSamp, Math.floor(Math.max(0.05, lenSec) * sr));
  const out = ctx.createBuffer(Math.max(2, src.numberOfChannels), Math.max(1, lenSamp), sr);
  for (let c = 0; c < out.numberOfChannels; c++) {
    const srcCh = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    out.getChannelData(c).set(srcCh.subarray(startSamp, startSamp + lenSamp));
  }
  return out;
}

function snapToBeat(sec: number, grid: number[] | null | undefined): number {
  if (!grid?.length) return sec;
  let best = grid[0];
  for (const b of grid) if (Math.abs(b - sec) < Math.abs(best - sec)) best = b;
  return best;
}

/** Find the longest instrumental window of `lenSec` (lowest mean voiced score). */
function findInstrumentalWindow(vmap: { t: number; voiced: number }[] | null | undefined, lenSec: number, durationSec: number, startAfter = 0): number {
  if (!vmap?.length) return startAfter;
  const win = Math.max(1, Math.floor(lenSec));
  let bestT = Math.max(startAfter, 0);
  let bestScore = Infinity;
  for (let i = 0; i < vmap.length - win; i++) {
    if (vmap[i].t < startAfter) continue;
    if (vmap[i].t + lenSec > durationSec) break;
    let s = 0;
    for (let j = 0; j < win; j++) s += vmap[i + j].voiced;
    if (s < bestScore) { bestScore = s; bestT = vmap[i].t; }
  }
  return bestT;
}

/** Find the most "vocal" / hook window of `lenSec` (highest mean voiced score). */
function findVocalWindow(vmap: { t: number; voiced: number }[] | null | undefined, lenSec: number, durationSec: number, startAfter = 0): number {
  if (!vmap?.length) return startAfter;
  const win = Math.max(1, Math.floor(lenSec));
  let bestT = Math.max(startAfter, 0);
  let bestScore = -Infinity;
  for (let i = 0; i < vmap.length - win; i++) {
    if (vmap[i].t < startAfter) continue;
    if (vmap[i].t + lenSec > durationSec) break;
    let s = 0;
    for (let j = 0; j < win; j++) s += vmap[i + j].voiced;
    if (s > bestScore) { bestScore = s; bestT = vmap[i].t; }
  }
  return bestT;
}

type LoopPlan = {
  chunk: AudioBuffer;
  startSec: number;
  durSec: number;
  gain: number;
  bus: "main" | "break";
};

/** Build a dance-edit. Uses analysis (BPM, beat-grid, vocal-map, energy cues) when available. */
export async function buildRemix(
  source: AudioBuffer,
  opts: RemixOptions = {},
): Promise<{ buffer: AudioBuffer; sourceBpm: number; targetBpm: number; style: RemixStyle; sections: { label: string; startSec: number; endSec: number }[] }> {
  const targetBpm = opts.targetBpm ?? 124;
  const totalSec = opts.lengthSec ?? 90;
  const style: RemixStyle = opts.style ?? "house";
  const progress = opts.onProgress ?? (() => {});

  progress("Analyse", 8);
  const analysis: TrackAnalysis = opts.analysis ?? await analyzeAudio(source, (label, pct) => progress(`Analyse: ${label}`, 8 + pct * 0.2));
  const sourceBpm = analysis.bpm || estimateBPM(source) || targetBpm;

  // Tempo stretch keeps pitch.
  progress("Time-Stretch", 35);
  const tempo = sourceBpm / targetBpm; // >1 → next deck is faster, we slow input
  const stretched = await stretchBuffer(new OfflineAudioContext(2, 1024, source.sampleRate), source, tempo);
  const stretchedDur = stretched.length / stretched.sampleRate;

  // Rebuild a coarse vocal map / grid scaled to the stretched material.
  const scaledVocal = analysis.vocalMap?.map((p) => ({ t: p.t * tempo, voiced: p.voiced })) ?? null;
  const scaledGrid = analysis.beatGrid?.map((b) => b * tempo) ?? null;
  const scaledCues = analysis.cues
    ? { introEnd: analysis.cues.introEnd * tempo, firstDrop: analysis.cues.firstDrop * tempo, outroStart: analysis.cues.outroStart * tempo }
    : null;

  // Section timing — proportional to total length.
  // Intro 18% · Verse 22% · Build 8% · Drop 28% · Break 8% · Outro 16%
  const intro = totalSec * 0.18;
  const verse = totalSec * 0.22;
  const build = totalSec * 0.08;
  const drop  = totalSec * 0.28;
  const brk   = totalSec * 0.08;
  const outro = totalSec * 0.16;
  const sections = [
    { label: "Intro", startSec: 0,                              endSec: intro },
    { label: "Verse", startSec: intro,                          endSec: intro + verse },
    { label: "Build", startSec: intro + verse,                  endSec: intro + verse + build },
    { label: "Drop",  startSec: intro + verse + build,          endSec: intro + verse + build + drop },
    { label: "Break", startSec: intro + verse + build + drop,   endSec: intro + verse + build + drop + brk },
    { label: "Outro", startSec: intro + verse + build + drop + brk, endSec: totalSec },
  ];

  // Pick smart source windows from the stretched buffer:
  //   - instrumental beat-loop for Intro / Build
  //   - vocal hook for Verse / Drop
  //   - longest instrumental tail for Break / Outro
  const beatSec = 60 / targetBpm;
  const sixteenBars = beatSec * 16;
  const eightBars   = beatSec * 8;
  const fourBars    = beatSec * 4;

  const loopOffline = new OfflineAudioContext(2, 1024, stretched.sampleRate);
  const dropStart = snapToBeat(scaledCues?.firstDrop ?? findVocalWindow(scaledVocal, eightBars, stretchedDur, scaledCues?.introEnd ?? 0), scaledGrid);
  const hookStart = snapToBeat(findVocalWindow(scaledVocal, eightBars, stretchedDur, dropStart + eightBars), scaledGrid);
  const instStart = snapToBeat(findInstrumentalWindow(scaledVocal, eightBars, stretchedDur, 0), scaledGrid);
  const tailStart = snapToBeat(Math.max(0, (scaledCues?.outroStart ?? stretchedDur - eightBars)), scaledGrid);

  const instLoop = slice(loopOffline, stretched, instStart, eightBars);
  const dropHook = slice(loopOffline, stretched, dropStart, sixteenBars);
  const verseHook = slice(loopOffline, stretched, hookStart, eightBars);
  const breakSlice = slice(loopOffline, stretched, tailStart, fourBars);

  // Build offline render context for the final remix length.
  progress("Render", 60);
  const sr = stretched.sampleRate;
  const renderLen = Math.floor((totalSec + 1) * sr);
  const ctx = new OfflineAudioContext(2, renderLen, sr);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Two buses (main vs creative break) so effects don't blast through the main signal.
  const mainBus = ctx.createGain(); mainBus.gain.value = 1;
  const mainFilter = ctx.createBiquadFilter();
  mainFilter.type = "lowpass"; mainFilter.Q.value = 0.5;
  mainFilter.frequency.setValueAtTime(700, 0);
  mainFilter.frequency.exponentialRampToValueAtTime(20000, intro);
  mainFilter.frequency.setValueAtTime(20000, intro + verse);
  // Build-up: HPF rises so the drop hits hard
  mainFilter.frequency.setValueAtTime(20000, intro + verse);
  // (additional automation handled per-section by HPF bus below)
  mainBus.connect(mainFilter); mainFilter.connect(master);

  // Break bus: light hi-pass + tempo-synced delay
  const breakBus = ctx.createGain(); breakBus.gain.value = 0.6;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 200;
  const delay = ctx.createDelay(2); delay.delayTime.value = (60 / targetBpm) / 2; // dotted eighth-ish
  const delayFb = ctx.createGain(); delayFb.gain.value = 0.35;
  delay.connect(delayFb); delayFb.connect(delay);
  breakBus.connect(hp); hp.connect(master);
  breakBus.connect(delay); delay.connect(master);

  // Build-up: HPF riser via a dedicated filter on the verse bus → drop release
  const buildFilter = ctx.createBiquadFilter();
  buildFilter.type = "highpass"; buildFilter.frequency.value = 30;

  function schedule(plan: LoopPlan, dest: AudioNode) {
    const sr2 = sr;
    const loopLen = plan.chunk.length / sr2;
    if (loopLen <= 0.05) return;
    const loops = Math.ceil(plan.durSec / loopLen);
    for (let i = 0; i < loops; i++) {
      const src = ctx.createBufferSource(); src.buffer = plan.chunk;
      const g = ctx.createGain();
      // Per-loop fade-in / fade-out to mask seam clicks
      const t0 = plan.startSec + i * loopLen;
      const t1 = Math.min(plan.startSec + plan.durSec, t0 + loopLen);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(plan.gain, t0 + 0.05);
      g.gain.setValueAtTime(plan.gain, Math.max(t0 + 0.05, t1 - 0.05));
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      src.connect(g); g.connect(dest);
      src.start(t0);
      src.stop(t1 + 0.05);
    }
  }

  // -- Intro: instrumental loop, low-pass swelling
  schedule({ chunk: instLoop, startSec: 0, durSec: intro, gain: 0.55, bus: "main" }, mainBus);

  // -- Verse: vocal hook on top of light instrumental bed
  schedule({ chunk: verseHook, startSec: intro, durSec: verse, gain: 0.75, bus: "main" }, mainBus);

  // -- Build: instrumental loop fed through HPF riser
  schedule({ chunk: instLoop, startSec: intro + verse, durSec: build, gain: 0.6, bus: "main" }, buildFilter);
  buildFilter.frequency.setValueAtTime(120, intro + verse);
  buildFilter.frequency.exponentialRampToValueAtTime(1800, intro + verse + build);
  buildFilter.connect(mainBus);

  // -- Drop: full vocal hook, slight gain bump
  schedule({ chunk: dropHook, startSec: intro + verse + build, durSec: drop, gain: 0.85, bus: "main" }, mainBus);

  // -- Break: filtered/delayed tail
  schedule({ chunk: breakSlice, startSec: intro + verse + build + drop, durSec: brk, gain: 0.7, bus: "break" }, breakBus);

  // -- Outro: vocal hook with master fade
  const outroBus = ctx.createGain();
  outroBus.gain.setValueAtTime(1, intro + verse + build + drop + brk);
  outroBus.gain.linearRampToValueAtTime(0, totalSec);
  outroBus.connect(mainBus);
  schedule({ chunk: dropHook, startSec: intro + verse + build + drop + brk, durSec: outro, gain: 0.7, bus: "main" }, outroBus);

  const rawMix = await ctx.startRendering();

  progress("Master", 90);
  const final = await masterBuffer(rawMix, { makeup: 1.0, ceiling: 0.96 });
  progress("Fertig", 100);

  return { buffer: final, sourceBpm: Math.round(sourceBpm), targetBpm, style, sections };
}