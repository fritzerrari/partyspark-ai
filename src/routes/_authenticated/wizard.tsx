import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  PenLine,
  Mic,
  Wand2,
  Music4,
  AudioWaveform,
  Users,
  Combine,
  Trophy,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wizard")({
  head: () => ({
    meta: [
      { title: "Studio-Wizard — von der Idee zum fertigen Track" },
      {
        name: "description",
        content:
          "Der geführte Flow: Lyrics schreiben, einsingen, veredeln, mixen und ins Battle schicken — alle AI-Tools in einer Reise.",
      },
    ],
  }),
  component: WizardRoute,
});

type Step = {
  id: number;
  title: string;
  body: string;
  icon: typeof Mic;
  to: "/lyric-writer" | "/karaoke" | "/autotune" | "/choir" | "/sound-designer" | "/crowd" | "/remix" | "/battle";
  cta: string;
  optional?: boolean;
};

const STEPS: Step[] = [
  {
    id: 1,
    title: "Songtext schreiben",
    body: "Lass die KI Verse, Chorus & Bridge zu deinem Thema texten — oder bring deinen eigenen Text mit.",
    icon: PenLine,
    to: "/lyric-writer",
    cta: "Zum Lyric-Writer",
    optional: true,
  },
  {
    id: 2,
    title: "Einsingen",
    body: "Karaoke-Modus mit Live-Captions, Pitch-Coach und sofortiger Bewertung. Mehrere Tonspuren möglich.",
    icon: Mic,
    to: "/karaoke",
    cta: "Aufnahme starten",
  },
  {
    id: 3,
    title: "Tonart korrigieren (Autotune)",
    body: "Die Aufnahme auf eine Skala/Tonart einrasten — natürlich oder hart wie ein Hit.",
    icon: Wand2,
    to: "/autotune",
    cta: "Autotune anwenden",
    optional: true,
  },
  {
    id: 4,
    title: "Chor & Doubles",
    body: "Mach aus deiner Stimme einen bis zu 50-köpfigen Chor mit Detune, Timing und Hall.",
    icon: Music4,
    to: "/choir",
    cta: "Choir bauen",
    optional: true,
  },
  {
    id: 5,
    title: "Sound-FX & Crowd",
    body: "Eigene KI-Sounds entwerfen und Jubel/Lacher/Applaus zwischen die Phrasen legen.",
    icon: AudioWaveform,
    to: "/sound-designer",
    cta: "FX designen",
    optional: true,
  },
  {
    id: 6,
    title: "Crowd-Reactions",
    body: "Wähle die richtige Stimmung — die KI baut Beds aus Noise + TTS-Bursts.",
    icon: Users,
    to: "/crowd",
    cta: "Crowd öffnen",
    optional: true,
  },
  {
    id: 7,
    title: "Remix oder Mashup",
    body: "90-Sek-Dance-Edit aus deinem Take oder Tempo-synchroner Mix mit einer zweiten Stimme.",
    icon: Combine,
    to: "/remix",
    cta: "Zum Remix",
    optional: true,
  },
  {
    id: 8,
    title: "Veröffentlichen & battlen",
    body: "Score checken, Leaderboard erklimmen und zum Duell herausfordern.",
    icon: Trophy,
    to: "/battle",
    cta: "Ins Battle",
  },
];

const STORAGE_KEY = "wizard:done";

function loadDone(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function WizardRoute() {
  const [done, setDone] = useState<number[]>(loadDone);

  const toggle = (id: number) => {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const reset = () => {
    setDone([]);
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  };

  const requiredDone = STEPS.filter((s) => !s.optional && done.includes(s.id)).length;
  const requiredTotal = STEPS.filter((s) => !s.optional).length;
  const progress = Math.round((done.length / STEPS.length) * 100);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Studio-Wizard"
        subtitle="Der komplette PartyPilot-Flow in 8 Schritten — du entscheidest, was optional bleibt."
        action={
          done.length > 0 ? (
            <Button variant="ghost" onClick={reset} size="sm">
              Fortschritt zurücksetzen
            </Button>
          ) : null
        }
      />

      <div className="rounded-3xl border border-border bg-card/80 p-5 backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {done.length} / {STEPS.length} Schritte · Pflicht: {requiredDone}/{requiredTotal}
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map(({ id, title, body, icon: Icon, to, cta, optional }, idx) => {
          const isDone = done.includes(id);
          const isNext = !isDone && done.length === idx;
          return (
            <li
              key={id}
              className={cn(
                "relative overflow-hidden rounded-3xl border bg-card p-5 transition",
                isDone ? "border-primary/60" : isNext ? "border-accent shadow-stage" : "border-border",
              )}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={isDone ? `Schritt ${id} als offen markieren` : `Schritt ${id} als erledigt markieren`}
                  className="shrink-0"
                >
                  {isDone ? (
                    <CheckCircle2 className="h-7 w-7 text-primary" />
                  ) : (
                    <Circle className="h-7 w-7 text-muted-foreground" />
                  )}
                </button>

                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Schritt {id}
                    </span>
                    {optional && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        optional
                      </span>
                    )}
                    {isNext && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Als Nächstes
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>

                <Button asChild className="shrink-0 rounded-full" variant={isNext ? "default" : "secondary"}>
                  <Link to={to}>
                    {cta} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-3xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-accent" /> Tipp
        </p>
        <p className="mt-1">
          Du kannst jeden Schritt überspringen — alle Tools sind auch einzeln in der Sidebar erreichbar. Der Wizard merkt
          sich deinen Fortschritt lokal in diesem Browser.
        </p>
      </div>
    </div>
  );
}