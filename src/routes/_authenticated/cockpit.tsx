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
import { CockpitCenter } from "@/components/cockpit/CockpitCenter";
import { MixabilityPlaylist } from "@/components/cockpit/MixabilityPlaylist";
import { CopilotLog } from "@/components/cockpit/CopilotLog";
import { EnergyTimeline } from "@/components/cockpit/EnergyTimeline";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import { useProject } from "@/lib/project/store";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { Sparkles, Square, Disc, Mic, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { startVisualBridge } from "@/lib/audio/visualBridge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bot, Music2, Volume2, Grid3x3, Lightbulb } from "lucide-react";

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
          energy: (t.energy as number | null) ?? null,
          embedding: (t.embedding as number[] | null) ?? null,
          smartCrate: (t.smart_crate as EngineTrack["smartCrate"] | null) ?? null,
          userTags: (t.user_tags as string[] | null) ?? null,
        } satisfies EngineTrack;
      }));
      const filtered = mapped.filter((t) => t.url);
      setTracks(filtered);
      // Mirror to project bus so other modules see these tracks
      filtered.forEach((t) => addEngineTrack(t));
    })();
    return () => { alive = false; };
  }, [user, addEngineTrack]);

  async function handlePartyMode() {
    if (tracks.length < 2) {
      toast.error("Du brauchst mindestens 2 Tracks in der Library.");
      return;
    }
    if (autoTimerOn) {
      stopAutoDj();
      toast("Party-Modus pausiert");
    } else {
      await startAutoDj();
      toast.success("Party-Modus läuft 🎚️ — Tracks werden automatisch geladen und gemixt");
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
            addArtifact({ kind: "recording", title: `Party-Modus Set · ${new Date().toLocaleTimeString()}`, buffer: buf });
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
      <div className="relative overflow-hidden rounded-3xl stage-gradient p-5 sm:p-6">
        {/* Ambient bg pulse */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--neon-cyan)]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-[var(--neon-magenta)]/10 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stage-foreground/60">
              Schritt 3 · Spiele deine Party
            </p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-stage-foreground sm:text-3xl">
              <span className="bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-magenta)] bg-clip-text text-transparent">
                DJ Cockpit
              </span>
            </h1>
            <p className="mt-1 text-[11px] text-stage-foreground/70">
              {tracks.length === 0
                ? "Noch keine Tracks — lade welche in deine Library."
                : tracks.length < 2
                  ? `${tracks.length} Track verfügbar — du brauchst min. 2 für Party-Modus.`
                  : `${tracks.length} Tracks bereit · Live-Mixen, Export, Stems, FX.`}
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button
              onClick={openVisualizer}
              className="min-h-[44px] rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold uppercase tracking-widest text-stage-foreground transition-all hover:bg-white/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <MonitorPlay className="h-3 w-3" /> Beamer
            </button>
            <button
              onClick={handlePartyMode}
              disabled={tracks.length < 2}
              className={
                "min-h-[44px] flex-1 sm:flex-none rounded-full px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 " +
                (autoTimerOn
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-[var(--neon-cyan)] text-black hover:brightness-110 neon-glow-cyan")
              }
            >
              {autoTimerOn ? <><Square className="h-3 w-3" /> Party-Modus stoppen</> : <><Sparkles className="h-4 w-4" /> Party-Modus starten</>}
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
            Lade mindestens 2 Tracks in deine <Link to="/library" className="underline text-[var(--neon-cyan)]">Library</Link>, dann startet der Party-Modus mit einem Klick.
          </p>
        )}
      </div>

      <TwinDeck tracks={tracks} />

      <EnergyTimeline />

      {/* Center / Playlist / Copilot — PartySpark-style cockpit row */}
      <div className="rounded-3xl stage-gradient p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <CockpitCenter />
          <div className="grid gap-3 grid-rows-[1fr_1fr] min-h-[420px]">
            <MixabilityPlaylist tracks={tracks} />
            <CopilotLog />
          </div>
        </div>
      </div>

      <Tabs defaultValue="autodj" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-card/60 p-1.5 backdrop-blur">
          {[
            { v: "autodj", label: "Export", icon: Bot },
            { v: "stems", label: "Stems & Mix", icon: Music2 },
            { v: "karaoke", label: "Karaoke", icon: Mic },
            { v: "fx", label: "FX & Drops", icon: Volume2 },
            { v: "sequencer", label: "Sequencer", icon: Grid3x3 },
            { v: "coach", label: "Coach", icon: Lightbulb },
          ].map(({ v, label, icon: Icon }) => (
            <TabsTrigger
              key={v}
              value={v}
              className="flex-1 min-w-[110px] gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="autodj" className="mt-4">
          {tracks.length < 2 ? (
            <EmptyHint title="Export braucht Tracks" body="Lade Songs in deine Library — der AI Mix-Builder rendert dann offline ein komplettes Set als WAV/MP3." to="/library" cta="Zur Library" />
          ) : (
            <AiMixBuilder tracks={tracks} />
          )}
        </TabsContent>

        <TabsContent value="stems" className="mt-4">
          <StemMixer />
        </TabsContent>

        <TabsContent value="karaoke" className="mt-4">
          <SingAlongPanel />
        </TabsContent>

        <TabsContent value="fx" className="mt-4 space-y-4">
          <FxPadGrid />
          <MicRecorder title="Vocal Drop Studio (Live FX)" />
        </TabsContent>

        <TabsContent value="sequencer" className="mt-4">
          <StepSequencer />
        </TabsContent>

        <TabsContent value="coach" className="mt-4">
          <CoachHud />
        </TabsContent>
      </Tabs>

      {/* Mobile sticky helper banner */}
      <div className="fixed bottom-4 left-4 right-4 z-40 rounded-full border border-white/15 bg-black/80 px-3 py-2 text-center text-[10px] uppercase tracking-widest text-stage-foreground/80 backdrop-blur sm:hidden">
        <Mic className="mr-1 inline h-3 w-3 text-[var(--neon-magenta)]" /> Mikro & Pads ↓ · Party-Modus ↑
      </div>

    </div>
  );
}

function EmptyHint({ title, body, to, cta }: { title: string; body: string; to: string; cta: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-card/40 p-8 text-center">
      <Lightbulb className="mx-auto mb-3 h-8 w-8 text-[var(--neon-cyan)]" />
      <h3 className="text-base font-bold text-stage-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-stage-foreground/70">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--neon-cyan)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-black hover:brightness-110"
      >
        {cta}
      </Link>
    </div>
  );
}