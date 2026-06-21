import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Loader2, Play, Pause, Save, Wand2, Users, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyHarmonies, applyChoir, applyPreset,
  type Interval, type VocalPreset,
} from "@/lib/audio/vocalPost";
import { pitchShiftBuffer, audioBufferToWav } from "@/lib/audio/pitchShift";
import { detectDominantMidi, snapToScale, type ScaleId, SCALES } from "@/lib/audio/pitch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Recording = { id: string; storage_path: string; title: string | null; kind: string };

type Props = { recording: Recording | null; onClose: () => void };

const INTERVALS: { id: Interval; label: string }[] = [
  { id: "third", label: "Terz (+4 HT)" },
  { id: "fifth", label: "Quinte (+7 HT)" },
  { id: "octaveUp", label: "Oktave hoch" },
  { id: "octaveDown", label: "Oktave runter" },
];

const PRESETS: { id: VocalPreset; label: string; emoji: string }[] = [
  { id: "stadion", label: "Stadion", emoji: "🏟️" },
  { id: "whisper", label: "Whisper", emoji: "🤫" },
  { id: "tpain", label: "T-Pain", emoji: "🎤" },
  { id: "telephone", label: "Telefon", emoji: "📞" },
  { id: "megafon", label: "Megafon", emoji: "📣" },
];

export function PostProcessSheet({ recording, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [origBuffer, setOrigBuffer] = useState<AudioBuffer | null>(null);
  const [outBuffer, setOutBuffer] = useState<AudioBuffer | null>(null);
  const [intervals, setIntervals] = useState<Set<Interval>>(new Set(["third", "fifth"]));
  const [choirVoices, setChoirVoices] = useState(8);
  const [scaleId, setScaleId] = useState<ScaleId>("c-major");
  const [tuneStrength, setTuneStrength] = useState(70);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [player, setPlayer] = useState<{ src: AudioBufferSourceNode; ctx: AudioContext } | null>(null);

  useEffect(() => {
    if (!recording) {
      setOrigBuffer(null);
      setOutBuffer(null);
      return;
    }
    (async () => {
      const { data } = await supabase.storage.from("recordings").createSignedUrl(recording.storage_path, 3600);
      if (!data?.signedUrl) return;
      const arr = await (await fetch(data.signedUrl)).arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(arr);
      ctx.close();
      setOrigBuffer(buf);
      setOutBuffer(null);
    })();
  }, [recording]);

  const stop = () => {
    if (player) {
      try { player.src.stop(); } catch { /* noop */ }
      player.ctx.close();
    }
    setPlayer(null);
    setPlaying(false);
  };

  const playBuf = (buf: AudioBuffer) => {
    stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setPlaying(false);
    src.start();
    setPlayer({ src, ctx });
    setPlaying(true);
  };

  useEffect(() => () => stop(), []);

  const ctxFor = (buf: AudioBuffer) =>
    new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);

  const runHarmonies = async () => {
    if (!origBuffer || intervals.size === 0) return;
    setBusy(true);
    try {
      const out = await applyHarmonies(ctxFor(origBuffer), origBuffer, [...intervals]);
      setOutBuffer(out);
      toast.success(`${intervals.size} Stimme(n) hinzugefügt`);
    } catch (e) { console.error(e); toast.error("Harmonies fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const runChoir = async () => {
    if (!origBuffer) return;
    setBusy(true);
    try {
      const out = await applyChoir(ctxFor(origBuffer), origBuffer, choirVoices);
      setOutBuffer(out);
      toast.success(`Chor mit ${choirVoices} Stimmen erzeugt`);
    } catch (e) { console.error(e); toast.error("Choir fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const runPreset = async (p: VocalPreset) => {
    if (!origBuffer) return;
    setBusy(true);
    try {
      const out = await applyPreset(origBuffer, p);
      setOutBuffer(out);
      toast.success(`Preset „${p}" angewandt`);
    } catch (e) { console.error(e); toast.error("Preset fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const runAutotune = async () => {
    if (!origBuffer) return;
    setBusy(true);
    try {
      const detected = detectDominantMidi(origBuffer);
      if (detected === null) { toast.error("Keine Tonhöhe erkannt"); return; }
      const target = snapToScale(detected, scaleId);
      const shift = (target - detected) * (tuneStrength / 100);
      const ctx = ctxFor(origBuffer);
      const out = await pitchShiftBuffer(ctx, origBuffer, shift);
      setOutBuffer(out);
      toast.success(`Autotune: ${shift > 0 ? "+" : ""}${shift.toFixed(2)} HT`);
    } catch (e) { console.error(e); toast.error("Autotune fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!outBuffer || !user || !recording) return;
    setBusy(true);
    try {
      const blob = audioBufferToWav(outBuffer);
      const path = `${user.id}/processed-${Date.now()}.wav`;
      const { error } = await supabase.storage.from("recordings").upload(path, blob);
      if (error) throw error;
      await supabase.from("recordings").insert({
        owner_id: user.id,
        storage_path: path,
        kind: "karaoke",
        title: `${recording.title ?? "Karaoke"} (FX)`,
      });
      qc.invalidateQueries({ queryKey: ["recordings"] });
      toast.success("Gespeichert ✨");
      onClose();
    } catch (e) { console.error(e); toast.error("Speichern fehlgeschlagen"); }
    finally { setBusy(false); }
  };

  const toggleInterval = (i: Interval) => {
    const next = new Set(intervals);
    next.has(i) ? next.delete(i) : next.add(i);
    setIntervals(next);
  };

  return (
    <Sheet open={!!recording} onOpenChange={(o) => !o && (stop(), onClose())}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Vocal Producer</SheetTitle>
          <SheetDescription>{recording?.title ?? "Karaoke-Take"}</SheetDescription>
        </SheetHeader>

        {!origBuffer ? (
          <div className="mt-8 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade Aufnahme…
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Autotune */}
            <section className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /><h4 className="font-semibold">Autotune</h4></div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tonart:</span>
                <Select value={scaleId} onValueChange={(v) => setScaleId(v as ScaleId)}>
                  <SelectTrigger className="w-[180px] rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCALES).map(([id, s]) => <SelectItem key={id} value={id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Stärke</span><span>{tuneStrength}%</span></div>
                <Slider value={[tuneStrength]} onValueChange={([v]) => setTuneStrength(v)} min={0} max={100} step={5} />
              </div>
              <Button size="sm" onClick={runAutotune} disabled={busy} className="rounded-full">Tunen</Button>
            </section>

            {/* Harmonies */}
            <section className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-primary" /><h4 className="font-semibold">AI Harmonies</h4></div>
              <div className="grid grid-cols-2 gap-2">
                {INTERVALS.map((i) => {
                  const active = intervals.has(i.id);
                  return (
                    <button
                      key={i.id}
                      onClick={() => toggleInterval(i.id)}
                      className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-primary bg-primary-soft text-primary" : "border-border")}
                    >{i.label}</button>
                  );
                })}
              </div>
              <Button size="sm" onClick={runHarmonies} disabled={busy || intervals.size === 0} className="rounded-full">
                Harmonien rendern
              </Button>
            </section>

            {/* Choir */}
            <section className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h4 className="font-semibold">AI Choir</h4></div>
              <div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Stimmen</span><span>{choirVoices}</span></div>
                <Slider value={[choirVoices]} onValueChange={([v]) => setChoirVoices(v)} min={4} max={16} step={1} />
              </div>
              <Button size="sm" onClick={runChoir} disabled={busy} className="rounded-full">Chor rendern</Button>
            </section>

            {/* Presets */}
            <section className="rounded-2xl border border-border p-4 space-y-3">
              <h4 className="font-semibold">FX-Presets</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => runPreset(p.id)}
                    className="rounded-2xl border border-border bg-muted/30 p-3 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <div className="text-xl">{p.emoji}</div>
                    <div className="mt-1 font-medium">{p.label}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Playback + Save */}
            <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-border bg-card/95 px-6 py-4 backdrop-blur flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => (playing ? stop() : playBuf(origBuffer))} className="rounded-full">
                {playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} Original
              </Button>
              {outBuffer && (
                <Button size="sm" onClick={() => (playing ? stop() : playBuf(outBuffer))} className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Play className="mr-2 h-4 w-4" /> Bearbeitet
                </Button>
              )}
              {outBuffer && (
                <Button size="sm" onClick={save} disabled={busy} className="rounded-full ml-auto">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Speichern
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}