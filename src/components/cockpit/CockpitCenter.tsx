import { useMemo, useState } from "react";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { harmonicDist, bpmFoldDelta, needsBridge } from "@/lib/dj/mixability";
import { pushLog } from "@/lib/dj/copilotLog";
import { makeBridgeBeatBlobUrl } from "@/lib/audio/bridgeBeat";
import type { EngineTrack } from "@/lib/audio/engine";
import type { CleanRecipeId } from "@/lib/audio/cleanDjTransitions";
import { CHOREOGRAPHIES, renderDirectorPreview, planDirector } from "@/lib/dj/director";
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
  const runVirtuoso = useTwinDeck((s) => s.runVirtuoso);

  const [virtuoso, setVirtuoso] = useState(true);
  const [creativity, setCreativity] = useState(0.7);
  const [choreoId, setChoreoId] = useState<string>("auto");
  const [previewBusy, setPreviewBusy] = useState(false);

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

  async function virtuosoMix() {
    if (!liveTrack || !nextTrack) { toast.error("Beide Decks brauchen einen Track"); return; }
    if (transitionInFlight) { toast("Übergang läuft bereits"); return; }
    await runVirtuoso(live, other, {
      creativity,
      bars,
      choreographyId: choreoId === "auto" ? undefined : choreoId,
    });
  }

  async function previewDirector() {
    if (!liveTrack || !nextTrack) { toast.error("Beide Decks brauchen einen Track"); return; }
    setPreviewBusy(true);
    try {
      const plan = await planDirector(liveTrack, nextTrack, {
        creativity,
        bars: Math.min(8, bars),
        choreographyId: choreoId === "auto" ? undefined : choreoId,
      });
      const pv = await renderDirectorPreview(plan);
      if (!pv) { toast("Nichts zum Vorhören"); return; }
      const a = new Audio(pv.url);
      a.play().catch(() => {/* needs gesture but we are in a click handler */});
      toast.success(`Preview ${pv.durationSec.toFixed(1)}s — ${plan.choreography.name}`);
    } catch (e) {
      console.error(e);
      toast.error("Director-Preview fehlgeschlagen");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Harmony Ring */}
      <div className="sb-card-2 flex flex-col items-center p-4">
        <div className="relative h-32 w-32">
          <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
            <circle cx="65" cy="65" r="57" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
            <circle
              cx="65" cy="65" r="57" fill="none"
              stroke={ringColor} strokeWidth="7"
              strokeDasharray={`${ringPct * 358} 358`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray .4s, stroke .4s" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            {liveTrack && nextTrack ? (
              <div>
                <div className="sb-eyebrow text-[9px]">Harmony</div>
                <div className="font-mono text-base font-bold" style={{ color: "var(--sb-ink)" }}>
                  {liveTrack.camelot ?? "?"} → {nextTrack.camelot ?? "?"}
                </div>
                <div className="text-[11px] font-semibold" style={{ color: ringColor }}>
                  {hd === 0 ? "perfekt" : hd <= 1 ? "passt" : hd <= 2 ? "okay" : "clash"}
                </div>
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: "var(--sb-ink-dim)" }}>Beide Decks laden</div>
            )}
          </div>
        </div>
        {bpmDelta != null && (
          <div className="mt-3 text-center font-mono text-[12px]"
               style={{ color: bridge ? "#ff9aa8" : "var(--sb-ink-dim)" }}>
            {Math.round(liveTrack!.bpm!)} → {Math.round(nextTrack!.bpm!)} BPM
            {bpmPct != null && <span className="ml-2" style={{ color: "var(--sb-ink-mute)" }}>({bpmPct >= 0 ? "+" : ""}{bpmPct.toFixed(1)}%)</span>}
            {bridge && <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#ff9aa8" }}>⚠ Tempo zu groß — Bridge nutzen</div>}
          </div>
        )}
      </div>

      {/* Bars slider */}
      <div className="sb-card-2 flex items-center gap-3 p-3">
        <span className="sb-eyebrow text-[10px]">Länge</span>
        <input
          type="range" min={4} max={32} step={4} value={bars}
          onChange={(e) => setBars(parseInt(e.target.value))}
          className="flex-1 accent-[var(--sb-primary)]"
        />
        <span className="font-mono text-sm font-bold" style={{ color: "var(--sb-ink)" }}>{bars} Takte</span>
      </div>

      {/* Recipe buttons */}
      <div className="grid grid-cols-2 gap-2">
        {RECIPES.map((r) => (
          <button
            key={r.id}
            onClick={() => run(r.id)}
            disabled={transitionInFlight || !liveTrack || !nextTrack}
            className={cn(
              "sb-btn h-auto justify-start py-2.5 px-3 text-left",
              r.id === "auto" && "sb-btn-primary col-span-2",
            )}
            title={r.hint}
          >
            <div className="flex flex-col items-start gap-0.5">
              <div className="text-[12px] font-bold tracking-wider">{r.icon} {r.label}</div>
              <div className="truncate text-[10px] font-normal normal-case tracking-normal opacity-80">{r.hint}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Bridge beat */}
      <button
        onClick={dropBridge}
        disabled={!liveTrack?.bpm}
        className={cn(
          "sb-btn h-auto w-full justify-start py-2.5 px-3 text-left",
          bridge && "sb-btn-live",
        )}
      >
        <div className="flex flex-col items-start gap-0.5">
          <div className="text-[12px] font-bold tracking-wider">🥁 Bridge-Beat erzeugen</div>
          <div className="text-[10px] font-normal normal-case tracking-normal opacity-80">
            {liveTrack?.bpm
              ? `Neutraler 4-Takt-Beat @ ${Math.round(liveTrack.bpm)} BPM → Deck ${other}`
              : "Lade einen Track ins Live-Deck"}
          </div>
        </div>
      </button>

      {/* Director — virtuose Übergänge */}
      <div className="sb-card-live space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-wide" style={{ color: "var(--sb-ink)" }}>🎬 Director — virtuose Übergänge</div>
            <div className="text-[11px]" style={{ color: "var(--sb-ink-dim)" }}>Teaser + generierte Drums/Bass/Pluck in Live-Key & BPM</div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest"
                 style={{ color: "var(--sb-ink)" }}>
            <input type="checkbox" checked={virtuoso} onChange={(e) => setVirtuoso(e.target.checked)} className="h-4 w-4 accent-[var(--sb-magenta)]" />
            an
          </label>
        </div>

        {virtuoso && (
          <>
            <div className="flex items-center gap-3">
              <span className="sb-eyebrow text-[10px]">Kreativität</span>
              <input
                type="range" min={0} max={1} step={0.05} value={creativity}
                onChange={(e) => setCreativity(parseFloat(e.target.value))}
                className="flex-1 accent-[var(--sb-magenta)]"
              />
              <span className="font-mono text-sm font-bold" style={{ color: "var(--sb-ink)" }}>{Math.round(creativity * 100)}%</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="sb-eyebrow text-[10px]">Choreo</span>
              <select
                value={choreoId}
                onChange={(e) => setChoreoId(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  background: "var(--sb-surface-3)",
                  borderColor: "var(--sb-border-strong)",
                  color: "var(--sb-ink)",
                }}
              >
                <option value="auto">🎲 Auto (würfelt)</option>
                {CHOREOGRAPHIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={virtuosoMix}
                disabled={transitionInFlight || !liveTrack || !nextTrack}
                className="sb-btn sb-btn-live"
              >
                🎬 Virtuoso-Mix starten
              </button>
              <button
                onClick={previewDirector}
                disabled={previewBusy || !liveTrack || !nextTrack}
                className="sb-btn sb-btn-ghost"
              >
                {previewBusy ? "Rendere…" : "🎧 Vorhören"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}