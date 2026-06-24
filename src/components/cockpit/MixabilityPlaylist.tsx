import { useMemo, useState } from "react";
import type { EngineTrack } from "@/lib/audio/engine";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { matchScore, scoreToTag, needsBridge } from "@/lib/dj/mixability";
import { pushLog } from "@/lib/dj/copilotLog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CRATE_COLORS, CRATE_LABELS, CRATE_ORDER, filterByCrate, type SmartCrate } from "@/lib/intel/smartCrates";
import { diagnoseBridge, findBridge } from "@/lib/intel/genreBridge";
import { Zap, X } from "lucide-react";

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
  const [crateFilter, setCrateFilter] = useState<SmartCrate | "all">("all");
  const [bridgeFor, setBridgeFor] = useState<EngineTrack | null>(null);

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
    const filtered = filterByCrate(tracks, crateFilter);
    return filtered
      .filter((t) => t.id !== liveTrack?.id)
      .map((t) => ({
        t,
        s: matchScore(liveTrack, t),
        bridge: needsBridge(liveTrack, t),
        diag: diagnoseBridge(liveTrack, t),
      }))
      .sort((a, b) => b.s - a.s);
  }, [tracks, liveTrack, crateFilter]);

  const bridgeSuggestions = useMemo(() => {
    if (!bridgeFor || !liveTrack) return [];
    return findBridge(liveTrack, bridgeFor, tracks, 2);
  }, [bridgeFor, liveTrack, tracks]);

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
      {/* Crate filter chips */}
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          onClick={() => setCrateFilter("all")}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest transition",
            crateFilter === "all"
              ? "border-white/40 bg-white/15 text-stage-foreground"
              : "border-white/10 text-stage-foreground/60 hover:text-stage-foreground",
          )}
        >
          alle
        </button>
        {CRATE_ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setCrateFilter(c)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest transition",
              crateFilter === c
                ? "border-white/40 text-stage-foreground"
                : "border-white/10 text-stage-foreground/60 hover:text-stage-foreground",
            )}
            style={{
              background: crateFilter === c ? `color-mix(in oklab, ${CRATE_COLORS[c]} 22%, transparent)` : undefined,
              color: crateFilter === c ? CRATE_COLORS[c] : undefined,
            }}
          >
            {CRATE_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {ranked.length === 0 ? (
          <div className="text-[11px] text-stage-foreground/40">
            Keine weiteren Tracks.
          </div>
        ) : (
          ranked.map(({ t, s, bridge, diag }) => {
            const tag = scoreToTag(s);
            const onOther = otherTrack?.id === t.id;
            const crate = (t.smartCrate ?? "reserve") as SmartCrate;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex w-full items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-left transition-all hover:bg-white/10",
                  onOther && "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_15%,transparent)]",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    tag === "green" && "bg-[var(--neon-lime)]",
                    tag === "amber" && "bg-[var(--neon-amber)]",
                    tag === "red"   && "bg-red-400",
                  )}
                  title={`Match ${s}`}
                />
                <button
                  onClick={() => loadOnOther(t)}
                  className="min-w-0 flex-1 text-left"
                  title={`Klick: auf Deck ${otherSide} laden`}
                >
                  <div className="truncate text-[11px] font-semibold text-stage-foreground">
                    {t.title}
                  </div>
                  <div className="truncate text-[10px] text-stage-foreground/50">
                    {t.bpm ? `${Math.round(t.bpm)} BPM` : "— BPM"} · {t.camelot ?? "?"}
                    <span
                      className="ml-1 px-1 rounded text-[9px]"
                      style={{
                        background: `color-mix(in oklab, ${CRATE_COLORS[crate]} 22%, transparent)`,
                        color: CRATE_COLORS[crate],
                      }}
                    >
                      {CRATE_LABELS[crate]}
                    </span>
                  </div>
                </button>
                {(bridge || diag.needed) && liveTrack && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setBridgeFor(t); }}
                    className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-200 hover:bg-red-500/20 flex items-center gap-0.5"
                    title={diag.reason}
                  >
                    <Zap className="h-2.5 w-2.5" /> Bridge
                  </button>
                )}
                <div className="font-mono text-[10px] text-stage-foreground/60 w-7 text-right">{s}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Bridge popover */}
      {bridgeFor && liveTrack && (
        <div className="mt-2 rounded border border-red-400/40 bg-red-500/10 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-red-200">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> Bridge zu „{bridgeFor.title}"
            </span>
            <button onClick={() => setBridgeFor(null)} className="text-red-200 hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
          {bridgeSuggestions.length === 0 ? (
            <div className="text-[10px] text-stage-foreground/50">Keine passenden Bridge-Tracks in deiner Library.</div>
          ) : (
            <div className="space-y-1">
              {bridgeSuggestions.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { void loadOnOther(b); setBridgeFor(null); }}
                  className="flex w-full items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1 text-left hover:bg-white/10"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-amber)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-stage-foreground">{b.title}</div>
                    <div className="truncate text-[10px] text-stage-foreground/50">
                      {b.bpm ? `${Math.round(b.bpm)} BPM` : "—"} · {b.camelot ?? "?"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}