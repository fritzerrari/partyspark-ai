import { useEffect, useRef, useState } from "react";
import { X, Square } from "lucide-react";
import { useEngine } from "@/lib/audio/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A small bank of synth-loops triggered beat-quantised to the playing song.
 *  Each pad is a single short procedural sample (drum hit / chord / fx). */
type Pad = {
  id: string; label: string; color: string;
  build: (ctx: AudioContext, durSec: number, bpm: number) => AudioBuffer;
};

function buildKick(ctx: AudioContext, dur: number): AudioBuffer {
  const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 8);
    d[i] = Math.sin(2 * Math.PI * (50 + 40 * Math.exp(-t * 12)) * t) * env;
  }
  return buf;
}
function buildSnare(ctx: AudioContext, dur: number): AudioBuffer {
  const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; const env = Math.exp(-t * 15);
    d[i] = (Math.random() * 2 - 1) * env * 0.6 + Math.sin(2 * Math.PI * 200 * t) * env * 0.4;
  }
  return buf;
}
function buildHat(ctx: AudioContext, dur: number): AudioBuffer {
  const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60); }
  return buf;
}
function buildChord(freqs: number[]) {
  return (ctx: AudioContext, dur: number): AudioBuffer => {
    const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; const env = Math.exp(-t * 1.5);
      let s = 0; for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
      d[i] = (s / freqs.length) * env * 0.6;
    }
    return buf;
  };
}
function buildRiser(ctx: AudioContext, dur: number): AudioBuffer {
  const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; const f = 200 + 1800 * (t / dur); const env = t / dur;
    d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.5;
  }
  return buf;
}
function buildSweep(ctx: AudioContext, dur: number): AudioBuffer {
  const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / dur, 2);
  }
  return buf;
}

const PADS: Pad[] = [
  { id: "kick",   label: "Kick",   color: "from-rose-500 to-orange-400", build: (c) => buildKick(c, 0.4) },
  { id: "snare",  label: "Snare",  color: "from-cyan-500 to-blue-400",   build: (c) => buildSnare(c, 0.3) },
  { id: "hat",    label: "Hat",    color: "from-amber-500 to-yellow-400",build: (c) => buildHat(c, 0.12) },
  { id: "clap",   label: "Clap",   color: "from-pink-500 to-rose-400",   build: (c) => buildSnare(c, 0.25) },
  { id: "chordA", label: "Chord A",color: "from-emerald-500 to-lime-400",build: (c) => buildChord([220, 277, 330])(c, 1.2) },
  { id: "chordB", label: "Chord B",color: "from-teal-500 to-emerald-400",build: (c) => buildChord([196, 246, 294])(c, 1.2) },
  { id: "chordC", label: "Chord C",color: "from-violet-500 to-fuchsia-400",build: (c) => buildChord([261, 329, 392])(c, 1.2) },
  { id: "chordD", label: "Chord D",color: "from-indigo-500 to-violet-400",build: (c) => buildChord([174, 220, 261])(c, 1.2) },
  { id: "bass1",  label: "Bass 1", color: "from-orange-500 to-red-400",  build: (c) => buildChord([55])(c, 0.6) },
  { id: "bass2",  label: "Bass 2", color: "from-yellow-500 to-orange-400",build: (c) => buildChord([65])(c, 0.6) },
  { id: "vox",    label: "Vox Stab", color: "from-fuchsia-500 to-pink-400",build: (c) => buildChord([440, 554, 659])(c, 0.4) },
  { id: "perc",   label: "Perc",   color: "from-sky-500 to-cyan-400",    build: (c) => buildHat(c, 0.18) },
  { id: "riser",  label: "Riser",  color: "from-purple-500 to-indigo-400",build: (c) => buildRiser(c, 2) },
  { id: "sweep",  label: "Sweep",  color: "from-slate-500 to-zinc-400",  build: (c) => buildSweep(c, 1.5) },
  { id: "boom",   label: "Boom",   color: "from-red-500 to-rose-400",    build: (c) => buildKick(c, 1.0) },
  { id: "stop",   label: "Stop",   color: "from-zinc-700 to-slate-600",  build: (c) => buildHat(c, 0.01) },
];

export function LoopPadOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useEngine((s) => s.current);
  const position = useEngine((s) => s.positionSec);
  const nextBeatTime = useEngine((s) => s.nextBeatTime);
  const ctxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const [recordingPerf, setRecordingPerf] = useState(false);
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => () => { try { void ctxRef.current?.close(); } catch { /* noop */ } }, []);

  function ensureCtx(): AudioContext {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }

  function trigger(pad: Pad) {
    if (pad.id === "stop") {
      for (const v of activeRef.current.values()) { try { v.stop(); } catch { /* noop */ } }
      activeRef.current.clear();
      return;
    }
    const ctx = ensureCtx();
    const bpm = current?.bpm ?? 120;
    const beatSec = 60 / bpm;
    const dropAt = current ? nextBeatTime(position) : position;
    const delay = Math.max(0, dropAt - position);
    const buf = pad.build(ctx, beatSec, bpm);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.7;
    src.connect(g); g.connect(ctx.destination);
    if (recDestRef.current) g.connect(recDestRef.current);
    src.start(ctx.currentTime + delay);
    activeRef.current.set(pad.id + "-" + Date.now(), src);
  }

  function startPerfRec() {
    const ctx = ensureCtx();
    recDestRef.current = ctx.createMediaStreamDestination();
    const mr = new MediaRecorder(recDestRef.current.stream);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "pad-performance.webm";
      a.click(); URL.revokeObjectURL(a.href);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecordingPerf(true);
  }
  function stopPerfRec() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    recDestRef.current = null;
    setRecordingPerf(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-x-0 bottom-[180px] z-30 mx-auto max-w-[1400px] px-2 lg:bottom-[112px] lg:px-6">
      <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-stage backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-semibold">Loop-Pads</p>
            <p className="text-xs text-muted-foreground">
              Beat-quantisiert zum laufenden Song
              {current?.bpm ? ` (${Math.round(current.bpm)} BPM)` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {recordingPerf ? (
              <Button size="sm" variant="destructive" onClick={stopPerfRec} className="rounded-full">
                <Square className="mr-1 h-3 w-3" /> Stop Perf
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startPerfRec} className="rounded-full">● Perf Rec</Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PADS.map((p) => (
            <button
              key={p.id}
              onClick={() => trigger(p)}
              className={cn(
                "aspect-square rounded-xl bg-gradient-to-br text-xs font-semibold text-white shadow-stage active:scale-95 transition",
                p.color,
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}