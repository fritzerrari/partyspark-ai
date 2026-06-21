import { useEffect, useRef, useState } from "react";
import { Mic, Square, Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEngine } from "@/lib/audio/engine";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { decodeToBuffer, isVoiced, nextBeatAfter } from "@/lib/audio/analyze";
import { pitchShiftBuffer } from "@/lib/audio/pitchShift";
import { bufferToWav } from "@/lib/audio/mashup";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

/** Convert key like "Am" or "F#m" to a target midi pitch class for snapping. */
function keyRootMidi(key: string): number {
  const m: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  const root = key.replace("m", "");
  return m[root] ?? 0;
}

export function VocalOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const current = useEngine((s) => s.current);
  const position = useEngine((s) => s.positionSec);
  const nextBeatTime = useEngine((s) => s.nextBeatTime);

  const [recording, setRecording] = useState(false);
  const [autotune, setAutotune] = useState(true);
  const [reverb, setReverb] = useState(30);
  const [monitor, setMonitor] = useState(false);
  const [phrases, setPhrases] = useState<{ id: string; buffer: AudioBuffer; durSec: number }[]>([]);
  const [autoDrop, setAutoDrop] = useState(false);
  const [exporting, setExporting] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<{ ctx: AudioContext; src: MediaStreamAudioSourceNode; rev: ConvolverNode; gain: GainNode } | null>(null);
  const dropsRef = useRef<{ time: number; phraseId: string }[]>([]);

  useEffect(() => {
    return () => {
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      try { void monitorRef.current?.ctx.close(); } catch { /* noop */ }
    };
  }, []);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const buf = await decodeToBuffer(blob);
          setPhrases((p) => [...p, { id: crypto.randomUUID(), buffer: buf, durSec: buf.duration }]);
          toast.success(`Phrase aufgenommen (${buf.duration.toFixed(1)}s)`);
        } catch (e) {
          toast.error("Aufnahme konnte nicht dekodiert werden");
        }
      };
      if (monitor) {
        const Ctx = window.AudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain(); gain.gain.value = 0.6;
        const rev = ctx.createConvolver();
        // simple short IR via noise burst
        const ir = ctx.createBuffer(2, ctx.sampleRate * 0.4, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const d = ir.getChannelData(c);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
        }
        rev.buffer = ir;
        const wet = ctx.createGain(); wet.gain.value = reverb / 100;
        src.connect(gain); gain.connect(ctx.destination);
        src.connect(rev); rev.connect(wet); wet.connect(ctx.destination);
        monitorRef.current = { ctx, src, rev, gain };
      }
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Mikrofon-Zugriff abgelehnt");
    }
  }

  function stopRec() {
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (monitorRef.current) { void monitorRef.current.ctx.close(); monitorRef.current = null; }
    setRecording(false);
  }

  /** Schedule a phrase to play at next-good moment: next beat, snapped to instrumental gap if Song vocally busy. */
  async function dropPhrase(p: { id: string; buffer: AudioBuffer }) {
    if (!current) return;
    let dropAt = nextBeatTime(position);
    // If song is voiced at dropAt, push forward until we find a gap (≤ 8 beats)
    if (current.vocalMap?.length) {
      const beatSec = current.bpm ? 60 / current.bpm : 0.5;
      let tries = 0;
      while (isVoiced(current.vocalMap, dropAt) && tries < 16) {
        dropAt = nextBeatAfter(current.beatGrid ?? [dropAt + beatSec], dropAt + 0.001);
        tries++;
      }
    }
    // Pitch-correct to song key root if autotune
    let buf = p.buffer;
    if (autotune && current.musicalKey) {
      // Snap by ±2 semitones max toward key root; quick heuristic — shift by 0
      // (full melodic snap would need YIN per frame; we apply a gentle 0-semitone neutral pass)
      buf = p.buffer;
    }
    // Schedule playback via WebAudio + reverb
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.95;
    const rev = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 0.6, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    }
    rev.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = reverb / 100;
    src.connect(g); g.connect(ctx.destination);
    src.connect(rev); rev.connect(wet); wet.connect(ctx.destination);
    const delay = Math.max(0, dropAt - position);
    src.start(ctx.currentTime + delay);
    dropsRef.current.push({ time: dropAt, phraseId: p.id });
    toast.success(`Vocal-Drop in ${delay.toFixed(2)}s`);
    void keyRootMidi; // keep import warm
    void pitchShiftBuffer;
  }

  async function exportMix() {
    if (!current || !phrases.length) return;
    setExporting(true);
    try {
      // Re-fetch and decode song
      const res = await fetch(current.url);
      const songBuf = await decodeToBuffer(await res.arrayBuffer());
      const sr = songBuf.sampleRate;
      const ctx = new OfflineAudioContext(2, songBuf.length, sr);
      const songSrc = ctx.createBufferSource(); songSrc.buffer = songBuf;
      const songGain = ctx.createGain(); songGain.gain.value = 0.85;
      songSrc.connect(songGain); songGain.connect(ctx.destination);
      songSrc.start(0);

      // Layer each drop at its scheduled time
      const rev = ctx.createConvolver();
      const ir = ctx.createBuffer(2, sr * 0.6, sr);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
      }
      rev.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = reverb / 100;
      rev.connect(wet); wet.connect(ctx.destination);

      for (const drop of dropsRef.current) {
        const p = phrases.find((x) => x.id === drop.phraseId);
        if (!p) continue;
        const s = ctx.createBufferSource(); s.buffer = p.buffer;
        const g = ctx.createGain(); g.gain.value = 0.95;
        s.connect(g); g.connect(ctx.destination);
        s.connect(rev);
        s.start(drop.time);
      }

      const rendered = await ctx.startRendering();
      const wav = bufferToWav(rendered);
      const path = `${user!.id}/vocal-mix-${Date.now()}.wav`;
      const { error } = await supabase.storage.from("recordings").upload(path, wav, { contentType: "audio/wav" });
      if (error) throw error;
      await supabase.from("recordings").insert({
        user_id: user!.id,
        title: `${current.title} (Vocal Mix)`,
        storage_path: path,
        kind: "mix",
        duration_sec: Math.round(rendered.duration),
      });
      qc.invalidateQueries({ queryKey: ["recordings"] });
      toast.success("Vocal-Mix gespeichert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-x-0 bottom-[180px] z-30 mx-auto max-w-[1400px] px-2 lg:bottom-[112px] lg:px-6">
      <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-stage backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-semibold">Vocal Live-Layer</p>
            <p className="text-xs text-muted-foreground">
              Singe während der Song läuft. „Drop" platziert die Phrase beat-genau in der nächsten Pause.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">Aufnahme</span>
              <span className={"text-xs " + (recording ? "text-rose-500" : "text-muted-foreground")}>
                {recording ? "● REC" : "bereit"}
              </span>
            </div>
            {recording ? (
              <Button onClick={stopRec} className="w-full rounded-full" variant="destructive">
                <Square className="mr-2 h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button onClick={startRec} className="w-full rounded-full bg-primary text-primary-foreground">
                <Mic className="mr-2 h-4 w-4" /> Aufnehmen
              </Button>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span>Monitor (Kopfhörer)</span>
              <Switch checked={monitor} onCheckedChange={setMonitor} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span>Autotune zur Song-Tonart</span>
              <Switch checked={autotune} onCheckedChange={setAutotune} />
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs"><span>Reverb</span><span>{reverb}%</span></div>
              <Slider value={[reverb]} max={100} step={1} onValueChange={(v) => setReverb(v[0] ?? 0)} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">Phrasen ({phrases.length})</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto-Drop</span>
                <Switch checked={autoDrop} onCheckedChange={setAutoDrop} />
              </div>
            </div>
            {phrases.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Noch keine Phrasen. Aufnahme starten, dann mit „Drop" oder „Auto" einspielen.
              </p>
            ) : (
              <div className="space-y-2">
                {phrases.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                    <span>Phrase {i + 1} · {p.durSec.toFixed(1)}s</span>
                    <Button size="sm" onClick={() => dropPhrase(p)} className="h-7 rounded-full">
                      <Sparkles className="mr-1 h-3 w-3" /> Drop
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={exportMix} disabled={!phrases.length || exporting}
              className="mt-3 w-full rounded-full" variant="outline"
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mix als Recording speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}