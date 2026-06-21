import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Headphones, HeadphoneOff, Wand2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { createFxChain, type FxConfig, type FxHandle } from "@/lib/audio/recording/fxChain";

type Props = {
  /** Called when user presses save with the resulting blob (post-FX). */
  onSave?: (blob: Blob, mime: string) => void | Promise<void>;
  /** Optional label for the panel. */
  title?: string;
  /** Inline / compact rendering. */
  compact?: boolean;
};

/**
 * Reusable live-recording panel with scrolling waveform and a pre-FX chain.
 * The pitch / reverb / delay / distortion sliders can be tweaked in real time
 * while recording; the saved blob captures the wet (post-FX) signal.
 */
export function MicRecorder({ onSave, title = "Live Recorder", compact }: Props) {
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fx, setFx] = useState<FxConfig>({
    pitchSemis: 0, reverb: 0.2, delay: 0.0, distortion: 0.0,
    autoSnap: "off", monitor: false,
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fxRef = useRef<FxHandle | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  // Start mic + build FX graph
  async function arm() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const handle = createFxChain(ctx, src, fx);
      fxRef.current = handle;
      const dest = ctx.createMediaStreamDestination();
      handle.outputNode.connect(dest);
      destRef.current = dest;
      setReady(true);
    } catch (e) {
      console.warn(e);
      toast.error("Mikrofon-Zugriff abgelehnt.");
    }
  }

  useEffect(() => {
    return () => {
      try { recRef.current?.stop(); } catch { /* noop */ }
      try { fxRef.current?.dispose(); } catch { /* noop */ }
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      try { ctxRef.current?.close(); } catch { /* noop */ }
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  // Live waveform from the FX chain's analyser
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !ready) return;
    const ctx2 = cv.getContext("2d");
    if (!ctx2) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const history: number[] = [];
    const SLOTS = 220;
    let raf = 0;
    const buf = new Float32Array(fxRef.current?.analyser.fftSize ?? 2048);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const an = fxRef.current?.analyser;
      if (!an) return;
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
      }
      history.push(peak);
      if (history.length > SLOTS) history.shift();
      const w = cv.width;
      const h = cv.height;
      ctx2.clearRect(0, 0, w, h);
      const barW = w / SLOTS;
      const mid = h / 2;
      ctx2.fillStyle = recording ? "rgba(255,80,140,0.95)" : "rgba(0,229,255,0.85)";
      for (let i = 0; i < history.length; i++) {
        const v = history[i];
        const bh = Math.max(2, v * h * 0.95);
        ctx2.fillRect(i * barW, mid - bh / 2, Math.max(1, barW * 0.85), bh);
      }
      // Center axis
      ctx2.strokeStyle = "rgba(255,255,255,0.07)";
      ctx2.beginPath(); ctx2.moveTo(0, mid); ctx2.lineTo(w, mid); ctx2.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ready, recording]);

  function updateFx(patch: Partial<FxConfig>) {
    setFx((f) => {
      const next = { ...f, ...patch };
      fxRef.current?.setConfig(next);
      return next;
    });
  }

  async function startRec() {
    if (!destRef.current) await arm();
    if (!destRef.current) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const rec = new MediaRecorder(destRef.current.stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(500);
    recRef.current = rec;
    setRecording(true);
    setElapsed(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  async function stopRec() {
    const rec = recRef.current;
    if (!rec) return;
    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    recRef.current = null;
    setRecording(false);
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (onSave) {
      try { await onSave(blob, rec.mimeType || "audio/webm"); } catch (e) { console.warn(e); }
    } else {
      // Default: trigger a download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `recording-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/40 p-3 sm:p-4 space-y-3", compact && "p-2 sm:p-3")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className={cn("h-4 w-4", recording ? "text-rose-400 animate-pulse" : "text-stage-foreground/70")} />
          <span className="text-xs font-bold uppercase tracking-widest text-stage-foreground">{title}</span>
          {recording && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono text-rose-300">REC {mins}:{secs}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateFx({ monitor: !fx.monitor })}
            disabled={!ready}
            title={fx.monitor ? "Monitor an (Kopfhörer empfohlen)" : "Monitor aus"}
            className={cn(
              "rounded-full border px-2 py-1 text-[10px]",
              fx.monitor ? "border-[var(--neon-cyan)] text-[var(--neon-cyan)]" : "border-white/10 text-stage-foreground/60",
            )}
          >
            {fx.monitor ? <Headphones className="h-3 w-3" /> : <HeadphoneOff className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="h-20 w-full rounded-md border border-white/10 bg-black/60" />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <SliderRow label="Pitch" value={fx.pitchSemis} min={-12} max={12} step={1}
          format={(v) => `${v > 0 ? "+" : ""}${v}st`}
          onChange={(v) => updateFx({ pitchSemis: v })} />
        <SliderRow label="Reverb" value={Math.round(fx.reverb * 100)} min={0} max={100}
          onChange={(v) => updateFx({ reverb: v / 100 })} />
        <SliderRow label="Delay" value={Math.round(fx.delay * 100)} min={0} max={100}
          onChange={(v) => updateFx({ delay: v / 100 })} />
        <SliderRow label="Distort" value={Math.round(fx.distortion * 100)} min={0} max={100}
          onChange={(v) => updateFx({ distortion: v / 100 })} />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-widest text-stage-foreground/60">AutoTune</span>
          <div className="flex gap-1">
            {(["off", "major", "minor"] as const).map((m) => (
              <button key={m}
                onClick={() => updateFx({ autoSnap: m })}
                className={cn(
                  "flex-1 rounded border px-1.5 py-1 text-[10px]",
                  fx.autoSnap === m
                    ? "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)]"
                    : "border-white/10 text-stage-foreground/60",
                )}
              >
                {m === "off" ? "off" : m === "major" ? "Dur" : "Moll"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {!ready ? (
          <Button onClick={arm} className="flex-1">
            <Wand2 className="mr-1 h-4 w-4" /> Mic aktivieren
          </Button>
        ) : !recording ? (
          <Button onClick={startRec} className="flex-1 bg-rose-500 hover:bg-rose-600">
            <Mic className="mr-1 h-4 w-4" /> Aufnahme starten
          </Button>
        ) : (
          <Button onClick={stopRec} variant="secondary" className="flex-1">
            <Square className="mr-1 h-4 w-4 fill-current" /> Stop {onSave ? <Save className="ml-2 h-3.5 w-3.5" /> : null}
          </Button>
        )}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-stage-foreground/60">
        <span>{label}</span>
        <span className="font-mono text-stage-foreground/80">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}