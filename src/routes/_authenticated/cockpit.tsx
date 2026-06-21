import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { EngineTrack } from "@/lib/audio/engine";
import { TwinDeck } from "@/components/cockpit/TwinDeck";
import { StepSequencer } from "@/components/cockpit/StepSequencer";
import { CoachHud } from "@/components/cockpit/CoachHud";
import { SingAlongPanel } from "@/components/cockpit/SingAlongPanel";
import { FxPadGrid } from "@/components/cockpit/FxPadGrid";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";

export const Route = createFileRoute("/_authenticated/cockpit")({
  head: () => ({ meta: [{ title: "DJ Cockpit — PartyPilot AI" }] }),
  component: Cockpit,
});

function Cockpit() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<EngineTrack[]>([]);

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
        return {
          id: String(t.id),
          title: (t.title as string) ?? "Untitled",
          artist: (t.artist as string | null) ?? null,
          url,
          artwork: (t.artwork_url as string | null) ?? null,
          bpm: (t.bpm as number | null) ?? null,
          musicalKey,
          camelot: keyToCamelot(musicalKey),
          beatGrid: (t.beat_grid as number[] | null) ?? null,
          cues: (t.cues as { introEnd: number; firstDrop: number; outroStart: number } | null) ?? null,
          vocalMap: (t.vocal_map as { t: number; voiced: number }[] | null) ?? null,
          durationSec: (t.duration_sec as number | null) ?? null,
        } satisfies EngineTrack;
      }));
      setTracks(mapped.filter((t) => t.url));
    })();
    return () => { alive = false; };
  }, [user]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="rounded-3xl stage-gradient p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-[0.2em] text-stage-foreground">DJ Cockpit</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-stage-foreground/60">
              Twin Turntables · Sequencer · Vocal-Layer · Loop-Pads
            </p>
          </div>
          <div className="hidden text-right text-[10px] uppercase tracking-widest text-stage-foreground/50 lg:block">
            Tipp: Klicke unten rechts auf <span className="text-[var(--neon-cyan)]">✨</span> um weitere Module einzublenden
          </div>
        </div>
      </div>

      <TwinDeck tracks={tracks} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <SingAlongPanel />
        <FxPadGrid />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <StepSequencer />
        <CoachHud />
      </div>
    </div>
  );
}