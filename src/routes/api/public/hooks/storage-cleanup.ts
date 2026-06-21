import { createFileRoute } from "@tanstack/react-router";

// Daily cleanup job called by pg_cron via apikey header.
// - Warns tracks not played in 90 days (sets cleanup_warned_at)
// - Deletes warned tracks after a 14-day grace period (also removes storage objects)
// - Removes rejected FX older than 30 days (storage already cleared at reject time)
// - Recomputes storage_quotas usage from actual rows
export const Route = createFileRoute("/api/public/hooks/storage-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = new Date();
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const report: Record<string, number> = {
          tracks_warned: 0,
          tracks_deleted: 0,
          fx_purged: 0,
          quotas_recomputed: 0,
        };

        // 1) Warn stale tracks
        const { data: toWarn } = await supabaseAdmin
          .from("tracks")
          .select("id")
          .lt("created_at", ninetyDaysAgo)
          .is("cleanup_warned_at", null)
          .or(`last_played_at.is.null,last_played_at.lt.${ninetyDaysAgo}`);
        if (toWarn && toWarn.length > 0) {
          await supabaseAdmin
            .from("tracks")
            .update({ cleanup_warned_at: now.toISOString() })
            .in("id", toWarn.map((t) => t.id));
          report.tracks_warned = toWarn.length;
        }

        // 2) Delete warned tracks past grace
        const { data: toDelete } = await supabaseAdmin
          .from("tracks")
          .select("id, storage_path")
          .not("cleanup_warned_at", "is", null)
          .lt("cleanup_warned_at", fourteenDaysAgo);
        if (toDelete && toDelete.length > 0) {
          const paths = toDelete.map((t) => t.storage_path).filter(Boolean) as string[];
          if (paths.length) await supabaseAdmin.storage.from("tracks").remove(paths);
          await supabaseAdmin.from("tracks").delete().in("id", toDelete.map((t) => t.id));
          report.tracks_deleted = toDelete.length;
        }

        // 3) Purge old rejected FX rows (storage already cleared at reject time)
        const { data: oldRejected } = await supabaseAdmin
          .from("community_fx")
          .select("id, storage_path")
          .eq("status", "rejected")
          .lt("created_at", thirtyDaysAgo);
        if (oldRejected && oldRejected.length > 0) {
          const paths = oldRejected.map((f) => f.storage_path).filter(Boolean);
          if (paths.length) await supabaseAdmin.storage.from("community-fx").remove(paths);
          await supabaseAdmin
            .from("community_fx")
            .delete()
            .in("id", oldRejected.map((f) => f.id));
          report.fx_purged = oldRejected.length;
        }

        // 4) Recompute storage_quotas (truth from actual rows)
        const { data: quotas } = await supabaseAdmin.from("storage_quotas").select("user_id");
        if (quotas) {
          for (const q of quotas) {
            const [fxAgg, trAgg, recAgg] = await Promise.all([
              supabaseAdmin.from("community_fx").select("file_size").eq("uploader_id", q.user_id).neq("status", "rejected"),
              supabaseAdmin.from("tracks").select("file_size_bytes").eq("user_id", q.user_id),
              supabaseAdmin.from("recordings").select("file_size_bytes").eq("user_id", q.user_id),
            ]);
            const fxBytes = (fxAgg.data ?? []).reduce((s, r) => s + (r.file_size ?? 0), 0);
            const trBytes = (trAgg.data ?? []).reduce((s, r) => s + ((r as { file_size_bytes?: number }).file_size_bytes ?? 0), 0);
            const recBytes = (recAgg.data ?? []).reduce((s, r) => s + ((r as { file_size_bytes?: number }).file_size_bytes ?? 0), 0);
            await supabaseAdmin
              .from("storage_quotas")
              .update({
                fx_bytes_used: fxBytes,
                tracks_bytes_used: trBytes,
                recordings_bytes_used: recBytes,
              })
              .eq("user_id", q.user_id);
            report.quotas_recomputed++;
          }
        }

        return Response.json({ ok: true, report });
      },
    },
  },
});