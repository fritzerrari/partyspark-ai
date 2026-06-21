import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Play,
  Pause,
  SkipForward,
  Zap,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Radio,
  Share2,
  ArrowLeft,
  Music2,
} from "lucide-react";
import { partyOptions, queueOptions, tracksListOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useEngine, TRANSITION_LABELS, type EngineTrack, type TransitionMode } from "@/lib/audio/engine";
import { Button } from "@/components/ui/button";
import { EnergyMeter } from "@/components/party/EnergyMeter";
import { MoodPill, type Mood } from "@/components/party/MoodPill";
import { Timeline } from "@/components/party/Timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/_authenticated/parties/$partyId")({
  head: () => ({ meta: [{ title: "Party Control Center — PartyPilot AI" }] }),
  component: ControlCenter,
});

async function trackToEngine(t: {
  id: string;
  title: string;
  artist: string | null;
  storage_path: string | null;
  artwork_url: string | null;
  duration_sec: number | null;
  bpm: number | null;
  energy: number;
}): Promise<EngineTrack | null> {
  if (!t.storage_path) return null;
  const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
  if (!data?.signedUrl) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork_url,
    url: data.signedUrl,
    durationSec: t.duration_sec,
    bpm: t.bpm,
    energy: t.energy,
  };
}

function ControlCenter() {
  const { partyId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: party } = useQuery(partyOptions(partyId));
  const { data: queue = [] } = useQuery(queueOptions(partyId));
  const { data: tracks = [] } = useQuery(tracksListOptions());

  const engine = useEngine();

  // Sync engine energy/mood with party row when party loads
  useEffect(() => {
    if (party) {
      engine.setEnergy(party.current_energy);
      engine.setMood(party.current_mood);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.id]);

  // Subscribe to realtime updates
  useEffect(() => {
    const ch = supabase
      .channel(`party-${partyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${partyId}` },
        () => qc.invalidateQueries({ queryKey: ["party", partyId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "track_queue", filter: `party_id=eq.${partyId}` },
        () => qc.invalidateQueries({ queryKey: ["queue", partyId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [partyId, qc]);

  const upNext = queue[0]?.tracks as
    | { id: string; title: string; artist: string | null }
    | undefined;

  async function persistEnergy(value: number) {
    engine.setEnergy(value);
    await supabase.from("parties").update({ current_energy: Math.round(value) }).eq("id", partyId);
  }
  async function persistMood(m: Mood) {
    engine.setMood(m);
    await supabase.from("parties").update({ current_mood: m }).eq("id", partyId);
  }

  async function loadAndPlay() {
    if (engine.current) {
      engine.toggle();
      return;
    }
    if (!tracks.length) {
      toast.info("Add some music to your library first");
      navigate({ to: "/library" });
      return;
    }
    const queueTracks: EngineTrack[] = [];
    for (const t of tracks.slice(0, 8)) {
      const e = await trackToEngine(t);
      if (e) queueTracks.push(e);
    }
    if (!queueTracks.length) {
      toast.info("Your tracks have no audio yet. Upload an MP3 to start playing.");
      navigate({ to: "/library" });
      return;
    }
    engine.loadQueue(queueTracks);
    await supabase.from("parties").update({ status: "live", started_at: new Date().toISOString() }).eq("id", partyId);
    qc.invalidateQueries({ queryKey: ["party", partyId] });
  }

  const progressPct = useMemo(() => {
    if (!party) return 0;
    const total = (party.duration_min ?? 180) * 60;
    return Math.min(100, ((engine.positionSec || 0) / total) * 100 + (party.status === "live" ? 10 : 0));
  }, [party, engine.positionSec]);

  if (!party) {
    return (
      <div className="grid h-72 place-items-center text-muted-foreground">Loading party…</div>
    );
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/p/${partyId}/guest` : "";

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">{party.name}</h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {party.event_type} · {party.guest_age_range}
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 rounded-full"
          onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            toast.success("Guest link copied!");
          }}
        >
          <Share2 className="mr-2 h-4 w-4" /> Share guest screen
        </Button>
      </div>

      {/* Stage */}
      <section className="relative overflow-hidden rounded-3xl stage-gradient p-5 text-stage-foreground shadow-stage sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* Now Playing */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Radio className="h-3.5 w-3.5" />
              {engine.isPlaying ? "Live — Now Playing" : "Ready when you are"}
            </span>

            <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 rounded-3xl bg-gradient-to-br from-primary to-accent shadow-stage sm:h-32 sm:w-32">
                {engine.isPlaying && (
                  <span className="absolute inset-0 animate-pulse-ring rounded-3xl" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-bold sm:text-3xl">
                  {engine.current?.title ?? "Pick the first track"}
                </p>
                <p className="truncate text-sm text-stage-foreground/70">
                  {engine.current?.artist ?? "Press play to let PartyPilot start the night"}
                </p>
              </div>
            </div>

            {/* Waveform */}
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={"h-full rounded-full " + (engine.isPlaying ? "animate-shimmer" : "bg-stage-muted")}
                style={engine.isPlaying ? undefined : { width: "10%" }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-stage-foreground/60">
              <span>{fmt(engine.positionSec)}</span>
              <span>{fmt(engine.durationSec)}</span>
            </div>

            {/* Transport */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-stage-foreground hover:bg-white/15"
                onClick={() => engine.skip()}
                aria-label="Previous"
              >
                <SkipForward className="h-5 w-5 rotate-180" />
              </button>
              <button
                onClick={loadAndPlay}
                className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-stage transition hover:scale-105"
                aria-label="Play"
              >
                {engine.isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-0.5" />}
              </button>
              <button
                className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-stage-foreground hover:bg-white/15"
                onClick={() => engine.skip()}
                aria-label="Skip"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>

            {/* AI Buttons */}
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Boost onClick={() => { void persistEnergy(Math.min(100, engine.energy + 20)); toast("Party Boost!", { icon: "⚡" }); }}>
                <Zap className="h-4 w-4" /> Party Boost
              </Boost>
              <Ghost onClick={() => persistEnergy(Math.min(100, engine.energy + 5))}>
                <ArrowUp className="h-4 w-4" /> Energy Up
              </Ghost>
              <Ghost onClick={() => persistEnergy(Math.max(0, engine.energy - 5))}>
                <ArrowDown className="h-4 w-4" /> Energy Down
              </Ghost>
              <Ghost onClick={() => toast.success("Moment captured — saved to memories")}>
                <Sparkles className="h-4 w-4" /> Create Moment
              </Ghost>
            </div>
          </div>

          {/* Sidebar — Up Next + meters */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-stage-border bg-white/5 p-4 backdrop-blur">
              <p className="text-[10px] uppercase tracking-widest text-stage-foreground/60">Up Next</p>
              {upNext ? (
                <>
                  <p className="mt-1 truncate font-display text-lg font-semibold">{upNext.title}</p>
                  <p className="truncate text-xs text-stage-foreground/70">{upNext.artist ?? ""}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-stage-foreground/60">
                  Queue is open — PartyPilot will keep picking.
                </p>
              )}
              <Link
                to="/library"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Music2 className="h-3.5 w-3.5" /> Manage queue
              </Link>
            </div>
            <EnergyMeter value={engine.energy} dark />
            <MoodPill value={engine.mood} onChange={(m) => void persistMood(m)} dark />
          </div>
        </div>
      </section>

      {/* Timeline */}
      <Timeline progress={progressPct} />

      {/* AI Engine status */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Beat Match", body: "Phase-locking next track" },
          { t: "Mood Engine", body: `Tuned to ${engine.mood}` },
          { t: "Energy AI", body: `Holding ${Math.round(engine.energy)}/100` },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.t}</p>
            <p className="mt-1 font-display text-base font-semibold">{c.body}</p>
            <div className="mt-3 h-1 rounded-full bg-muted">
              <div className="h-full w-2/3 animate-shimmer rounded-full" />
            </div>
          </div>
        ))}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Transition</p>
          <Select value={engine.transitionMode} onValueChange={(v) => engine.setTransitionMode(v as TransitionMode)}>
            <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TRANSITION_LABELS).map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Länge</span>
            <Slider value={[engine.crossfadeSec]} onValueChange={([v]) => engine.setCrossfade(v)} min={0} max={12} step={0.5} className="flex-1" />
            <span className="tabular-nums w-8 text-right">{engine.crossfadeSec}s</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Boost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-3 py-3 text-sm font-semibold text-accent-foreground shadow-stage transition hover:scale-[1.02]"
    >
      {children}
    </button>
  );
}
function Ghost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stage-border bg-white/5 px-3 py-3 text-sm font-medium text-stage-foreground transition hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}