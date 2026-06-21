import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Play, Trash2, Wand2 } from "lucide-react";
import { recordingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { VocalChainPanel } from "@/components/karaoke/VocalChainPanel";
import { IntroPicker } from "@/components/karaoke/IntroPicker";
import { PostProcessSheet } from "@/components/karaoke/PostProcessSheet";
import { VocalChain, DEFAULT_VOCAL_CHAIN, type VocalChainSettings } from "@/lib/audio/vocalChain";
import { runIntro, type IntroConfig } from "@/lib/audio/intro";

export const Route = createFileRoute("/_authenticated/karaoke")({
  head: () => ({ meta: [{ title: "Karaoke — PartyPilot AI" }] }),
  component: Karaoke,
});

function Karaoke() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: recs = [] } = useQuery(recordingsOptions());
  const [recording, setRecording] = useState(false);
  const [introCountdown, setIntroCountdown] = useState<string | null>(null);
  const [chain, setChain] = useState<VocalChainSettings>(DEFAULT_VOCAL_CHAIN);
  const [intro, setIntro] = useState<IntroConfig>({ kind: "countdown", voice: "alloy" });
  const [selectedRec, setSelectedRec] = useState<null | { id: string; storage_path: string; title: string | null; kind: string }>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const chainRef = useRef<VocalChain | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  // Live-apply chain settings to the running graph
  useEffect(() => {
    if (chainRef.current) {
      chainRef.current.apply(chain);
      chainRef.current.setReverbPreset(chain.reverbPreset);
    }
  }, [chain]);

  async function start() {
    try {
      // Run intro first
      if (intro.kind !== "none") {
        setIntroCountdown(intro.kind === "countdown" ? "3" : "…");
        if (intro.kind === "countdown") {
          let n = 3;
          const tick = setInterval(() => { n--; setIntroCountdown(n > 0 ? String(n) : "GO"); if (n <= 0) clearInterval(tick); }, 1000);
        }
        try { await runIntro(intro); } catch (e) { console.error(e); }
        setIntroCountdown(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const vc = new VocalChain(ctx, stream);
      vc.setReverbPreset(chain.reverbPreset);
      vc.apply(chain);
      chainRef.current = vc;
      const mr = new MediaRecorder(vc.recordDest.stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        chainRef.current?.dispose();
        chainRef.current = null;
        ctxRef.current?.close();
        ctxRef.current = null;
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
          {introCountdown && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-stage/80 backdrop-blur">
              <div className="font-display text-9xl font-bold text-accent animate-pulse">{introCountdown}</div>
            </div>
          )}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <IntroPicker value={intro} onChange={setIntro} />
        <VocalChainPanel settings={chain} onChange={setChain} />
      </div>

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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => play(r.storage_path)} className="rounded-full bg-primary text-primary-foreground">
                    <Play className="mr-2 h-4 w-4" /> Play
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setSelectedRec(r)} className="rounded-full">
                    <Wand2 className="mr-2 h-4 w-4" /> FX
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

      <PostProcessSheet recording={selectedRec} onClose={() => setSelectedRec(null)} />
    </div>
  );
}