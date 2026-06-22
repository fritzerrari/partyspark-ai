import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { settingsOptions, storageQuotaOptions } from "@/lib/db/queries";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { bytesToHuman } from "@/lib/fx/utils";
import { Button } from "@/components/ui/button";
import { Headphones } from "lucide-react";
import { ChangePasswordCard } from "@/components/auth/ChangePasswordCard";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PartyPilot AI" }] }),
  component: Settings,
});

function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsOptions(user!.id));
  const { data: quota } = useQuery(storageQuotaOptions(user!.id));

  async function update(patch: TablesUpdate<"settings">) {
    const { error } = await supabase.from("settings").update(patch).eq("user_id", user!.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings", user!.id] });
  }

  if (!s) return <div className="grid h-72 place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Settings" subtitle="Tune your engine and your account." />

      <Card title="Hardware" subtitle="Externes Mikrofon, Lautsprecher & Vorhör-Kopfhörer.">
        <Row>
          <div>
            <Label>Audio-Geräte einrichten</Label>
            <p className="text-xs text-muted-foreground">Master, Cue-Kopfhörer und Mikrofon zuweisen + Pegel testen.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/audio"><Headphones className="mr-2 h-4 w-4" /> Öffnen</Link>
          </Button>
        </Row>
      </Card>

      <Card title="Speicher" subtitle="Wie viel Cloud-Speicher du verbrauchst.">
        {quota ? (
          <div className="space-y-4 py-2">
            <QuotaBar label="Tracks" used={quota.tracks_bytes_used} total={quota.tracks_quota_bytes} />
            <QuotaBar label="Community FX" used={quota.fx_bytes_used} total={quota.fx_quota_bytes} />
            <QuotaBar label="Aufnahmen" used={quota.recordings_bytes_used} total={quota.recordings_quota_bytes} />
            <p className="pt-1 text-xs text-muted-foreground">
              Tarif: <span className="font-medium uppercase">{quota.tier}</span>. Tracks ohne Plays seit 90 Tagen werden nach 14 Tagen Vorwarnung automatisch entfernt.
            </p>
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Lade Quota…</p>
        )}
      </Card>

      <Card title="Auto-Mix Engine" subtitle="How PartyPilot moves between songs.">
        <Row>
          <div>
            <Label>Auto-Mix</Label>
            <p className="text-xs text-muted-foreground">Let PartyPilot pick the next track automatically in party mode.</p>
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
        <div className="py-4">
          <Label className="text-sm">Passwort ändern</Label>
          <p className="text-xs text-muted-foreground mb-2">Setze ein neues Passwort. Du bleibst eingeloggt.</p>
          <ChangePasswordCard />
        </div>
      </Card>
    </div>
  );
}

function QuotaBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const danger = pct > 90;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {bytesToHuman(used)} / {bytesToHuman(total)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={danger ? "h-full bg-destructive" : "h-full bg-primary"}
          style={{ width: `${pct}%` }}
        />
      </div>
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