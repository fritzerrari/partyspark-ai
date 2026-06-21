import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Layers, ShoppingBag, Sparkles } from "lucide-react";
import { soundpacksOptions } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/soundpool")({
  head: () => ({ meta: [{ title: "Sound Pool — PartyPilot AI" }] }),
  component: SoundPool,
});

const COLORS = [
  "from-rose-400 to-orange-300",
  "from-sky-400 to-cyan-300",
  "from-violet-400 to-fuchsia-300",
  "from-emerald-400 to-lime-300",
  "from-amber-400 to-yellow-300",
  "from-pink-400 to-rose-300",
  "from-indigo-400 to-blue-300",
  "from-teal-400 to-emerald-300",
  "from-purple-400 to-pink-300",
  "from-cyan-400 to-sky-300",
  "from-yellow-400 to-amber-300",
  "from-fuchsia-400 to-purple-300",
];

function SoundPool() {
  const { data: packs = [] } = useQuery(soundpacksOptions());
  const categories = Array.from(new Set(packs.map((p) => p.category)));

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Sound Pool"
        subtitle="Curated packs to drop into any party — drums, vocals, FX and full genres."
      />
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <span key={c} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
            <Layers className="mr-1 inline h-3 w-3 text-primary" /> {c}
          </span>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((p, i) => (
          <div key={p.id} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={"aspect-[4/3] bg-gradient-to-br " + COLORS[i % COLORS.length]}>
              <div className="flex h-full w-full items-end p-4">
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white backdrop-blur">
                  {p.category}
                </span>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.track_count} sounds</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-1 text-xs font-semibold text-accent">
                  ${(p.price_cents / 100).toFixed(0)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              <Button
                size="sm"
                onClick={() => toast.info("Sound Pool purchases launch with our Pro plan.")}
                className="mt-3 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ShoppingBag className="mr-2 h-4 w-4" /> Add to library
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
        <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
        More packs ship every week. Got a request? <a className="font-medium text-primary hover:underline" href="mailto:hello@partypilot.ai">Tell us</a>.
      </div>
    </div>
  );
}