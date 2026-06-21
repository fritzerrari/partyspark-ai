// Multitrack mixer: each lane is one recorded AudioBuffer with mute/solo/vol/pan.
// Playback uses one shared AudioContext, all tracks start/stop in sync.
import { audioBufferToWav } from "./pitchShift";

export type TrackId = string;

export type Track = {
  id: TrackId;
  name: string;
  buffer: AudioBuffer;
  blob?: Blob;            // original webm/wav
  volume: number;         // 0..1.5
  pan: number;            // -1..1
  muted: boolean;
  soloed: boolean;
  color: string;          // hex
  startSec: number;       // offset in the master timeline
  durationSec: number;
  peakData?: Float32Array; // downsampled peaks for waveform draw
};

const COLORS = ["#FF6B9D", "#5BCFFA", "#A6E22E", "#FFB454", "#C792EA", "#FF5370", "#82AAFF", "#F78C6C"];

export function pickColor(i: number) { return COLORS[i % COLORS.length]; }

/** Downsample an AudioBuffer to N peak values for waveform rendering. */
export function buildPeaks(buf: AudioBuffer, samples = 600): Float32Array {
  const ch = buf.getChannelData(0);
  const blockSize = Math.floor(ch.length / samples);
  if (blockSize < 1) return new Float32Array(ch);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(ch[start + j] ?? 0);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

export type ActiveVoice = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
};

export class MultitrackPlayer {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  analyser: AnalyserNode;
  voices = new Map<TrackId, ActiveVoice>();
  playing = false;
  playStartCtxTime = 0;
  playStartOffset = 0;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.95;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /** Effective mute: respects solo state across the track set. */
  private isAudible(t: Track, anySolo: boolean): boolean {
    if (anySolo) return t.soloed;
    return !t.muted;
  }

  async play(tracks: Track[], fromSec = 0) {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stop();
    const anySolo = tracks.some((t) => t.soloed);
    const now = this.ctx.currentTime;
    this.playStartCtxTime = now + 0.05;
    this.playStartOffset = fromSec;

    for (const t of tracks) {
      if (!this.isAudible(t, anySolo)) continue;
      const trackStart = t.startSec;
      const trackEnd = trackStart + t.durationSec;
      if (fromSec >= trackEnd) continue;

      const src = this.ctx.createBufferSource();
      src.buffer = t.buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = t.volume;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = t.pan;
      src.connect(gain); gain.connect(panner); panner.connect(this.master);

      // Where in the master timeline should this voice start
      const masterDelay = Math.max(0, trackStart - fromSec);
      // Where in the buffer should playback begin
      const bufOffset = Math.max(0, fromSec - trackStart);
      src.start(this.playStartCtxTime + masterDelay, bufOffset);
      this.voices.set(t.id, { src, gain, panner });
    }
    this.playing = true;
  }

  stop() {
    for (const v of this.voices.values()) {
      try { v.src.stop(); } catch { /* noop */ }
      try { v.src.disconnect(); v.gain.disconnect(); v.panner.disconnect(); } catch { /* noop */ }
    }
    this.voices.clear();
    this.playing = false;
  }

  /** Current master timeline position in seconds. */
  position(): number {
    if (!this.playing) return this.playStartOffset;
    return this.playStartOffset + (this.ctx.currentTime - this.playStartCtxTime);
  }

  /** Hot-tune one track without restarting playback. */
  liveUpdate(t: Track, anySolo: boolean) {
    const v = this.voices.get(t.id);
    if (!v) return;
    const audible = this.isAudible(t, anySolo);
    v.gain.gain.setTargetAtTime(audible ? t.volume : 0, this.ctx.currentTime, 0.03);
    v.panner.pan.setTargetAtTime(t.pan, this.ctx.currentTime, 0.03);
  }

  setMasterVolume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  dispose() {
    this.stop();
    try { this.master.disconnect(); this.limiter.disconnect(); this.analyser.disconnect(); } catch { /* noop */ }
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}

/** Render the entire multitrack to one stereo WAV via OfflineAudioContext. */
export async function mixdown(tracks: Track[]): Promise<Blob> {
  const sr = tracks[0]?.buffer.sampleRate ?? 48000;
  const projectEnd = Math.max(...tracks.map((t) => t.startSec + t.durationSec), 1);
  const ctx = new OfflineAudioContext(2, Math.ceil(projectEnd * sr) + sr, sr);
  const master = ctx.createGain(); master.gain.value = 0.95;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  master.connect(limiter); limiter.connect(ctx.destination);

  const anySolo = tracks.some((t) => t.soloed);
  for (const t of tracks) {
    if (anySolo ? !t.soloed : t.muted) continue;
    const src = ctx.createBufferSource();
    src.buffer = t.buffer;
    const gain = ctx.createGain(); gain.gain.value = t.volume;
    const panner = ctx.createStereoPanner(); panner.pan.value = t.pan;
    src.connect(gain); gain.connect(panner); panner.connect(master);
    src.start(t.startSec);
  }

  const rendered = await ctx.startRendering();
  return audioBufferToWav(rendered);
}

/** Decode an audio blob into an AudioBuffer using a short-lived context. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arr = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(arr.slice(0));
  await ctx.close();
  return buf;
}