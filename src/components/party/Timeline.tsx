const PHASES = [
  { id: "arrival", label: "Arrival", emoji: "🚪" },
  { id: "dinner", label: "Dinner", emoji: "🍽️" },
  { id: "warmup", label: "Warm-up", emoji: "🎶" },
  { id: "peak", label: "Dancefloor", emoji: "🔥" },
  { id: "afterparty", label: "Afterparty", emoji: "🌙" },
];

export function Timeline({ progress, dark = false }: { progress: number; dark?: boolean }) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <div className={dark ? "rounded-2xl border border-stage-border bg-white/5 p-5 backdrop-blur" : "rounded-2xl border border-border bg-card p-5"}>
      <div className="flex items-center justify-between">
        <p className={"text-[10px] uppercase tracking-widest " + (dark ? "text-stage-foreground/60" : "text-muted-foreground")}>Party Timeline</p>
        <p className={"text-xs " + (dark ? "text-stage-foreground/70" : "text-muted-foreground")}>{Math.round(pct)}%</p>
      </div>
      <div className="relative mt-4">
        <div className={"h-1.5 rounded-full " + (dark ? "bg-white/10" : "bg-muted")} />
        <div
          className="absolute left-0 top-0 h-1.5 rounded-full bg-gradient-to-r from-primary to-accent transition-all"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-1.5 h-4.5 w-1 -translate-x-1/2 rounded-full bg-accent shadow-stage transition-all"
          style={{ left: `${pct}%`, height: 18 }}
        />
      </div>
      <div className="mt-4 flex justify-between gap-2">
        {PHASES.map((p, i) => {
          const phasePct = (i / (PHASES.length - 1)) * 100;
          const reached = pct >= phasePct - 10;
          return (
            <div key={p.id} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <span className={"text-lg transition " + (reached ? "" : "opacity-40")}>{p.emoji}</span>
              <span className={"mt-1 truncate text-[10px] " + (reached ? (dark ? "text-stage-foreground" : "text-foreground") : dark ? "text-stage-foreground/40" : "text-muted-foreground")}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}