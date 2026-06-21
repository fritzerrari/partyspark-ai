import { useEffect, useState, lazy, Suspense } from "react";
import { Disc3, Grid3X3, Mic2, Music2, Layers, Sparkles, Lightbulb, X } from "lucide-react";
import { useEngine, type EngineTrack } from "@/lib/audio/engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FloatingPanel } from "./FloatingPanel";
import { cn } from "@/lib/utils";

const TwinDeck = lazy(() => import("@/components/cockpit/TwinDeck").then((m) => ({ default: m.TwinDeck })));
const StepSequencer = lazy(() => import("@/components/cockpit/StepSequencer").then((m) => ({ default: m.StepSequencer })));
const CoachHud = lazy(() => import("@/components/cockpit/CoachHud").then((m) => ({ default: m.CoachHud })));
const LoopPadOverlay = lazy(() => import("@/components/player/LoopPadOverlay").then((m) => ({ default: m.LoopPadOverlay })));
const VocalOverlay = lazy(() => import("@/components/player/VocalOverlay").then((m) => ({ default: m.VocalOverlay })));

type ModuleId = "twin-deck" | "sequencer" | "loop-pads" | "vocal" | "coach";

const MODULES: { id: ModuleId; label: string; icon: typeof Disc3; size: { w: number; h: number } }[] = [
  { id: "twin-deck", label: "Twin Decks", icon: Disc3, size: { w: 820, h: 460 } },
  { id: "sequencer", label: "Sequencer", icon: Grid3X3, size: { w: 720, h: 320 } },
  { id: "loop-pads", label: "Loop-Pads", icon: Layers, size: { w: 420, h: 460 } },
  { id: "vocal",     label: "Vocal-Layer", icon: Mic2, size: { w: 380, h: 320 } },
  { id: "coach",     label: "Coach", icon: Lightbulb, size: { w: 340, h: 220 } },
];

function useLibraryTracks(): EngineTrack[] {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<EngineTrack[]>([]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tracks").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(60);
      if (!alive || !data) return;
      const mapped: EngineTrack[] = await Promise.all(data.map(async (raw) => {
        const t = raw as unknown as Record<string, unknown>;
        const path = (t as { storage_path?: string }).storage_path;
        let url = "";
        if (path) {
          const { data: signed } = await supabase.storage.from("tracks").createSignedUrl(path, 60 * 60);
          url = signed?.signedUrl ?? "";
        }
        return {
          id: String(t.id),
          title: (t.title as string) ?? "Untitled",
          artist: (t.artist as string | null) ?? null,
          url,
          artwork: (t.artwork_url as string | null) ?? null,
          bpm: (t.bpm as number | null) ?? null,
          musicalKey: (t.musical_key as string | null) ?? null,
          camelot: (t.camelot as string | null) ?? null,
          beatGrid: (t.beat_grid as number[] | null) ?? null,
          cues: (t.cues as { introEnd: number; firstDrop: number; outroStart: number } | null) ?? null,
          vocalMap: (t.vocal_map as { t: number; voiced: number }[] | null) ?? null,
          durationSec: (t.duration_sec as number | null) ?? null,
        };
      }));
      setTracks(mapped.filter((t) => t.url));
    })();
    return () => { alive = false; };
  }, [user]);
  return tracks;
}

export function ModuleDock() {
  const [open, setOpen] = useState<Set<ModuleId>>(new Set());
  const [dockOpen, setDockOpen] = useState(false);
  const tracks = useLibraryTracks();
  const current = useEngine((s) => s.current);

  const toggle = (id: ModuleId) => {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const close = (id: ModuleId) => setOpen((s) => { const n = new Set(s); n.delete(id); return n; });

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-24 right-4 z-40 lg:bottom-28">
        {dockOpen && (
          <div className="mb-3 grid w-56 grid-cols-1 gap-1 rounded-2xl border border-white/15 bg-[var(--deck-graphite)] p-2 shadow-2xl">
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-stage-foreground/60">Module einblenden</div>
            {MODULES.map((m) => {
              const Icon = m.icon;
              const isOpen = open.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-stage-foreground/90 transition-all",
                    isOpen ? "bg-[color-mix(in_oklab,var(--neon-cyan)_25%,transparent)] neon-glow-cyan" : "hover:bg-white/10",
                  )}
                >
                  <Icon className="h-4 w-4" /> {m.label}
                  {isOpen && <X className="ml-auto h-3 w-3" />}
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setDockOpen((o) => !o)}
          className={cn(
            "grid h-14 w-14 place-items-center rounded-full border-2 transition-all",
            "bg-[var(--deck-graphite)] text-stage-foreground border-[var(--neon-cyan)] neon-glow-cyan",
            dockOpen && "rotate-45",
          )}
          aria-label="Module"
        >
          {dockOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </button>
      </div>

      {/* Panels */}
      <Suspense fallback={null}>
        {[...open].filter((id) => id === "twin-deck" || id === "sequencer" || id === "coach").map((id, i) => {
          const m = MODULES.find((x) => x.id === id)!;
          return (
            <FloatingPanel
              key={id}
              id={`mod-${id}`}
              title={m.label}
              onClose={() => close(id)}
              initial={{ x: 120 + i * 30, y: 110 + i * 30, w: m.size.w, h: m.size.h }}
            >
              {id === "twin-deck" && <TwinDeck tracks={tracks} />}
              {id === "sequencer" && <StepSequencer />}
              {id === "coach" && <CoachHud />}
            </FloatingPanel>
          );
        })}
        <LoopPadOverlay open={open.has("loop-pads")} onClose={() => close("loop-pads")} />
        {current && <VocalOverlay open={open.has("vocal")} onClose={() => close("vocal")} />}
      </Suspense>
    </>
  );
}