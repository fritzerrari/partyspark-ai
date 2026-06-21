import { createFileRoute } from "@tanstack/react-router";
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

const FEATURES = [
  { icon: Mic, title: "AI Autotune", body: "Soft to studio-tight vocal correction, per voice." },
  { icon: Wand2, title: "AI Remix", body: "Stretch any song into a 90-second dance edit." },
  { icon: Combine, title: "AI Mashups", body: "Blend two tracks that shouldn't work — and do." },
  { icon: Bot, title: "AI Party Host", body: "A friendly voice that hypes the crowd between songs." },
  { icon: Music4, title: "AI Choir", body: "Turn one voice into a 50-person sing-along." },
  { icon: Mic, title: "AI Vocal Producer", body: "Reverb, doubles, formant shifts — all hands-free." },
  { icon: AudioWaveform, title: "AI Sound Designer", body: "Tailored FX for the exact second they're needed." },
  { icon: Users, title: "AI Crowd Reactions", body: "Roars, gasps, claps reacting to the room." },
  { icon: CalendarHeart, title: "AI Party Moments", body: "Auto-capture the unrepeatable bits as keepsakes." },
];

function AILab() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="AI Lab"
        subtitle="The next wave of PartyPilot. Drop your name in and we'll ping you when it lands."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="absolute right-4 top-4 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
              Coming soon
            </span>
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.success(`We'll let you know when ${title} is ready ✨`)}
              className="mt-4 rounded-full text-primary hover:bg-primary-soft"
            >
              <Bell className="mr-2 h-4 w-4" /> Notify me
            </Button>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
        <Sparkles className="mr-2 inline h-4 w-4 text-primary" /> Pro subscribers get early-access drops every two weeks.
      </div>
    </div>
  );
}