import { useEffect, useState } from "react";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { RECIPES, type RecipeId } from "@/lib/audio/transitionRecipes";
import type { StemId } from "@/lib/audio/stemSplit";
import { cn } from "@/lib/utils";
import { Drum, Music2, Mic2, Piano, Sparkles, Wand2, Loader2 } from "lucide-react";
import { useTrackStems } from "@/hooks/useTrackStems";
import { toast } from "sonner";

type IconCmp = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
const STEM_META: Record<StemId, { label: string; color: string; icon: IconCmp }> = {
  drums:  { label: "Drums",  color: "var(--neon-magenta)", icon: Drum },
  bass:   { label: "Bass",   color: "var(--neon-cyan)",    icon: Music2 },
  vocals: { label: "Vocals", color: "var(--neon-amber)",   icon: Mic2 },
  other:  { label: "Melody", color: "var(--neon-lime)",    icon: Piano },
};

function DeckStemColumn({ side, deckTitle }: { side: DeckSide; deckTitle: string }) {
  const setStem = useTwinDeck((s) => s.setStem);
  const resetStems = useTwinDeck((s) => s.resetStems);
  const getStemGains = useTwinDeck((s) => s.getStemGains);
  const stemsMode = useTwinDeck((s) => s[side].stemsMode);
  const trackId = useTwinDeck((s) => s[side].track?.id ?? null);
  const attachRealStems = useTwinDeck((s) => s.attachRealStems);
  const detachRealStems = useTwinDeck((s) => s.detachRealStems);
  const { data: stems, generate } = useTrackStems(trackId);

  // Auto-attach real stems when they become ready and we're not already on them.
  useEffect(() => {
    if (!stems || stems.status !== "ready") return;
    if (stemsMode === "real" || stemsMode === "loading") return;
    const urls = stems.urls;
    if (!urls.drums || !urls.bass || !urls.vocals || !urls.other) return;
    void attachRealStems(side, {
      drums: urls.drums, bass: urls.bass, vocals: urls.vocals, other: urls.other,
    });
  }, [stems, stemsMode, side, attachRealStems]);

  const [vals, setVals] = useState<Record<StemId, number>>({ drums: 1, bass: 1, vocals: 1, other: 1 });

  // Poll the actual gain values so recipe-driven changes show up in the UI.
  useEffect(() => {
    const id = window.setInterval(() => setVals(getStemGains(side)), 80);
    return () => clearInterval(id);
  }, [side, getStemGains]);

  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-black/40 p-2">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] uppercase tracking-widest text-stage-foreground/70 truncate">
          Deck {side} <span className="text-stage-foreground/40">· {deckTitle}</span>
        </span>
        <div className="flex items-center gap-1">
          <StemStatusBadge
            status={stems?.status ?? "pending"}
            mode={stemsMode}
            progress={stems?.progress ?? 0}
          />
          {trackId && (stems?.status === "ready" ? (
            <button
              onClick={() => stemsMode === "real" ? detachRealStems(side) : void attachRealStems(side, {
                drums: stems.urls.drums!, bass: stems.urls.bass!,
                vocals: stems.urls.vocals!, other: stems.urls.other!,
              })}
              className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-stage-foreground/70 hover:text-stage-foreground"
              title={stemsMode === "real" ? "Auf Pseudo-Stems zurück" : "Echte Stems aktivieren"}
            >
              {stemsMode === "real" ? "Pseudo" : "Real"}
            </button>
          ) : (
            <button
              onClick={() => {
                generate.mutate(undefined, {
                  onError: (e) => toast.error(`Stems: ${(e as Error).message}`),
                  onSuccess: () => toast("Stem-Separation gestartet — dauert ~60–120 s"),
                });
              }}
              disabled={generate.isPending || stems?.status === "processing"}
              className="flex items-center gap-1 rounded border border-[var(--neon-amber)]/60 bg-[var(--neon-amber)]/10 px-1.5 py-0.5 text-[9px] text-[var(--neon-amber)] hover:bg-[var(--neon-amber)]/20 disabled:opacity-50"
              title="Echte Demucs-Stems per HuggingFace Space generieren"
            >
              {generate.isPending || stems?.status === "processing"
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Wand2 className="h-2.5 w-2.5" />}
              Stems
            </button>
          ))}
          <button
            onClick={() => resetStems(side)}
            className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-stage-foreground/60 hover:text-stage-foreground"
          >
            Reset
          </button>
        </div>
      </div>
      {stems?.status === "failed" && stems.error && (
        <p className="mb-1 text-[9px] text-red-400 truncate" title={stems.error}>⚠ {stems.error}</p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(STEM_META) as StemId[]).map((stem) => {
          const meta = STEM_META[stem];
          const Icon = meta.icon;
          const v = vals[stem];
          return (
            <div key={stem} className="flex flex-col items-center gap-1">
              <Icon className="h-3 w-3" style={{ color: meta.color }} />
              <input
                type="range"
                min={0} max={1.5} step={0.01}
                value={v}
                onChange={(e) => {
                  const nv = parseFloat(e.target.value);
                  setStem(side, stem, nv, 0.03);
                  setVals((prev) => ({ ...prev, [stem]: nv }));
                }}
                className="h-20 w-2 cursor-pointer appearance-none rounded-full bg-white/10"
                style={{
                  writingMode: "vertical-lr" as never,
                  WebkitAppearance: "slider-vertical" as never,
                  accentColor: meta.color,
                }}
              />
              <span className="text-[9px] text-stage-foreground/60">{meta.label}</span>
              <span className="font-mono text-[8px] text-stage-foreground/40">{Math.round(v * 100)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StemMixer() {
  const A = useTwinDeck((s) => s.A);
  const B = useTwinDeck((s) => s.B);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const runStemRecipe = useTwinDeck((s) => s.runStemRecipe);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const [recipe, setRecipe] = useState<RecipeId | "auto">("auto");

  const fromSide: DeckSide = crossfader < 0.5 ? "A" : "B";
  const toSide: DeckSide = fromSide === "A" ? "B" : "A";

  async function fire() {
    await runStemRecipe(fromSide, toSide, recipe === "auto" ? undefined : recipe);
  }

  return (
    <div className="neon-surface rounded-2xl p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--neon-amber)]" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/70">
            Stem Mixer & Transition Recipes
          </span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={recipe}
            onChange={(e) => setRecipe(e.target.value as RecipeId | "auto")}
            className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-stage-foreground"
            title={recipe !== "auto" ? RECIPES.find((r) => r.id === recipe)?.hint : "Engine pickt das beste Rezept anhand BPM/Key/Vocals"}
          >
            <option value="auto">Auto (smart pick)</option>
            {RECIPES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={fire}
            disabled={inFlight || !A.track || !B.track}
            className={cn(
              "rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest",
              inFlight
                ? "border-white/10 text-stage-foreground/40"
                : "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)] hover:bg-[var(--neon-amber)]/25",
            )}
          >
            {inFlight ? "läuft…" : `Mix ${fromSide} → ${toSide}`}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <DeckStemColumn side="A" deckTitle={A.track?.title ?? "—"} />
        <DeckStemColumn side="B" deckTitle={B.track?.title ?? "—"} />
      </div>

      <p className="text-[9px] text-stage-foreground/50">
        Hinweis: Stems werden in Echtzeit aus dem Spektrum gerechnet (Drums = Transients,
        Bass &lt;220 Hz, Vocals = Mid-Presence, Melody = restliche Mitten). Echte Source-Separation per Demucs kommt in Phase 2.
      </p>
    </div>
  );
}