import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { EngineTrack } from "@/lib/audio/engine";
import { TwinDeck } from "@/components/cockpit/TwinDeck";
import { MicRecorder } from "@/components/recording/MicRecorder";
import { StemMixer } from "@/components/cockpit/StemMixer";
import { AiMixBuilder } from "@/components/cockpit/AiMixBuilder";
import { StepSequencer } from "@/components/cockpit/StepSequencer";
import { CoachHud } from "@/components/cockpit/CoachHud";
import { SingAlongPanel } from "@/components/cockpit/SingAlongPanel";
import { FxPadGrid } from "@/components/cockpit/FxPadGrid";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import { useProject } from "@/lib/project/store";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { Sparkles, Square, Disc, Mic, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { TrackDropZone } from "@/components/upload/TrackDropZone";
import { startVisualBridge } from "@/lib/audio/visualBridge";

export const Route = createFileRoute("/_authenticated/cockpit")({
  head: () => ({ meta: [{ title: "DJ Cockpit — PartyPilot AI" }] }),
  component: Cockpit,
});

function Cockpit() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<EngineTrack[]>([]);
  const addEngineTrack = useProject((s) => s.addEngineTrack);
  const addArtifact = useProject((s) => s.addArtifact);
  const startAutoDj = useTwinDeck((s) => s.startAutoDj);
  const stopAutoDj = useTwinDeck((s) => s.stopAutoDj);
  const autoTimerOn = useTwinDeck((s) => s.autoTimerOn);
  const recording = useTwinDeck((s) => s.recording);
  const startRecording = useTwinDeck((s) => s.startRecording);
  const stopRecording = useTwinDeck((s) => s.stopRecording);

  useEffect(() => {
    const stop = startVisualBridge();
    return () => { stop(); };
  }, []);

  function openVisualizer() {
    startVisualBridge();
    const w = window.open(
      "/visualizer",
      "partypilot-visualizer",
      "noopener=no,width=1280,height=720",
    );
    if (!w) toast.error("Popup geblockt – bitte Popups für diese Seite erlauben.");
    else toast.success("Visualizer öffnet sich – ziehe das Fenster auf den Beamer & drücke F11.");
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tracks").select("*").eq("owner_id", user.id)
        .order("created_at", { ascending: false }).limit(60);
      if (!alive || !data) return;
      const mapped = await Promise.all(data.map(async (raw) => {
        const t = raw as unknown as Record<string, unknown>;
        const path = t.storage_path as string | undefined;
        let url = "";
        if (path) {
          const { data: signed } = await supabase.storage.from("tracks").createSignedUrl(path, 60 * 60);
          url = signed?.signedUrl ?? "";
        }
        const musicalKey = (t.music_key as string | null) ?? null;
        const safeJson = <T,>(v: unknown): T | null => {
          if (v == null) return null;
          if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } }
          return v as T;
        };
        return {
          id: String(t.id),
          title: (t.title as string) ?? "Untitled",
          artist: (t.artist as string | null) ?? null,
          url,
          artwork: (t.artwork_url as string | null) ?? null,
          bpm: (t.bpm as number | null) ?? null,
          musicalKey,
          camelot: keyToCamelot(musicalKey),
          beatGrid: safeJson<number[]>(t.beat_grid),
          cues: safeJson<{ introEnd: number; firstDrop: number; outroStart: number }>(t.cues),
          vocalMap: safeJson<{ t: number; voiced: number }[]>(t.vocal_map),
          durationSec: (t.duration_sec as number | null) ?? null,
        } satisfies EngineTrack;
      }));
      const filtered = mapped.filter((t) => t.url);
      setTracks(filtered);
      // Mirror to project bus so other modules see these tracks
      filtered.forEach((t) => addEngineTrack(t));
    })();
    return () => { alive = false; };
  }, [user, addEngineTrack]);

  async function handleAutoDj() {
    if (tracks.length < 2) {
      toast.error("Du brauchst mindestens 2 Tracks in der Library.");
      return;
    }
    if (autoTimerOn) {
      stopAutoDj();
      toast("Auto-DJ pausiert");
    } else {
      await startAutoDj();
      toast.success("Auto-DJ läuft 🎚️ — Tracks werden automatisch gemixt");
    }
  }

  async function handleRecord() {
    if (recording) {
      const blob = await stopRecording();
      if (blob) {
        const ab = await blob.arrayBuffer();
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
        if (Ctx) {
          const c = new Ctx();
          try {
            const buf = await c.decodeAudioData(ab);
            addArtifact({ kind: "recording", title: `Auto-DJ Set · ${new Date().toLocaleTimeString()}`, buffer: buf });
            toast.success("Set in den Projekt-Bus gespeichert");
          } catch { toast.error("Aufnahme konnte nicht dekodiert werden"); }
          finally { void c.close(); }
        }
      }
    } else {
      await startRecording();
      toast("Aufnahme läuft – stoppe sie um sie zu speichern", { icon: "🔴" });
    }
  }

  return (
    <div className="space-y-4 pb-32 animate-fade-up sm:pb-4">
      <div className="rounded-3xl stage-gradient p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-black uppercase tracking-[0.18em] text-stage-foreground sm:text-2xl">DJ Cockpit</h1>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-stage-foreground/60 sm:text-xs">
              Twin Decks · Auto-DJ · Sing-Along · FX
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openVisualizer}
              className="min-h-[44px] rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold uppercase tracking-widest text-stage-foreground transition-all hover:bg-white/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <MonitorPlay className="h-3 w-3" /> Beamer
            </button>
            <button
              onClick={handleAutoDj}
              disabled={tracks.length < 2}
              className={
                "min-h-[44px] flex-1 sm:flex-none rounded-full px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 " +
                (autoTimerOn
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-[var(--neon-cyan)] text-black hover:brightness-110 neon-glow-cyan")
              }
            >
              {autoTimerOn ? <><Square className="h-3 w-3" /> Stop Auto-DJ</> : <><Sparkles className="h-4 w-4" /> Auto-DJ starten</>}
            </button>
            <button
              onClick={handleRecord}
              className={
                "min-h-[44px] rounded-full px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 " +
                (recording ? "bg-red-500 text-white animate-pulse" : "border border-white/20 bg-white/10 text-stage-foreground hover:bg-white/20")
              }
            >
              <Disc className="h-3 w-3" /> {recording ? "Stop" : "Rec"}
            </button>
          </div>
        </div>
        {tracks.length < 2 && (
          <p className="mt-3 text-[11px] text-stage-foreground/70">
            Lade mindestens 2 Tracks in deine <Link to="/library" className="underline text-[var(--neon-cyan)]">Library</Link>, dann startet Auto-DJ mit einem Klick.
          </p>
        )}
      </div>

      <TwinDeck tracks={tracks} />

      <StemMixer />

      <AiMixBuilder tracks={tracks} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <SingAlongPanel />
        <FxPadGrid />
      </div>

      <MicRecorder title="Vocal Drop Studio (Live FX)" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <StepSequencer />
        <CoachHud />
      </div>

      {/* Mobile sticky helper banner */}
      <div className="fixed bottom-4 left-4 right-4 z-40 rounded-full border border-white/15 bg-black/80 px-3 py-2 text-center text-[10px] uppercase tracking-widest text-stage-foreground/80 backdrop-blur sm:hidden">
        <Mic className="mr-1 inline h-3 w-3 text-[var(--neon-magenta)]" /> Mikro & Pads ↓ · Auto-DJ ↑
      </div>

      <TrackDropZone />
    </div>
  );
}