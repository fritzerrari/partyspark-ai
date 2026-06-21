const MOODS = ["Warm-up", "Build", "Peak", "Sing-along", "Wind-down"] as const;
export type Mood = (typeof MOODS)[number];

const HUE: Record<Mood, string> = {
  "Warm-up": "from-sky-300 to-cyan-300",
  Build: "from-cyan-400 to-primary",
  Peak: "from-primary to-accent",
  "Sing-along": "from-accent to-pink-400",
  "Wind-down": "from-indigo-400 to-purple-400",
};

export function MoodPill({
  value,
  onChange,
  dark = false,
}: {
  value: string;
  onChange?: (m: Mood) => void;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "rounded-2xl border border-stage-border bg-white/5 p-4 backdrop-blur" : "rounded-2xl border border-border bg-card p-4"}>
      <p className={"text-[10px] uppercase tracking-widest " + (dark ? "text-stage-foreground/60" : "text-muted-foreground")}>Mood</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MOODS.map((m) => {
          const on = m === value;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange?.(m)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold transition " +
                (on
                  ? `bg-gradient-to-r ${HUE[m]} text-foreground shadow`
                  : dark
                    ? "bg-white/10 text-stage-foreground/70 hover:bg-white/15"
                    : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { MOODS };