import { useRef, useState } from "react";
import { Music, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { identifySong } from "@/lib/ai/songId.functions";

export function SongIdentifier() {
  const fn = useServerFn(identifySong);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string; artist: string; year: string; genre: string; confidence: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function listen() {
    try {
      setBusy(true);
      setResult(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        const audioBase64 = btoa(bin);
        try {
          const res = await fn({ data: { audioBase64, format: mime.includes("mp4") ? "mp4" : "webm" } });
          setResult(res.result);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      setTimeout(() => mr.state === "recording" && mr.stop(), 8000);
    } catch {
      toast.error("Mikrofon nicht verfügbar");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">KI Song-Identifier</span>
        <Button size="sm" onClick={listen} disabled={busy} className="rounded-full">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
          {busy ? "Hört zu (8s)…" : "Erkenne Song"}
        </Button>
      </div>
      {result ? (
        <div className="space-y-1 text-sm">
          <p className="font-display text-lg font-bold">{result.title}</p>
          <p className="text-muted-foreground">{result.artist} {result.year && `· ${result.year}`}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{result.genre} · Confidence: {result.confidence}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Tippe & lass die KI lauschen — sie rät Titel, Artist und Genre.</p>
      )}
    </div>
  );
}