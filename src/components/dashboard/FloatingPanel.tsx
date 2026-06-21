import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Minus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  onClose: () => void;
  initial?: { x: number; y: number; w: number; h: number };
  children: ReactNode;
};

export function FloatingPanel({ id, title, onClose, initial, children }: Props) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(`fp:${id}`);
      if (raw) return JSON.parse(raw) as { x: number; y: number; w: number; h: number };
    } catch {}
    return initial ?? { x: 80, y: 80, w: 560, h: 360 };
  });
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number; mode: "move" | "resize" } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(`fp:${id}`, JSON.stringify(pos)); } catch {}
  }, [id, pos]);

  const onDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y, mode };
    if (mode === "resize") dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.w, py: pos.h, mode };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      setPos((p) => ({ ...p, x: Math.max(0, d.px + e.clientX - d.ox), y: Math.max(60, d.py + e.clientY - d.oy) }));
    } else {
      setPos((p) => ({ ...p, w: Math.max(280, d.px + e.clientX - d.ox), h: Math.max(180, d.py + e.clientY - d.oy) }));
    }
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: pos.w, height: minimized ? 36 : pos.h }}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-white/15",
        "bg-[var(--deck-graphite)] text-stage-foreground shadow-2xl backdrop-blur",
      )}
    >
      <div
        onPointerDown={onDown("move")}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="flex h-9 shrink-0 cursor-move items-center gap-2 border-b border-white/10 bg-black/30 px-2 select-none"
      >
        <GripVertical className="h-3.5 w-3.5 text-stage-foreground/40" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-stage-foreground/80">{title}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setMinimized((m) => !m)} className="rounded p-1 text-stage-foreground/60 hover:bg-white/10 hover:text-stage-foreground" aria-label="Minimieren">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 text-stage-foreground/60 hover:bg-[var(--neon-magenta)]/30 hover:text-stage-foreground" aria-label="Schließen">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!minimized && (
        <>
          <div className="flex-1 overflow-auto p-3">{children}</div>
          <div
            onPointerDown={onDown("resize")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-[linear-gradient(135deg,transparent_50%,rgba(255,255,255,0.3)_50%)]"
          />
        </>
      )}
    </div>
  );
}