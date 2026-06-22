import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { subscribeVisual, type VisualFrame } from "@/lib/audio/visualBridge";
import { Maximize2, X } from "lucide-react";

export const Route = createFileRoute("/visualizer")({
  head: () => ({ meta: [{ title: "PartyPilot · Visualizer" }] }),
  component: Visualizer,
});

/**
 * Full-screen reactive visualizer for an external display (beamer).
 * Receives audio frames via BroadcastChannel from the cockpit window.
 */
function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<VisualFrame | null>(null);
  const lastBeat = useRef(0);
  const [connected, setConnected] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    let lastMsg = 0;
    const unsub = subscribeVisual((f) => {
      frameRef.current = f;
      lastMsg = Date.now();
      if (!connected) setConnected(true);
    });
    const id = setInterval(() => setConnected(Date.now() - lastMsg < 2000), 800);
    return () => { unsub(); clearInterval(id); };
  }, [connected]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    let raf = 0;
    let phase = 0;
    let beatPulse = 0;
    let prevBass = 0;
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2,
    }));
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = cv.width, h = cv.height;
      const f = frameRef.current;
      const level = f?.level ?? 0;
      const bass = f?.bass ?? 0;
      const mid = f?.mid ?? 0;
      const high = f?.high ?? 0;

      // Beat detection on bass kick
      if (bass - prevBass > 0.18 && Date.now() - lastBeat.current > 180) {
        beatPulse = 1;
        lastBeat.current = Date.now();
      }
      prevBass = bass;
      beatPulse *= 0.9;
      phase += 0.005 + level * 0.05;

      // Background: deep gradient that shifts with mid energy
      const hueA = (phase * 50) % 360;
      const hueB = (hueA + 80 + mid * 60) % 360;
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h));
      bg.addColorStop(0, `hsl(${hueA}, 70%, ${10 + level * 18}%)`);
      bg.addColorStop(1, `hsl(${hueB}, 80%, 4%)`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Starfield
      ctx.fillStyle = `rgba(255,255,255,${0.3 + high * 0.7})`;
      for (const s of stars) {
        s.x = (s.x + s.z * (0.0008 + level * 0.004)) % 1;
        const px = s.x * w, py = s.y * h;
        ctx.fillRect(px, py, s.z * 2 * dpr, s.z * 2 * dpr);
      }

      // Frequency ring
      const cx = w / 2, cy = h / 2;
      const radius = Math.min(w, h) * (0.18 + beatPulse * 0.06);
      const bands = f?.freq ?? [];
      ctx.lineWidth = 2 * dpr;
      for (let i = 0; i < bands.length; i++) {
        const a = (i / bands.length) * Math.PI * 2 + phase;
        const v = bands[i];
        const r1 = radius;
        const r2 = radius + v * Math.min(w, h) * 0.32;
        const hue = (hueA + i * 6) % 360;
        ctx.strokeStyle = `hsla(${hue}, 95%, ${55 + v * 25}%, ${0.5 + v * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }

      // Pulsing inner circle on beat
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (1 + beatPulse));
      glow.addColorStop(0, `hsla(${hueA}, 90%, 65%, ${0.4 + beatPulse * 0.5})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.6 + beatPulse), 0, Math.PI * 2);
      ctx.fill();

      // Bottom spectrum bar
      const barH = h * 0.18;
      const bw = w / bands.length;
      for (let i = 0; i < bands.length; i++) {
        const v = bands[i];
        const hue = (hueB + i * 4) % 360;
        const grad = ctx.createLinearGradient(0, h - barH, 0, h);
        grad.addColorStop(0, `hsla(${hue}, 95%, 70%, 0.9)`);
        grad.addColorStop(1, `hsla(${hue}, 95%, 40%, 0.1)`);
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw + bw * 0.1, h - v * barH, bw * 0.8, v * barH);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  // Auto-hide cursor & UI
  const [showUi, setShowUi] = useState(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setShowUi(true);
      clearTimeout(t);
      t = setTimeout(() => setShowUi(false), 2500);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); };
  }, []);

  async function goFs() {
    setHint(false);
    try { await document.documentElement.requestFullscreen(); } catch { /* noop */ }
  }

  return (
    <div className={"fixed inset-0 overflow-hidden bg-black " + (showUi ? "cursor-default" : "cursor-none")}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showUi && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 text-white">
          <div className="pointer-events-auto rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-bold uppercase tracking-widest backdrop-blur">
            PartyPilot · Beamer
            <span className={"ml-3 inline-block h-2 w-2 rounded-full " + (connected ? "bg-emerald-400" : "bg-red-500")} />
            <span className="ml-1 text-white/60">{connected ? "live" : "no signal"}</span>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button onClick={goFs} className="rounded-full border border-white/20 bg-black/40 p-2 backdrop-blur hover:bg-white/10">
              <Maximize2 className="h-4 w-4" />
            </button>
            <button onClick={() => window.close()} className="rounded-full border border-white/20 bg-black/40 p-2 backdrop-blur hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {hint && !connected && showUi && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-white/20 bg-black/60 p-6 text-center text-white backdrop-blur-xl">
            <p className="text-sm uppercase tracking-widest text-white/60">Warte auf Audio…</p>
            <p className="mt-2 max-w-md text-white/80">
              Öffne dieses Fenster aus dem DJ Cockpit – die Visualisierung folgt automatisch deinem Master-Bus.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}