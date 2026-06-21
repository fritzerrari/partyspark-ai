import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  Mic,
  Wand2,
  Combine,
  Bot,
  Music4,
  AudioWaveform,
  Users,
  CalendarHeart,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ai-lab")({
  head: () => ({ meta: [{ title: "AI Lab — PartyPilot AI" }] }),
  component: AILab,
});

type Feature = { icon: typeof Mic; title: string; body: string; to?: "/party-host" | "/moments" | "/autotune" };
const FEATURES: Feature[] = [
  { icon: Bot, title: "AI Party Host", body: "Gemini schreibt die Ansage, eine KI-Stimme spricht sie zwischen deinen Tracks.", to: "/party-host" },
  { icon: CalendarHeart, title: "AI Party Moments", body: "Findet automatisch die besten Momente aus deinen Aufnahmen.", to: "/moments" },
  { icon: Mic, title: "Autotune", body: "Live-Tuner zum Einsingen + Tonart-Korrektur für deine Aufnahmen.", to: "/autotune" },
  { icon: Wand2, title: "AI Remix", body: "Songs in 90-Sekunden-Dance-Edits stretchen. Audio-Modell pending." },
  { icon: Combine, title: "AI Mashups", body: "Zwei Tracks blenden, die nicht zusammenpassen — aber funktionieren." },
  { icon: Music4, title: "AI Choir", body: "Aus einer Stimme einen 50-köpfigen Chor machen." },
  { icon: Mic, title: "AI Vocal Producer", body: "Reverb, Doubles, Formant-Shifts hands-free." },
  { icon: AudioWaveform, title: "AI Sound Designer", body: "Maßgeschneiderte FX für die exakte Sekunde." },
  { icon: Users, title: "AI Crowd Reactions", body: "Jubel, Lacher, Applaus passend zum Raum." },
];

function AILab() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="AI Lab"
        subtitle="The next wave of PartyPilot. Drop your name in and we'll ping you when it lands."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body, to }) => (
          <div
            key={title}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {to ? (
              <span className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                Live
              </span>
            ) : (
              <span className="absolute right-4 top-4 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
                Coming soon
              </span>
            )}
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            {to ? (
              <Button asChild size="sm" className="mt-4 rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to={to}><Sparkles className="mr-2 h-4 w-4" /> Öffnen</Link>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast.success(`Wir sagen Bescheid, sobald ${title} live ist ✨`)}
                className="mt-4 rounded-full text-primary hover:bg-primary-soft"
              >
                <Bell className="mr-2 h-4 w-4" /> Notify me
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
        <Sparkles className="mr-2 inline h-4 w-4 text-primary" /> Pro subscribers get early-access drops every two weeks.
      </div>
    </div>
  );
}