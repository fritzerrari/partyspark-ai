import { useEffect } from "react";
import { Trash2, Play, Pause, Disc3, Mic, Wand2, Music, FileText, Send } from "lucide-react";
import { useProject, type ArtifactKind } from "@/lib/project/store";
import { useEngine } from "@/lib/audio/engine";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { decodeToBuffer } from "@/lib/audio/analyze";
import { useQuery } from "@tanstack/react-query";
import { tracksListOptions, recordingsOptions } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ArtifactKind, typeof Disc3> = {
  track: Music, recording: Mic, vocal: Mic, remix: Wand2, mashup: Disc3, fx: Disc3, lyrics: FileText,
};

const KIND_COLOR: Record<ArtifactKind, string> = {
  track: "text-[var(--neon-cyan)]",
  recording: "text-[var(--neon-magenta)]",
  vocal: "text-[var(--neon-magenta)]",
  remix: "text-[var(--neon-amber)]",
  mashup: "text-[var(--neon-lime)]",
  fx: "text-stage-foreground/70",
  lyrics: "text-stage-foreground/70",
};

/** Tray panel showing every Artifact in the Project Bus.
 *  Also bulk-imports the user's library tracks & recordings on first mount
 *  so other modules immediately see something to chew on. */
export function ProjectTrayPanel() {
  const artifacts = useProject((s) => s.artifacts);
  const addArtifact = useProject((s) => s.addArtifact);
  const removeArtifact = useProject((s) => s.removeArtifact);
  const toEngineTrack = useProject((s) => s.toEngineTrack);
  const loadQueue = useEngine((s) => s.loadQueue);
  const current = useEngine((s) => s.current);
  const isPlaying = useEngine((s) => s.isPlaying);
  const toggle = useEngine((s) => s.toggle);
  const { user } = useAuth();
  const { data: tracks = [] } = useQuery(tracksListOptions());
  const { data: recs = [] } = useQuery(recordingsOptions());

  // Auto-seed the bus with library tracks/recordings (only once).
  useEffect(() => {
    if (!user) return;
    const present = new Set(artifacts.map((a) => a.id));
    (async () => {
      for (const t of tracks.slice(0, 30)) {
        const id = `track-${t.id}`;
        if (present.has(id)) continue;
        if (!t.storage_path) continue;
        const { data: signed } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
        const tt = t as unknown as Record<string, unknown>;
        addArtifact({
          id,
          kind: "track",
          title: t.title ?? "Untitled",
          url: signed?.signedUrl ?? undefined,
          storagePath: t.storage_path,
          bucket: "tracks",
          analysis: ((tt.bpm as number | null) && (tt.beat_grid as number[] | null)) ? {
            bpm: (tt.bpm as number),
            musicalKey: (tt.musical_key as string) ?? "",
            camelot: (tt.camelot as string) ?? "",
            beatGrid: (tt.beat_grid as number[]) ?? [],
            firstBeat: ((tt.beat_grid as number[] | null)?.[0]) ?? 0,
            energyCurve: [],
            cues: (tt.cues as { introEnd: number; firstDrop: number; outroStart: number } | null) ?? { introEnd: 0, firstDrop: 0, outroStart: 0 },
            vocalMap: (tt.vocal_map as { t: number; voiced: number }[] | null) ?? [],
          } : null,
          meta: { artist: (tt.artist as string | null), artwork: (tt.artwork_url as string | null), durationSec: (tt.duration_sec as number | null) },
        });
      }
      for (const r of recs.slice(0, 20)) {
        const id = `rec-${r.id}`;
        if (present.has(id)) continue;
        if (!r.storage_path) continue;
        const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(r.storage_path, 60 * 60);
        addArtifact({
          id, kind: "recording",
          title: r.title ?? "Aufnahme",
          url: signed?.signedUrl ?? undefined,
          storagePath: r.storage_path, bucket: "recordings",
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tracks.length, recs.length]);

  async function importFile(file: File) {
    const url = URL.createObjectURL(file);
    const buf = await decodeToBuffer(await file.arrayBuffer());
    addArtifact({ kind: "recording", title: file.name, buffer: buf, url });
  }

  function sendToDeck(id: string) {
    const t = toEngineTrack(id);
    if (t) loadQueue([t], { autoplay: true });
  }

  return (
    <div className="space-y-2 text-sm text-stage-foreground">
      <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 p-3 text-xs text-stage-foreground/70 hover:bg-black/30 cursor-pointer">
        + Audio importieren
        <input
          type="file" accept="audio/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])}
        />
      </label>

      <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {artifacts.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-center text-xs text-stage-foreground/60">
            Noch keine Artefakte. Importiere Audio oder lade einen Track aus der Library.
          </p>
        )}
        {artifacts.map((a) => {
          const Icon = KIND_ICON[a.kind];
          const active = current?.id === a.id;
          return (
            <div key={a.id} className={cn(
              "flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2",
              active && "border-[var(--neon-cyan)] neon-glow-cyan",
            )}>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", KIND_COLOR[a.kind])} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{a.title}</p>
                <p className="text-[10px] uppercase tracking-widest text-stage-foreground/50">
                  {a.kind}{a.analysis?.bpm ? ` · ${Math.round(a.analysis.bpm)} BPM` : ""}{a.analysis?.musicalKey ? ` · ${a.analysis.musicalKey}` : ""}
                </p>
              </div>
              {active ? (
                <button onClick={toggle} className="rounded p-1 hover:bg-white/10" title={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
              ) : (
                <button onClick={() => sendToDeck(a.id)} className="rounded p-1 hover:bg-white/10" title="Auf Deck A">
                  <Send className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => removeArtifact(a.id)} className="rounded p-1 text-stage-foreground/50 hover:bg-[var(--neon-magenta)]/30 hover:text-stage-foreground" title="Entfernen">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}