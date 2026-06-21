import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — PartyPilot AI" },
      {
        name: "description",
        content:
          "Free for casual parties. Paid plans for weddings and big nights. Cancel any time.",
      },
      { property: "og:title", content: "Pricing — PartyPilot AI" },
      {
        property: "og:description",
        content: "Free for casual parties. Paid plans for weddings and big nights.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      tagline: "For the everyday party.",
      features: ["1 active party", "Up to 3 hours", "AI auto-mix", "Guest screen"],
      cta: "Start free",
      highlight: false,
    },
    {
      name: "Host",
      price: "$9",
      per: "/month",
      tagline: "For people who throw real parties.",
      features: [
        "Unlimited parties",
        "Full-night timelines",
        "Karaoke + voice moments",
        "Sound Pool starter packs",
        "Email reminders",
      ],
      cta: "Go Host",
      highlight: true,
    },
    {
      name: "Pro",
      price: "$24",
      per: "/month",
      tagline: "Weddings, big events, communities.",
      features: [
        "Everything in Host",
        "Loop Creator pro",
        "AI Autotune + Harmonies (preview)",
        "Private artwork uploads",
        "Priority support",
      ],
      cta: "Go Pro",
      highlight: false,
    },
  ];
  return (
    <div className="min-h-screen brand-gradient">
      <MarketingNav />
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Simple, party-friendly pricing.</h1>
          <p className="mt-3 text-muted-foreground">Start free. Upgrade when the night gets big.</p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                "relative rounded-3xl border bg-card p-7 shadow-sm " +
                (t.highlight
                  ? "border-primary/50 ring-2 ring-primary/20"
                  : "border-border")
              }
            >
              {t.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  Most popular
                </span>
              )}
              <h2 className="font-display text-xl font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <p className="mt-5 font-display text-4xl font-bold">
                {t.price}
                <span className="text-base font-medium text-muted-foreground">{t.per ?? ""}</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={
                  "mt-7 h-11 w-full rounded-full " +
                  (t.highlight
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-foreground text-background hover:bg-foreground/90")
                }
              >
                <Link to="/auth">
                  <PartyPopper className="mr-2 h-4 w-4" /> {t.cta}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}