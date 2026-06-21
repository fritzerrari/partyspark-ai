import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Play, Pause, CalendarHeart } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { recordingsOptions } from "@/lib/db/queries";
import { listMoments, analyzeRecording, getRecordingUrl } from "@/lib/ai/moments.functions";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/moments")({
  head: () => ({ meta: [{ title: "AI Party Moments — PartyPilot AI" }] }),
  component: Moments,
});

function Moments() {
  const { data: recordings } = useQuery(recordingsOptions());

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="AI Party Moments"
        subtitle="KI findet automatisch die besten Momente in deinen Aufnahmen — Lacher, Sing-alongs, Drops."
      />
      {(!recordings || recordings.length === 0) ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
          <CalendarHeart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Noch keine Aufnahmen. Starte eine Party und nimm sie auf, dann findest du sie hier.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recordings.map((r) => <RecordingCard key={r.id} rec={r} />)}
        </div>
      )}
    </div>
  );
}

function RecordingCard({ rec }: { rec: Tables<"recordings"> }) {
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeRecording);
  const list = useServerFn(listMoments);
  const getUrl = useServerFn(getRecordingUrl);

  const { data: moments } = useQuery({
    queryKey: ["moments", rec.id],
    queryFn: () => list({ data: { recordingId: rec.id } }),
  });

  const m = useMutation({
    mutationFn: () => analyze({ data: { recordingId: rec.id } }),
    onSuccess: (res) => {
      toast.success(`${res.count} Momente erkannt`);
      qc.invalidateQueries({ queryKey: ["moments", rec.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function ensureUrl() {
    if (audioUrl) return audioUrl;
    const { url } = await getUrl({ data: { recordingId: rec.id } });
    setAudioUrl(url);
    return url;
  }

  async function playMoment(id: string, start: number, end: number) {
    const url = await ensureUrl();
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (a.src !== url) a.src = url;
    a.currentTime = start;
    setPlayingId(id);
    const stop = () => {
      if (a.currentTime >= end) {
        a.pause();
        setPlayingId(null);
        a.removeEventListener("timeupdate", stop);
      }
    };
    a.addEventListener("timeupdate", stop);
    a.onended = () => setPlayingId(null);
    await a.play();
  }

  function stopPlayback() {
    audioRef.current?.pause();
    setPlayingId(null);
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{rec.title || "Unbenannte Aufnahme"}</h3>
          <p className="text-xs text-muted-foreground">
            {rec.kind} · {rec.duration_sec ? `${Math.round(rec.duration_sec)}s` : "Dauer unbekannt"} · {new Date(rec.created_at).toLocaleString()}
          </p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending} size="sm" className="rounded-full">
          {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {moments?.length ? "Neu analysieren" : "Analysieren"}
        </Button>
      </div>

      {moments && moments.length > 0 && (
        <ul className="mt-4 space-y-2">
          {moments.map((mo) => (
            <li key={mo.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-3">
              <button
                onClick={() => (playingId === mo.id ? stopPlayback() : playMoment(mo.id, Number(mo.start_sec), Number(mo.end_sec)))}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                {playingId === mo.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{mo.caption || "(ohne Caption)"}</p>
                <p className="text-xs text-muted-foreground">
                  {mo.kind} · {Math.round(Number(mo.start_sec))}s → {Math.round(Number(mo.end_sec))}s
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{Math.round(Number(mo.score) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}

      {moments && moments.length === 0 && !m.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">Noch nicht analysiert. Klicke auf „Analysieren" oben.</p>
      )}
    </section>
  );
}