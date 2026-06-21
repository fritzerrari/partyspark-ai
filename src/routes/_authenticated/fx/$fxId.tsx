import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Play, Star, Flag, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { fxDetailOptions, fxMyRatingOptions, fxRankingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { previewFx } from "@/lib/audio/fxPlayer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fx/$fxId")({
  head: () => ({ meta: [{ title: "FX — PartyPilot AI" }] }),
  component: FxDetail,
});

function FxDetail() {
  const { fxId } = useParams({ from: "/_authenticated/fx/$fxId" });
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: fx } = useQuery(fxDetailOptions(fxId));
  const { data: rankings = [] } = useQuery(fxRankingsOptions());
  const ranking = rankings.find((r) => r.fx_id === fxId);
  const { data: myRating } = useQuery({
    ...fxMyRatingOptions(fxId, user?.id ?? ""),
    enabled: !!user?.id,
  });

  const [busy, setBusy] = useState(false);

  if (!fx) return <div className="grid h-72 place-items-center text-muted-foreground">Loading…</div>;

  async function preview() {
    if (!fx) return;
    const { data } = await supabase.storage.from("community-fx").createSignedUrl(fx.storage_path, 300);
    if (!data?.signedUrl) return toast.error("Konnte FX nicht laden");
    previewFx(data.signedUrl);
    // Track play
    if (user) {
      await supabase.from("community_fx_plays").insert({ fx_id: fx.id, user_id: user.id });
    }
  }

  async function rate(stars: number) {
    if (!user || !fx) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("community_fx_ratings")
        .upsert(
          { fx_id: fx.id, user_id: user.id, stars },
          { onConflict: "fx_id,user_id" },
        );
      if (error) throw error;
      toast.success("Bewertung gespeichert");
      qc.invalidateQueries({ queryKey: ["fx_rating", fx.id] });
      qc.invalidateQueries({ queryKey: ["community_fx_rankings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (!user || !fx) return;
    const reason = window.prompt("Grund der Meldung? (Spam, Copyright, NSFW, Sonstiges)");
    if (!reason) return;
    const { error } = await supabase.from("community_fx_reports").insert({
      fx_id: fx.id,
      reporter_id: user.id,
      reason,
    });
    if (error) toast.error(error.message);
    else toast.success("Danke — wir prüfen das");
  }

  async function remove() {
    if (!fx) return;
    if (!window.confirm("Diesen FX wirklich löschen?")) return;
    await supabase.storage.from("community-fx").remove([fx.storage_path]);
    const { error } = await supabase.from("community_fx").delete().eq("id", fx.id);
    if (error) return toast.error(error.message);
    toast.success("Gelöscht");
    qc.invalidateQueries({ queryKey: ["community_fx"] });
    window.history.back();
  }

  const isOwner = user?.id === fx.uploader_id;

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-up">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/fx"><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Link>
      </Button>

      <PageHeader title={fx.title} subtitle={fx.description ?? `${fx.category} · ${Number(fx.duration_s).toFixed(1)}s`} />

      {fx.status !== "approved" && (
        <div
          className={cn(
            "rounded-2xl border p-4 text-sm",
            fx.status === "pending"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {fx.status === "pending"
            ? "Wartet auf Admin-Freigabe — sichtbar nur für dich und Admins."
            : `Abgelehnt: ${fx.reject_reason ?? "kein Grund angegeben"}`}
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-2xl font-display font-bold">
              <Star className="h-5 w-5 fill-accent text-accent" />
              {ranking ? Number(ranking.avg_stars).toFixed(1) : "—"}
              <span className="text-sm font-normal text-muted-foreground">
                ({ranking?.rating_count ?? 0} Bewertungen)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{fx.play_count} Plays total · {ranking?.plays_7d ?? 0} diese Woche</p>
          </div>
          <Button onClick={preview} className="h-11 rounded-full bg-primary text-primary-foreground">
            <Play className="mr-2 h-4 w-4" /> Abspielen
          </Button>
        </div>

        {fx.tags && fx.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {fx.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {fx.status === "approved" && (
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm font-semibold">Bewerte diesen FX</p>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => rate(n)}
                className={cn(
                  "rounded-full p-2 transition",
                  (myRating?.stars ?? 0) >= n ? "text-accent" : "text-muted-foreground hover:text-accent",
                )}
              >
                <Star className={cn("h-7 w-7", (myRating?.stars ?? 0) >= n && "fill-accent")} />
              </button>
            ))}
            {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />}
          </div>
          {myRating && (
            <p className="mt-2 text-xs text-muted-foreground">Deine Bewertung: {myRating.stars} Sterne</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isOwner && (
          <Button variant="outline" onClick={report} className="rounded-full">
            <Flag className="mr-2 h-4 w-4" /> Melden
          </Button>
        )}
        {isOwner && (
          <Button variant="outline" onClick={remove} className="rounded-full text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Löschen
          </Button>
        )}
      </div>
    </div>
  );
}