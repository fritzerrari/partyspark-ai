import { useEffect, useState } from "react";
import { useTwinDeck, peekNextPlan } from "@/lib/audio/twinDeckBus";
import { TRANSITION_LABELS } from "@/lib/audio/engine";
import { Wand2, ArrowRight, TrendingUp, TrendingDown, Minus, Music2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

type Peek = ReturnType<typeof peekNextPlan>;

export function NextMoveCard() {
  const autoTimerOn = useTwinDeck((s) => s.autoTimerOn);
  const autoTimerSec = useTwinDeck((s) => s.autoTimerSec);
  const autoTimerCountdown = useTwinDeck((s) => s.autoTimerCountdown);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const A = useTwinDeck((s) => s.A);
  const B = useTwinDeck((s) => s.B);
  const transitionMode = useTwinDeck((s) => s.transitionMode);

  const [peek, setPeek] = useState<Peek>(null);
  useEffect(() => {
    const tick = () => setPeek(peekNextPlan());
    tick();
    const id = window.setInterval(tick, 600);
    return () => clearInterval(id);
  }, [autoTimerOn, transitionMode, A.track?.id, B.track?.id, inFlight]);

  if (!peek) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center text-[11px] text-stage-foreground/50">
        Lade beide Decks für die Next-Move-Vorschau.
      </div>
    );
  }

  const fromTrack = peek.from === "A" ? A.track : B.track;
  const toTrack = peek.to === "A" ? A.track : B.track;
  const fromBpm = fromTrack?.bpm ?? null;
  const toBpm = toTrack?.bpm ?? null;
  const energyFrom = fromTrack?.energy ?? null;
  const energyTo = toTrack?.energy ?? null;
  const dE = (energyTo ?? 50) - (energyFrom ?? 50);
  const EnergyIcon = dE > 8 ? TrendingUp : dE < -8 ? TrendingDown : Minus;

  const ringPct = autoTimerOn && peek.triggerInSec != null
    ? Math.max(0, Math.min(1, 1 - peek.triggerInSec / Math.max(1, autoTimerSec)))
    : 0;
  const R = 22;
  const C = 2 * Math.PI * R;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-all",
        inFlight
          ? "border-[var(--neon-amber)]/60 bg-[color-mix(in_oklab,var(--neon-amber)_8%,black)] animate-pulse"
          : "border-white/10 bg-black/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
            <circle cx="30" cy="30" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
            <circle
              cx="30" cy="30" r={R}
              stroke="var(--neon-cyan)" strokeWidth="4" fill="none"
              strokeDasharray={C} strokeDashoffset={C * (1 - ringPct)}
              className="transition-[stroke-dashoffset] duration-700 ease-linear"
              style={{ filter: "drop-shadow(0 0 4px var(--neon-cyan))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {autoTimerOn && peek.triggerInSec != null ? (
              <>
                <span className="text-[14px] font-bold leading-none text-stage-foreground">{peek.triggerInSec}</span>
                <span className="text-[7px] uppercase tracking-widest text-stage-foreground/50">sek</span>
              </>
            ) : (
              <Wand2 className="h-5 w-5 text-stage-foreground/60" />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-stage-foreground/60">
            <Timer className="h-3 w-3" /> Next Move
            {inFlight && <span className="ml-auto rounded bg-[var(--neon-amber)]/30 px-1.5 py-0.5 text-[9px] font-bold text-[var(--neon-amber)]">LIVE</span>}
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-stage-foreground">
            {TRANSITION_LABELS[peek.mode] ?? peek.mode}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[10px] text-stage-foreground/60">{peek.note}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 items-center gap-2 rounded-md border border-white/5 bg-black/30 px-2 py-1.5 text-[10px] font-mono">
        <div className="text-center">
          <div className="text-[8px] uppercase text-stage-foreground/40">{peek.from}</div>
          <div className="font-bold text-[var(--neon-cyan)]">{fromBpm ? Math.round(fromBpm) : "?"}</div>
          <div className="text-stage-foreground/60">{fromTrack?.camelot ?? "?"}</div>
        </div>
        <div className="text-center text-stage-foreground/70">
          {peek.midBpm != null && peek.mode === "meetMiddle" ? (
            <div className="text-[var(--neon-amber)] font-bold">→{Math.round(peek.midBpm)}←</div>
          ) : (
            <ArrowRight className="mx-auto h-3 w-3" />
          )}
          <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] text-stage-foreground/50">
            <Music2 className="h-3 w-3" /> Δ{peek.keyShiftSemis > 0 ? "+" : ""}{peek.keyShiftSemis}st
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px]">
            <EnergyIcon className="h-3 w-3" /> {dE > 0 ? "+" : ""}{Math.round(dE)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] uppercase text-stage-foreground/40">{peek.to}</div>
          <div className="font-bold text-[var(--neon-magenta)]">{toBpm ? Math.round(toBpm) : "?"}</div>
          <div className="text-stage-foreground/60">{toTrack?.camelot ?? "?"}</div>
        </div>
      </div>
    </div>
  );
}