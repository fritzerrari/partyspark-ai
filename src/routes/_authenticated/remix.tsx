import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Wand2, Play, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { recordingsOptions, tracksListOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buildRemix } from "@/lib/audio/remix";
import { bufferToWav } from "@/lib/audio/mashup";

export const Route = createFileRoute("/_authenticated/remix")({
  head: () => ({ meta: [{ title: "AI Remix — PartyPilot" }] }),
  component: RemixRoute,
});

function RemixRoute() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: recs = [] } = useQuery(recordingsOptions());
  const { data: tracks = [] } = useQuery(tracksListOptions());
  const [sel, setSel] = useState<string>("");
  const [bpm, setBpm] = useState(128);
  const [length, setLength] = useState<60 | 90 | 120>(90);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [bpms, setBpms] = useState<{ src: number; tgt: number } | null>(null);

  const items: { id: string; label: string; path: string; bucket: "recordings" | "tracks" }[] = [
    ...recs.map((r) => ({ id: `r:${r.id}`, label: `🎤 ${r.title ?? r.kind}`, path: r.storage_path, bucket: "recordings" as const })),
    ...tracks.map((t) => ({ id: `t:${t.id}`, label: `🎵 ${t.title ?? "Track"}`, path: t.storage_path, bucket: "tracks" as const })),
  ];

  async function render() {
    const item = items.find((i) => i.id === sel);
    if (!item) { toast.error("Quelle wählen"); return; }
    try {
      setBusy(true); setUrl(null); setBlob(null);
      const signed = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 60 * 60);
      if (!signed.data?.signedUrl) throw new Error("Quelle nicht ladbar");
      const ab = await (await fetch(signed.data.signedUrl)).arrayBuffer();
      const liveCtx = new AudioContext();
      const src = await liveCtx.decodeAudioData(ab);
      const { buffer, sourceBpm, targetBpm } = await buildRemix(src, { targetBpm: bpm, lengthSec: length });
      const wav = bufferToWav(buffer);
      setBlob(wav); setUrl(URL.createObjectURL(wav)); setBpms({ src: sourceBpm, tgt: targetBpm });
      liveCtx.close();
      toast.success(`Remix fertig — ${sourceBpm} → ${targetBpm} BPM, ${length}s`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!blob || !user) return;
    const path = `${user.id}/remix-${Date.now()}.wav`;
    const { error } = await supabase.storage.from("recordings").upload(path, blob);
    if (error) { toast.error(error.message); return; }
    await supabase.from("recordings").insert({
      owner_id: user.id, storage_path: path, kind: "karaoke",
      title: `Remix ${bpm} BPM`,
    });
    qc.invalidateQueries({ queryKey: ["recordings"] });
    toast.success("Remix gespeichert");
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="AI Remix" subtitle="Eure Aufnahme oder ein Track als 60–120-Sek Dance-Edit mit Intro, Break und Drop." />

      <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Quelle</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
            <option value="">— wählen —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>

        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Ziel-BPM</span><span className="text-muted-foreground">{bpm}</span></div>
          <Slider value={[bpm]} min={90} max={160} step={1} onValueChange={(v) => setBpm(v[0])} />
        </div>
        <div>
          <div className="mb-1 text-sm">Länge</div>
          <div className="flex gap-2">
            {([60, 90, 120] as const).map((l) => (
              <button key={l} onClick={() => setLength(l)}
                className={"rounded-full px-3 py-1 text-xs uppercase tracking-widest " + (length === l ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                {l}s
              </button>
            ))}
          </div>
        </div>

        <Button onClick={render} disabled={busy || !sel} className="rounded-full bg-primary text-primary-foreground">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {busy ? "Mixe…" : "Remix bauen"}
        </Button>
      </div>

      {url && (
        <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
          {bpms && <p className="text-xs uppercase tracking-widest text-muted-foreground">Source {bpms.src} BPM → Target {bpms.tgt} BPM</p>}
          <audio src={url} controls className="w-full" />
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => new Audio(url).play()} variant="secondary" className="rounded-full">
              <Play className="mr-2 h-4 w-4" /> Play
            </Button>
            <Button onClick={save} className="rounded-full bg-accent text-accent-foreground">
              <Save className="mr-2 h-4 w-4" /> Speichern
            </Button>
            <a href={url} download={`remix-${bpm}.wav`} className="inline-flex items-center gap-2 self-center text-sm text-accent hover:underline">
              <Download className="h-4 w-4" /> WAV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}