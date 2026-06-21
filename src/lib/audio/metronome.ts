// Web Audio metronome with lookahead scheduler (Chris Wilson pattern).
// Provides downbeat/offbeat clicks + a shared AudioContext clock that
// other modules (loop recorder) can sync to.
export type TimeSig = "2/4" | "3/4" | "4/4" | "6/8";

export type MetronomeEvent =
  | { type: "tick"; beat: number; bar: number; isDownbeat: boolean; time: number }
  | { type: "countin-done"; time: number };

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export class Metronome {
  ctx: AudioContext;
  out: GainNode;
  bpm: number;
  sig: TimeSig;
  beatsPerBar: number;
  isPlaying = false;
  currentBeat = 0; // 0-based since start
  private nextNoteTime = 0;
  private timerId: number | null = null;
  private listeners = new Set<(e: MetronomeEvent) => void>();
  private countInBeatsRemaining = 0;
  startTime = 0;

  constructor(ctx: AudioContext, opts: { bpm?: number; sig?: TimeSig; volume?: number } = {}) {
    this.ctx = ctx;
    this.bpm = opts.bpm ?? 120;
    this.sig = opts.sig ?? "4/4";
    this.beatsPerBar = parseInt(this.sig.split("/")[0], 10);
    this.out = ctx.createGain();
    this.out.gain.value = opts.volume ?? 0.5;
    this.out.connect(ctx.destination);
  }

  setBpm(bpm: number) { this.bpm = Math.max(40, Math.min(220, bpm)); }
  setSig(sig: TimeSig) { this.sig = sig; this.beatsPerBar = parseInt(sig.split("/")[0], 10); }
  setVolume(v: number) { this.out.gain.value = Math.max(0, Math.min(1, v)); }

  subscribe(fn: (e: MetronomeEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: MetronomeEvent) { for (const l of this.listeners) l(e); }

  start(countInBars = 0) {
    if (this.isPlaying) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.isPlaying = true;
    this.currentBeat = 0;
    this.countInBeatsRemaining = countInBars * this.beatsPerBar;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.startTime = this.nextNoteTime;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
  }

  /** Time of the n-th beat since start, in audio-clock seconds. */
  beatTime(n: number): number {
    return this.startTime + n * (60 / this.bpm);
  }

  /** Next downbeat time at or after the given audio-clock time. */
  nextDownbeatAfter(t: number): number {
    const period = 60 / this.bpm;
    const barLen = this.beatsPerBar * period;
    const elapsed = t - this.startTime;
    const bars = Math.ceil(elapsed / barLen);
    return this.startTime + bars * barLen;
  }

  private scheduler = () => {
    if (!this.isPlaying) return;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      this.scheduleClick(this.currentBeat, this.nextNoteTime);
      this.advance();
    }
    this.timerId = window.setTimeout(this.scheduler, LOOKAHEAD_MS) as unknown as number;
  };

  private advance() {
    const period = 60 / this.bpm;
    this.nextNoteTime += period;
    this.currentBeat++;
  }

  private scheduleClick(beat: number, time: number) {
    const beatInBar = beat % this.beatsPerBar;
    const isDownbeat = beatInBar === 0;
    const bar = Math.floor(beat / this.beatsPerBar);

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = isDownbeat ? 1500 : 900;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(isDownbeat ? 0.9 : 0.5, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.07);

    this.emit({ type: "tick", beat, bar, isDownbeat, time });

    if (this.countInBeatsRemaining > 0) {
      this.countInBeatsRemaining--;
      if (this.countInBeatsRemaining === 0) {
        this.emit({ type: "countin-done", time: time + 60 / this.bpm });
      }
    }
  }
}

/** Compute peak-data array (0..1) from an AudioBuffer for waveform rendering. */
export function computePeaks(buf: AudioBuffer, bins = 256): number[] {
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / bins));
  const peaks: number[] = [];
  for (let i = 0; i < bins; i++) {
    let max = 0;
    const start = i * step;
    const end = Math.min(ch.length, start + step);
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    peaks.push(+max.toFixed(3));
  }
  return peaks;
}
