import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users, Play, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { renderCrowdBed, type CrowdPreset } from "@/lib/audio/crowd";
import { bufferToWav } from "@/lib/audio/mashup";
import { pickCrowdPreset } from "@/lib/ai/crowdPick.functions";

export const Route = createFileRoute("/_authenticated/crowd")({
  head: () => ({ meta: [{ title: "AI Crowd Reactions — PartyPilot" }] }),
  component: CrowdRoute,
});

const PRESETS: { id: CrowdPreset; label: string; emoji: string }[] = [
  { id: "cheer", label: "Jubel", emoji: "🎉" },
  { id: "laugh", label: "Lacher", emoji: "😂" },
  { id: "applause", label: "Applaus", emoji: "👏" },
  { id: "boo", label: "Buh", emoji: "👎" },
  { id: "ooh", label: "Ohhhh", emoji: "😮" },
];

function CrowdRoute() {
  const pick = useServerFn(pickCrowdPreset);
  const [preset, setPreset] = useState<CrowdPreset>("cheer");
  const [duration, setDuration] = useState(4);
  const [scene, setScene] = useState("Sänger trifft den High-Note perfekt");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  async function render(p: CrowdPreset, d: number) {
    setBusy(true); setUrl(null);
    try {
      const buf = await renderCrowdBed(p, d);
      const wav = bufferToWav(buf);
      const u = URL.createObjectURL(wav);
      setUrl(u);
      new Audio(u).play().catch(() => { /* */ });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function aiPick() {
    try {
      setAiBusy(true); setReason(null);
      const r = await pick({ data: { scene } });
      setPreset(r.preset); setDuration(r.duration); setReason(r.reason);
      await render(r.preset, r.duration);
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiBusy(false); }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="AI Crowd Reactions" subtitle="Jubel, Lacher, Applaus, Buh oder Ohhhh — die KI wählt zum Moment, dein Browser rendert die Crowd." />

      <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => { setPreset(p.id); render(p.id, duration); }}
              className={"rounded-full px-4 py-2 text-sm font-semibold " + (preset === p.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-accent/20")}>
              <span className="mr-2">{p.emoji}</span>{p.label}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Dauer</span><span className="text-muted-foreground">{duration}s</span></div>
          <Slider value={[duration]} min={2} max={8} step={1} onValueChange={(v) => setDuration(v[0])} />
        </div>
        <Button onClick={() => render(preset, duration)} disabled={busy} className="rounded-full bg-primary text-primary-foreground">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          Crowd erzeugen
        </Button>
      </div>

      <div className="rounded-3xl border border-accent/40 bg-gradient-to-r from-accent/10 to-primary/10 p-5 space-y-3">
        <h3 className="font-display text-lg font-semibold">KI-Auswahl</h3>
        <p className="text-sm text-muted-foreground">Beschreibe die Szene — die KI wählt das passende Crowd-Preset.</p>
        <div className="flex gap-2">
          <Input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="z.B. Witz ist gefloppt" />
          <Button onClick={aiPick} disabled={aiBusy} className="rounded-full bg-accent text-accent-foreground">
            {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI Pick
          </Button>
        </div>
        {reason && <p className="text-xs text-muted-foreground">→ {preset} ({duration}s) · {reason}</p>}
      </div>

      {url && (
        <div className="rounded-3xl border border-border bg-card p-5 space-y-2">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => new Audio(url).play()} variant="secondary" className="rounded-full">
              <Play className="mr-2 h-4 w-4" /> Erneut
            </Button>
            <a href={url} download={`crowd-${preset}.wav`} className="inline-flex items-center gap-2 self-center text-sm text-accent hover:underline">
              <Download className="h-4 w-4" /> WAV
            </a>
          </div>
          <audio src={url} controls className="w-full" />
        </div>
      )}
    </div>
  );
}