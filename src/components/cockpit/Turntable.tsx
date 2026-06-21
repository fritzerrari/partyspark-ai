import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  artwork?: string | null;
  label?: string;          // shown on the center label
  spinning: boolean;       // rotates when true (paused otherwise)
  positionSec: number;     // current track time (drives rotation phase)
  durationSec: number;
  onScrub?: (deltaSec: number) => void; // user dragged the platter
  onScrubEnd?: () => void;
  color?: "cyan" | "magenta";
};

// 33.3 rpm → 33.3 / 60 = 0.555 rev/s → 200 deg/s
const DEG_PER_SEC = 200;

export function Turntable({
  size = 240, artwork, label, spinning, positionSec, durationSec,
  onScrub, onScrubEnd, color = "cyan",
}: Props) {
  const ringColor = color === "cyan" ? "var(--neon-cyan)" : "var(--neon-magenta)";
  const [drag, setDrag] = useState<{ angle: number; lastDeg: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // base angle from position (continuous; not modded so transitions are smooth)
  const baseAngle = positionSec * DEG_PER_SEC;
  const [scrubAngle, setScrubAngle] = useState(0);
  const angle = baseAngle + scrubAngle;

  const angleOfPointer = useCallback((e: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  }, []);

  const onDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const a = angleOfPointer(e);
    setDrag({ angle: a, lastDeg: a });
  }, [angleOfPointer]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    const a = angleOfPointer(e);
    let delta = a - drag.lastDeg;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    setScrubAngle((s) => s + delta);
    // convert deg → seconds
    const dSec = delta / DEG_PER_SEC;
    onScrub?.(dSec);
    setDrag({ angle: drag.angle, lastDeg: a });
  }, [drag, angleOfPointer, onScrub]);

  const onUp = useCallback(() => {
    if (!drag) return;
    setDrag(null);
    setScrubAngle(0);
    onScrubEnd?.();
  }, [drag, onScrubEnd]);

  // progress ring
  const pct = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  // Spinning visual (CSS animation when playing & not dragging)
  const useCssSpin = spinning && !drag;

  useEffect(() => {
    if (useCssSpin && wrapRef.current) {
      const el = wrapRef.current.querySelector<HTMLElement>("[data-platter]");
      if (el) {
        // sync animation start with current angle
        el.style.animation = "none";
        el.getBoundingClientRect();
        el.style.transform = `rotate(${angle}deg)`;
        el.style.animation = `spin-slow 1.8s linear infinite`;
      }
    }
  }, [useCssSpin, angle]);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ width: size, height: size }}
      className="relative grid place-items-center touch-none select-none"
    >
      {/* progress ring */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <circle
          cx="50" cy="50" r="47" fill="none"
          stroke={ringColor} strokeWidth="1.8" strokeLinecap="round"
          strokeDasharray={`${pct * 295.3} 295.3`}
          style={{ filter: `drop-shadow(0 0 4px ${ringColor})` }}
        />
      </svg>

      <div
        data-platter
        style={{
          transform: useCssSpin ? undefined : `rotate(${angle}deg)`,
          backgroundImage: artwork ? `url(${artwork})` : undefined,
        }}
        className={cn(
          "relative grid place-items-center rounded-full bg-cover bg-center",
          "border-2 border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.7)] cursor-grab",
          drag && "cursor-grabbing",
        )}
      >
        <div
          style={{ width: "85%", height: "85%" }}
          className="rounded-full"
        >
          {/* concentric grooves */}
          <svg viewBox="0 0 100 100" className="h-full w-full">
            {Array.from({ length: 18 }).map((_, i) => (
              <circle key={i} cx="50" cy="50" r={6 + i * 2.4} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.3" />
            ))}
          </svg>
        </div>
        {/* center label */}
        <div
          style={{ width: "32%", height: "32%", background: ringColor }}
          className="absolute grid place-items-center rounded-full text-[10px] font-bold uppercase tracking-widest text-black/80"
        >
          {label?.slice(0, 6) ?? ""}
        </div>
        {/* spindle */}
        <div className="absolute h-2 w-2 rounded-full bg-stage-foreground/80" />
      </div>

      {/* fixed platter outer is the dragger; cover children by transparent overlay */}
      <style>{`[data-platter]{ width: 100%; height: 100%; }`}</style>
    </div>
  );
}