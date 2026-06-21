import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Check, X, ArrowLeft, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { fxPendingOptions, isAdminOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { previewFx } from "@/lib/audio/fxPlayer";
import { bytesToHuman } from "@/lib/fx/utils";

export const Route = createFileRoute("/_authenticated/admin/fx-review")({
  head: () => ({ meta: [{ title: "FX Review — Admin" }] }),
  component: FxReview,
});

function FxReview() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    ...isAdminOptions(user?.id ?? ""),
    enabled: !!user?.id,
  });
  const { data: pending = [] } = useQuery({
    ...fxPendingOptions(),
    enabled: isAdmin === true,
  });

  if (adminLoading) return <div className="grid h-72 place-items-center text-muted-foreground">Loading…</div>;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 font-display text-lg font-semibold">Nur für Admins</p>
        <p className="mt-1 text-sm text-muted-foreground">Dein Account hat keine Admin-Rechte.</p>
        <Button asChild className="mt-5"><Link to="/dashboard">Zurück</Link></Button>
      </div>
    );
  }

  async function preview(path: string) {
    const { data } = await supabase.storage.from("community-fx").createSignedUrl(path, 300);
    if (data?.signedUrl) previewFx(data.signedUrl);
  }

  async function approve(id: string) {
    const { error } = await supabase
      .from("community_fx")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Freigegeben");
    qc.invalidateQueries({ queryKey: ["community_fx"] });
  }

  async function reject(id: string, path: string, size: number, uploaderId: string) {
    const reason = window.prompt("Ablehnungsgrund?");
    if (!reason) return;
    // Datei sofort aus Storage löschen
    await supabase.storage.from("community-fx").remove([path]);
    const { error } = await supabase
      .from("community_fx")
      .update({ status: "rejected", reject_reason: reason })
      .eq("id", id);
    if (error) return toast.error(error.message);
    // Quota zurückgeben
    const { data: q } = await supabase
      .from("storage_quotas")
      .select("fx_bytes_used")
      .eq("user_id", uploaderId)
      .maybeSingle();
    if (q) {
      await supabase
        .from("storage_quotas")
        .update({ fx_bytes_used: Math.max(0, q.fx_bytes_used - size) })
        .eq("user_id", uploaderId);
    }
    toast.success("Abgelehnt");
    qc.invalidateQueries({ queryKey: ["community_fx"] });
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link>
      </Button>

      <PageHeader
        title="FX Review"
        subtitle={`${pending.length} FX warten auf deine Freigabe`}
      />

      {pending.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center text-muted-foreground">
          Aktuell keine offenen Uploads.
        </div>
      ) : (
        <div className="grid gap-3">
          {pending.map((f) => (
            <div key={f.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold">{f.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.category} · {Number(f.duration_s).toFixed(1)}s · {bytesToHuman(f.file_size)}
                  </p>
                  {f.description && <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>}
                  {f.tags && f.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.tags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => preview(f.storage_path)}>
                    <Play className="mr-1 h-4 w-4" /> Hören
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approve(f.id)}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Check className="mr-1 h-4 w-4" /> OK
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reject(f.id, f.storage_path, f.file_size, f.uploader_id)}
                  >
                    <X className="mr-1 h-4 w-4" /> Nein
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}