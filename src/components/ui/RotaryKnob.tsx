import { useCallback, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;        // 0..1
  onChange: (v: number) => void;
  label?: string;
  size?: number;
  color?: "cyan" | "magenta" | "amber";
  format?: (v: number) => string;
  className?: string;
};

const COLOR: Record<NonNullable<Props["color"]>, string> = {
  cyan: "var(--neon-cyan)", magenta: "var(--neon-magenta)", amber: "var(--neon-amber)",
};

export function RotaryKnob({
  value, onChange, label, size = 56, color = "cyan", format, className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const v = Math.max(0, Math.min(1, value));
  const deg = -135 + v * 270;
  const c = COLOR[color];

  const onDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setDragging(true);
  }, [value]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const next = Math.max(0, Math.min(1, dragRef.current.startVal + dy / 200));
    onChange(next);
  }, [onChange]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // double-click resets to 0.5
  const onDouble = () => onChange(0.5);

  useEffect(() => () => { dragRef.current = null; }, []);

  const display = format ? format(v) : Math.round(v * 100).toString();

  return (
    <div ref={ref} className={cn("flex flex-col items-center gap-1", className)}>
      <div
        role="slider"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDouble}
        style={{
          width: size, height: size,
          background: `conic-gradient(from -135deg, ${c} 0deg, ${c} ${v * 270}deg, transparent ${v * 270}deg, transparent 270deg)`,
        }}
        className={cn(
          "relative grid place-items-center rounded-full cursor-grab touch-none",
          "border border-white/10 shadow-[inset_0_0_18px_rgba(0,0,0,0.6)]",
          dragging && "cursor-grabbing",
        )}
      >
        <div className="absolute inset-1 rounded-full bg-[var(--deck-graphite)] grid place-items-center">
          <div
            style={{ transform: `rotate(${deg}deg)`, background: c, boxShadow: `0 0 8px ${c}` }}
            className="h-1/2 w-0.5 origin-bottom"
          />
        </div>
        <span className="absolute -bottom-1 right-0 translate-y-full text-[9px] font-mono text-stage-foreground/80">{display}</span>
      </div>
      {label && <span className="mt-2 text-[10px] uppercase tracking-widest text-stage-foreground/70">{label}</span>}
    </div>
  );
}