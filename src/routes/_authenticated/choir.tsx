import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Music4, Save, Play } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { recordingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { applyChoir } from "@/lib/audio/vocalPost";
import { bufferToWav } from "@/lib/audio/mashup";
import { makeImpulseResponse, type ReverbPreset } from "@/lib/audio/reverbImpulse";

export const Route = createFileRoute("/_authenticated/choir")({
  head: () => ({ meta: [{ title: "AI Choir — PartyPilot" }] }),
  component: ChoirRoute,
});

function ChoirRoute() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: recs = [] } = useQuery(recordingsOptions());
  const [sel, setSel] = useState<string>("");
  const [voices, setVoices] = useState(16);
  const [reverb, setReverb] = useState<ReverbPreset>("hall");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  async function render() {
    const rec = recs.find((r) => r.id === sel);
    if (!rec) { toast.error("Aufnahme wählen"); return; }
    try {
      setBusy(true); setUrl(null); setBlob(null);
      const signed = await supabase.storage.from("recordings").createSignedUrl(rec.storage_path, 60 * 60);
      if (!signed.data?.signedUrl) throw new Error("Track nicht ladbar");
      const ab = await (await fetch(signed.data.signedUrl)).arrayBuffer();
      const liveCtx = new AudioContext();
      const dry = await liveCtx.decodeAudioData(ab);
      const offline = new OfflineAudioContext(2, dry.length + Math.floor(dry.sampleRate * 2.5), dry.sampleRate);
      const choirBuf = await applyChoir(offline, dry, voices);
      // Wet reverb pass
      const src = offline.createBufferSource(); src.buffer = choirBuf;
      const dryG = offline.createGain(); dryG.gain.value = 0.7;
      const conv = offline.createConvolver(); conv.buffer = makeImpulseResponse(offline, reverb);
      const wetG = offline.createGain(); wetG.gain.value = 0.5;
      src.connect(dryG); dryG.connect(offline.destination);
      src.connect(conv); conv.connect(wetG); wetG.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      const wav = bufferToWav(rendered);
      setBlob(wav);
      setUrl(URL.createObjectURL(wav));
      liveCtx.close();
      toast.success(`Chor mit ${voices} Stimmen gerendert ✨`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!blob || !user) return;
    const path = `${user.id}/choir-${Date.now()}.wav`;
    const { error } = await supabase.storage.from("recordings").upload(path, blob);
    if (error) { toast.error(error.message); return; }
    await supabase.from("recordings").insert({
      owner_id: user.id, storage_path: path, kind: "choir",
      title: `Choir ×${voices}`,
    });
    qc.invalidateQueries({ queryKey: ["recordings"] });
    toast.success("Im Library gespeichert");
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="AI Choir" subtitle="Eine Stimme — bis zu 50 Stimmen. Detune, Timing-Offset & Halle inklusive." />

      <div className="grid gap-4 rounded-3xl border border-border bg-card p-6 lg:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Aufnahme</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
            <option value="">— wählen —</option>
            {recs.map((r) => <option key={r.id} value={r.id}>{r.title ?? r.kind}</option>)}
          </select>
        </label>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>Stimmen</span><span className="text-muted-foreground">{voices}</span></div>
            <Slider value={[voices]} min={3} max={50} step={1} onValueChange={(v) => setVoices(v[0])} />
          </div>
          <div>
            <div className="mb-1 text-sm">Hall</div>
            <div className="flex flex-wrap gap-2">
              {(["room", "hall", "plate", "cathedral"] as ReverbPreset[]).map((p) => (
                <button key={p} onClick={() => setReverb(p)}
                  className={"rounded-full px-3 py-1 text-xs uppercase tracking-widest " + (reverb === p ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 flex flex-wrap gap-3">
          <Button onClick={render} disabled={busy || !sel} className="rounded-full bg-primary text-primary-foreground">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music4 className="mr-2 h-4 w-4" />}
            {busy ? `Rendere ${voices} Stimmen…` : "Chor rendern"}
          </Button>
          {url && (
            <>
              <Button variant="secondary" onClick={() => new Audio(url).play()} className="rounded-full">
                <Play className="mr-2 h-4 w-4" /> Anhören
              </Button>
              <Button onClick={save} className="rounded-full bg-accent text-accent-foreground">
                <Save className="mr-2 h-4 w-4" /> Speichern
              </Button>
              <a href={url} download={`choir-${voices}.wav`} className="self-center text-sm text-accent hover:underline">WAV herunterladen</a>
            </>
          )}
        </div>
        {url && <audio src={url} controls className="lg:col-span-2 w-full" />}
      </div>
    </div>
  );
}