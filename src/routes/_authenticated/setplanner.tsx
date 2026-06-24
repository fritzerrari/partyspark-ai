import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { EngineTrack } from "@/lib/audio/engine";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import {
  generateSetPlan,
  EVENT_LABELS,
  type EventType,
  type SetPlan,
} from "@/lib/intel/setPlanner";
import { saveSetPlan, listSetPlans, deleteSetPlan } from "@/lib/intel/setPlanner.functions";
import { useServerFn } from "@tanstack/react-start";
import { CRATE_COLORS, CRATE_LABELS } from "@/lib/intel/smartCrates";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { toast } from "sonner";
import { Calendar, Save, Trash2, Sparkles, Play, ArrowRight, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setplanner")({
  head: () => ({ meta: [{ title: "Set-Planer — PartyPilot AI" }] }),
  component: SetPlannerPage,
});

function SetPlannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tracks, setTracks] = useState<EngineTrack[]>([]);
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [durationMin, setDurationMin] = useState(180);
  const [peakAtMin, setPeakAtMin] = useState(120);
  const [plan, setPlan] = useState<SetPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [savedPlans, setSavedPlans] = useState<Awaited<ReturnType<typeof listSetPlans>>>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const loadDeck = useTwinDeck((s) => s.loadDeck);

  const list = useServerFn(listSetPlans);
  const save = useServerFn(saveSetPlan);
  const del = useServerFn(deleteSetPlan);

  // Load library
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tracks").select("*").eq("owner_id", user.id)
        .order("created_at", { ascending: false }).limit(500);
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
        return {
          id: String(t.id),
          title: (t.title as string) ?? "Untitled",
          artist: (t.artist as string | null) ?? null,
          url,
          artwork: (t.artwork_url as string | null) ?? null,
          bpm: (t.bpm as number | null) ?? null,
          energy: (t.energy as number | null) ?? null,
          musicalKey,
          camelot: keyToCamelot(musicalKey),
          durationSec: (t.duration_sec as number | null) ?? null,
          embedding: (t.embedding as number[] | null) ?? null,
          smartCrate: (t.smart_crate as EngineTrack["smartCrate"] | null) ?? null,
        } satisfies EngineTrack;
      }));
      setTracks(mapped);
    })();
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refreshSaved() {
    setLoadingPlans(true);
    try {
      const rows = await list();
      setSavedPlans(rows);
    } catch {
      // ignore
    } finally {
      setLoadingPlans(false);
    }
  }

  function handleGenerate() {
    if (tracks.length < 4) {
      toast.error("Du brauchst mindestens 4 analysierte Tracks in der Library.");
      return;
    }
    const p = generateSetPlan(tracks, { eventType, durationMin, peakAtMin });
    setPlan(p);
    setPlanName(p.name);
    toast.success("Set generiert — passe an oder speichere.");
  }

  async function handleSave() {
    if (!plan) return;
    try {
      const res = await save({ data: { ...plan, name: planName || plan.name, peakAtMin } });
      toast.success("Plan gespeichert");
      setPlan({ ...plan, id: res.id });
      await refreshSaved();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleLoadPlan(row: Awaited<ReturnType<typeof listSetPlans>>[number]) {
    setPlan({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      durationMin: row.duration_min,
      peakAtMin: row.peak_at_min ?? Math.round(row.duration_min * 0.66),
      slots: row.slots,
    });
    setEventType(row.event_type);
    setDurationMin(row.duration_min);
    setPeakAtMin(row.peak_at_min ?? Math.round(row.duration_min * 0.66));
    setPlanName(row.name);
  }

  async function handleDelete(id: string) {
    if (!confirm("Plan löschen?")) return;
    await del({ data: { id } });
    await refreshSaved();
  }

  function handleSendToCockpit() {
    if (!plan || !plan.slots.length) return;
    const first = tracks.find((t) => t.id === plan.slots[0]?.trackId);
    const second = plan.slots[1]?.trackId ? tracks.find((t) => t.id === plan.slots[1].trackId) : null;
    if (!first) { toast.error("Erster Slot leer"); return; }
    void loadDeck("A", first);
    if (second) void loadDeck("B", second);
    toast.success("Geladen aufs Cockpit — viel Spaß!");
    router.navigate({ to: "/cockpit" });
  }

  const tracksById = useMemo(() => {
    const m = new Map<string, EngineTrack>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  return (
    <div className="space-y-4 pb-24 animate-fade-up">
      <div className="rounded-3xl stage-gradient p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stage-foreground/60">Vorbereitung</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-stage-foreground sm:text-3xl">
              <span className="bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-magenta)] bg-clip-text text-transparent">
                Set-Planer
              </span>
            </h1>
            <p className="mt-1 text-[11px] text-stage-foreground/70">
              Event auswählen — KI baut Energie-Kurve & Tracklist aus deiner Library.
            </p>
          </div>
          <Link
            to="/cockpit"
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-stage-foreground hover:bg-white/20"
          >
            zum Cockpit
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Wizard column */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-card/40 p-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--neon-cyan)]">
              <Calendar className="inline h-3 w-3 mr-1" /> Event
            </div>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className="w-full rounded bg-black/40 border border-white/15 px-2 py-2 text-sm text-stage-foreground"
            >
              {(Object.keys(EVENT_LABELS) as EventType[]).map((k) => (
                <option key={k} value={k}>{EVENT_LABELS[k]}</option>
              ))}
            </select>

            <label className="block text-[11px] text-stage-foreground/70">
              Dauer: <span className="font-mono text-stage-foreground">{durationMin} min</span>
              <input type="range" min={30} max={480} step={15} value={durationMin}
                     onChange={(e) => { const v = Number(e.target.value); setDurationMin(v); if (peakAtMin > v) setPeakAtMin(Math.round(v * 0.66)); }}
                     className="mt-1 w-full" />
            </label>

            <label className="block text-[11px] text-stage-foreground/70">
              Peak bei: <span className="font-mono text-stage-foreground">{peakAtMin} min</span>
              <input type="range" min={10} max={durationMin - 10} step={5} value={peakAtMin}
                     onChange={(e) => setPeakAtMin(Number(e.target.value))}
                     className="mt-1 w-full" />
            </label>

            <button
              onClick={handleGenerate}
              className="w-full rounded-full bg-[var(--neon-cyan)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black hover:brightness-110 flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" /> Plan generieren
            </button>

            <div className="text-[10px] text-stage-foreground/50">
              {tracks.length} Tracks in Library · {tracks.filter((t) => t.embedding?.length).length} mit Fingerprint
            </div>
          </div>

          {/* Saved plans */}
          <div className="rounded-2xl border border-white/10 bg-card/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--neon-magenta)]">
                Gespeicherte Pläne
              </div>
              <button onClick={() => void refreshSaved()} className="text-stage-foreground/40 hover:text-stage-foreground" title="Neu laden">
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            {loadingPlans ? (
              <div className="text-[11px] text-stage-foreground/50">Lade...</div>
            ) : savedPlans.length === 0 ? (
              <div className="text-[11px] text-stage-foreground/50">Noch keine Pläne gespeichert.</div>
            ) : savedPlans.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 p-2">
                <button onClick={() => void handleLoadPlan(row)} className="flex-1 min-w-0 text-left">
                  <div className="truncate text-[11px] font-semibold text-stage-foreground">{row.name}</div>
                  <div className="truncate text-[10px] text-stage-foreground/50">
                    {EVENT_LABELS[row.event_type]} · {row.duration_min} min · {row.slots.length} Slots
                  </div>
                </button>
                <button onClick={() => void handleDelete(row.id)} className="text-red-300 hover:text-red-100">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Plan column */}
        <div className="space-y-3">
          {plan ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-card/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    className="flex-1 rounded bg-black/40 border border-white/15 px-2 py-1.5 text-sm text-stage-foreground"
                    placeholder="Plan-Name"
                  />
                  <button
                    onClick={() => void handleSave()}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-stage-foreground hover:bg-white/20 flex items-center gap-1"
                  >
                    <Save className="h-3 w-3" /> Speichern
                  </button>
                  <button
                    onClick={handleSendToCockpit}
                    className="rounded-full bg-[var(--neon-magenta)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black hover:brightness-110 flex items-center gap-1"
                  >
                    <Play className="h-3 w-3" /> Ins Cockpit
                  </button>
                </div>

                <EnergyCurvePreview plan={plan} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-card/40 p-3 space-y-1">
                {plan.slots.map((slot, i) => {
                  const main = slot.trackId ? tracksById.get(slot.trackId) : null;
                  const backup = slot.backupTrackId ? tracksById.get(slot.backupTrackId) : null;
                  return (
                    <div key={i} className="grid grid-cols-[60px_1fr_auto] items-center gap-2 rounded border border-white/10 bg-white/5 p-2">
                      <div className="text-[10px] font-mono text-stage-foreground/60">
                        {Math.floor(slot.startMin).toString().padStart(2,"0")}:{Math.round((slot.startMin % 1) * 60).toString().padStart(2,"0")}
                      </div>
                      <div className="min-w-0">
                        {main ? (
                          <>
                            <div className="truncate text-[12px] font-semibold text-stage-foreground">{main.title}</div>
                            <div className="truncate text-[10px] text-stage-foreground/50">
                              {main.bpm ? `${Math.round(main.bpm)} BPM` : "—"} · {main.camelot ?? "?"}
                              {main.smartCrate && (
                                <span className="ml-1 px-1.5 rounded" style={{ background: `color-mix(in oklab, ${CRATE_COLORS[main.smartCrate]} 25%, transparent)`, color: CRATE_COLORS[main.smartCrate] }}>
                                  {CRATE_LABELS[main.smartCrate]}
                                </span>
                              )}
                            </div>
                            {backup && (
                              <div className="truncate text-[10px] text-stage-foreground/40">
                                <ArrowRight className="inline h-2.5 w-2.5" /> Plan B: {backup.title}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-stage-foreground/40">— kein passender Track —</div>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-stage-foreground/60">
                        E {(slot.targetEnergy * 100).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-card/30 p-8 text-center text-stage-foreground/60">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--neon-cyan)]" />
              <div className="text-sm">Event-Typ wählen und „Plan generieren" klicken.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EnergyCurvePreview({ plan }: { plan: SetPlan }) {
  const W = 600, H = 80;
  const pts = plan.slots.map((s, i) => {
    const x = (i / Math.max(1, plan.slots.length - 1)) * W;
    const y = H - s.targetEnergy * (H - 10) - 5;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((y) => (
        <line key={y} x1={0} y1={H - y * (H - 10) - 5} x2={W} y2={H - y * (H - 10) - 5} stroke="rgba(255,255,255,0.06)" />
      ))}
      <polyline points={pts} fill="none" stroke="var(--neon-cyan)" strokeWidth={2} />
      {/* peak marker */}
      <line
        x1={(plan.peakAtMin / plan.durationMin) * W}
        y1={0}
        x2={(plan.peakAtMin / plan.durationMin) * W}
        y2={H}
        stroke="var(--neon-magenta)"
        strokeDasharray="3 3"
      />
    </svg>
  );
}