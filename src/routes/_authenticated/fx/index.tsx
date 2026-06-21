import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Upload, Play, Star, Search, Sparkles, Clock, Trophy, User2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  communityFxOptions,
  fxRankingsOptions,
  type FxTab,
} from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { previewFx } from "@/lib/audio/fxPlayer";
import { FX_CATEGORIES } from "@/lib/fx/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fx/")({
  head: () => ({ meta: [{ title: "Community FX — PartyPilot AI" }] }),
  component: FxLibrary,
});

const TABS: { id: FxTab; label: string; icon: typeof Sparkles }[] = [
  { id: "trending", label: "Trending", icon: Sparkles },
  { id: "top", label: "Top", icon: Trophy },
  { id: "new", label: "New", icon: Clock },
  { id: "mine", label: "Mine", icon: User2 },
];

function FxLibrary() {
  const { user } = useAuth();
  const [tab, setTab] = useState<FxTab>("trending");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const { data: fx = [], isLoading } = useQuery(communityFxOptions(tab, user?.id));
  const { data: rankings = [] } = useQuery(fxRankingsOptions());

  const rankingMap = useMemo(() => {
    const m = new Map<string, { avg_stars: number; rating_count: number; trending_score: number; plays_7d: number }>();
    for (const r of rankings) m.set(r.fx_id!, r as never);
    return m;
  }, [rankings]);

  const list = useMemo(() => {
    let items = fx.filter((f) =>
      (f.title + " " + (f.description ?? "") + " " + (f.tags ?? []).join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
    if (cat) items = items.filter((f) => f.category === cat);
    if (tab === "top") {
      items = [...items].sort(
        (a, b) => (rankingMap.get(b.id)?.avg_stars ?? 0) - (rankingMap.get(a.id)?.avg_stars ?? 0),
      );
    } else if (tab === "trending") {
      items = [...items].sort(
        (a, b) => (rankingMap.get(b.id)?.trending_score ?? 0) - (rankingMap.get(a.id)?.trending_score ?? 0),
      );
    }
    return items;
  }, [fx, search, cat, tab, rankingMap]);

  async function preview(path: string) {
    const { data } = await supabase.storage.from("community-fx").createSignedUrl(path, 300);
    if (!data?.signedUrl) return toast.error("Konnte FX nicht laden");
    previewFx(data.signedUrl);
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Community FX"
        subtitle="Entdecke Sound-FX von der Community. Bewerte sie. Nutze sie auf deiner Party."
        action={
          <Button asChild className="h-11 rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/fx/upload">
              <Upload className="mr-2 h-4 w-4" /> FX hochladen
            </Link>
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition",
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nach Titel, Tag oder Beschreibung suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-full pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCat(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-medium",
              cat === null ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            Alle
          </button>
          {FX_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCat(c.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-2 text-xs font-medium",
                cat === c.value ? "border-primary text-primary" : "border-border text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center text-muted-foreground">Loading…</div>
      ) : list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((f) => {
            const r = rankingMap.get(f.id);
            return (
              <div key={f.id} className="group rounded-2xl border border-border bg-card p-4 transition hover:shadow-stage">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/fx/$fxId"
                      params={{ fxId: f.id }}
                      className="block truncate font-display text-base font-semibold hover:text-primary"
                    >
                      {f.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {f.category} · {Number(f.duration_s).toFixed(1)}s
                    </p>
                  </div>
                  {f.status !== "approved" && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        f.status === "pending"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {f.status === "pending" ? "Prüfung" : "Abgelehnt"}
                    </span>
                  )}
                </div>

                {f.tags && f.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                    {r ? Number(r.avg_stars).toFixed(1) : "—"}
                    <span className="text-muted-foreground/70">({r?.rating_count ?? 0})</span>
                  </span>
                  <span>{f.play_count} plays</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => preview(f.storage_path)}
                    className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-full">
                    <Link to="/fx/$fxId" params={{ fxId: f.id }}>Details</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: FxTab }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <p className="mt-4 font-display text-lg font-semibold">
        {tab === "mine" ? "Du hast noch keine FX hochgeladen" : "Noch keine FX hier"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tab === "mine"
          ? "Lade deinen ersten Sound hoch — nach Admin-Freigabe ist er live."
          : "Sei der Erste und lade einen FX hoch."}
      </p>
      <Button asChild className="mt-5 rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
        <Link to="/fx/upload"><Upload className="mr-2 h-4 w-4" /> FX hochladen</Link>
      </Button>
    </div>
  );
}