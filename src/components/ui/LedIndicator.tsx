import { cn } from "@/lib/utils";

type Color = "cyan" | "magenta" | "amber" | "lime" | "off";
const MAP: Record<Color, string> = {
  cyan:    "bg-[var(--neon-cyan)] neon-glow-cyan",
  magenta: "bg-[var(--neon-magenta)] neon-glow-magenta",
  amber:   "bg-[var(--neon-amber)] neon-glow-amber",
  lime:    "bg-[var(--neon-lime)]",
  off:     "bg-white/15",
};

export function Led({
  color = "cyan", blink, size = 8, className, label,
}: { color?: Color; blink?: boolean; size?: number; className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        style={{ width: size, height: size }}
        className={cn("rounded-full transition-all", MAP[color], blink && "animate-led-blink")}
      />
      {label && <span className="text-[10px] uppercase tracking-widest text-stage-foreground/70">{label}</span>}
    </span>
  );
}