import { useEffect, useState } from "react";
import type { EngineTrack } from "@/lib/audio/engine";
import { useTwinDeck, compatHint, type DeckSide } from "@/lib/audio/twinDeckBus";
import { Turntable } from "./Turntable";
import { DeckLiveHud } from "./DeckLiveHud";
import { NextMoveCard } from "./NextMoveCard";
import { MixScoreDial } from "./MixScoreDial";
import { SkillBadge } from "./SkillBadge";
import { DeckSpectrum } from "./DeckSpectrum";
import { NeonButton } from "@/components/ui/NeonButton";
import { Led } from "@/components/ui/LedIndicator";
import { RotaryKnob } from "@/components/ui/RotaryKnob";
import { Play, Pause, RotateCw, Headphones, Zap, Wand2, ArrowLeftRight, RefreshCw, Timer, Shuffle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { tracks: EngineTrack[] };

function fmt(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function TwinDeck({ tracks }: Props) {
  const A = useTwinDeck((s) => s.A);
  const B = useTwinDeck((s) => s.B);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const phase = useTwinDeck((s) => s.transitionPhase);
  const engine = useTwinDeck((s) => s.transitionEngine);
  const lastNote = useTwinDeck((s) => s.lastTransitionNote);
  const autoTimerOn = useTwinDeck((s) => s.autoTimerOn);
  const autoTimerSec = useTwinDeck((s) => s.autoTimerSec);
  const autoTimerCountdown = useTwinDeck((s) => s.autoTimerCountdown);
  const autoShuffle = useTwinDeck((s) => s.autoShuffle);

  const init = useTwinDeck((s) => s.init);
  const setCrossfader = useTwinDeck((s) => s.setCrossfader);
  const setVolume = useTwinDeck((s) => s.setVolume);
  const loadDeck = useTwinDeck((s) => s.loadDeck);
  const toggle = useTwinDeck((s) => s.toggle);
  const scrub = useTwinDeck((s) => s.scrub);
  const sync = useTwinDeck((s) => s.sync);
  const smartMix = useTwinDeck((s) => s.smartMix);
  const ensureAnalysis = useTwinDeck((s) => s.ensureAnalysis);
  const setPool = useTwinDeck((s) => s.setPool);
  const setAutoTimerSec = useTwinDeck((s) => s.setAutoTimerSec);
  const setAutoTimerOn = useTwinDeck((s) => s.setAutoTimerOn);
  const setAutoShuffle = useTwinDeck((s) => s.setAutoShuffle);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { setPool(tracks); }, [tracks, setPool]);

  const compat = compatHint(A.track, B.track);

  return (
    <>
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="flex-1"><NextMoveCard /></div>
      <div className="sm:w-[260px]"><MixScoreDial /></div>
      <div className="flex items-center sm:items-stretch"><SkillBadge /></div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1fr_280px_1fr]">
      <DeckColumn
        side="A" color="cyan"
        deck={A}
        onToggle={() => toggle("A")}
        onScrub={(d) => scrub("A", d)}
        onVolume={(v) => setVolume("A", v)}
        tracks={tracks}
        onLoadTrack={(t) => loadDeck("A", t)}
        onReanalyze={() => ensureAnalysis("A", { force: true })}
      />

      <div className="neon-surface rounded-2xl p-3 sm:p-4 flex flex-col gap-3 order-first lg:order-none">
        <div className="text-center text-[10px] uppercase tracking-[0.2em] text-stage-foreground/60">Mixer</div>

        {/* Animated transition viz */}
        <div className="relative h-6 w-full rounded-full overflow-hidden bg-black/40 border border-white/10">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--neon-cyan)] via-transparent to-transparent transition-all duration-300"
            style={{ width: `${(1 - crossfader) * 100}%`, opacity: 0.4 }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-gradient-to-l from-[var(--neon-magenta)] via-transparent to-transparent transition-all duration-300"
            style={{ width: `${crossfader * 100}%`, opacity: 0.4 }}
          />
          {inFlight && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          )}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_white] transition-all duration-150"
            style={{ left: `${crossfader * 100}%`, transform: "translateX(-50%)" }}
          />
        </div>

        <div className="flex items-center justify-around">
          <RotaryKnob value={A.volume} onChange={(v) => setVolume("A", v)} label="Vol A" color="cyan" size={44} />
          <RotaryKnob value={B.volume} onChange={(v) => setVolume("B", v)} label="Vol B" color="magenta" size={44} />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[9px] uppercase tracking-widest text-stage-foreground/60">
            <span>A</span><span>Crossfader</span><span>B</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.001}
            value={crossfader} onChange={(e) => setCrossfader(parseFloat(e.target.value))}
            onDoubleClick={() => setCrossfader(0.5)}
            className="w-full h-2 accent-[var(--neon-cyan)]"
          />
        </div>

        {/* Manual transition trigger — single A↔B move between the loaded decks */}
        <div className="rounded-md border border-[var(--neon-amber)]/30 bg-black/30 p-2 space-y-1">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-stage-foreground/70">
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-[var(--neon-amber)]" /> Übergang</span>
            {inFlight && (
              <span className="rounded bg-[var(--neon-cyan)]/15 px-1.5 py-0.5 text-[var(--neon-cyan)] animate-pulse">
                {engine === "real" ? "Real" : "Clean"} · {phase ?? "…"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NeonButton onClick={() => { void smartMix("A", "B"); }}
              variant="active" size="sm"
              disabled={!A.track || !B.track || inFlight}>
              <Wand2 className="h-3 w-3" /> A → B
            </NeonButton>
            <NeonButton onClick={() => { void smartMix("B", "A"); }}
              variant="danger" size="sm"
              disabled={!A.track || !B.track || inFlight}>
              <Wand2 className="h-3 w-3" /> B → A
            </NeonButton>
          </div>
          <p className="text-[8px] text-stage-foreground/50 leading-tight">
            Löst einen einzelnen, KI-gesteuerten Übergang aus. Echte Stems werden automatisch genutzt; ohne Stems bleibt das Originalsignal sauber.
          </p>
        </div>

        <NeonButton onClick={() => sync("A", "B")} variant="armed" size="sm" disabled={!A.track?.bpm || !B.track?.bpm}>
          <Zap className="h-3 w-3" /> Sync B→A
          {A.track?.bpm && B.track?.bpm && (
            <span className="ml-1 font-mono">{Math.round(A.track.bpm)}↔{Math.round(B.track.bpm)}</span>
          )}
        </NeonButton>

        <div className="flex items-center justify-between text-[9px]">
          <span className={cn("rounded px-1.5 py-0.5", compat.keyOk ? "bg-emerald-500/30 text-emerald-200" : "bg-white/10 text-stage-foreground/60")}>
            Key {compat.keyOk ? "✓" : `Δ${compat.semitones > 0 ? "+" : ""}${compat.semitones}st`} {A.track?.camelot ?? "?"}↔{B.track?.camelot ?? "?"}
          </span>
          <span className={cn("rounded px-1.5 py-0.5", compat.bpmOk ? "bg-emerald-500/30 text-emerald-200" : "bg-white/10 text-stage-foreground/60")}>
            BPM Δ {compat.bpmDelta ?? "?"}
          </span>
        </div>

        {/* Party-Mode auto-transition timer */}
        <div className="rounded-md border border-white/10 bg-black/30 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-widest text-stage-foreground/70 flex items-center gap-1">
              <Timer className="h-3 w-3" /> Party-Timer
            </span>
            <button
              onClick={() => setAutoTimerOn(!autoTimerOn)}
              disabled={tracks.length < 2}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40",
                autoTimerOn ? "bg-[var(--neon-cyan)] text-black" : "bg-white/10 text-stage-foreground/60",
              )}
              title={tracks.length < 2 ? "Mindestens 2 Tracks nötig" : ""}
            >
              {autoTimerOn ? `läuft · ${autoTimerCountdown}s` : "aus"}
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between text-[9px] text-stage-foreground/60">
              <span>Intervall</span><span className="font-mono">{autoTimerSec}s</span>
            </div>
            <input
              type="range" min={20} max={300} step={5}
              value={autoTimerSec}
              onChange={(e) => setAutoTimerSec(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--neon-cyan)]"
            />
          </div>
          <button
            onClick={() => setAutoShuffle(!autoShuffle)}
            className="flex w-full items-center justify-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-widest text-stage-foreground/80 hover:bg-white/5"
          >
            <Shuffle className="h-3 w-3" /> {autoShuffle ? "Shuffle" : "Linear"}
          </button>
          {tracks.length < 2 && (
            <div className="text-center text-[9px] text-stage-foreground/50">
              Lade mindestens 2 Tracks in die Library für den Party-Timer.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Led color={A.isPlaying ? "cyan" : "off"} label="A" blink={A.isPlaying} />
          <Led color={inFlight ? "amber" : "off"} label="MIX" blink={inFlight} />
          <Led color={B.isPlaying ? "magenta" : "off"} label="B" blink={B.isPlaying} />
        </div>

        {lastNote && (
          <div className="text-center text-[9px] font-mono text-stage-foreground/60 line-clamp-2 flex items-center justify-center gap-1">
            <ArrowLeftRight className="h-3 w-3" /> {lastNote}
          </div>
        )}
      </div>

      <DeckColumn
        side="B" color="magenta"
        deck={B}
        onToggle={() => toggle("B")}
        onScrub={(d) => scrub("B", d)}
        onVolume={(v) => setVolume("B", v)}
        tracks={tracks}
        onLoadTrack={(t) => loadDeck("B", t)}
        onReanalyze={() => ensureAnalysis("B", { force: true })}
      />
    </div>
    </>
  );
}

function DeckColumn({
  side, color, deck, onToggle, onScrub, onVolume: _ov, tracks, onLoadTrack, onReanalyze,
}: {
  side: DeckSide;
  color: "cyan" | "magenta";
  deck: ReturnType<typeof useTwinDeck.getState>["A"];
  onToggle: () => void;
  onScrub: (dSec: number) => void;
  onVolume: (v: number) => void;
  tracks: EngineTrack[];
  onLoadTrack: (t: EngineTrack) => void;
  onReanalyze: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const t = deck.track;
  return (
    <div className="neon-surface rounded-2xl p-4 flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between">
        <span className={cn(
          "text-xs font-bold tracking-widest",
          color === "cyan" ? "text-[var(--neon-cyan)]" : "text-[var(--neon-magenta)]",
        )}>DECK {side}</span>
        <span className="font-mono text-[10px] text-stage-foreground/70">{fmt(deck.position)} / {fmt(deck.duration)}</span>
      </div>

      <Turntable
        size={typeof window !== "undefined" && window.innerWidth < 480 ? 160 : 220} color={color}
        artwork={t?.artwork ?? undefined}
        label={t?.title}
        spinning={deck.isPlaying}
        positionSec={deck.position}
        durationSec={deck.duration}
        onScrub={onScrub}
      />

      <DeckLiveHud side={side} />
      <DeckSpectrum side={side} color={color === "cyan" ? "var(--neon-cyan)" : "var(--neon-magenta)"} />

      <div className="line-clamp-1 text-sm font-semibold text-stage-foreground">{t?.title ?? "— kein Track —"}</div>
      <div className="flex items-center gap-1 text-[10px] text-stage-foreground/60">
        <span className="line-clamp-1">
          {t?.artist ?? ""}{t?.bpm ? ` • ${Math.round(t.bpm)} BPM` : ""}{t?.camelot ? ` • ${t.camelot}` : ""}
        </span>
        {t && (
          <button onClick={onReanalyze} title="Erneut analysieren"
            className="ml-1 rounded p-0.5 text-stage-foreground/60 hover:bg-white/10 hover:text-stage-foreground">
            <RefreshCw className={cn("h-3 w-3", deck.analyzing && "animate-spin")} />
          </button>
        )}
      </div>
      {deck.analyzing && (
        <div className="w-full">
          <div className="text-center text-[9px] text-stage-foreground/50">Analyse… {deck.analyzeProgress}%</div>
          <div className="h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-[var(--neon-cyan)]" style={{ width: `${deck.analyzeProgress}%` }} />
          </div>
        </div>
      )}

      <div className="mt-1 flex w-full items-center justify-center gap-2">
        <NeonButton onClick={onToggle} variant={deck.isPlaying ? "active" : "idle"} size="md" disabled={!t}>
          {deck.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {deck.isPlaying ? "Pause" : "Play"}
        </NeonButton>
        <NeonButton onClick={() => setPickerOpen((o) => !o)} size="md" variant="ghost">
          <Headphones className="h-3.5 w-3.5" /> Load
        </NeonButton>
        <NeonButton onClick={() => onScrub(-2)} variant="ghost" size="sm" title="-2s">
          <RotateCw className="h-3 w-3 scale-x-[-1]" />
        </NeonButton>
      </div>

      {pickerOpen && (
        <div className="mt-2 max-h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-black/40 p-1 text-xs">
          {tracks.length === 0 && <div className="p-2 text-stage-foreground/50">Keine Tracks in Library</div>}
          {tracks.map((tt) => (
            <button
              key={tt.id}
              onClick={() => { onLoadTrack(tt); setPickerOpen(false); }}
              className="block w-full truncate rounded px-2 py-1 text-left text-stage-foreground/90 hover:bg-white/10"
            >
              {tt.title}{tt.bpm ? ` · ${Math.round(tt.bpm)} BPM` : ""}{tt.camelot ? ` · ${tt.camelot}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}