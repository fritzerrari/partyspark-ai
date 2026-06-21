import { useState } from "react";
import { Flame, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { generateRoastToast } from "@/lib/ai/roast.functions";

export function RoastToastButton({ title, score, mode }: { title?: string | null; score?: number | null; mode: "roast" | "toast" }) {
  const fn = useServerFn(generateRoastToast);
  const [busy, setBusy] = useState(false);

  async function run() {
    try {
      setBusy(true);
      const res = await fn({ data: { title: title ?? undefined, score: score ?? undefined, mode, language: "de", voice: mode === "roast" ? "ash" : "coral" } });
      toast(mode === "roast" ? "🔥 Roast" : "🥂 Toast", { description: res.text });
      if (res.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
        audio.play().catch(() => { /* */ });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={run} disabled={busy} className="rounded-full">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "roast" ? <Flame className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
    </Button>
  );
}