import { useMemo } from "react";
import type { EngineTrack } from "@/lib/audio/engine";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { matchScore, scoreToTag, needsBridge } from "@/lib/dj/mixability";
import { pushLog } from "@/lib/dj/copilotLog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function liveSide(state: ReturnType<typeof useTwinDeck.getState>): DeckSide {
  // The "live" deck is whichever is audible: playing and on its xfader side.
  const aLoud = (1 - state.crossfader) * (state.A.isPlaying ? 1 : 0);
  const bLoud = state.crossfader * (state.B.isPlaying ? 1 : 0);
  if (aLoud === 0 && bLoud === 0) return state.A.track ? "A" : "B";
  return bLoud > aLoud ? "B" : "A";
}

export function MixabilityPlaylist({ tracks }: { tracks: EngineTrack[] }) {
  const aTrack = useTwinDeck((s) => s.A.track);
  const bTrack = useTwinDeck((s) => s.B.track);
  const aPlaying = useTwinDeck((s) => s.A.isPlaying);
  const bPlaying = useTwinDeck((s) => s.B.isPlaying);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const loadDeck = useTwinDeck((s) => s.loadDeck);

  const live: DeckSide = useMemo(() => {
    const aLoud = (1 - crossfader) * (aPlaying ? 1 : 0);
    const bLoud = crossfader * (bPlaying ? 1 : 0);
    if (aLoud === 0 && bLoud === 0) return aTrack ? "A" : "B";
    return bLoud > aLoud ? "B" : "A";
  }, [aPlaying, bPlaying, crossfader, aTrack]);
  const liveTrack = live === "A" ? aTrack : bTrack;
  const otherSide: DeckSide = live === "A" ? "B" : "A";
  const otherTrack = live === "A" ? bTrack : aTrack;

  const ranked = useMemo(() => {
    return [...tracks]
      .filter((t) => t.id !== liveTrack?.id)
      .map((t) => ({ t, s: matchScore(liveTrack, t), bridge: needsBridge(liveTrack, t) }))
      .sort((a, b) => b.s - a.s);
  }, [tracks, liveTrack]);

  async function loadOnOther(track: EngineTrack) {
    try {
      await loadDeck(otherSide, track);
      pushLog(`📥 ${track.title} → Deck ${otherSide} (Match ${matchScore(liveTrack, track)})`, "act");
      toast.success(`Geladen auf Deck ${otherSide}`);
    } catch {
      toast.error("Konnte nicht laden");
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--neon-magenta)]">
          Playlist
        </span>
        <span className="text-[10px] uppercase tracking-widest text-stage-foreground/40">
          live = {live}
        </span>
      </div>
      <div className="mb-2 text-[10px] text-stage-foreground/60">
        Sortiert nach Mix-Fit zum Live-Deck.<br />
        🟢 passt · 🟡 ok · 🔴 Bridge nötig
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {ranked.length === 0 ? (
          <div className="text-[11px] text-stage-foreground/40">
            Keine weiteren Tracks.
          </div>
        ) : (
          ranked.map(({ t, s, bridge }) => {
            const tag = scoreToTag(s);
            const onOther = otherTrack?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => loadOnOther(t)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-left transition-all hover:bg-white/10",
                  onOther && "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_15%,transparent)]",
                )}
                title={`Klick: auf Deck ${otherSide} laden`}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    tag === "green" && "bg-[var(--neon-lime)]",
                    tag === "amber" && "bg-[var(--neon-amber)]",
                    tag === "red"   && "bg-red-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-stage-foreground">
                    {t.title}
                  </div>
                  <div className="truncate text-[10px] text-stage-foreground/50">
                    {t.bpm ? `${Math.round(t.bpm)} BPM` : "— BPM"} · {t.camelot ?? "?"}
                    {bridge && <span className="ml-1 text-red-300">· Bridge</span>}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-stage-foreground/60">{s}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}