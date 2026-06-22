import { useState } from "react";
import { Wand2, Loader2, Download, FileAudio } from "lucide-react";
import { toast } from "sonner";
import type { EngineTrack } from "@/lib/audio/engine";
import { trackProfileFromEngine } from "@/lib/intel/fromEngineTrack";
import { planMixSet, renderMixToWav, renderMixToMp3, type RenderProgress } from "@/lib/intel/autodj";
import { batchAnalyze, type BatchAnalyzeProgress } from "@/lib/intel/batchAnalyze";
import type { MixSet } from "@/lib/intel/types";
import { cn } from "@/lib/utils";

export function AiMixBuilder({ tracks }: { tracks: EngineTrack[] }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<BatchAnalyzeProgress | null>(null);
  const [mixSet, setMixSet] = useState<MixSet | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadKind, setDownloadKind] = useState<"wav" | "mp3">("wav");

  async function build(format: "wav" | "mp3") {
    if (tracks.length < 2) { toast.error("Mindestens 2 analysierte Tracks nötig."); return; }
    setBusy(true);
    setMixSet(null);
    setAnalyzeProgress(null);
    setDownloadUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setDownloadKind(format);
    try {
      // 1) Batch-analyze tracks that don't have BPM yet.
      const ready = await batchAnalyze(tracks.filter((t) => t.url), setAnalyzeProgress);
      setAnalyzeProgress(null);
      const profiles = ready
        .filter((t) => t.bpm)
        .map((t) => trackProfileFromEngine(t, { stemsAvailable: false }));
      if (profiles.length < 2) {
        toast.error("Konnte nicht genug Tracks analysieren.");
        setBusy(false); return;
      }
      const set = planMixSet(profiles);
      setMixSet(set);
      const blob = format === "mp3"
        ? await renderMixToMp3(set, { onProgress: setProgress })
        : await renderMixToWav(set, { onProgress: setProgress });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      toast.success(`${format.toUpperCase()} fertig · ${set.tracks.length} Tracks · Ø ${set.meanScore}/100`);
    } catch (e) {
      console.error(e);
      toast.error(`Render-Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="neon-surface rounded-2xl p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-[var(--neon-magenta)]" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/70">
            Offline Mix · WAV / MP3 Export
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => build("wav")}
            disabled={busy || tracks.length < 2}
            className={cn(
              "flex items-center gap-1 rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest",
              busy
                ? "border-white/10 text-stage-foreground/40"
                : "border-[var(--neon-magenta)] bg-[var(--neon-magenta)]/15 text-[var(--neon-magenta)] hover:bg-[var(--neon-magenta)]/25",
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "Render…" : "Mix · WAV"}
          </button>
          <button
            onClick={() => build("mp3")}
            disabled={busy || tracks.length < 2}
            className={cn(
              "flex items-center gap-1 rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest",
              busy
                ? "border-white/10 text-stage-foreground/40"
                : "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)] hover:bg-[var(--neon-amber)]/25",
            )}
          >
            <FileAudio className="h-3.5 w-3.5" />
            MP3
          </button>
          {downloadUrl && mixSet && (
            <a
              href={downloadUrl}
              download={`partypilot-mix-${Date.now()}.${downloadKind}`}
              className="flex items-center gap-1 rounded-md border border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/25"
            >
              <Download className="h-3.5 w-3.5" /> {downloadKind.toUpperCase()}
            </a>
          )}
        </div>
      </div>

      {analyzeProgress && (
        <div className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[9px] uppercase tracking-widest text-stage-foreground/70">
          <div className="flex items-center justify-between">
            <span className="truncate">Analyse {analyzeProgress.index + 1}/{analyzeProgress.total} · {analyzeProgress.title}</span>
            <span className="font-mono">{Math.round(analyzeProgress.pct)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[var(--neon-amber)]" style={{ width: `${analyzeProgress.pct}%` }} />
          </div>
        </div>
      )}

      {busy && progress && (
        <div className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[9px] uppercase tracking-widest text-stage-foreground/70">
          <div className="flex items-center justify-between">
            <span>{stageLabel(progress.stage)}{progress.trackIndex != null ? ` · Track ${progress.trackIndex + 1}` : ""}</span>
            <span className="font-mono">{Math.round(progress.pct)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[var(--neon-magenta)]" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {mixSet && (
        <div className="space-y-1.5 rounded-md border border-white/10 bg-black/40 p-2">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-stage-foreground/60">
            <span>Setlist · Ø {mixSet.meanScore}/100</span>
            <span>{mixSet.tracks.length} Tracks · {mixSet.plans.length} Transitions</span>
          </div>
          <ol className="space-y-0.5 text-[10px] text-stage-foreground/80">
            {mixSet.tracks.map((t, i) => {
              const next = mixSet.plans[i];
              const eng = tracks.find((x) => x.id === t.id);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-stage-foreground/40">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate">{eng?.title ?? t.id}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-stage-foreground/60">
                    {Math.round(t.bpm)} BPM · {t.camelot}
                  </span>
                  {next && (
                    <span className="rounded bg-[var(--neon-cyan)]/10 px-1.5 py-0.5 font-mono text-[9px] text-[var(--neon-cyan)]">
                      ↓ {next.type} · {next.bars}b · {next.qualityScore}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="text-[9px] text-stage-foreground/50">
        Dies ist der <b className="text-stage-foreground/80">Offline-Export</b>: die Library wird nach Mixability sortiert,
        jeder Übergang wird als deterministischer Plan gerendert und das komplette Set wird als Datei ausgegeben —
        ohne Live-Playback. Für die Party verwende oben den Party-Modus oder den Übergang im Mixer.
      </p>
    </div>
  );
}

function stageLabel(s: RenderProgress["stage"]): string {
  switch (s) {
    case "fetch": return "Lade Tracks";
    case "decode": return "Dekodiere";
    case "render": return "Rendere Mix";
    case "encode": return "Encodiere WAV";
  }
}