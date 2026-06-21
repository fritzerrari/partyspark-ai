export function EnergyMeter({ value, dark = false }: { value: number; dark?: boolean }) {
  return (
    <div className={dark ? "rounded-2xl border border-stage-border bg-white/5 p-4 backdrop-blur" : "rounded-2xl border border-border bg-card p-4"}>
      <div className="flex items-center justify-between">
        <span className={"text-[10px] uppercase tracking-widest " + (dark ? "text-stage-foreground/60" : "text-muted-foreground")}>
          Energy
        </span>
        <span className={"font-display text-2xl font-bold " + (dark ? "text-stage-foreground" : "text-foreground")}>
          {Math.round(value)}
        </span>
      </div>
      <div className={"mt-2 h-2 overflow-hidden rounded-full " + (dark ? "bg-white/10" : "bg-muted")}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-accent transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}