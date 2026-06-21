import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  to = "/",
  size = "md",
}: {
  className?: string;
  to?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <Link to={to} className={cn("group inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid place-items-center rounded-xl bg-stage shadow-stage",
          dim,
        )}
      >
        <span className="absolute inset-1 rounded-lg bg-gradient-to-br from-primary to-accent opacity-90" />
        <span className="relative font-display text-stage-foreground text-sm font-bold">P</span>
      </span>
      <span className={cn("font-display font-bold tracking-tight", text)}>
        PartyPilot<span className="text-primary">.</span>
      </span>
    </Link>
  );
}