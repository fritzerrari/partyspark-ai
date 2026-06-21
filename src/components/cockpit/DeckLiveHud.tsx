import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { cn } from "@/lib/utils";
import { Activity, Music, ArrowDownUp, Sparkles, Loader2 } from "lucide-react";

type Props = { side: DeckSide };

/**
 * Live readout for one deck: effective BPM, effective key + semitone shift,
 * bridge-snippet status, and a beat-phase pulse. Numbers animate via CSS
 * transitions when the underlying value changes.
 */
export function DeckLiveHud({ side }: Props) {
  const deck = useTwinDeck((s) => s[side]);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const t = deck.track;
  const color = side === "A" ? "var(--neon-cyan)" : "var(--neon-magenta)";

  const nativeBpm = t?.bpm ?? null;
  const effBpm = deck.effectiveBpm ?? nativeBpm;
  const nativeKey = t?.musicalKey ?? null;
  const effKey = deck.effectiveKey ?? nativeKey;
  const shift = deck.keyShiftSemis;
  const bpmDrift = nativeBpm && effBpm ? +(effBpm - nativeBpm).toFixed(1) : 0;

  // Beat phase: 0..1 within current beat, derived from position + bpm.
  let beatPhase = 0;
  if (nativeBpm && deck.position > 0) {
    const beatLen = 60 / nativeBpm;
    beatPhase = ((deck.position % beatLen) / beatLen);
  }

  return (
    <div
      className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-[10px] font-mono"
      style={{ boxShadow: `inset 0 0 12px ${color}22` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 uppercase tracking-widest text-stage-foreground/60">
          <Activity className="h-3 w-3" /> Live
        </span>
        <div className="flex items-center gap-1">
          {/* Beat dot */}
          <span
            className="inline-block h-2 w-2 rounded-full transition-all duration-75"
            style={{
              background: color,
              opacity: deck.isPlaying ? Math.max(0.25, 1 - beatPhase) : 0.15,
              boxShadow: deck.isPlaying ? `0 0 ${4 + (1 - beatPhase) * 8}px ${color}` : "none",
            }}
            aria-label="Beat"
          />
          {inFlight && <span className="text-amber-300 animate-pulse">MIX</span>}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {/* BPM column */}
        <div className="rounded bg-white/5 px-1.5 py-1">
          <div className="text-[8px] uppercase tracking-widest text-stage-foreground/40">BPM</div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-base font-bold tabular-nums transition-colors"
              style={{ color: bpmDrift !== 0 ? color : undefined }}
            >
              {effBpm ? effBpm.toFixed(1) : "—"}
            </span>
            {nativeBpm && bpmDrift !== 0 && (
              <span className="text-[9px] text-stage-foreground/40">
                ({bpmDrift > 0 ? "+" : ""}{bpmDrift})
              </span>
            )}
          </div>
          {nativeBpm && bpmDrift !== 0 && (
            <div className="text-[8px] text-stage-foreground/40">nativ {nativeBpm.toFixed(0)}</div>
          )}
        </div>

        {/* Key column */}
        <div className="rounded bg-white/5 px-1.5 py-1">
          <div className="text-[8px] uppercase tracking-widest text-stage-foreground/40 flex items-center gap-1">
            <Music className="h-2.5 w-2.5" /> Key
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-base font-bold tabular-nums transition-colors"
              style={{ color: shift !== 0 ? color : undefined }}
            >
              {effKey ?? "—"}
            </span>
            {shift !== 0 && (
              <span className="text-[9px] text-stage-foreground/40 flex items-center gap-0.5">
                <ArrowDownUp className="h-2.5 w-2.5" />{shift > 0 ? "+" : ""}{shift}
              </span>
            )}
          </div>
          {t?.camelot && (
            <div className="text-[8px] text-stage-foreground/40">{t.camelot}</div>
          )}
        </div>
      </div>

      {/* Bridge readiness */}
      <div className="mt-1.5 flex items-center justify-between gap-1 rounded bg-white/5 px-1.5 py-1">
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-stage-foreground/50">
          <Sparkles className="h-2.5 w-2.5" /> Bridge
        </span>
        {deck.bridgeBuilding ? (
          <span className="flex items-center gap-1 text-amber-300">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> rendert…
          </span>
        ) : deck.bridgeReady ? (
          <span className="line-clamp-1 text-emerald-300" title={deck.bridgeNotes ?? ""}>
            ✓ bereit
          </span>
        ) : (
          <span className="text-stage-foreground/40">—</span>
        )}
      </div>

      {deck.bridgeReady && deck.bridgeNotes && (
        <div
          className={cn(
            "mt-1 line-clamp-1 text-[8px] text-stage-foreground/50",
          )}
        >
          {deck.bridgeNotes}
        </div>
      )}
    </div>
  );
}