import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "idle" | "active" | "armed" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  idle:   "bg-white/5 text-stage-foreground border-white/15 hover:bg-white/10",
  active: "bg-[color-mix(in_oklab,var(--neon-cyan)_22%,transparent)] text-stage-foreground border-[color-mix(in_oklab,var(--neon-cyan)_55%,transparent)] neon-glow-cyan",
  armed:  "bg-[color-mix(in_oklab,var(--neon-amber)_25%,transparent)] text-stage-foreground border-[color-mix(in_oklab,var(--neon-amber)_55%,transparent)] neon-glow-amber animate-led-blink",
  danger: "bg-[color-mix(in_oklab,var(--neon-magenta)_25%,transparent)] text-stage-foreground border-[color-mix(in_oklab,var(--neon-magenta)_55%,transparent)] neon-glow-magenta",
  ghost:  "bg-transparent text-stage-foreground/70 border-transparent hover:bg-white/5 hover:text-stage-foreground",
};
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-[10px] tracking-widest uppercase",
  md: "h-9 px-3 text-xs tracking-widest uppercase",
  lg: "h-11 px-4 text-sm tracking-widest uppercase",
};

export const NeonButton = forwardRef<HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; active?: boolean }
>(function NeonButton({ className, variant = "idle", size = "md", active, ...props }, ref) {
  const v = active ? "active" : variant;
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-semibold transition-all select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        SIZES[size], VARIANTS[v], className,
      )}
    />
  );
});