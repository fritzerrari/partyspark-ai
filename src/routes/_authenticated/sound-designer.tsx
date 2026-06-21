import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AudioWaveform, Play, Download, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { designSound } from "@/lib/ai/soundDesigner.functions";
import { renderSynth, type SynthParams, DEFAULT_SYNTH } from "@/lib/audio/synth";
import { bufferToWav } from "@/lib/audio/mashup";

export const Route = createFileRoute("/_authenticated/sound-designer")({
  head: () => ({ meta: [{ title: "AI Sound Designer — PartyPilot" }] }),
  component: SoundDesigner,
});

const PRESETS = ["Laser-Schuss", "UFO-Landung", "Bass-Drop", "Tropfen ins Glas", "Whoosh-Übergang", "Retro-Drum-Kick", "Glas-Splitter", "Cyber-Drone"];

function SoundDesigner() {
  const fn = useServerFn(designSound);
  const [prompt, setPrompt] = useState("Laser-Schuss");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useState<SynthParams>(DEFAULT_SYNTH);
  const [url, setUrl] = useState<string | null>(null);

  async function design() {
    try {
      setBusy(true); setUrl(null);
      const r = await fn({ data: { prompt } });
      setParams(r.params);
      const buf = await renderSynth(r.params);
      const wav = bufferToWav(buf);
      setUrl(URL.createObjectURL(wav));
      // auto-play
      new Audio(URL.createObjectURL(wav)).play().catch(() => { /* */ });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function rerender() {
    const buf = await renderSynth(params);
    const wav = bufferToWav(buf);
    setUrl(URL.createObjectURL(wav));
    new Audio(URL.createObjectURL(wav)).play().catch(() => { /* */ });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="AI Sound Designer" subtitle="Beschreibe einen FX — die KI baut die Synth-Parameter, dein Browser rendert ihn." />

      <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setPrompt(p)}
              className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-accent/20 hover:text-accent">
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="z.B. tropfender Wasserhahn in einer Halle" />
          <Button onClick={design} disabled={busy} className="rounded-full bg-primary text-primary-foreground">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {busy ? "Baut…" : "Sound bauen"}
          </Button>
        </div>
      </div>

      {url && (
        <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => new Audio(url).play()} variant="secondary" className="rounded-full">
              <Play className="mr-2 h-4 w-4" /> Erneut abspielen
            </Button>
            <Button onClick={rerender} variant="ghost" className="rounded-full">
              <AudioWaveform className="mr-2 h-4 w-4" /> Mit Tweaks neu rendern
            </Button>
            <a href={url} download={`${prompt}.wav`} className="inline-flex items-center gap-2 self-center text-sm text-accent hover:underline">
              <Download className="h-4 w-4" /> WAV
            </a>
          </div>
          <audio src={url} controls className="w-full" />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Parameter</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3">{JSON.stringify(params, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}