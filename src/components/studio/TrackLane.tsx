import { useEffect, useRef } from "react";
import { Volume2, VolumeX, Trash2, Headphones } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/audio/multitrack";

type Props = {
  track: Track;
  positionSec: number;
  pxPerSec: number;
  onChange: (next: Track) => void;
  onRemove: () => void;
};

export function TrackLane({ track, positionSec, pxPerSec, onChange, onRemove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width = c.clientWidth * window.devicePixelRatio;
    const h = c.height = c.clientHeight * window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const peaks = track.peakData;
    if (!peaks || peaks.length === 0) return;

    const mid = h / 2;
    ctx.fillStyle = track.color;
    const widthForTrack = track.durationSec * pxPerSec * window.devicePixelRatio;
    const offset = track.startSec * pxPerSec * window.devicePixelRatio;
    const step = widthForTrack / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const x = offset + i * step;
      const peak = peaks[i] * mid * 0.95;
      ctx.fillRect(x, mid - peak, Math.max(1, step), peak * 2);
    }
  }, [track, pxPerSec]);

  const playheadX = positionSec * pxPerSec;

  return (
    <div className="flex border-b border-border">
      {/* Controls */}
      <div className="flex w-56 shrink-0 flex-col gap-2 border-r border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: track.color }} />
          <input
            value={track.name}
            onChange={(e) => onChange({ ...track, name: e.target.value })}
            className="flex-1 truncate bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost"
            onClick={() => onChange({ ...track, muted: !track.muted })}
            className={"h-7 px-2 " + (track.muted ? "text-destructive" : "text-muted-foreground")}
          >
            {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => onChange({ ...track, soloed: !track.soloed })}
            className={"h-7 px-2 " + (track.soloed ? "text-accent" : "text-muted-foreground")}
          >
            <Headphones className="h-3.5 w-3.5" /> S
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="ml-auto h-7 px-2 text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>VOL</span><span>{Math.round(track.volume * 100)}</span></div>
          <Slider value={[track.volume]} onValueChange={([v]) => onChange({ ...track, volume: v })} min={0} max={1.5} step={0.01} />
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>PAN</span><span>{track.pan > 0 ? `R${Math.round(track.pan*100)}` : track.pan < 0 ? `L${Math.round(-track.pan*100)}` : "C"}</span></div>
          <Slider value={[track.pan]} onValueChange={([v]) => onChange({ ...track, pan: v })} min={-1} max={1} step={0.05} />
        </div>
      </div>

      {/* Waveform */}
      <div className="relative h-24 flex-1 overflow-hidden bg-muted/10">
        <canvas ref={canvasRef} className="h-full w-full" />
        <div className="pointer-events-none absolute top-0 h-full w-px bg-accent" style={{ left: `${playheadX}px` }} />
      </div>
    </div>
  );
}