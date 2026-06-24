import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { subscribeLiveDrift, getLiveDrift } from "@/lib/audio/phaseLock";
import { startDriftMonitor } from "@/lib/audio/driftMonitor";

/** Live beat-drift HUD. Shows how locked the two decks are during a blend.
 *  <40 ms = pro, <80 ms = ok, >120 ms = train wreck. */
export function BeatDriftBadge() {
  const [ms, setMs] = useState<number>(() => getLiveDrift());

  useEffect(() => {
    startDriftMonitor();
    return subscribeLiveDrift(setMs);
  }, []);

  const abs = Math.abs(ms);
  const tone =
    abs < 40 ? "var(--neon-lime, #aef25b)"
    : abs < 80 ? "var(--neon-cyan, #5be1f2)"
    : abs < 120 ? "var(--neon-amber, #f2c25b)"
    : "var(--neon-magenta, #f25bd1)";
  const label =
    abs < 40 ? "LOCKED"
    : abs < 80 ? "tight"
    : abs < 120 ? "drift"
    : "TRAIN WRECK";

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[10px]"
      style={{ boxShadow: `0 0 10px ${tone}33` }}
      title={`Beat drift between deck A & B: ${ms.toFixed(0)} ms`}
    >
      <Activity className="h-3 w-3" style={{ color: tone }} />
      <span className="font-bold uppercase tracking-widest" style={{ color: tone }}>{label}</span>
      <span className="text-stage-foreground/50">·</span>
      <span className="text-stage-foreground/70">{ms >= 0 ? "+" : ""}{ms.toFixed(0)} ms</span>
    </div>
  );
}