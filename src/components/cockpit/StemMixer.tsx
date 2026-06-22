import { useEffect, useState } from "react";
import { useTwinDeck, type DeckSide } from "@/lib/audio/twinDeckBus";
import { RECIPES } from "@/lib/audio/transitionRecipes";
import type { StemId } from "@/lib/audio/stemSplit";
import { cn } from "@/lib/utils";
import { Drum, Music2, Mic2, Piano, Sparkles, Wand2, Loader2, AlertTriangle, Zap, Lock } from "lucide-react";
import { useTrackStems } from "@/hooks/useTrackStems";
import { toast } from "sonner";

const PHASES = ["cue", "tease", "layer", "strip", "switch", "reveal"] as const;
const PHASE_LABELS: Record<string, string> = {
  cue: "Cue", tease: "Tease", layer: "Layer",
  strip: "Strip", switch: "Switch", reveal: "Reveal", done: "Done",
};

type IconCmp = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
const STEM_META: Record<StemId, { label: string; color: string; icon: IconCmp }> = {
  drums:  { label: "Drums",  color: "var(--neon-magenta)", icon: Drum },
  bass:   { label: "Bass",   color: "var(--neon-cyan)",    icon: Music2 },
  vocals: { label: "Vocals", color: "var(--neon-amber)",   icon: Mic2 },
  other:  { label: "Melody", color: "var(--neon-lime)",    icon: Piano },
};

function StemStatusBadge({ status, mode, progress }: { status: string; mode: "pseudo"|"loading"|"real"; progress: number }) {
  let color = "bg-amber-400/20 text-amber-300 border-amber-400/40";
  let label = "Pseudo";
  if (mode === "real") { color = "bg-emerald-400/20 text-emerald-300 border-emerald-400/40"; label = "Real ✓"; }
  else if (mode === "loading") { color = "bg-cyan-400/20 text-cyan-300 border-cyan-400/40"; label = "Lade…"; }
  else if (status === "processing" || status === "pending") {
    color = "bg-cyan-400/20 text-cyan-300 border-cyan-400/40 animate-pulse";
    label = `Sep ${progress}%`;
  } else if (status === "failed") {
    color = "bg-red-500/20 text-red-300 border-red-500/40"; label = "Fehler";
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-widest ${color}`}>{label}</span>
  );
}

function DeckStemColumn({ side, deckTitle }: { side: DeckSide; deckTitle: string }) {
  const setStem = useTwinDeck((s) => s.setStem);
  const resetStems = useTwinDeck((s) => s.resetStems);
  const getStemGains = useTwinDeck((s) => s.getStemGains);
  const getStemLevels = useTwinDeck((s) => s.getStemLevels);
  const stemsMode = useTwinDeck((s) => s[side].stemsMode);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const trackId = useTwinDeck((s) => s[side].track?.id ?? null);
  const attachRealStems = useTwinDeck((s) => s.attachRealStems);
  const detachRealStems = useTwinDeck((s) => s.detachRealStems);
  const { data: stems, generate } = useTrackStems(trackId);

  // Sliders only do real work when actual separated buffers are loaded.
  // In pseudo mode they would just colour the original signal through fake
  // band-pass filters and make the song unrecognisable — so we hard-lock
  // them and tell the user to generate real stems first.
  const slidersLocked = stemsMode !== "real" || inFlight;

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
  const [levels, setLevels] = useState<Record<StemId, number>>({ drums: 0, bass: 0, vocals: 0, other: 0 });

  // Poll the actual gain values so recipe-driven changes show up in the UI.
  useEffect(() => {
    const id = window.setInterval(() => {
      setVals(getStemGains(side));
      setLevels(getStemLevels(side));
    }, 60);
    return () => clearInterval(id);
  }, [side, getStemGains, getStemLevels]);

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
      <div className={cn("grid grid-cols-4 gap-2 relative", slidersLocked && "opacity-90")}>
        {slidersLocked && stemsMode !== "real" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/55 backdrop-blur-[2px]">
            <span className="flex items-center gap-1 rounded border border-white/10 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-widest text-stage-foreground/80">
              <Lock className="h-2.5 w-2.5" /> Clean DJ Mode · Echte Stems generieren für Slider
            </span>
          </div>
        )}
        {(Object.keys(STEM_META) as StemId[]).map((stem) => {
          const meta = STEM_META[stem];
          const Icon = meta.icon;
          const v = vals[stem];
          const lvl = levels[stem];
          return (
            <div key={stem} className="flex flex-col items-center gap-1">
              <Icon className="h-3 w-3" style={{ color: meta.color }} />
              <div className="relative flex h-20 items-end gap-1">
                {/* VU meter */}
                <div className="relative h-full w-3 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-full transition-[height] duration-75"
                    style={{ height: `${Math.round(lvl * 100)}%`, background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
                  />
                </div>
                {/* Slider */}
                <input
                  type="range"
                  min={0} max={1.5} step={0.01}
                  value={v}
                  disabled={slidersLocked}
                  onChange={(e) => {
                    const nv = parseFloat(e.target.value);
                    setStem(side, stem, nv, 0.03);
                    setVals((prev) => ({ ...prev, [stem]: nv }));
                  }}
                  className="h-20 w-3 cursor-pointer appearance-none rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    writingMode: "vertical-lr" as never,
                    WebkitAppearance: "slider-vertical" as never,
                    accentColor: meta.color,
                  }}
                />
              </div>
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
  const smartMix = useTwinDeck((s) => s.smartMix);
  const getTransitionQuality = useTwinDeck((s) => s.getTransitionQuality);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const phase = useTwinDeck((s) => s.transitionPhase);
  const engine = useTwinDeck((s) => s.transitionEngine);

  const fromSide: DeckSide = crossfader < 0.5 ? "A" : "B";
  const toSide: DeckSide = fromSide === "A" ? "B" : "A";

  // Re-score whenever a deck/pitch/mode changes.
  const [quality, setQuality] = useState(() => getTransitionQuality(fromSide, toSide));
  useEffect(() => {
    const id = window.setInterval(() => setQuality(getTransitionQuality(fromSide, toSide)), 400);
    return () => clearInterval(id);
  }, [fromSide, toSide, getTransitionQuality]);

  async function fireSmart() {
    if (!A.track || !B.track) {
      toast.error("Beide Decks brauchen einen Track.");
      return;
    }
    const used = await smartMix(fromSide, toSide);
    if (used) {
      const engineLabel = used.engine === "real" ? "Real Stem Performance" : "Clean DJ Transition";
      toast.success(`Smart Mix · ${engineLabel} · ${used.recipe}`);
    }
  }

  const modePill = quality.mode === "real"
    ? { label: "Real Stems", color: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40" }
    : quality.mode === "hybrid"
      ? { label: "Hybrid", color: "bg-cyan-400/15 text-cyan-300 border-cyan-400/40" }
      : { label: "Pseudo Mode", color: "bg-amber-400/15 text-amber-300 border-amber-400/40" };

  const scoreColor = quality.score >= 75 ? "text-emerald-300"
    : quality.score >= 50 ? "text-amber-300"
    : "text-red-300";

  return (
    <div className="neon-surface rounded-2xl p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--neon-amber)]" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/70">
            Moises-Style Stem Mixer
          </span>
          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest", modePill.color)}>
            {modePill.label}
          </span>
          {inFlight && (
            <span className="rounded border border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[var(--neon-cyan)] animate-pulse">
              {engine === "real" ? "Real" : "Clean"} · {phase ?? "…"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fireSmart}
            disabled={inFlight || !A.track || !B.track}
            className={cn(
              "flex items-center gap-1 rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest",
              inFlight
                ? "border-white/10 text-stage-foreground/40"
                : "border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/30",
            )}
            title="Wählt das beste Rezept anhand BPM, Key, Vocals & Energie und fährt es beat-synchron"
          >
            <Zap className="h-3.5 w-3.5" />
            {inFlight ? `läuft · ${phase ?? "…"}` : `Smart Mix ${fromSide} → ${toSide}`}
          </button>
        </div>
      </div>

      {/* Phase timeline — visible during a transition so the performer sees
          which stage the choreography is in. */}
      {inFlight && (
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5">
          {PHASES.map((p, i) => {
            const activeIdx = PHASES.indexOf((phase ?? "cue") as typeof PHASES[number]);
            const isActive = i === activeIdx;
            const isDone = activeIdx > i || phase === "done";
            return (
              <div key={p} className="flex flex-1 items-center gap-1">
                <div className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  isActive ? "bg-[var(--neon-cyan)] animate-pulse"
                  : isDone ? "bg-[var(--neon-cyan)]/40"
                  : "bg-white/10",
                )} />
                <span className={cn(
                  "text-[8px] uppercase tracking-widest",
                  isActive ? "text-[var(--neon-cyan)]"
                  : isDone ? "text-stage-foreground/50"
                  : "text-stage-foreground/30",
                )}>{PHASE_LABELS[p]}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Quality + warnings */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest text-stage-foreground/60">Mix-Score</span>
            <span className={cn("font-mono text-base font-bold", scoreColor)}>{quality.score}</span>
            <span className="text-[9px] text-stage-foreground/40">/ 100</span>
          </div>
          <span className="text-[9px] text-stage-foreground/60">
            Empfehlung: <span className="text-[var(--neon-amber)]">{RECIPES.find((r) => r.id === quality.recommendedRecipe)?.label}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-stage-foreground/60">
          <span className="rounded bg-white/5 px-1.5 py-0.5">
            Länge: <span className="font-mono text-stage-foreground">{quality.bars} bars</span>
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5">
            Teaser: <span className="font-mono text-stage-foreground capitalize">{quality.teaserStem}</span>
          </span>
          <span className={cn(
            "rounded px-1.5 py-0.5 font-mono uppercase",
            quality.aggression === "emergency" ? "bg-red-500/15 text-red-300"
            : quality.aggression === "performance" ? "bg-[var(--neon-amber)]/15 text-[var(--neon-amber)]"
            : "bg-emerald-500/15 text-emerald-300",
          )}>
            {quality.aggression}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-[9px] text-stage-foreground/70">
          <SubScore label="BPM" v={quality.bpmScore} />
          <SubScore label="Key" v={quality.keyScore} />
          <SubScore label="Energie" v={quality.energyScore} />
          <SubScore label="Vox-Clear" v={quality.vocalConflict} />
        </div>
        {quality.warnings.length > 0 && (
          <div className="space-y-1">
            {quality.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-1 text-[9px] text-red-300">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" /> {w}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <DeckStemColumn side="A" deckTitle={A.track?.title ?? "—"} />
        <DeckStemColumn side="B" deckTitle={B.track?.title ?? "—"} />
      </div>

      <p className="text-[9px] text-stage-foreground/50">
        Ohne echte Stems läuft eine <b className="text-stage-foreground/80">Clean DJ Transition</b>:
        bar-genaue EQ-/Filter-Moves auf dem Originalsignal — Bass-Swap, Filter Build,
        Hook Tease, Drum-Top Blend, Drop Cut oder Echo Out. Das Originallied bleibt
        klar erkennbar. Sobald für <b>beide</b> Decks echte Demucs-Stems geladen sind,
        wechselt Smart Mix automatisch auf die <b className="text-stage-foreground/80">Real Stem Performance</b>:
        Vocals, Drums, Bass und Melody werden unabhängig choreografiert (Teaser →
        Layer → Strip → Downbeat Switch → Reveal).
      </p>
    </div>
  );
}

function SubScore({ label, v }: { label: string; v: number }) {
  const c = v >= 75 ? "text-emerald-300" : v >= 50 ? "text-amber-300" : "text-red-300";
  return (
    <div className="flex items-center justify-between rounded bg-white/5 px-1.5 py-0.5">
      <span className="text-stage-foreground/60">{label}</span>
      <span className={cn("font-mono font-bold", c)}>{v}</span>
    </div>
  );
}