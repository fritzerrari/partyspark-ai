import { useEffect, useState } from "react";
import { Play, Pause, SkipForward, Mic, Grid3x3, Wand2, Volume2 } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useEngine, TRANSITION_LABELS, type TransitionModeHint } from "@/lib/audio/engine";
import { buildPeaks } from "@/lib/audio/multitrack";
import { decodeToBuffer } from "@/lib/audio/analyze";
import { WaveformBar } from "./WaveformBar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDock } from "@/lib/dock";
import { cn } from "@/lib/utils";

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TransportBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = useEngine((s) => s.current);
  const isPlaying = useEngine((s) => s.isPlaying);
  const position = useEngine((s) => s.positionSec);
  const duration = useEngine((s) => s.durationSec);
  const volume = useEngine((s) => s.volume);
  const autoDj = useEngine((s) => s.autoDj);
  const transitionMode = useEngine((s) => s.transitionMode);
  const pendingPlan = useEngine((s) => s.pendingPlan);
  const toggle = useEngine((s) => s.toggle);
  const skip = useEngine((s) => s.skip);
  const setVolume = useEngine((s) => s.setVolume);
  const setAutoDj = useEngine((s) => s.setAutoDj);
  const setTransitionMode = useEngine((s) => s.setTransitionMode);
  const dockToggle = useDock((s) => s.toggle);
  const padsOpen = useDock((s) => s.open["loop-pads"]);
  const vocalOpen = useDock((s) => s.open.vocal);

  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  // Build waveform peaks when current track URL changes
  useEffect(() => {
    let abort = false;
    setPeaks(null);
    if (!current?.url) return;
    (async () => {
      try {
        const res = await fetch(current.url);
        const ab = await res.arrayBuffer();
        if (abort) return;
        const buf = await decodeToBuffer(ab);
        if (abort) return;
        setPeaks(buildPeaks(buf, 800));
      } catch { /* silent: peaks optional */ }
    })();
    return () => { abort = true; };
  }, [current?.url]);

  if (pathname === "/auth" || pathname === "/" || pathname.startsWith("/p/")) return null;
  if (!current) return null;

  return (
      <div className="fixed inset-x-0 bottom-[68px] z-20 mx-auto max-w-[1400px] px-2 lg:bottom-3 lg:px-6">
        <div className="rounded-2xl border border-border bg-card/95 p-3 shadow-stage backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 sm:block" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{current.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {current.artist ?? "—"}
                    {current.bpm ? ` · ${Math.round(current.bpm)} BPM` : ""}
                    {current.musicalKey ? ` · ${current.musicalKey}` : ""}
                    {autoDj && pendingPlan ? ` · 🎚 ${pendingPlan.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant={vocalOpen ? "default" : "ghost"}
                    onClick={() => dockToggle("vocal")}
                    className="h-9 rounded-full"
                    title="Über Song singen"
                  >
                    <Mic className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Vocal</span>
                  </Button>
                  <Button
                    size="sm" variant={padsOpen ? "default" : "ghost"}
                    onClick={() => dockToggle("loop-pads")}
                    className="h-9 rounded-full"
                    title="Loop-Pads"
                  >
                    <Grid3x3 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Pads</span>
                  </Button>
                  <div className="hidden items-center gap-2 rounded-full bg-muted px-3 py-1 md:flex">
                    <Wand2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Party-Modus</span>
                    <Switch checked={autoDj} onCheckedChange={setAutoDj} />
                    <Select value={transitionMode} onValueChange={(v) => setTransitionMode(v as TransitionModeHint)}>
                      <SelectTrigger className="h-7 w-[150px] border-none bg-transparent px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TRANSITION_LABELS) as [TransitionModeHint, string][]).map(([id, label]) => (
                          <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <button onClick={toggle} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <button onClick={() => void skip()} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                  <SkipForward className="h-4 w-4" />
                </button>
                <span className="w-10 shrink-0 tabular-nums text-xs text-muted-foreground">{fmt(position)}</span>
                <div className="min-w-0 flex-1">
                  <WaveformBar peaks={peaks} height={36} />
                </div>
                <span className="w-10 shrink-0 tabular-nums text-right text-xs text-muted-foreground">{fmt(duration)}</span>
                <div className="hidden w-32 items-center gap-2 md:flex">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <Slider value={[Math.round(volume * 100)]} max={100} step={1} onValueChange={(v) => setVolume((v[0] ?? 0) / 100)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

export const _cn = cn; // keep utility import used