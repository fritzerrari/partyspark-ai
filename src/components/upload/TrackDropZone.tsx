import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Music2, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { uploadTracks, isAudioFile, type UploadProgress } from "@/lib/upload/uploadTracks";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Global drag-and-drop overlay. Drop MP3/WAV/etc anywhere on the page to
 * upload them straight into the user's track library.
 */
export function TrackDropZone({ onUploaded }: { onUploaded?: (count: number) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    function hasFiles(e: DragEvent) {
      return Array.from(e.dataTransfer?.types ?? []).includes("Files");
    }
    function onEnter(e: DragEvent) {
      if (!user || !hasFiles(e)) return;
      counter.current++;
      setDragging(true);
    }
    function onOver(e: DragEvent) {
      if (!user || !hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function onLeave() {
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setDragging(false);
    }
    async function onDrop(e: DragEvent) {
      if (!user) return;
      counter.current = 0;
      setDragging(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const all = Array.from(e.dataTransfer.files);
      const audio = all.filter(isAudioFile);
      const rejected = all.length - audio.length;
      if (rejected > 0) toast.error(`${rejected} Datei(en) übersprungen (nur Audio).`);
      if (!audio.length) return;
      setBusy(true);
      try {
        const n = await uploadTracks(audio, user.id, (p) => setProgress(p));
        toast.success(`${n} Track${n === 1 ? "" : "s"} hinzugefügt`);
        qc.invalidateQueries({ queryKey: ["tracks"] });
        onUploaded?.(n);
      } finally {
        setBusy(false);
        setProgress(null);
      }
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [user, qc, onUploaded]);

  const pct = progress ? Math.round(((progress.index + (progress.phase === "done" ? 1 : 0.5)) / progress.total) * 100) : 0;

  if (!dragging && !busy) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-fade-in">
      <div className="pointer-events-auto relative w-[min(560px,92vw)] overflow-hidden rounded-3xl border-2 border-dashed border-[var(--neon-cyan,#22d3ee)] bg-card/95 p-8 text-center shadow-2xl">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.35),transparent_60%)]" />
        {busy ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--neon-cyan,#22d3ee)]" />
            <h3 className="mt-4 text-xl font-bold">Lade Tracks hoch…</h3>
            <p className="mt-2 truncate text-sm text-muted-foreground">{progress?.file}</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              {progress?.phase === "upload" && <><Upload className="h-3 w-3" /> Upload</>}
              {progress?.phase === "analyze" && <><Music2 className="h-3 w-3" /> Analyse (BPM, Key)</>}
              {progress?.phase === "save" && <><CheckCircle2 className="h-3 w-3" /> Speichern</>}
              {progress?.phase === "error" && <><AlertCircle className="h-3 w-3 text-red-400" /> Fehler</>}
              <span>· {(progress?.index ?? 0) + 1}/{progress?.total ?? 0}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-[var(--neon-cyan,#22d3ee)] to-[var(--neon-pink,#ec4899)] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload className="mx-auto h-12 w-12 animate-bounce text-[var(--neon-cyan,#22d3ee)]" />
            <h3 className="mt-4 text-2xl font-bold">Drop it like it's hot 🔥</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              MP3, WAV, FLAC, M4A … Tracks landen direkt in deiner Library und werden automatisch analysiert.
            </p>
          </>
        )}
      </div>
    </div>
  );
}