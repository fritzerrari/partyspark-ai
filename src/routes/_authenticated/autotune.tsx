import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Music, Upload, Download, Play, Pause, Square, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LivePitchTracker,
  SCALES,
  type ScaleId,
  freqToMidi,
  midiToName,
  snapToScale,
  detectDominantMidi,
} from "@/lib/audio/pitch";
import { pitchShiftBuffer, audioBufferToWav } from "@/lib/audio/pitchShift";

export const Route = createFileRoute("/_authenticated/autotune")({
  head: () => ({ meta: [{ title: "Autotune — PartyPilot" }] }),
  component: AutotunePage,
});

function AutotunePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Autotune"
        subtitle="Live-Tuner zum Einsingen + Offline-Tonart-Korrektur für deine Aufnahmen."
      />
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="rounded-full">
          <TabsTrigger value="live" className="rounded-full"><Mic className="mr-2 h-4 w-4" /> Live-Tuner</TabsTrigger>
          <TabsTrigger value="offline" className="rounded-full"><Wand2 className="mr-2 h-4 w-4" /> Aufnahme tunen</TabsTrigger>
        </TabsList>
        <TabsContent value="live"><LiveTuner /></TabsContent>
        <TabsContent value="offline"><OfflineTuner /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ Live Tuner ============================ */
function LiveTuner() {
  const [active, setActive] = useState(false);
  const [scaleId, setScaleId] = useState<ScaleId>("chromatic");
  const [pitch, setPitch] = useState<{ hz: number; midi: number; target: number; cents: number; clarity: number } | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setActive(false);
    setPitch(null);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const tracker = new LivePitchTracker(analyser);
      setActive(true);

      const loop = () => {
        const { hz, clarity } = tracker.read();
        if (clarity > 0.9 && hz > 60 && hz < 1500) {
          const midi = freqToMidi(hz);
          const target = snapToScale(midi, scaleId);
          const cents = (midi - target) * 100;
          setPitch({ hz, midi, target, cents, clarity });
        } else {
          setPitch(null);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      toast.error("Mikrofon-Zugriff verweigert");
      console.error(e);
    }
  };

  useEffect(() => () => stop(), []);

  const cents = pitch?.cents ?? 0;
  const indicator = Math.max(-50, Math.min(50, cents));

  return (
    <div className="rounded-3xl border border-border bg-card p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {!active ? (
          <Button onClick={start} className="rounded-full">
            <Mic className="mr-2 h-4 w-4" /> Mikrofon starten
          </Button>
        ) : (
          <Button onClick={stop} variant="secondary" className="rounded-full">
            <Square className="mr-2 h-4 w-4" /> Stop
          </Button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tonart:</span>
          <Select value={scaleId} onValueChange={(v) => setScaleId(v as ScaleId)}>
            <SelectTrigger className="w-[200px] rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SCALES).map(([id, s]) => (
                <SelectItem key={id} value={id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/40 p-8 text-center space-y-4">
        <div className="text-6xl font-display font-semibold tabular-nums">
          {pitch ? midiToName(pitch.target) : "—"}
        </div>
        <div className="text-sm text-muted-foreground">
          {pitch ? (
            <>
              gesungen: <b>{pitch.hz.toFixed(1)} Hz</b> ({midiToName(pitch.midi)}) ·{" "}
              <b>{cents > 0 ? "+" : ""}{cents.toFixed(0)} cents</b>
            </>
          ) : (
            active ? "Sing oder spiele einen Ton…" : "Drücke „Mikrofon starten“."
          )}
        </div>

        {/* Cents-Skala */}
        <div className="relative mx-auto h-3 max-w-md rounded-full bg-border">
          <div className="absolute left-1/2 top-0 h-full w-px bg-foreground/40" />
          {pitch && (
            <div
              className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary transition-all"
              style={{ left: `calc(50% + ${indicator}%)` }}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground max-w-md mx-auto">
          <span>–50¢</span><span>perfect</span><span>+50¢</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tipp: Für sauberes Tracking Kopfhörer tragen — sonst greift das Mikrofon den Lautsprecher mit ab.
      </p>
    </div>
  );
}

/* ============================ Offline Tuner ============================ */
function OfflineTuner() {
  const [file, setFile] = useState<File | null>(null);
  const [origBuffer, setOrigBuffer] = useState<AudioBuffer | null>(null);
  const [tunedBuffer, setTunedBuffer] = useState<AudioBuffer | null>(null);
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const [targetMidi, setTargetMidi] = useState<number | null>(null);
  const [scaleId, setScaleId] = useState<ScaleId>("c-major");
  const [strength, setStrength] = useState(100);
  const [processing, setProcessing] = useState(false);
  const [playing, setPlaying] = useState<"orig" | "tuned" | null>(null);
  const playerRef = useRef<{ src: AudioBufferSourceNode; ctx: AudioContext } | null>(null);

  const stopPlayback = () => {
    if (playerRef.current) {
      try { playerRef.current.src.stop(); } catch { /* noop */ }
      playerRef.current.ctx.close();
      playerRef.current = null;
    }
    setPlaying(null);
  };

  const play = (which: "orig" | "tuned") => {
    stopPlayback();
    const buf = which === "orig" ? origBuffer : tunedBuffer;
    if (!buf) return;
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setPlaying(null);
    src.start();
    playerRef.current = { src, ctx };
    setPlaying(which);
  };

  const handleFile = async (f: File) => {
    stopPlayback();
    setFile(f);
    setTunedBuffer(null);
    setTargetMidi(null);
    const arr = await f.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(arr);
    ctx.close();
    setOrigBuffer(buf);
    const m = detectDominantMidi(buf);
    setDetectedMidi(m);
    if (m !== null) setTargetMidi(snapToScale(m, scaleId));
  };

  useEffect(() => {
    if (detectedMidi !== null) setTargetMidi(snapToScale(detectedMidi, scaleId));
  }, [scaleId, detectedMidi]);

  const tune = async () => {
    if (!origBuffer || detectedMidi === null || targetMidi === null) return;
    setProcessing(true);
    try {
      const shift = (targetMidi - detectedMidi) * (strength / 100);
      const ctx = new OfflineAudioContext(
        origBuffer.numberOfChannels,
        origBuffer.length,
        origBuffer.sampleRate,
      );
      const out = await pitchShiftBuffer(ctx, origBuffer, shift);
      setTunedBuffer(out);
      toast.success(`Getunt: ${shift > 0 ? "+" : ""}${shift.toFixed(2)} Halbtöne`);
    } catch (e) {
      console.error(e);
      toast.error("Tuning fehlgeschlagen");
    } finally {
      setProcessing(false);
    }
  };

  const download = () => {
    if (!tunedBuffer || !file) return;
    const blob = audioBufferToWav(tunedBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.[^.]+$/, "") + "-tuned.wav";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => () => stopPlayback(), []);

  return (
    <div className="rounded-3xl border border-border bg-card p-6 space-y-6">
      <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 cursor-pointer hover:bg-muted/50 transition">
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">{file ? file.name : "Audio-Datei wählen (MP3, WAV, M4A …)"}</span>
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </label>

      {origBuffer && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-muted/40 p-4 space-y-1">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Erkannt</div>
            <div className="text-2xl font-display font-semibold">
              {detectedMidi !== null ? midiToName(detectedMidi) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {origBuffer.duration.toFixed(1)}s · {origBuffer.sampleRate} Hz · {origBuffer.numberOfChannels}ch
            </div>
          </div>
          <div className="rounded-2xl bg-primary-soft p-4 space-y-1">
            <div className="text-xs uppercase tracking-widest text-primary">Ziel</div>
            <div className="text-2xl font-display font-semibold text-primary">
              {targetMidi !== null ? midiToName(targetMidi) : "—"}
            </div>
            <div className="text-xs text-primary/80">
              {detectedMidi !== null && targetMidi !== null
                ? `${targetMidi > detectedMidi ? "+" : ""}${(targetMidi - detectedMidi).toFixed(2)} Halbtöne`
                : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Music className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Tonart:</span>
          <Select value={scaleId} onValueChange={(v) => setScaleId(v as ScaleId)}>
            <SelectTrigger className="w-[200px] rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SCALES).map(([id, s]) => (
                <SelectItem key={id} value={id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stärke</span>
            <span className="font-medium">{strength}%</span>
          </div>
          <Slider value={[strength]} onValueChange={([v]) => setStrength(v)} min={0} max={100} step={5} />
          <p className="text-xs text-muted-foreground">
            0% = unbehandelt, 100% = voll auf Ziel-Note. Für sanftes Tuning 40–70 %.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={tune} disabled={!origBuffer || processing} className="rounded-full">
          {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          Tunen
        </Button>
        {origBuffer && (
          <Button
            variant="secondary"
            onClick={() => (playing === "orig" ? stopPlayback() : play("orig"))}
            className="rounded-full"
          >
            {playing === "orig" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            Original
          </Button>
        )}
        {tunedBuffer && (
          <>
            <Button
              variant="secondary"
              onClick={() => (playing === "tuned" ? stopPlayback() : play("tuned"))}
              className="rounded-full"
            >
              {playing === "tuned" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              Getunt
            </Button>
            <Button onClick={download} variant="outline" className="rounded-full">
              <Download className="mr-2 h-4 w-4" /> WAV
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Hinweis: Diese Variante stimmt die Aufnahme global auf die nächste passende Skalen-Note. Für echtes
        Note-für-Note-Autotune wäre eine Audio-DSP-Pipeline pro Phrase nötig — kommt in einer späteren Phase.
      </p>
    </div>
  );
}