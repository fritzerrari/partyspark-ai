import { type ReactNode } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  children?: ReactNode;
  className?: string;
};

/** The "do-it-for-me" button. Big, glowing, beginner-friendly.
 *  Every module exposes one. Power users still see manual controls below. */
export function AutoMagicButton({ onClick, loading, disabled, label = "Auto-Magic", hint, className }: Props) {
  return (
    <div className={cn("flex flex-col items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={() => { void onClick(); }}
        disabled={loading || disabled}
        className={cn(
          "group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all",
          "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_15%,transparent)] text-stage-foreground",
          "neon-glow-cyan hover:bg-[color-mix(in_oklab,var(--neon-cyan)_28%,transparent)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />}
        {loading ? "Arbeite…" : label}
      </button>
      {hint && <p className="px-1 text-[10px] text-stage-foreground/60">{hint}</p>}
    </div>
  );
}