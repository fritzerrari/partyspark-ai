import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Loader2, Play, Sparkles, Trash2, Volume2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateHypeLine, listHostLines, deleteHostLine } from "@/lib/ai/partyHost.functions";

export const Route = createFileRoute("/_authenticated/party-host")({
  head: () => ({ meta: [{ title: "AI Party Host — PartyPilot AI" }] }),
  component: PartyHost,
});

type Vibe = "hype" | "smooth" | "funny" | "romantic" | "crowd-surf";
type Lang = "de" | "en";
type Voice = "alloy" | "verse" | "coral" | "ash" | "sage" | "shimmer" | "ballad" | "echo";

const VIBES: { value: Vibe; label: string }[] = [
  { value: "hype", label: "🔥 Hype" },
  { value: "smooth", label: "🎧 Smooth" },
  { value: "funny", label: "😄 Funny" },
  { value: "romantic", label: "💞 Romantic" },
  { value: "crowd-surf", label: "🌊 Crowd-Surf" },
];
const VOICES: Voice[] = ["alloy", "verse", "coral", "ash", "sage", "shimmer", "ballad", "echo"];

function PartyHost() {
  const qc = useQueryClient();
  const gen = useServerFn(generateHypeLine);
  const list = useServerFn(listHostLines);
  const del = useServerFn(deleteHostLine);

  const [vibe, setVibe] = useState<Vibe>("hype");
  const [language, setLanguage] = useState<Lang>("de");
  const [voice, setVoice] = useState<Voice>("alloy");
  const [context, setContext] = useState("");
  const [lastTrack, setLastTrack] = useState("");
  const [nextTrack, setNextTrack] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [playing, setPlaying] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["host-lines"],
    queryFn: () => list(),
  });

  const m = useMutation({
    mutationFn: () => gen({ data: { vibe, language, context: context || undefined, lastTrack: lastTrack || undefined, nextTrack: nextTrack || undefined } }),
    onSuccess: async (res) => {
      setCurrentText(res.text);
      qc.invalidateQueries({ queryKey: ["host-lines"] });
      await speak(res.text);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function speak(text: string) {
    if (!text.trim()) return;
    setPlaying(true);
    try {
      const res = await fetch("/api/ai/party-host-speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        toast.error(`TTS Fehler: ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Playback fehler");
      setPlaying(false);
    }
  }

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-lines"] }),
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="AI Party Host"
        subtitle="Gemini schreibt die Ansage, eine KI-Stimme spricht sie zwischen deinen Tracks."
      />

      <section className="rounded-3xl border border-border bg-card p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Vibe</Label>
            <Select value={vibe} onValueChange={(v) => setVibe(v as Vibe)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VIBES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sprache</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Lang)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stimme</Label>
            <Select value={voice} onValueChange={(v) => setVoice(v as Voice)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VOICES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Letzter Track</Label>
            <Input className="mt-1" placeholder="z.B. Levitating – Dua Lipa" value={lastTrack} onChange={(e) => setLastTrack(e.target.value)} />
          </div>
          <div>
            <Label>Nächster Track</Label>
            <Input className="mt-1" placeholder="z.B. One More Time – Daft Punk" value={nextTrack} onChange={(e) => setNextTrack(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Kontext (optional)</Label>
          <Input className="mt-1" placeholder="z.B. Sarahs 30. Geburtstag, gleich kommt die Torte" value={context} onChange={(e) => setContext(e.target.value)} />
        </div>

        <Button
          onClick={() => m.mutate()}
          disabled={m.isPending || playing}
          className="h-12 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {m.isPending ? "Schreibe & spreche…" : playing ? "Spielt ab…" : "Ansage generieren & sprechen"}
        </Button>

        {currentText && (
          <div className="rounded-2xl border border-dashed border-primary/40 bg-primary-soft/40 p-4">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="flex-1 text-base font-medium">{currentText}</p>
              <Button size="sm" variant="ghost" onClick={() => speak(currentText)} disabled={playing}>
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Volume2 className="h-4 w-4" /> Verlauf
        </h2>
        <p className="text-sm text-muted-foreground">Deine letzten 20 Ansagen.</p>
        <ul className="mt-4 space-y-2">
          {(history ?? []).map((line) => (
            <li key={line.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider w-16 shrink-0">{line.vibe}</span>
              <p className="flex-1 text-sm">{line.text}</p>
              <Button size="icon" variant="ghost" onClick={() => speak(line.text)} disabled={playing}>
                <Play className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => delM.mutate(line.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {(!history || history.length === 0) && (
            <li className="py-6 text-center text-sm text-muted-foreground">Noch keine Ansagen — generiere die erste oben.</li>
          )}
        </ul>
      </section>
    </div>
  );
}