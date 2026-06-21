import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Trash2, Volume2, VolumeX, Plus } from "lucide-react";
import { loopsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loops")({
  head: () => ({ meta: [{ title: "Loop Creator — PartyPilot AI" }] }),
  component: Loops,
});

const LOOP_COLORS = [
  "from-rose-500 to-orange-400",
  "from-cyan-500 to-blue-400",
  "from-fuchsia-500 to-pink-400",
  "from-emerald-500 to-lime-400",
  "from-amber-500 to-yellow-400",
  "from-indigo-500 to-violet-400",
];

function Loops() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: loops = [] } = useQuery(loopsOptions());
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const path = `${user!.id}/loop-${Date.now()}.webm`;
        const { error } = await supabase.storage.from("recordings").upload(path, blob);
        if (error) {
          toast.error(error.message);
          return;
        }
        await supabase.from("loops").insert({
          owner_id: user!.id,
          name: `Loop ${loops.length + 1}`,
          storage_path: path,
          volume: 80,
          color: LOOP_COLORS[loops.length % LOOP_COLORS.length],
        });
        toast.success("Loop saved");
        qc.invalidateQueries({ queryKey: ["loops"] });
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopRec() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function setMuted(id: string, is_muted: boolean) {
    await supabase.from("loops").update({ is_muted }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["loops"] });
  }
  async function setVolume(id: string, volume: number) {
    await supabase.from("loops").update({ volume }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["loops"] });
  }
  async function remove(id: string) {
    await supabase.from("loops").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["loops"] });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Loop Creator"
        subtitle="Tap to record. Stack loops. Build a vibe from your own voice and room."
        action={
          <Button
            onClick={recording ? stopRec : startRec}
            className={cn(
              "h-11 shrink-0 rounded-full text-base shadow-stage",
              recording
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-accent text-accent-foreground hover:bg-accent/90",
            )}
          >
            {recording ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Record loop</>}
          </Button>
        }
      />

      {loops.length === 0 ? (
        <EmptyPads onRecord={startRec} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loops.map((l, i) => (
            <div key={l.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className={cn("aspect-[3/2] bg-gradient-to-br", l.color ?? LOOP_COLORS[i % LOOP_COLORS.length])}>
                <div className="grid h-full w-full place-items-center">
                  <button
                    onClick={() => setMuted(l.id, !l.is_muted)}
                    className={cn(
                      "grid h-16 w-16 place-items-center rounded-full border-4 border-white/60 backdrop-blur transition hover:scale-105",
                      l.is_muted ? "bg-black/30" : "bg-white/20",
                    )}
                  >
                    {l.is_muted ? <VolumeX className="h-7 w-7 text-white" /> : <Volume2 className="h-7 w-7 text-white" />}
                  </button>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-display text-base font-semibold">{l.name}</p>
                  <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Volume {l.volume}</p>
                  <Slider
                    value={[l.volume]}
                    min={0}
                    max={100}
                    onValueChange={(v) => setVolume(l.id, v[0] ?? 0)}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
        Coming in Phase 2: real-time loop layering, BPM-locked playback, AI percussion fills.
      </div>
    </div>
  );
}

function EmptyPads({ onRecord }: { onRecord: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {LOOP_COLORS.map((c, i) => (
        <button
          key={i}
          onClick={onRecord}
          className={cn(
            "group aspect-square rounded-2xl bg-gradient-to-br opacity-60 transition hover:opacity-100",
            c,
          )}
        >
          <div className="grid h-full w-full place-items-center">
            <Plus className="h-7 w-7 text-white drop-shadow" />
          </div>
        </button>
      ))}
    </div>
  );
}