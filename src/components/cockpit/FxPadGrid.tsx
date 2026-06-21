import { useEffect, useRef, useState } from "react";
import { Plus, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

type Pad = {
  id: string;
  label: string;
  emoji: string;
  /** Web-Audio synth recipe (lightweight: no external file needed). */
  synth: () => void;
};

/** Build a tiny one-shot synth using a shared AudioContext (no external assets). */
function makeSynth(kind: "horn" | "riser" | "crash" | "drop" | "laser" | "sweep" | "chop" | "kick") {
  return () => {
    if (typeof window === "undefined") return;
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(ctx.destination);

    if (kind === "horn") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 220;
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(440, now + 0.6);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 1.3);
    } else if (kind === "riser") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(2000, now + 2.5);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.6, now + 2.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 3);
    } else if (kind === "crash") {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
      const src = ctx.createBufferSource();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 4000;
      src.buffer = buf; src.connect(hp); hp.connect(out);
      src.start(now);
    } else if (kind === "drop") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.6);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 1);
    } else if (kind === "laser") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.5);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 0.7);
    } else if (kind === "sweep") {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.8, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      const src = ctx.createBufferSource();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, now);
      lp.frequency.exponentialRampToValueAtTime(8000, now + 1.8);
      src.buffer = buf; src.connect(lp); lp.connect(out);
      src.start(now);
    } else if (kind === "chop") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 660;
      for (let i = 0; i < 6; i++) {
        const t0 = now + i * 0.08;
        gain.gain.setValueAtTime(0.5, t0);
        gain.gain.setValueAtTime(0, t0 + 0.04);
      }
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 0.6);
    } else if (kind === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + 0.3);
    }
    setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 4000);
  };
}

const DEFAULT_PADS: Pad[] = [
  { id: "horn",  label: "Air-Horn", emoji: "📯", synth: makeSynth("horn") },
  { id: "riser", label: "Riser",    emoji: "🚀", synth: makeSynth("riser") },
  { id: "crash", label: "Crash",    emoji: "💥", synth: makeSynth("crash") },
  { id: "drop",  label: "Drop",     emoji: "🔻", synth: makeSynth("drop") },
  { id: "laser", label: "Laser",    emoji: "🛸", synth: makeSynth("laser") },
  { id: "sweep", label: "Sweep",    emoji: "🌊", synth: makeSynth("sweep") },
  { id: "chop",  label: "Chop",     emoji: "✂️", synth: makeSynth("chop") },
  { id: "kick",  label: "Kick",     emoji: "🥁", synth: makeSynth("kick") },
];

export function FxPadGrid() {
  const [custom, setCustom] = useState<{ id: string; label: string; url: string }[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function trigger(id: string, fn: () => void) {
    setFlash(id);
    try { fn(); } catch { /* noop */ }
    setTimeout(() => setFlash(null), 250);
  }

  function triggerCustom(id: string, url: string) {
    setFlash(id);
    try {
      const a = new Audio(url);
      void a.play().catch(() => {});
    } catch { /* noop */ }
    setTimeout(() => setFlash(null), 250);
  }

  function onAddFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCustom((c) => [...c, { id: `c${Date.now()}`, label: f.name.replace(/\.[^.]+$/, "").slice(0, 12), url }]);
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = ["1","2","3","4","5","6","7","8"].indexOf(e.key);
      if (idx >= 0 && DEFAULT_PADS[idx]) {
        trigger(DEFAULT_PADS[idx].id, DEFAULT_PADS[idx].synth);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="neon-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/60 flex items-center gap-1">
          <Radio className="h-3 w-3" /> FX-Pads
        </span>
        <span className="text-[9px] text-stage-foreground/50">Tasten 1-8</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {DEFAULT_PADS.map((p, i) => (
          <button
            key={p.id}
            onClick={() => trigger(p.id, p.synth)}
            className={cn(
              "aspect-square rounded-lg border-2 border-white/10 bg-white/5 text-stage-foreground transition-all active:scale-95",
              "flex flex-col items-center justify-center gap-0.5 hover:border-[var(--neon-cyan)]/60",
              flash === p.id && "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_25%,transparent)] neon-glow-cyan",
            )}
          >
            <span className="text-xl">{p.emoji}</span>
            <span className="text-[9px] uppercase tracking-widest">{p.label}</span>
            <span className="text-[8px] text-stage-foreground/40">[{i + 1}]</span>
          </button>
        ))}
        {custom.map((p) => (
          <button
            key={p.id}
            onClick={() => triggerCustom(p.id, p.url)}
            className={cn(
              "aspect-square rounded-lg border-2 border-white/10 bg-white/5 text-stage-foreground transition-all active:scale-95",
              "flex flex-col items-center justify-center gap-0.5 hover:border-[var(--neon-magenta)]/60",
              flash === p.id && "border-[var(--neon-magenta)] bg-[color-mix(in_oklab,var(--neon-magenta)_25%,transparent)] neon-glow-magenta",
            )}
          >
            <span className="text-xl">🎵</span>
            <span className="text-[9px] uppercase tracking-widest line-clamp-1">{p.label}</span>
          </button>
        ))}
        <label className="aspect-square rounded-lg border-2 border-dashed border-white/15 bg-white/5 text-stage-foreground/50 hover:border-[var(--neon-cyan)]/40 hover:text-stage-foreground flex flex-col items-center justify-center gap-1 cursor-pointer">
          <Plus className="h-5 w-5" />
          <span className="text-[9px] uppercase tracking-widest">Datei</span>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onAddFile} />
        </label>
      </div>
    </div>
  );
}