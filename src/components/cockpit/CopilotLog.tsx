import { useCopilotLog } from "@/lib/dj/copilotLog";
import { cn } from "@/lib/utils";

export function CopilotLog() {
  const entries = useCopilotLog((s) => s.entries);
  const clear = useCopilotLog((s) => s.clear);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--neon-cyan)]">
          Copilot
        </span>
        <span className="text-[10px] uppercase tracking-widest text-stage-foreground/40">
          live engine log
        </span>
        <button
          onClick={clear}
          className="ml-auto rounded border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-stage-foreground/60 hover:bg-white/10"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug">
        {entries.length === 0 ? (
          <div className="text-stage-foreground/40">
            Engine-Kommentare erscheinen hier, sobald du einen Übergang startest.
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className={cn(
                "rounded border-l-2 bg-white/5 px-2 py-1",
                e.kind === "act"  && "border-[var(--neon-cyan)] text-stage-foreground",
                e.kind === "ok"   && "border-[var(--neon-lime)] text-[color-mix(in_oklab,var(--neon-lime)_70%,white)]",
                e.kind === "warn" && "border-red-400 text-red-200",
                e.kind === "info" && "border-white/20 text-stage-foreground/70",
              )}
            >
              {e.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
}