// Virtuoso Auto-Mix Director — picks a 3-phase choreography (preview →
// transform → reveal), renders the necessary layers, and exposes a
// `runDirector` function the cockpit calls before a transition. Variations
// are shuffled to avoid sounding repetitive.

import type { EngineTrack } from "@/lib/audio/engine";
import { buildTeaser, type TeaserPlan } from "@/lib/audio/teaserBuilder";
import { renderLayer, renderLayerStack, type LayerKind } from "@/lib/audio/genLayers";
import { pushLog } from "./copilotLog";

export type Choreography = {
  id: string;
  name: string;
  layers: LayerKind[];
  drumStyle: "four-floor" | "breakbeat" | "halftime";
  /** Whether to also build a teaser snippet from incoming. */
  teaser: boolean;
  /** Bars for the preview phase before the recipe starts. */
  previewBars: number;
};

export const CHOREOGRAPHIES: Choreography[] = [
  { id: "vocal-tease",   name: "Vocal-Tease + Drums",     layers: ["drums"],          drumStyle: "four-floor", teaser: true,  previewBars: 8 },
  { id: "pluck-arp",     name: "Pluck-Arp + Bass-Walk",   layers: ["bass", "pluck"],  drumStyle: "halftime",   teaser: true,  previewBars: 8 },
  { id: "pad-riser",     name: "Pad-Riser + Hook",        layers: ["pad"],            drumStyle: "four-floor", teaser: true,  previewBars: 8 },
  { id: "drum-bridge",   name: "Drum-Bridge (kein Teaser)", layers: ["drums", "bass"],drumStyle: "breakbeat",  teaser: false, previewBars: 4 },
  { id: "full-bandbed",  name: "Full Band-Bed",           layers: ["drums", "bass", "pluck", "pad"], drumStyle: "four-floor", teaser: true, previewBars: 8 },
];

const recentIds: string[] = [];

/** Pick a choreography we haven't used in the last 3 transitions. */
export function pickChoreography(creativity = 0.7): Choreography {
  if (creativity <= 0.05) return CHOREOGRAPHIES[3]; // minimal
  const pool = CHOREOGRAPHIES.filter((c) => !recentIds.includes(c.id));
  const choice = pool.length ? pool[Math.floor(Math.random() * pool.length)] : CHOREOGRAPHIES[Math.floor(Math.random() * CHOREOGRAPHIES.length)];
  recentIds.push(choice.id);
  if (recentIds.length > 3) recentIds.shift();
  return choice;
}

export type DirectorPlan = {
  choreography: Choreography;
  teaser: TeaserPlan | null;
  layerBuffer: AudioBuffer | null;
};

/**
 * Render all the previews/layers for a transition without playing them.
 * The caller (twinDeckBus) decides WHEN to schedule them on the master.
 */
export async function planDirector(
  live: EngineTrack,
  incoming: EngineTrack,
  opts?: { creativity?: number; bars?: number; choreographyId?: string },
): Promise<DirectorPlan> {
  if (!live.bpm) throw new Error("Live deck needs BPM");
  const choreo = opts?.choreographyId
    ? (CHOREOGRAPHIES.find((c) => c.id === opts.choreographyId) ?? pickChoreography(opts?.creativity))
    : pickChoreography(opts?.creativity);
  pushLog(`🎬 Director: ${choreo.name}`, "act");

  const bars = opts?.bars ?? choreo.previewBars;
  const [teaser, layerBuffer] = await Promise.all([
    choreo.teaser
      ? buildTeaser(incoming, { bpm: live.bpm, musicalKey: live.musicalKey }, { bars: Math.min(bars, 4) }).catch((e) => { pushLog(`⚠ Teaser fehlgeschlagen: ${(e as Error).message}`, "warn"); return null; })
      : Promise.resolve(null),
    choreo.layers.length
      ? renderLayerStack(choreo.layers, {
          bpm: live.bpm,
          bars,
          key: live.musicalKey,
          drumStyle: choreo.drumStyle,
          level: 0.55,
        }).catch((e) => { pushLog(`⚠ Layer fehlgeschlagen: ${(e as Error).message}`, "warn"); return null; })
      : Promise.resolve(null),
  ]);

  if (teaser) pushLog(`↳ Teaser bereit (${teaser.hookBars} Takte, ${teaser.notes})`, "info");
  if (layerBuffer) pushLog(`↳ Layer bereit (${choreo.layers.join("+")}, ${bars} Takte)`, "info");

  return { choreography: choreo, teaser, layerBuffer };
}

/** Render a downloadable WAV blob from a director plan for offline preview. */
export function planToWavBlobUrl(plan: DirectorPlan): string | null {
  const bufs: AudioBuffer[] = [];
  if (plan.teaser) bufs.push(plan.teaser.buffer);
  if (plan.layerBuffer) bufs.push(plan.layerBuffer);
  if (!bufs.length) return null;
  const sr = bufs[0].sampleRate;
  const len = Math.max(...bufs.map((b) => b.length));
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const off = new Ctx(2, len, sr);
  for (const b of bufs) {
    const s = off.createBufferSource();
    s.buffer = b;
    s.connect(off.destination);
    s.start(0);
  }
  // Synchronous rendering not available; caller should use renderToWavBlobUrl instead.
  return null;
}

/** Async render of a director plan to a WAV blob URL (preview audio file). */
export async function renderDirectorPreview(plan: DirectorPlan): Promise<{ url: string; durationSec: number } | null> {
  const bufs: AudioBuffer[] = [];
  if (plan.teaser) bufs.push(plan.teaser.buffer);
  if (plan.layerBuffer) bufs.push(plan.layerBuffer);
  if (!bufs.length) return null;
  const sr = bufs[0].sampleRate;
  const len = Math.max(...bufs.map((b) => b.length));
  const Ctx = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const off = new Ctx(2, len, sr);
  for (const b of bufs) {
    const s = off.createBufferSource();
    s.buffer = b;
    s.connect(off.destination);
    s.start(0);
  }
  const rendered = await off.startRendering();
  const wav = audioBufferToWavBlob(rendered);
  return { url: URL.createObjectURL(wav), durationSec: rendered.duration };
}

function audioBufferToWavBlob(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const samples = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataLen = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  let offset = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
