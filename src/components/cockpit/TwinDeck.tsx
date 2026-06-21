import { useEffect, useRef, useState, useCallback } from "react";
import { useEngine, type EngineTrack } from "@/lib/audio/engine";
import { Turntable } from "./Turntable";
import { NeonButton } from "@/components/ui/NeonButton";
import { Led } from "@/components/ui/LedIndicator";
import { RotaryKnob } from "@/components/ui/RotaryKnob";
import { Play, Pause, RotateCw, Headphones, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  tracks: EngineTrack[];   // selectable tracks for Deck B (and A pickers)
};

function fmt(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function TwinDeck({ tracks }: Props) {
  // --- Deck A: bound to global engine ---
  const current = useEngine((s) => s.current);
  const positionA = useEngine((s) => s.positionSec);
  const durationA = useEngine((s) => s.durationSec);
  const playingA = useEngine((s) => s.isPlaying);
  const seek = useEngine((s) => s.seek);
  const toggleA = useEngine((s) => s.toggle);
  const loadQueue = useEngine((s) => s.loadQueue);

  // --- Deck B: private <audio> ---
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [trackB, setTrackB] = useState<EngineTrack | null>(null);
  const [playingB, setPlayingB] = useState(false);
  const [positionB, setPositionB] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [pitchB, setPitchB] = useState(1); // 0.94..1.06

  // --- Mixer ---
  const [crossfader, setCrossfader] = useState(0.5); // 0 = full A, 1 = full B
  const [volA, setVolA] = useState(0.9);
  const [volB, setVolB] = useState(0.9);

  // init audio B
  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    audioBRef.current = a;
    const onTime = () => setPositionB(a.currentTime);
    const onMeta = () => setDurationB(a.duration || 0);
    const onEnd = () => setPlayingB(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      audioBRef.current = null;
    };
  }, []);

  // apply crossfader to deck volumes
  useEffect(() => {
    const gainA = Math.cos((crossfader * Math.PI) / 2); // equal-power
    const gainB = Math.sin((crossfader * Math.PI) / 2);
    // Deck A: control engine audio element via setVolume
    useEngine.getState().setVolume(volA * gainA);
    if (audioBRef.current) audioBRef.current.volume = volB * gainB;
  }, [crossfader, volA, volB]);

  // load Deck B
  const loadB = useCallback(async (t: EngineTrack) => {
    setTrackB(t);
    if (!audioBRef.current) return;
    audioBRef.current.src = t.url;
    audioBRef.current.playbackRate = pitchB;
    audioBRef.current.volume = volB * Math.sin((crossfader * Math.PI) / 2);
  }, [pitchB, volB, crossfader]);

  const toggleB = useCallback(async () => {
    const a = audioBRef.current;
    if (!a || !trackB) return;
    if (a.paused) { await a.play().catch(() => {}); setPlayingB(true); }
    else { a.pause(); setPlayingB(false); }
  }, [trackB]);

  // pitch (used for sync)
  useEffect(() => {
    if (audioBRef.current) audioBRef.current.playbackRate = pitchB;
  }, [pitchB]);

  // sync B → A by BPM
  const sync = useCallback(() => {
    if (!current?.bpm || !trackB?.bpm) return;
    const ratio = current.bpm / trackB.bpm;
    setPitchB(Math.max(0.85, Math.min(1.15, ratio)));
  }, [current, trackB]);

  // scrub callbacks
  const scrubA = useCallback((dSec: number) => {
    const next = Math.max(0, Math.min(durationA, positionA + dSec));
    seek(next);
  }, [positionA, durationA, seek]);

  const scrubB = useCallback((dSec: number) => {
    const a = audioBRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + dSec));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px_1fr]">
      {/* Deck A */}
      <DeckColumn
        side="A" color="cyan"
        track={current}
        playing={playingA}
        position={positionA}
        duration={durationA}
        onToggle={toggleA}
        onScrub={scrubA}
        volume={volA} onVolume={setVolA}
        tracks={tracks}
        onLoadTrack={(t) => loadQueue([t], { autoplay: false })}
      />

      {/* Mixer column */}
      <div className="neon-surface rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-center text-[10px] uppercase tracking-[0.2em] text-stage-foreground/60">Mixer</div>

        <div className="flex items-center justify-around">
          <RotaryKnob value={volA} onChange={setVolA} label="Vol A" color="cyan" size={48} />
          <RotaryKnob value={volB} onChange={setVolB} label="Vol B" color="magenta" size={48} />
        </div>

        {/* Crossfader */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] uppercase tracking-widest text-stage-foreground/60">
            <span>A</span><span>Crossfader</span><span>B</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.001}
            value={crossfader} onChange={(e) => setCrossfader(parseFloat(e.target.value))}
            onDoubleClick={() => setCrossfader(0.5)}
            className="w-full accent-[var(--neon-cyan)]"
          />
        </div>

        <NeonButton onClick={sync} variant="armed" size="sm" disabled={!current?.bpm || !trackB?.bpm}>
          <Zap className="h-3 w-3" /> Sync
          {current?.bpm && trackB?.bpm && (
            <span className="ml-1 font-mono">{Math.round(current.bpm)}↔{Math.round(trackB.bpm)}</span>
          )}
        </NeonButton>

        <div className="flex items-center justify-between">
          <Led color={playingA ? "cyan" : "off"} label="A" blink={playingA} />
          <Led color={playingB ? "magenta" : "off"} label="B" blink={playingB} />
        </div>

        <div className="text-center text-[10px] font-mono text-stage-foreground/60">
          Pitch B: {pitchB.toFixed(3)}x
        </div>
      </div>

      {/* Deck B */}
      <DeckColumn
        side="B" color="magenta"
        track={trackB}
        playing={playingB}
        position={positionB}
        duration={durationB}
        onToggle={toggleB}
        onScrub={scrubB}
        volume={volB} onVolume={setVolB}
        tracks={tracks}
        onLoadTrack={loadB}
      />
    </div>
  );
}

function DeckColumn({
  side, color, track, playing, position, duration,
  onToggle, onScrub, volume: _v, onVolume: _ov, tracks, onLoadTrack,
}: {
  side: "A" | "B";
  color: "cyan" | "magenta";
  track: EngineTrack | null;
  playing: boolean;
  position: number;
  duration: number;
  onToggle: () => void;
  onScrub: (dSec: number) => void;
  volume: number; onVolume: (v: number) => void;
  tracks: EngineTrack[];
  onLoadTrack: (t: EngineTrack) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="neon-surface rounded-2xl p-4 flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between">
        <span className={cn(
          "text-xs font-bold tracking-widest",
          color === "cyan" ? "text-[var(--neon-cyan)]" : "text-[var(--neon-magenta)]",
        )}>DECK {side}</span>
        <span className="font-mono text-[10px] text-stage-foreground/70">{fmt(position)} / {fmt(duration)}</span>
      </div>

      <Turntable
        size={220} color={color}
        artwork={track?.artwork ?? undefined}
        label={track?.title}
        spinning={playing}
        positionSec={position}
        durationSec={duration}
        onScrub={onScrub}
      />

      <div className="line-clamp-1 text-sm font-semibold text-stage-foreground">{track?.title ?? "— kein Track —"}</div>
      <div className="line-clamp-1 text-[10px] text-stage-foreground/60">
        {track?.artist ?? ""}{track?.bpm ? ` • ${Math.round(track.bpm)} BPM` : ""}{track?.camelot ? ` • ${track.camelot}` : ""}
      </div>

      <div className="mt-1 flex w-full items-center justify-center gap-2">
        <NeonButton onClick={onToggle} variant={playing ? "active" : "idle"} size="md" disabled={!track}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : "Play"}
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
          {tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => { onLoadTrack(t); setPickerOpen(false); }}
              className="block w-full truncate rounded px-2 py-1 text-left text-stage-foreground/90 hover:bg-white/10"
            >
              {t.title}{t.bpm ? ` · ${Math.round(t.bpm)} BPM` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}