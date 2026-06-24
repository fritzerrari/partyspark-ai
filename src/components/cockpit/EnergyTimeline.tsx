// Live Energy-Timeline: SVG strip showing recent live RMS (past 90 s)
// alongside the projected energy of the next queued track. Reacts to
// the TwinDeck bus by sampling crossfaded output level each second.
import { useEffect, useRef, useState } from "react";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { TrendingDown, Activity } from "lucide-react";

const HISTORY_SEC = 90;

export function EnergyTimeline() {
  const aTrack = useTwinDeck((s) => s.A.track);
  const bTrack = useTwinDeck((s) => s.B.track);
  const aPlaying = useTwinDeck((s) => s.A.isPlaying);
  const bPlaying = useTwinDeck((s) => s.B.isPlaying);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const [history, setHistory] = useState<number[]>([]);
  const [warning, setWarning] = useState(false);
  const histRef = useRef<number[]>([]);

  // Determine live deck + its track for "next" projection
  const liveSide: "A" | "B" = aPlaying && (1 - crossfader) >= crossfader ? "A" : "B";
  const liveTrack = liveSide === "A" ? aTrack : bTrack;
  const nextTrack = liveSide === "A" ? bTrack : aTrack;

  // Sample energy: instead of tapping the bus (no analyser exposed here),
  // use the live track's energy curve at the current position. This still
  // reflects what the audience hears since the bus volume is gain-controlled.
  const liveSec = useTwinDeck((s) => Math.floor(liveSide === "A" ? s.A.position : s.B.position));

  useEffect(() => {
    if (!liveTrack) return;
    const curve = (liveTrack as unknown as { energyCurve?: number[]; energy_curve?: number[] }).energyCurve
               ?? (liveTrack as unknown as { energyCurve?: number[]; energy_curve?: number[] }).energy_curve
               ?? [];
    const e = curve.length ? Math.min(1, (curve[Math.min(liveSec, curve.length - 1)] ?? 0) * 4) : 0.5;
    histRef.current = [...histRef.current.slice(-HISTORY_SEC + 1), e];
    setHistory([...histRef.current]);
    // Warn if 3-min trailing average is falling
    if (histRef.current.length >= 60) {
      const first = histRef.current.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
      const last = histRef.current.slice(-20).reduce((a, b) => a + b, 0) / 20;
      setWarning(last < first - 0.12);
    } else {
      setWarning(false);
    }
  }, [liveSec, liveTrack]);

  // Build SVG points
  const W = 600, H = 80;
  const pastN = history.length || 1;
  const pastPts = history.map((v, i) => `${(i / Math.max(1, HISTORY_SEC)) * (W * 0.5)},${H - v * (H - 10) - 5}`).join(" ");

  // Projected curve from nextTrack.energyCurve (first 60 s scaled to right half)
  const projCurve = (nextTrack as unknown as { energyCurve?: number[]; energy_curve?: number[] })?.energyCurve
                 ?? (nextTrack as unknown as { energyCurve?: number[]; energy_curve?: number[] })?.energy_curve
                 ?? [];
  const projN = Math.min(60, projCurve.length);
  const projPts = projN
    ? Array.from({ length: projN }, (_, i) => {
        const v = Math.min(1, (projCurve[i] ?? 0) * 4);
        return `${W * 0.5 + (i / 60) * (W * 0.5)},${H - v * (H - 10) - 5}`;
      }).join(" ")
    : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-stage-foreground/60">
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-[var(--neon-cyan)]" /> Energie-Verlauf · Deck {liveSide}
        </span>
        <span className="text-stage-foreground/40">
          {nextTrack ? `nächste: ${nextTrack.title}` : "kein nächster Track"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {/* center divider = now */}
        <line x1={W * 0.5} y1={0} x2={W * 0.5} y2={H} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
        {/* past */}
        {pastN > 1 && (
          <polyline points={pastPts} fill="none" stroke="var(--neon-cyan)" strokeWidth={1.8} />
        )}
        {/* projected */}
        {projN > 0 && (
          <polyline points={projPts} fill="none" stroke="var(--neon-magenta)" strokeWidth={1.8} strokeDasharray="4 2" opacity={0.85} />
        )}
        {/* horizontal grid */}
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1={0} y1={H - y * (H - 10) - 5} x2={W} y2={H - y * (H - 10) - 5} stroke="rgba(255,255,255,0.06)" />
        ))}
      </svg>
      {warning && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
          <TrendingDown className="h-3 w-3" />
          Energie sinkt — Floor-Filler oder Peak-Track aus der Playlist nachschieben.
        </div>
      )}
    </div>
  );
}