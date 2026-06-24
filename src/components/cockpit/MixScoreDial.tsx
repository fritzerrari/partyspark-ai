import { useEffect, useRef, useState } from "react";
import { useTwinDeck, getDeckSignal } from "@/lib/audio/twinDeckBus";
import { computeMixScore, type MixScore } from "@/lib/audio/mixQuality";
import { recordMixSkill } from "@/lib/dj/skill";

export function MixScoreDial() {
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const aPlaying = useTwinDeck((s) => s.A.isPlaying);
  const bPlaying = useTwinDeck((s) => s.B.isPlaying);
  const [score, setScore] = useState<MixScore | null>(null);
  const sparkRef = useRef<number[]>([]);
  const lastInFlight = useRef(false);
  const peakScore = useRef(0);
  const sumScore = useRef(0);
  const countScore = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 220) {
        last = t;
        if (aPlaying && bPlaying) {
          const a = getDeckSignal("A");
          const b = getDeckSignal("B");
          const s = computeMixScore(a, b);
          setScore(s);
          sparkRef.current.push(s.total);
          if (sparkRef.current.length > 60) sparkRef.current.shift();
          if (s.total > peakScore.current) peakScore.current = s.total;
          sumScore.current += s.total;
          countScore.current += 1;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [aPlaying, bPlaying]);

  useEffect(() => {
    if (lastInFlight.current && !inFlight) {
      const avg = countScore.current > 0 ? Math.round(sumScore.current / countScore.current) : 0;
      const peak = Math.round(peakScore.current);
      if (avg > 0) recordMixSkill(avg, peak);
      peakScore.current = 0; sumScore.current = 0; countScore.current = 0;
    }
    lastInFlight.current = inFlight;
  }, [inFlight]);

  const total = score?.total ?? 0;
  const tone = total >= 75 ? "var(--neon-cyan)" : total >= 50 ? "var(--neon-amber)" : "var(--neon-magenta)";
  const R = 30;
  const C = 2 * Math.PI * R;
  const dash = C * (total / 100);
  const grade = total >= 88 ? "A+" : total >= 78 ? "A" : total >= 68 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "—";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
      <div className="text-center text-[9px] uppercase tracking-widest text-stage-foreground/60">Mix-Quality</div>
      <div className="mt-1 flex items-center gap-3">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle cx="40" cy="40" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <circle
              cx="40" cy="40" r={R}
              stroke={tone} strokeWidth="6" fill="none" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              className="transition-[stroke-dasharray] duration-300"
              style={{ filter: `drop-shadow(0 0 6px ${tone})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold" style={{ color: tone }}>{total}</span>
            <span className="text-[9px] uppercase tracking-widest text-stage-foreground/40">{grade}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <Sparkline points={sparkRef.current} color={tone} />
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] font-mono text-stage-foreground/70">
            <span>Phase {score?.phase ?? 0}</span>
            <span>Bass {score?.bassClash ?? 100}</span>
            <span>Beat {score?.beatAlign ?? 100}</span>
            <span>Key {score?.keyCompat ?? 100}</span>
            <span>Vox {score?.vocalClash ?? 100}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="h-6" />;
  const w = 100;
  const h = 24;
  const max = 100;
  const step = w / Math.max(1, points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
    </svg>
  );
}