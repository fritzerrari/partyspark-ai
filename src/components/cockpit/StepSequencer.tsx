import { useEffect, useRef, useState, useCallback } from "react";
import { NeonButton } from "@/components/ui/NeonButton";
import { Led } from "@/components/ui/LedIndicator";
import { RotaryKnob } from "@/components/ui/RotaryKnob";
import { useEngine } from "@/lib/audio/engine";
import { Play, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Voice = "kick" | "snare" | "hat" | "perc" | "bass" | "lead";
const VOICES: { id: Voice; label: string; color: "cyan" | "magenta" | "amber" | "lime" }[] = [
  { id: "kick",  label: "Kick",  color: "cyan" },
  { id: "snare", label: "Snare", color: "magenta" },
  { id: "hat",   label: "Hat",   color: "amber" },
  { id: "perc",  label: "Perc",  color: "lime" },
  { id: "bass",  label: "Bass",  color: "cyan" },
  { id: "lead",  label: "Lead",  color: "magenta" },
];

const STEPS = 16;
type Pattern = Record<Voice, boolean[]>;
const emptyPattern = (): Pattern =>
  Object.fromEntries(VOICES.map((v) => [v.id, Array(STEPS).fill(false)])) as Pattern;

function trigger(ctx: AudioContext, voice: Voice, time: number, gain: number) {
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);

  if (voice === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    g.gain.setValueAtTime(1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    o.connect(g).connect(out);
    o.start(time); o.stop(time + 0.45);
  } else if (voice === "snare") {
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.connect(hp).connect(g).connect(out);
    noise.start(time);
  } else if (voice === "hat") {
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    noise.connect(hp).connect(g).connect(out);
    noise.start(time);
  } else if (voice === "perc") {
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(800, time);
    o.frequency.exponentialRampToValueAtTime(200, time + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    o.connect(g).connect(out);
    o.start(time); o.stop(time + 0.2);
  } else if (voice === "bass") {
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(55, time);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    o.connect(lp).connect(g).connect(out);
    o.start(time); o.stop(time + 0.32);
  } else if (voice === "lead") {
    const o = ctx.createOscillator(); o.type = "square";
    o.frequency.setValueAtTime(440, time);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    o.connect(g).connect(out);
    o.start(time); o.stop(time + 0.27);
  }
}

export function StepSequencer() {
  const masterBpm = useEngine((s) => s.current?.bpm ?? null);
  const [bpm, setBpm] = useState(120);
  useEffect(() => { if (masterBpm) setBpm(Math.round(masterBpm)); }, [masterBpm]);

  const [pattern, setPattern] = useState<Pattern>(emptyPattern());
  const [muted, setMuted] = useState<Record<Voice, boolean>>(
    Object.fromEntries(VOICES.map((v) => [v.id, false])) as Record<Voice, boolean>,
  );
  const [vol, setVol] = useState(0.7);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const patternRef = useRef(pattern);
  const mutedRef = useRef(muted);
  const bpmRef = useRef(bpm);
  const volRef = useRef(vol);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { volRef.current = vol; }, [vol]);

  const start = useCallback(async () => {
    if (running) return;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current!;
    if (ctx.state === "suspended") await ctx.resume();
    stepRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    setRunning(true);

    intervalRef.current = window.setInterval(() => {
      const lookahead = 0.1;
      while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
        const s = stepRef.current;
        for (const { id } of VOICES) {
          if (mutedRef.current[id]) continue;
          if (patternRef.current[id][s]) {
            trigger(ctx, id, nextNoteTimeRef.current, volRef.current);
          }
        }
        setStep(s);
        const secPerStep = 60 / bpmRef.current / 4; // 16th notes
        nextNoteTimeRef.current += secPerStep;
        stepRef.current = (s + 1) % STEPS;
      }
    }, 25);
  }, [running]);

  const stop = useCallback(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setStep(0);
  }, []);

  useEffect(() => () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    ctxRef.current?.close();
  }, []);

  const toggleCell = (v: Voice, i: number) => {
    setPattern((p) => {
      const row = [...p[v]]; row[i] = !row[i];
      return { ...p, [v]: row };
    });
  };

  return (
    <div className="neon-surface scanlines rounded-2xl p-3">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--neon-cyan)]">Sequencer</span>
        <Led color={running ? "lime" : "off"} blink={running} label={running ? "RUN" : "STOP"} />
        <div className="ml-auto flex items-center gap-2">
          <input
            type="number" min={60} max={200} value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value || "120"))}
            className="h-7 w-16 rounded border border-white/10 bg-black/30 px-2 text-center font-mono text-xs text-stage-foreground"
          />
          <span className="text-[10px] uppercase tracking-widest text-stage-foreground/60">BPM</span>
          <RotaryKnob value={vol} onChange={setVol} label="Mix" color="amber" size={36} />
          {!running ? (
            <NeonButton onClick={start} variant="active" size="sm"><Play className="h-3 w-3" /> Run</NeonButton>
          ) : (
            <NeonButton onClick={stop} variant="danger" size="sm"><Square className="h-3 w-3" /> Stop</NeonButton>
          )}
          <NeonButton onClick={() => setPattern(emptyPattern())} variant="ghost" size="sm"><Trash2 className="h-3 w-3" /></NeonButton>
        </div>
      </div>

      <div className="space-y-1">
        {VOICES.map((v) => (
          <div key={v.id} className="flex items-center gap-1">
            <button
              onClick={() => setMuted((m) => ({ ...m, [v.id]: !m[v.id] }))}
              className={cn(
                "h-7 w-14 shrink-0 rounded border border-white/10 text-[10px] font-bold uppercase tracking-widest transition-all",
                muted[v.id]
                  ? "bg-[color-mix(in_oklab,var(--neon-magenta)_30%,transparent)] text-stage-foreground animate-led-blink"
                  : "bg-white/5 text-stage-foreground/80 hover:bg-white/10",
              )}
              title={muted[v.id] ? "Unmute" : "Mute"}
            >
              {v.label}
            </button>
            <div className="grid grid-cols-16 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${STEPS}, minmax(0, 1fr))` }}>
              {pattern[v.id].map((on, i) => {
                const isBeat = i % 4 === 0;
                const isCursor = running && step === i;
                return (
                  <button
                    key={i}
                    onClick={() => toggleCell(v.id, i)}
                    className={cn(
                      "h-7 rounded border transition-all",
                      on
                        ? v.color === "cyan" ? "bg-[var(--neon-cyan)] border-[var(--neon-cyan)] neon-glow-cyan"
                        : v.color === "magenta" ? "bg-[var(--neon-magenta)] border-[var(--neon-magenta)] neon-glow-magenta"
                        : v.color === "amber" ? "bg-[var(--neon-amber)] border-[var(--neon-amber)] neon-glow-amber"
                        : "bg-[var(--neon-lime)] border-[var(--neon-lime)]"
                        : isBeat ? "bg-white/10 border-white/15 hover:bg-white/15"
                                 : "bg-white/5 border-white/10 hover:bg-white/10",
                      isCursor && "ring-2 ring-white/70",
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}