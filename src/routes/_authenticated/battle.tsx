import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Trophy, Swords, Crown, Music2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { recordingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { scoreLabel } from "@/lib/audio/scoring";
import { autoMashup, bufferToWav } from "@/lib/audio/mashup";

export const Route = createFileRoute("/_authenticated/battle")({
  head: () => ({ meta: [{ title: "Karaoke-Battle & Leaderboard — PartyPilot" }] }),
  component: BattleRoute,
});

type Rec = { id: string; title: string | null; storage_path: string; score: number | null; cover_url?: string | null; kind: string };

function BattleRoute() {
  const { data: recs = [] } = useQuery(recordingsOptions());
  const ranked = useMemo(() =>
    [...recs as Rec[]].filter((r) => typeof r.score === "number").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [recs]);
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mashupUrl, setMashupUrl] = useState<string | null>(null);
  const [bpms, setBpms] = useState<{ a: number; b: number } | null>(null);

  const recA = ranked.find((r) => r.id === a) ?? (recs as Rec[]).find((r) => r.id === a);
  const recB = ranked.find((r) => r.id === b) ?? (recs as Rec[]).find((r) => r.id === b);

  async function loadBuffer(path: string, ctx: AudioContext): Promise<AudioBuffer> {
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) throw new Error("Konnte Track nicht laden");
    const res = await fetch(data.signedUrl);
    const ab = await res.arrayBuffer();
    return ctx.decodeAudioData(ab);
  }

  async function runMashup() {
    if (!recA || !recB) { toast.error("Wähle 2 Aufnahmen"); return; }
    try {
      setBusy(true); setMashupUrl(null); setBpms(null);
      const ctx = new AudioContext();
      const [bufA, bufB] = await Promise.all([loadBuffer(recA.storage_path, ctx), loadBuffer(recB.storage_path, ctx)]);
      const { buffer, bpmA, bpmB } = await autoMashup(ctx, bufA, bufB, { crossfadeSec: 4 });
      const wav = bufferToWav(buffer);
      setMashupUrl(URL.createObjectURL(wav));
      setBpms({ a: bpmA, b: bpmB });
      ctx.close();
      toast.success(`Mashup ready — ${bpmA} → ${bpmB} BPM`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader title="Battle & Mashup" subtitle="Vergleicht eure Scores, krönt den König und mixt zwei Takes zum Auto-Mashup." />

      <section className="rounded-3xl border border-accent/40 bg-gradient-to-r from-accent/15 via-primary/10 to-accent/15 p-6">
        <div className="mb-4 flex items-center gap-3">
          <Trophy className="h-6 w-6 text-accent" />
          <h2 className="font-display text-xl font-bold">Leaderboard</h2>
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine bewerteten Takes. Singt im Studio, dann erscheinen sie hier.</p>
        ) : (
          <ol className="space-y-2">
            {ranked.slice(0, 10).map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3">
                <span className={"grid h-9 w-9 place-items-center rounded-full font-bold " + (i === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold">{r.title ?? r.kind}</p>
                  <p className="text-xs text-muted-foreground">{r.score} · {scoreLabel(r.score!)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <Swords className="h-6 w-6 text-primary" />
          <h2 className="font-display text-xl font-bold">Battle / Auto-Mashup</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <RecPicker label="Track A" value={a} onChange={setA} recs={recs as Rec[]} />
          <RecPicker label="Track B" value={b} onChange={setB} recs={recs as Rec[]} />
        </div>

        {recA && recB && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-muted px-3 py-1 text-sm">{recA.title}: {recA.score ?? "—"}</div>
            <span className="text-muted-foreground">vs</span>
            <div className="rounded-full bg-muted px-3 py-1 text-sm">{recB.title}: {recB.score ?? "—"}</div>
            {typeof recA.score === "number" && typeof recB.score === "number" && (
              <span className="rounded-full bg-accent/20 px-3 py-1 text-sm font-semibold text-accent">
                Winner: {(recA.score ?? 0) >= (recB.score ?? 0) ? recA.title : recB.title}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <Button onClick={runMashup} disabled={busy || !a || !b} className="rounded-full bg-primary text-primary-foreground">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music2 className="mr-2 h-4 w-4" />}
            {busy ? "Mixe…" : "Auto-Mashup erstellen"}
          </Button>
        </div>

        {mashupUrl && (
          <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
            {bpms && <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{bpms.a} BPM → {bpms.b} BPM angepasst</p>}
            <audio src={mashupUrl} controls className="w-full" />
            <a href={mashupUrl} download="mashup.wav" className="mt-2 inline-flex items-center gap-2 text-sm text-accent hover:underline">
              <Download className="h-4 w-4" /> WAV herunterladen
            </a>
          </div>
        )}
      </section>
    </div>
  );
}

function RecPicker({ label, value, onChange, recs }: { label: string; value: string | null; onChange: (v: string) => void; recs: Rec[] }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2">
        <option value="">— wählen —</option>
        {recs.map((r) => (
          <option key={r.id} value={r.id}>{r.title ?? r.kind}{typeof r.score === "number" ? ` (${r.score})` : ""}</option>
        ))}
      </select>
    </label>
  );
}