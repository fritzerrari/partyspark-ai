import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { settingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PartyPilot AI" }] }),
  component: Settings,
});

function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsOptions(user!.id));

  async function update(patch: Record<string, unknown>) {
    const { error } = await supabase.from("settings").update(patch).eq("user_id", user!.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings", user!.id] });
  }

  if (!s) return <div className="grid h-72 place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Settings" subtitle="Tune your engine and your account." />

      <Card title="Auto DJ Engine" subtitle="How PartyPilot moves between songs.">
        <Row>
          <div>
            <Label>Auto DJ</Label>
            <p className="text-xs text-muted-foreground">Let PartyPilot pick the next track automatically.</p>
          </div>
          <Switch checked={s.autodj_enabled} onCheckedChange={(v) => update({ autodj_enabled: v })} />
        </Row>
        <Row>
          <div>
            <Label>Beat Match</Label>
            <p className="text-xs text-muted-foreground">Phase-lock kicks for seamless mixes. (Preview)</p>
          </div>
          <Switch checked={s.beat_match} onCheckedChange={(v) => update({ beat_match: v })} />
        </Row>
        <Row>
          <div>
            <Label>Harmonic Mix</Label>
            <p className="text-xs text-muted-foreground">Pick tracks in compatible keys. (Preview)</p>
          </div>
          <Switch checked={s.harmonic_mix} onCheckedChange={(v) => update({ harmonic_mix: v })} />
        </Row>
        <Row>
          <div>
            <Label>Energy Management</Label>
            <p className="text-xs text-muted-foreground">Auto-build and recover the dancefloor energy curve.</p>
          </div>
          <Switch checked={s.energy_management} onCheckedChange={(v) => update({ energy_management: v })} />
        </Row>
        <Row>
          <div className="w-full">
            <div className="flex items-center justify-between">
              <Label>Crossfade length</Label>
              <span className="font-display text-sm font-semibold">{s.crossfade_sec}s</span>
            </div>
            <Slider
              value={[s.crossfade_sec]}
              min={0}
              max={20}
              step={1}
              onValueChange={(v) => update({ crossfade_sec: v[0] ?? 6 })}
              className="mt-3"
            />
          </div>
        </Row>
      </Card>

      <Card title="Notifications" subtitle="When PartyPilot should tap you.">
        <Row>
          <div>
            <Label>Email updates</Label>
            <p className="text-xs text-muted-foreground">Product news and feature drops.</p>
          </div>
          <Switch
            checked={!!(s.notifications as { email?: boolean }).email}
            onCheckedChange={(v) => update({ notifications: { ...(s.notifications as object), email: v } })}
          />
        </Row>
        <Row>
          <div>
            <Label>Party reminders</Label>
            <p className="text-xs text-muted-foreground">Heads-up before a scheduled party starts.</p>
          </div>
          <Switch
            checked={!!(s.notifications as { party_reminders?: boolean }).party_reminders}
            onCheckedChange={(v) =>
              update({ notifications: { ...(s.notifications as object), party_reminders: v } })
            }
          />
        </Row>
      </Card>

      <Card title="Account" subtitle="The basics.">
        <Row>
          <div>
            <Label>Email</Label>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </Row>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 divide-y divide-border">{children}</div>
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-4">{children}</div>;
}