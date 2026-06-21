import { useEffect, useRef } from "react";

export type PitchSample = { t: number; midi: number; cents: number };

type Props = {
  active: boolean;
  current: { midi: number; cents: number; clarity: number; noteName: string } | null;
  history: PitchSample[]; // recent samples; we keep last ~6s
};

/**
 * Live pitch trace: shows the singer's pitch over time as a flowing line.
 * Center line = target note (snapped to nearest semitone).
 * Above = sharp, below = flat. ±50 cents max.
 */
export function PitchCoach({ active, current, history }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width = c.clientWidth * window.devicePixelRatio;
    const h = c.height = c.clientHeight * window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    // Gridlines for ±25/50 cents
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const y = h / 2 + (i / 4) * (h / 2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Center target line
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

    if (history.length < 2) return;
    const now = history[history.length - 1].t;
    const windowSec = 6;
    const start = now - windowSec;

    ctx.lineWidth = 3 * window.devicePixelRatio;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    for (const s of history) {
      if (s.t < start) continue;
      const x = ((s.t - start) / windowSec) * w;
      const y = h / 2 - (s.cents / 50) * (h / 2);
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
    }
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#FF6B9D");
    grad.addColorStop(0.5, "#5BCFFA");
    grad.addColorStop(1, "#A6E22E");
    ctx.strokeStyle = grad;
    ctx.stroke();

    // Current sharp/flat dot
    if (current) {
      const x = w - 12;
      const y = h / 2 - (current.cents / 50) * (h / 2);
      ctx.fillStyle = Math.abs(current.cents) < 15 ? "#A6E22E" : Math.abs(current.cents) < 30 ? "#FFB454" : "#FF5370";
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    }
  }, [history, current]);

  return (
    <div className="relative rounded-2xl border border-border bg-stage/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pitch Coach</h4>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold text-stage-foreground">
            {active && current ? current.noteName : "—"}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {active && current ? `${current.cents > 0 ? "+" : ""}${current.cents.toFixed(0)} cents` : ""}
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} className="h-32 w-full rounded-xl bg-stage" />
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>♭ 50¢ flat</span>
        <span>on pitch</span>
        <span>♯ 50¢ sharp</span>
      </div>
    </div>
  );
}