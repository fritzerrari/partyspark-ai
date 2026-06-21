import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wand2, Loader2, Copy, Volume2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { writeLyrics } from "@/lib/ai/lyrics.functions";
import { speakDuetLine } from "@/lib/ai/duet.functions";

export const Route = createFileRoute("/_authenticated/lyric-writer")({
  head: () => ({ meta: [{ title: "KI-Lyric-Writer — PartyPilot" }] }),
  component: LyricWriter,
});

function LyricWriter() {
  const write = useServerFn(writeLyrics);
  const sing = useServerFn(speakDuetLine);
  const [topic, setTopic] = useState("Sommernacht am See mit besten Freunden");
  const [style, setStyle] = useState("Pop / Disco");
  const [artist, setArtist] = useState("");
  const [mood, setMood] = useState<"party" | "love" | "sad" | "funny" | "epic" | "chill">("party");
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  const [singing, setSinging] = useState(false);

  async function generate() {
    try {
      setBusy(true);
      const r = await write({ data: { topic, style: style || undefined, artistVibe: artist || undefined, mood, language: "de", structure: "verse-chorus-bridge" } });
      setLyrics(r.lyrics);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function singChorus() {
    const chorus = lyrics.split(/\[CHORUS\]/i)[1]?.split(/\[/)[0]?.trim();
    if (!chorus) { toast.error("Kein [CHORUS] gefunden"); return; }
    try {
      setSinging(true);
      const r = await sing({ data: { line: chorus.slice(0, 380), voice: "ballad" } });
      const audio = new Audio(`data:audio/mp3;base64,${r.audioBase64}`);
      await audio.play();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSinging(false); }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="KI-Lyric-Writer" subtitle="Beschreibe das Thema, wähle Vibe — die KI schreibt euren Karaoke-Song." />

      <div className="grid gap-3 rounded-3xl border border-border bg-card p-5 lg:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Thema / Anlass</span>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Stil</span>
            <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Pop, Rock, Schlager…" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Artist-Vibe</span>
            <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="z.B. Helene Fischer" />
          </label>
          <label className="col-span-2 space-y-1 text-sm">
            <span className="text-muted-foreground">Mood</span>
            <div className="flex flex-wrap gap-2">
              {(["party", "love", "sad", "funny", "epic", "chill"] as const).map((m) => (
                <button key={m} onClick={() => setMood(m)}
                  className={"rounded-full px-3 py-1 text-xs uppercase tracking-widest " + (mood === m ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {m}
                </button>
              ))}
            </div>
          </label>
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <Button onClick={generate} disabled={busy} className="rounded-full bg-primary text-primary-foreground">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {busy ? "Schreibt…" : "Lyrics generieren"}
          </Button>
        </div>
      </div>

      {lyrics && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Euer Song</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(lyrics); toast.success("Kopiert"); }}>
                <Copy className="mr-2 h-4 w-4" /> Kopieren
              </Button>
              <Button size="sm" onClick={singChorus} disabled={singing} className="rounded-full bg-accent text-accent-foreground">
                {singing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
                Refrain anhören (KI-Duett)
              </Button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-display text-base leading-relaxed">{lyrics}</pre>
        </div>
      )}
    </div>
  );
}