import { useMemo, useState } from "react";
import { Sparkles, ArrowRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reorderPlaylist, type ScoreableTrack, type TransitionEdge } from "@/lib/audio/transitionScore";

type TrackLite = {
  id: string;
  title: string;
  artist: string | null;
  bpm: number | null;
  music_key: string | null;
  energy: number | null;
  beat_grid: number[] | null;
  cues: { introEnd: number; firstDrop: number; outroStart: number; introPoints?: number[]; outroPoints?: number[] } | null;
  vocal_map: { t: number; voiced: number }[] | null;
  duration_sec: number | null;
  analyzed_at: string | null;
};

type Props = {
  tracks: TrackLite[];
  selectedIds: string[];
  analyzingIds: Set<string>;
  onToggle: (id: string) => void;
  onAnalyzeMissing: () => void;
  onLoadToCockpit: (orderedIds: string[]) => void;
};

function camelotFromKey(k: string | null): string | null {
  // crude — relies on analyzer already storing camelot via key text; we just pass key as-is
  return k;
}

export function SmartOrderPanel({ tracks, selectedIds, analyzingIds, onToggle, onAnalyzeMissing, onLoadToCockpit }: Props) {
  const [ordered, setOrdered] = useState<string[] | null>(null);
  const [edges, setEdges] = useState<TransitionEdge[]>([]);
  const [computing, setComputing] = useState(false);

  const selected = useMemo(
    () => selectedIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as TrackLite[],
    [selectedIds, tracks],
  );

  const missingCount = selected.filter((t) => !t.analyzed_at).length;
  const canOrder = selected.length >= 2 && missingCount === 0;

  function compute() {
    setComputing(true);
    setTimeout(() => {
      try {
        const inputs: ScoreableTrack[] = selected.map((t) => ({
          id: t.id,
          title: t.title,
          bpm: t.bpm,
          camelot: camelotFromKey(t.music_key),
          beatGrid: t.beat_grid,
          cues: t.cues,
          durationSec: t.duration_sec,
          energy: t.energy,
          vocalMap: t.vocal_map,
          introPoints: t.cues?.introPoints ?? null,
          outroPoints: t.cues?.outroPoints ?? null,
        }));
        const res = reorderPlaylist(inputs);
        setOrdered(res.orderedIds);
        setEdges(res.edges);
      } finally {
        setComputing(false);
      }
    }, 10);
  }

  const display = ordered
    ? (ordered.map((id) => selected.find((t) => t.id === id)).filter(Boolean) as TrackLite[])
    : selected;

  if (selected.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-center">
        <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">Smart-Order Playlist</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Wähle 2+ Tracks aus deiner Library, um die optimale Reihenfolge berechnen zu lassen.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <p className="font-display text-sm font-semibold">Smart-Order ({selected.length})</p>
        <div className="ml-auto flex flex-wrap gap-2">
          {missingCount > 0 ? (
            <Button size="sm" variant="outline" onClick={onAnalyzeMissing} disabled={analyzingIds.size > 0} className="h-8 rounded-full">
              {analyzingIds.size > 0 ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              {missingCount} analysieren
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={compute}
            disabled={!canOrder || computing}
            className="h-8 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {computing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
            Smart-Order
          </Button>
          {ordered ? (
            <Button size="sm" variant="outline" onClick={() => onLoadToCockpit(ordered)} className="h-8 rounded-full">
              <ArrowRight className="mr-2 h-3.5 w-3.5" /> An Cockpit
            </Button>
          ) : null}
        </div>
      </div>

      <ol className="mt-4 space-y-1.5">
        {display.map((t, i) => {
          const edge = ordered && i > 0 ? edges[i - 1] : null;
          return (
            <li key={t.id} className="space-y-1.5">
              {edge ? (
                <div className="ml-4 flex items-center gap-2 text-[10px]">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 font-bold tabular-nums",
                    edge.score >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                    edge.score >= 60 ? "bg-amber-500/20 text-amber-300" :
                                       "bg-rose-500/20 text-rose-300",
                  )}>{edge.score}</span>
                  <span className="text-muted-foreground">{edge.recommendedMode}</span>
                  <span className="truncate text-muted-foreground/70">{edge.note}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2">
                <span className="w-5 text-center text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{t.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t.bpm ? `${Math.round(t.bpm)} BPM` : "no BPM"} · {t.music_key ?? "?"} · E{t.energy ?? "?"}
                    {!t.analyzed_at ? <span className="ml-1 text-amber-400">· unanalyzed</span> : null}
                    {analyzingIds.has(t.id) ? <span className="ml-1 text-accent">· analyzing…</span> : null}
                  </p>
                </div>
                <button onClick={() => onToggle(t.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
