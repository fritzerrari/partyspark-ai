import { useEffect, useRef } from "react";
import { Volume2, VolumeX, Trash2, Headphones } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  color: string;
  peaks: number[];
  durationSec: number;
  bpm: number;
  bars: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  active: boolean;
  positionSec: number;
  onMute: () => void;
  onSolo: () => void;
  onVolume: (v: number) => void;
  onRemove: () => void;
};

export function LoopLane({
  name, color, peaks, durationSec, bpm, bars,
  volume, muted, soloed, active, positionSec,
  onMute, onSolo, onVolume, onRemove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.width = c.clientWidth * dpr;
    const h = c.height = c.clientHeight * dpr;
    ctx.clearRect(0, 0, w, h);

    // Beat grid
    const beatsTotal = bars * 4;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = dpr;
    for (let i = 0; i <= beatsTotal; i++) {
      const x = (i / beatsTotal) * w;
      ctx.globalAlpha = i % 4 === 0 ? 0.35 : 0.12;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Waveform
    if (peaks?.length) {
      const mid = h / 2;
      const step = w / peaks.length;
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "rgba(255,255,255,0.9)");
      grd.addColorStop(1, "rgba(255,255,255,0.5)");
      ctx.fillStyle = grd;
      for (let i = 0; i < peaks.length; i++) {
        const peak = Math.max(0.02, peaks[i]) * mid * 0.92;
        ctx.fillRect(i * step, mid - peak, Math.max(1, step * 0.85), peak * 2);
      }
    }
  }, [peaks, bars]);

  // Playhead animation
  useEffect(() => {
    const el = playheadRef.current;
    if (!el || !durationSec) return;
    const pct = ((positionSec % durationSec) / durationSec) * 100;
    el.style.transform = `translateX(${pct}%)`;
  }, [positionSec, durationSec]);

  return (
    <div className={cn(
      "rounded-2xl border bg-card transition",
      active ? "border-accent shadow-glow" : "border-border",
    )}>
      <div className="flex items-center gap-3 p-3">
        <div className={cn("h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br", color)}>
          <div className="grid h-full w-full place-items-center text-white">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[10px] text-muted-foreground">
            {bars} bar{bars !== 1 ? "s" : ""} · {bpm.toFixed(0)} BPM · {durationSec.toFixed(2)}s
          </p>
        </div>
        <Button size="sm" variant={muted ? "default" : "ghost"} onClick={onMute} className="h-8 px-2">
          {muted ? "M" : "M"}
        </Button>
        <Button size="sm" variant={soloed ? "default" : "ghost"} onClick={onSolo} className="h-8 px-2">
          <Headphones className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} className="h-8 px-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className={cn(
        "relative h-20 overflow-hidden bg-gradient-to-r",
        color,
      )}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div
          ref={playheadRef}
          className="absolute inset-y-0 left-0 w-[2px] bg-white shadow-[0_0_8px_white]"
          style={{ willChange: "transform" }}
        />
        {active ? (
          <div className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-white shadow-[0_0_8px_white]" />
        ) : null}
      </div>

      <div className="flex items-center gap-2 p-3">
        <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Slider value={[volume]} min={0} max={100} onValueChange={(v) => onVolume(v[0] ?? 0)} />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{volume}</span>
      </div>
    </div>
  );
}
