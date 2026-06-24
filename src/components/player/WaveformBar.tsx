import { useEffect, useRef } from "react";
import { useEngine } from "@/lib/audio/engine";

/** Click/drag to seek; renders downsampled peaks if `peaks` provided,
 *  otherwise a thin progress strip. */
export function WaveformBar({ peaks, height = 44 }: { peaks?: Float32Array | null; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const position = useEngine((s) => s.positionSec);
  const duration = useEngine((s) => s.durationSec);
  const seek = useEngine((s) => s.seek);
  const beatGrid = useEngine((s) => s.current?.beatGrid ?? null);
  const energyEvents = useEngine((s) => s.current?.energyEvents ?? null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, w, h);

    // Beat-grid ticks (every 4th = downbeat brighter)
    if (beatGrid && duration > 0) {
      for (let i = 0; i < beatGrid.length; i++) {
        const x = (beatGrid[i] / duration) * w;
        const isDown = i % 4 === 0;
        ctx.fillStyle = isDown ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)";
        ctx.fillRect(x, h - (isDown ? 8 : 4), 1, isDown ? 8 : 4);
      }
    }

    // Waveform
    if (peaks && peaks.length) {
      const mid = h / 2;
      const step = w / peaks.length;
      ctx.fillStyle = "rgba(180, 200, 255, 0.55)";
      for (let i = 0; i < peaks.length; i++) {
        const v = peaks[i] * (h * 0.45);
        ctx.fillRect(i * step, mid - v, Math.max(1, step - 0.5), v * 2);
      }
    } else {
      ctx.fillStyle = "rgba(180, 200, 255, 0.25)";
      ctx.fillRect(0, h / 2 - 1, w, 2);
    }

    // Progress overlay
    if (duration > 0) {
      const px = (position / duration) * w;
      ctx.fillStyle = "rgba(255, 107, 157, 0.18)";
      ctx.fillRect(0, 0, px, h);
      ctx.fillStyle = "#FF6B9D";
      ctx.fillRect(px - 1, 0, 2, h);
    }

    // Buildup / Drop markers — amber for buildup, magenta for drop, height
    // scaled by `strength` so weak events read fainter.
    if (energyEvents && energyEvents.length && duration > 0) {
      for (const ev of energyEvents) {
        const x = (ev.t / duration) * w;
        const hh = Math.max(6, Math.min(h, h * (0.35 + 0.55 * ev.strength)));
        const color = ev.kind === "drop" ? "rgba(255, 107, 157, 0.85)" : "rgba(245, 192, 80, 0.75)";
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, 0, 2, hh);
        // Triangle cap on top so drops pop visually.
        ctx.beginPath();
        ctx.moveTo(x - 4, 0);
        ctx.lineTo(x + 4, 0);
        ctx.lineTo(x, 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }, [peaks, position, duration, beatGrid, energyEvents]);

  function onSeek(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = ref.current;
    if (!c || !duration) return;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * duration;
    seek(Math.max(0, Math.min(duration, t)));
  }

  return (
    <canvas
      ref={ref}
      onClick={onSeek}
      onMouseMove={(e) => { if (e.buttons === 1) onSeek(e); }}
      style={{ width: "100%", height, cursor: "pointer" }}
      className="rounded-md"
    />
  );
}