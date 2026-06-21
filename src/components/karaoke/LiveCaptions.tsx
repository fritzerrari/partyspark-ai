import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Live captions: records 5-second snippets in a rolling loop while active,
 * sends each to /api/transcribe (SSE), appends deltas to the on-screen line.
 */
export function LiveCaptions({ active }: { active: boolean }) {
  const [text, setText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimer = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!active || !enabled) return;
    stoppedRef.current = false;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";

        const recordChunk = () => {
          if (stoppedRef.current || !streamRef.current) return;
          const chunks: Blob[] = [];
          const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
          recorderRef.current = mr;
          mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
          mr.onstop = async () => {
            const blob = new Blob(chunks, { type: mime });
            if (blob.size > 1024) transcribe(blob);
            if (!stoppedRef.current) recordChunk();
          };
          mr.start();
          loopTimer.current = window.setTimeout(() => mr.state === "recording" && mr.stop(), 5000);
        };
        recordChunk();
      } catch {
        setText("(Mikrofon nicht verfügbar)");
      }
    }

    async function transcribe(blob: Blob) {
      try {
        const fd = new FormData();
        fd.append("file", blob, "clip.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok || !res.body) return;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.type === "transcript.text.delta" && ev.delta) {
                setText((prev) => (prev + ev.delta).slice(-220));
              } else if (ev.type === "transcript.text.done" && ev.text) {
                setText((prev) => (prev + " " + ev.text).slice(-220));
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    start();
    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (loopTimer.current) clearTimeout(loopTimer.current);
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, enabled]);

  if (!active) return null;
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live-Untertitel</span>
        <Button size="sm" variant="ghost" onClick={() => setEnabled((v) => !v)}>
          {enabled ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
        </Button>
      </div>
      <p className="min-h-[2.5rem] font-display text-lg leading-snug">
        {enabled ? (text || "…") : "deaktiviert"}
      </p>
    </div>
  );
}