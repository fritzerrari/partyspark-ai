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
import { Sparkles, Square, Disc, Mic, MonitorPlay, Calendar, Radio, Activity, Music } from "lucide-react";
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
    <div className="cockpit-pro sb-shell -mx-4 -my-4 min-h-[calc(100vh-3rem)] space-y-5 px-4 py-4 pb-32 animate-fade-up sm:-mx-6 sm:px-6 sm:pb-6">
      {/* ───── Top bar ───── */}
      <header className="sb-card sb-scan grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
               style={{ background: "linear-gradient(135deg, var(--sb-primary), var(--sb-magenta))",
                        boxShadow: "0 10px 24px -10px color-mix(in oklab, var(--sb-primary) 70%, transparent)" }}>
            <Radio className="h-5 w-5 text-black/80" />
          </div>
          <div className="min-w-0">
            <div className="sb-eyebrow">Schritt 3 · Spiele deine Party</div>
            <h1 className="sb-title truncate text-2xl sm:text-3xl">DJ COCKPIT</h1>
            <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--sb-ink-dim)" }}>
              <span className="sb-eq" aria-hidden><span /><span /><span /><span /></span>
              <span className="font-mono">
                {tracks.length === 0
                  ? "Noch keine Tracks — lade welche in die Library."
                  : tracks.length < 2
                    ? `${tracks.length} Track · min. 2 für Party-Modus`
                    : `${tracks.length} Tracks bereit · Live-Engine ready`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={openVisualizer} className="sb-pill">
            <MonitorPlay className="h-3.5 w-3.5" /> Beamer
          </button>
          <Link to="/setplanner" className="sb-pill">
            <Calendar className="h-3.5 w-3.5" /> Set-Planer
          </Link>
          <button
            onClick={handlePartyMode}
            disabled={tracks.length < 2}
            className={"sb-pill " + (autoTimerOn ? "sb-pill-rec animate-pulse" : "sb-pill-primary")}
          >
            {autoTimerOn ? <><Square className="h-3.5 w-3.5" /> Stop</> : <><Sparkles className="h-3.5 w-3.5" /> Party-Modus</>}
          </button>
          <button
            onClick={handleRecord}
            className={"sb-pill " + (recording ? "sb-pill-rec animate-pulse" : "")}
          >
            <Disc className="h-3.5 w-3.5" /> {recording ? "Stop" : "Rec"}
          </button>
        </div>
      </header>

      {/* ───── KPI strip ───── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={<Music className="h-4 w-4" />}
          label="Library"
          value={tracks.length.toString().padStart(2, "0")}
          hint={tracks.length >= 2 ? "Bereit zum Mixen" : "≥ 2 Tracks benötigt"}
          tone="warm"
        />
        <LiveStateKpi />
        <CrateKpi tracks={tracks} />
      </section>

      {/* ───── Decks row ───── */}
      <section>
        <SectionHeader label="Decks & Mixer" icon={<Activity className="h-3.5 w-3.5" />} />
        <TwinDeck tracks={tracks} />
      </section>

      {/* ───── Mix Lab + Right Rail ───── */}
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="sb-card-warm p-5">
          <SectionHeader label="Mix Lab" icon={<Sparkles className="h-3.5 w-3.5" />} />
          <CockpitCenter />
        </div>
        <div className="grid gap-4">
          <div className="sb-card p-4">
            <SectionHeader label="Energy Timeline" />
            <EnergyTimeline />
          </div>
          <div className="sb-card p-4">
            <SectionHeader label="Playlist" />
            <MixabilityPlaylist tracks={tracks} />
          </div>
          <div className="sb-card p-4">
            <SectionHeader label="Copilot Log" />
            <CopilotLog />
          </div>
        </div>
      </section>

      {/* ───── Module rail (Export · Stems · Karaoke · FX · Sequencer · Coach) ───── */}
      <Tabs defaultValue="autodj" className="w-full">
        <TabsList className="sb-rail">
          {[
            { v: "autodj", label: "Export", icon: Bot },
            { v: "stems", label: "Stems & Mix", icon: Music2 },
            { v: "karaoke", label: "Karaoke", icon: Mic },
            { v: "fx", label: "FX & Drops", icon: Volume2 },
            { v: "sequencer", label: "Sequencer", icon: Grid3x3 },
            { v: "coach", label: "Coach", icon: Lightbulb },
          ].map(({ v, label, icon: Icon }) => (
            <TabsTrigger key={v} value={v} className="sb-rail-item">
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
    <div className="sb-card p-8 text-center">
      <Lightbulb className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--sb-primary)" }} />
      <h3 className="text-base font-bold" style={{ color: "var(--sb-ink)" }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--sb-ink-dim)" }}>{body}</p>
      <Link
        to={to}
        className="sb-pill sb-pill-primary mt-4"
      >
        {cta}
      </Link>
    </div>
  );
}

/* ───── helpers ───── */

function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {icon && (
        <span
          className="grid h-6 w-6 place-items-center rounded-md"
          style={{
            background: "color-mix(in oklab, var(--sb-primary) 20%, transparent)",
            color: "var(--sb-primary)",
          }}
        >
          {icon}
        </span>
      )}
      <span className="sb-section-title">{label}</span>
      <span className="sb-section-divider" />
    </div>
  );
}

function KpiTile({
  icon, label, value, hint, tone = "warm",
}: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "warm" | "cool" }) {
  const color = tone === "cool" ? "var(--sb-cool)" : "var(--sb-primary)";
  return (
    <div className="sb-kpi flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
           style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="sb-eyebrow text-[10px]">{label}</div>
        <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--sb-ink)" }}>{value}</div>
        {hint && <div className="mt-1 truncate text-[10px]" style={{ color: "var(--sb-ink-mute)" }}>{hint}</div>}
      </div>
    </div>
  );
}

function LiveStateKpi() {
  const aPlaying = useTwinDeck((s) => s.A.isPlaying);
  const bPlaying = useTwinDeck((s) => s.B.isPlaying);
  const crossfader = useTwinDeck((s) => s.crossfader);
  const inFlight = useTwinDeck((s) => s.transitionInFlight);
  const live = (1 - crossfader) > crossfader ? "A" : "B";
  const liveColor = live === "A" ? "var(--sb-primary)" : "var(--sb-cool)";
  const status = inFlight ? "Übergang läuft" : aPlaying || bPlaying ? `Deck ${live} live` : "Idle";
  return (
    <div className="sb-kpi flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
           style={{ background: `color-mix(in oklab, ${liveColor} 20%, transparent)`, color: liveColor }}>
        {aPlaying || bPlaying ? (
          <span className="sb-eq" aria-hidden><span /><span /><span /><span /></span>
        ) : (
          <Activity className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="sb-eyebrow text-[10px]">Engine</div>
        <div className="font-mono text-base font-bold leading-tight" style={{ color: "var(--sb-ink)" }}>{status}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, white 8%, transparent)" }}>
          <div className="h-full rounded-full transition-[width] duration-200"
               style={{
                 width: `${Math.round(crossfader * 100)}%`,
                 background: "linear-gradient(90deg, var(--sb-primary), var(--sb-magenta), var(--sb-cool))",
               }} />
        </div>
      </div>
    </div>
  );
}

function CrateKpi({ tracks }: { tracks: EngineTrack[] }) {
  const counts = tracks.reduce<Record<string, number>>((acc, t) => {
    const k = (t.smartCrate ?? "unsortiert") as string;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const order = ["warmup", "filler", "peak", "cooldown", "reserve", "unsortiert"] as const;
  const labels: Record<string, string> = {
    warmup: "Warm-up", filler: "Floor-Filler", peak: "Peak-Time",
    cooldown: "Cool-down", reserve: "Reserve", unsortiert: "Unsortiert",
  };
  const top = order
    .map((k) => ({ k, n: counts[k] ?? 0 }))
    .filter((x) => x.n > 0)
    .slice(0, 3);
  const total = tracks.length;
  return (
    <div className="sb-kpi flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
           style={{ background: "color-mix(in oklab, var(--sb-warm) 18%, transparent)", color: "var(--sb-warm)" }}>
        <Calendar className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="sb-eyebrow text-[10px]">Smart Crates</div>
        {top.length === 0 ? (
          <div className="font-mono text-base font-bold leading-tight" style={{ color: "var(--sb-ink-dim)" }}>
            noch leer
          </div>
        ) : (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {top.map(({ k, n }) => (
              <span key={k}
                className="rounded-full px-2 py-0.5 font-mono text-[10px]"
                style={{ background: "color-mix(in oklab, var(--sb-warm) 16%, transparent)",
                         color: "var(--sb-ink)" }}>
                {labels[k]} <span style={{ color: "var(--sb-ink-mute)" }}>· {n}</span>
              </span>
            ))}
          </div>
        )}
        {total > 0 && (
          <div className="mt-1 text-[10px]" style={{ color: "var(--sb-ink-mute)" }}>
            {total} Tracks analysiert
          </div>
        )}
      </div>
    </div>
  );
}