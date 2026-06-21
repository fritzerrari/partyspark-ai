import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  Music2,
  Wand2,
  Mic,
  Radio,
  Gauge,
  Heart,
  PartyPopper,
  Play,
  Headphones,
  Zap,
  Cake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PartyPilot AI — Your AI Party DJ" },
      {
        name: "description",
        content:
          "Throw an unforgettable party in under two minutes. PartyPilot AI mixes, transitions and reads the room — so you don't have to.",
      },
      { property: "og:title", content: "PartyPilot AI — Your AI Party DJ" },
      {
        property: "og:description",
        content:
          "Throw an unforgettable party in under two minutes. PartyPilot AI mixes, transitions and reads the room.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen brand-gradient">
      <MarketingNav />
      <Hero />
      <LogoStrip />
      <Features />
      <ControlPreview />
      <HowItWorks />
      <CtaBand />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-16 md:pt-24">
      <div className="mx-auto max-w-3xl text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Your AI Party DJ — now in early access
        </span>
        <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
          Throw the best party
          <span className="block bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
            of their life.
          </span>
        </h1>
        <p className="mt-6 text-balance text-base text-muted-foreground sm:text-lg">
          Birthdays. Weddings. BBQs. PartyPilot reads the room, blends the songs,
          and keeps the dancefloor full — no DJ skills required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-full bg-accent px-7 text-base text-accent-foreground shadow-stage hover:bg-accent/90">
            <Link to="/auth">
              <PartyPopper className="mr-2 h-5 w-5" /> Start a party — it&apos;s free
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-border bg-card/60 px-6 text-base backdrop-blur hover:bg-card">
            <a href="#how">
              <Play className="mr-2 h-4 w-4" /> See how it works
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card. Set up your first party in under two minutes.
        </p>
      </div>
    </section>
  );
}

function LogoStrip() {
  const tags = [
    { icon: Cake, label: "Birthdays" },
    { icon: Heart, label: "Weddings" },
    { icon: PartyPopper, label: "House parties" },
    { icon: Headphones, label: "BBQs" },
    { icon: Radio, label: "Office parties" },
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-6">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="text-xs uppercase tracking-widest">Made for</span>
        {tags.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 backdrop-blur"
          >
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const items = [
    {
      icon: Wand2,
      title: "AI does the mixing",
      body: "Smart crossfades, energy curves, and mood transitions you'd pay a real DJ thousands for.",
    },
    {
      icon: Gauge,
      title: "Reads the room",
      body: "Energy meter and mood engine tune the next song to the moment — warm-up, peak, sing-along.",
    },
    {
      icon: Mic,
      title: "Karaoke + guest moments",
      body: "One-tap karaoke, voice messages, AI vocal effects. Guests become part of the show.",
    },
    {
      icon: Music2,
      title: "Your music + ours",
      body: "Upload your MP3s, build playlists, or grab a Sound Pool pack curated for the vibe.",
    },
    {
      icon: Zap,
      title: "Party Boost",
      body: "When energy dips, one big button takes the room from chatter to dancing.",
    },
    {
      icon: Sparkles,
      title: "Magical guest screen",
      body: "Share a link. Guests request songs, drop reactions, and grab the mic from their phones.",
    },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          A full DJ booth in your pocket.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Press one button. PartyPilot does the rest.
        </p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="group relative rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ControlPreview() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      <div className="relative overflow-hidden rounded-[2rem] stage-gradient p-6 shadow-stage sm:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="text-stage-foreground">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-stage-foreground/80 backdrop-blur">
              <Radio className="h-3.5 w-3.5" /> The Control Center
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold sm:text-4xl">
              A command deck for the dancefloor.
            </h2>
            <p className="mt-4 max-w-md text-stage-foreground/80">
              See what&apos;s playing, what&apos;s next, where the energy is,
              and how the night is unfolding — at a glance, on any phone.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Now Playing", "Up Next", "Energy Meter", "Mood", "Timeline", "Party Boost"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-stage-foreground/80 backdrop-blur"
                  >
                    {t}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* Mock control card */}
          <div className="relative">
            <div className="rounded-3xl border border-stage-border bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 animate-float rounded-2xl bg-gradient-to-br from-primary to-accent shadow-stage" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-widest text-stage-foreground/60">Now Playing</p>
                  <p className="truncate font-display text-lg font-semibold text-stage-foreground">
                    Dancing on Tables
                  </p>
                  <p className="truncate text-sm text-stage-foreground/70">The Late Bloomers</p>
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/3 animate-shimmer rounded-full" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <Stat label="Energy" value="78" accent />
                <Stat label="Mood" value="Peak" />
                <Stat label="Next" value="2:14" />
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2">
                {["⏮", "⏯", "⏭", "⚡"].map((g, i) => (
                  <button
                    key={i}
                    className={
                      i === 3
                        ? "rounded-2xl bg-accent py-3 text-accent-foreground shadow-stage"
                        : "rounded-2xl bg-white/10 py-3 text-stage-foreground hover:bg-white/15"
                    }
                  >
                    <span className="text-lg">{g}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 animate-pulse-ring rounded-full bg-primary/20 blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"rounded-2xl border border-stage-border bg-white/5 p-3"}>
      <p className="text-[10px] uppercase tracking-widest text-stage-foreground/60">{label}</p>
      <p className={"mt-1 font-display text-lg font-bold " + (accent ? "text-accent" : "text-stage-foreground")}>{value}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Tell us the vibe", body: "Event type, ages, music you love, how long it runs." },
    { n: "02", title: "AI builds the night", body: "A timeline of phases tuned to your crowd — warm-up to afterparty." },
    { n: "03", title: "Press play", body: "Smart crossfades, energy reads, guest interaction. Just enjoy." },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          From zero to dancefloor in 2 minutes.
        </h2>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-3xl border border-border bg-card p-6">
            <span className="font-display text-sm font-semibold text-primary">{s.n}</span>
            <h3 className="mt-2 font-display text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-primary/80 p-10 text-center text-primary-foreground shadow-stage sm:p-16">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          Your next party deserves better than a Spotify playlist.
        </h2>
        <p className="mt-3 text-primary-foreground/90">It&apos;s free to start. No credit card.</p>
        <Button asChild size="lg" className="mt-7 h-12 rounded-full bg-accent px-7 text-base text-accent-foreground hover:bg-accent/90">
          <Link to="/auth">Start a party</Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-foreground">PartyPilot AI</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <a href="mailto:hello@partypilot.ai" className="hover:text-foreground">Contact</a>
        </div>
      </div>
    </footer>
  );
}
