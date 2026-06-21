import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Sparkles, Play, Trash2 } from "lucide-react";
import { recordingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/karaoke")({
  head: () => ({ meta: [{ title: "Karaoke — PartyPilot AI" }] }),
  component: Karaoke,
});

function Karaoke() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: recs = [] } = useQuery(recordingsOptions());
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const path = `${user!.id}/kara-${Date.now()}.webm`;
        const { error } = await supabase.storage.from("recordings").upload(path, blob);
        if (error) {
          toast.error(error.message);
          return;
        }
        await supabase.from("recordings").insert({
          owner_id: user!.id,
          storage_path: path,
          kind: "karaoke",
          title: `Karaoke ${recs.length + 1}`,
        });
        toast.success("Saved! 🎤");
        qc.invalidateQueries({ queryKey: ["recordings"] });
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function play(path: string) {
    const { data } = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) new Audio(data.signedUrl).play();
  }

  async function remove(id: string) {
    await supabase.from("recordings").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["recordings"] });
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title="Karaoke Mode"
        subtitle="Hand the phone around. Capture the moment."
      />

      <section className="relative overflow-hidden rounded-3xl stage-gradient p-10 text-stage-foreground shadow-stage">
        <div className="flex flex-col items-center text-center">
          <button
            onClick={recording ? stop : start}
            className={
              "relative grid h-44 w-44 place-items-center rounded-full shadow-stage transition hover:scale-105 " +
              (recording
                ? "bg-destructive text-destructive-foreground"
                : "bg-accent text-accent-foreground")
            }
          >
            {!recording && <span className="absolute inset-0 animate-pulse-ring rounded-full" />}
            {recording ? <Square className="h-14 w-14" /> : <Mic className="h-16 w-16" />}
          </button>
          <p className="mt-6 font-display text-2xl font-bold">
            {recording ? "Listening…" : "Tap to record"}
          </p>
          <p className="mt-1 text-stage-foreground/70">
            {recording ? "Sing it loud." : "Vocals, wishes, weird noises — all welcome."}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Tonight's moments</h2>
        {recs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No recordings yet. The first one is always the funniest.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="truncate font-display text-base font-semibold">{r.title ?? r.kind}</p>
                <p className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground">{r.kind}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => play(r.storage_path)} className="rounded-full bg-primary text-primary-foreground">
                    <Play className="mr-2 h-4 w-4" /> Play
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-semibold">
          <Sparkles className="mr-2 inline h-4 w-4 text-primary" /> Coming soon
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">AI Autotune · AI Harmonies · AI Choir · Vocal FX</p>
      </section>
    </div>
  );
}