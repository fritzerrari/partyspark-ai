import { useMemo, useState } from "react";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { harmonicDist, bpmFoldDelta, needsBridge } from "@/lib/dj/mixability";
import { pushLog } from "@/lib/dj/copilotLog";
import { makeBridgeBeatBlobUrl } from "@/lib/audio/bridgeBeat";
import type { EngineTrack } from "@/lib/audio/engine";
import type { CleanRecipeId } from "@/lib/audio/cleanDjTransitions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RecipeBtn = { id: CleanRecipeId | "auto"; label: string; icon: string; hint: string };
const RECIPES: RecipeBtn[] = [
  { id: "auto",        label: "Auto-Mix",   icon: "🤖", hint: "Engine wählt nach BPM/Key" },
  { id: "djEqSwap",    label: "Bass Swap",  icon: "🔊", hint: "Bässe tauschen am Downbeat" },
  { id: "filterBuild", label: "Filter Fade",icon: "🎛", hint: "A schließt LP, B öffnet HP" },
  { id: "echoOut",     label: "Echo Out",   icon: "🌀", hint: "A in Delay-Tail, B clean rein" },
  { id: "dropCut",     label: "Drop Cut",   icon: "✂️", hint: "Kurzer Build, harter Cut" },
];

export function CockpitCenter() {
  const aTrack = useTwinDeck((s) => s.A.track);
  const bTrack = useTwinDeck((s) => s.B.track);
  const aPlaying = useTwinDeck((s) => s.A.isPlaying);
  const bPlaying = useTwinDeck((s) => s.B.isPlaying);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const transitionInFlight = useTwinDeck((s) => s.transitionInFlight);
  const runCleanRecipe = useTwinDeck((s) => s.runCleanRecipe);
  const smartMix = useTwinDeck((s) => s.smartMix);
  const loadDeck = useTwinDeck((s) => s.loadDeck);

  const live: DeckSide = useMemo(() => {
    const aLoud = (1 - crossfader) * (aPlaying ? 1 : 0);
    const bLoud = crossfader * (bPlaying ? 1 : 0);
    if (aLoud === 0 && bLoud === 0) return aTrack ? "A" : "B";
    return bLoud > aLoud ? "B" : "A";
  }, [aPlaying, bPlaying, crossfader, aTrack]);
  const other: DeckSide = live === "A" ? "B" : "A";
  const liveTrack = live === "A" ? aTrack : bTrack;
  const nextTrack = live === "A" ? bTrack : aTrack;

  const [bars, setBars] = useState(16);

  const hd = harmonicDist(liveTrack?.camelot, nextTrack?.camelot);
  const ringColor = hd <= 1 ? "var(--neon-lime)" : hd <= 2 ? "var(--neon-amber)" : "#f87171";
  const ringPct = Math.max(0.06, 1 - Math.min(1, hd / 4));

  const bpmDelta = liveTrack?.bpm && nextTrack?.bpm
    ? bpmFoldDelta(liveTrack.bpm, nextTrack.bpm)
    : null;
  const bpmPct = liveTrack?.bpm && bpmDelta != null ? (bpmDelta / liveTrack.bpm) * 100 : null;
  const bridge = needsBridge(liveTrack, nextTrack);

  async function run(id: CleanRecipeId | "auto") {
    if (!liveTrack || !nextTrack) { toast.error("Beide Decks brauchen einen Track"); return; }
    if (transitionInFlight) { toast("Übergang läuft bereits"); return; }
    if (id === "auto") {
      pushLog(`🤖 Auto-Mix: ${live} → ${other} (${bars} Takte)`, "act");
      const res = await smartMix(live, other);
      if (res) pushLog(`✅ Recipe gewählt: ${res.recipe} (${res.engine})`, "ok");
      return;
    }
    pushLog(`🎚 ${id}: ${live} → ${other} (${bars} Takte)`, "act");
    await runCleanRecipe(live, other, id, { bars });
    pushLog(`✅ ${nextTrack.title} LIVE`, "ok");
  }

  async function dropBridge() {
    if (!liveTrack?.bpm) { toast.error("Live-Deck hat keine BPM"); return; }
    try {
      const { url, durationSec } = makeBridgeBeatBlobUrl(Math.round(liveTrack.bpm), 4);
      const track: EngineTrack = {
        id: `bridge-${Date.now()}`,
        title: `Bridge ${Math.round(liveTrack.bpm)} BPM`,
        artist: "PartyPilot",
        url,
        bpm: liveTrack.bpm,
        camelot: liveTrack.camelot ?? null,
        musicalKey: liveTrack.musicalKey ?? null,
        durationSec,
        beatGrid: Array.from({ length: 32 }, (_, i) => i * (60 / liveTrack.bpm!)),
        cues: { introEnd: 0, firstDrop: 0, outroStart: durationSec },
        vocalMap: [],
        energy: 0.5,
      };
      await loadDeck(other, track);
      pushLog(`🥁 Bridge-Beat (${Math.round(liveTrack.bpm)} BPM) auf Deck ${other}`, "ok");
      toast.success(`Bridge auf Deck ${other} — jetzt mixen`);
    } catch (err) {
      console.error(err);
      toast.error("Bridge konnte nicht erzeugt werden");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-card/40 p-4">
      {/* Harmony Ring */}
      <div className="flex flex-col items-center">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
            <circle cx="65" cy="65" r="57" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle
              cx="65" cy="65" r="57" fill="none"
              stroke={ringColor} strokeWidth="6"
              strokeDasharray={`${ringPct * 358} 358`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray .4s, stroke .4s" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            {liveTrack && nextTrack ? (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stage-foreground/50">Harmony</div>
                <div className="font-mono text-sm font-bold text-stage-foreground">
                  {liveTrack.camelot ?? "?"} → {nextTrack.camelot ?? "?"}
                </div>
                <div className="text-[10px]" style={{ color: ringColor }}>
                  {hd === 0 ? "perfekt" : hd <= 1 ? "passt" : hd <= 2 ? "okay" : "clash"}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-stage-foreground/50">Beide Decks laden</div>
            )}
          </div>
        </div>
        {bpmDelta != null && (
          <div className={cn(
            "mt-2 text-center font-mono text-[11px]",
            bridge ? "text-red-300" : "text-stage-foreground/70",
          )}>
            {Math.round(liveTrack!.bpm!)} → {Math.round(nextTrack!.bpm!)} BPM
            {bpmPct != null && <span className="ml-2 text-stage-foreground/50">({bpmPct >= 0 ? "+" : ""}{bpmPct.toFixed(1)}%)</span>}
            {bridge && <div className="text-[10px]">⚠ Tempo zu groß — Bridge nutzen</div>}
          </div>
        )}
      </div>

      {/* Bars slider */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-stage-foreground/60">Länge</span>
        <input
          type="range" min={4} max={32} step={4} value={bars}
          onChange={(e) => setBars(parseInt(e.target.value))}
          className="flex-1 accent-[var(--neon-cyan)]"
        />
        <span className="font-mono text-[11px] text-stage-foreground">{bars} Takte</span>
      </div>

      {/* Recipe buttons */}
      <div className="grid grid-cols-2 gap-2">
        {RECIPES.map((r) => (
          <button
            key={r.id}
            onClick={() => run(r.id)}
            disabled={transitionInFlight || !liveTrack || !nextTrack}
            className={cn(
              "rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-left transition-all hover:bg-white/10 disabled:opacity-40",
              r.id === "auto" && "col-span-2 border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_15%,transparent)]",
            )}
            title={r.hint}
          >
            <div className="text-xs font-bold text-stage-foreground">{r.icon} {r.label}</div>
            <div className="truncate text-[10px] text-stage-foreground/60">{r.hint}</div>
          </button>
        ))}
      </div>

      {/* Bridge beat */}
      <button
        onClick={dropBridge}
        disabled={!liveTrack?.bpm}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-left transition-all disabled:opacity-40",
          bridge
            ? "border-red-400 bg-red-500/10 hover:bg-red-500/20 text-red-100"
            : "border-white/10 bg-white/5 hover:bg-white/10 text-stage-foreground",
        )}
      >
        <div className="text-xs font-bold">🥁 Bridge-Beat erzeugen</div>
        <div className="text-[10px] text-stage-foreground/60">
          {liveTrack?.bpm
            ? `Neutraler 4-Takt-Beat @ ${Math.round(liveTrack.bpm)} BPM → Deck ${other}`
            : "Lade einen Track ins Live-Deck"}
        </div>
      </button>
    </div>
  );
}