import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Headphones,
  Mic,
  Speaker,
  Volume2,
  ChevronLeft,
  RefreshCw,
  Play,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { settingsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useDevices } from "@/lib/audio/devices";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/settings/audio")({
  head: () => ({ meta: [{ title: "Audio Setup — PartyPilot AI" }] }),
  component: AudioSetup,
});

function AudioSetup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsOptions(user!.id));
  const d = useDevices();

  // Initial enumeration + hydrate from saved settings
  useEffect(() => {
    d.refresh();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!s) return;
    if (s.master_output_id) d.setMasterOutput(s.master_output_id);
    if (s.cue_output_id) d.setCueOutput(s.cue_output_id);
    if (s.mic_device_id) d.setMicDevice(s.mic_device_id);
    d.setMicGain(s.mic_gain ?? 0.8);
    if (s.mic_enabled) d.setMicEnabled(true);
    return () => { d.setMicEnabled(false); };
  }, [s?.user_id]); // eslint-disable-line

  async function save(patch: TablesUpdate<"settings">) {
    const { error } = await supabase.from("settings").update(patch).eq("user_id", user!.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["settings", user!.id] });
  }

  async function requestPerm() {
    const ok = await d.requestPermission();
    if (ok) toast.success("Mikrofon-Zugriff erlaubt — Geräte sind sichtbar.");
    else toast.error("Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.");
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/settings"><ChevronLeft className="mr-1 h-4 w-4" /> Zurück zu Settings</Link>
        </Button>
        <PageHeader
          title="Audio Setup"
          subtitle="Externes Mikrofon, Lautsprecher und Vorhör-Kopfhörer einrichten."
        />
      </div>

      {!d.supportsSinkId && (
        <Card>
          <div className="flex gap-3 text-sm">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              Dein Browser unterstützt keine getrennten Audio-Ausgänge (setSinkId). Master + Cue laufen dann auf dem System-Standard-Ausgang. Für volle Funktion: <strong>Chrome</strong> oder <strong>Edge</strong> verwenden.
            </p>
          </div>
        </Card>
      )}

      {!d.hasPermission && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Geräte-Labels sind verborgen</p>
              <p className="text-sm text-muted-foreground">Erlaube Mikrofon-Zugriff, damit dein Browser alle Audio-Geräte mit Namen anzeigt.</p>
            </div>
            <Button onClick={requestPerm}><Mic className="mr-2 h-4 w-4" /> Zugriff erlauben</Button>
          </div>
        </Card>
      )}

      <Card
        title="Master-Ausgang"
        subtitle="Hauptlautsprecher / PA / Audio-Interface"
        icon={<Speaker className="h-4 w-4" />}
        onRefresh={() => d.refresh()}
      >
        <DeviceSelect
          value={d.masterOutputId ?? s?.master_output_id ?? "default"}
          options={d.outputs}
          onChange={async (id) => { await d.setMasterOutput(id); await save({ master_output_id: id }); }}
        />
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => d.testMaster()}>
            <Play className="mr-2 h-3.5 w-3.5" /> Testton 440 Hz
          </Button>
        </div>
      </Card>

      <Card
        title="Cue / Vorhör-Kopfhörer"
        subtitle="Separater Ausgang für Pre-Listen (nur du hörst es)"
        icon={<Headphones className="h-4 w-4" />}
      >
        <DeviceSelect
          value={d.cueOutputId ?? s?.cue_output_id ?? "default"}
          options={d.outputs}
          onChange={async (id) => { await d.setCueOutput(id); await save({ cue_output_id: id }); }}
        />
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => d.testCue()}>
            <Play className="mr-2 h-3.5 w-3.5" /> Testton 880 Hz
          </Button>
        </div>
      </Card>

      <Card
        title="Mikrofon"
        subtitle="Sprich rein und sieh den Pegel live."
        icon={<Mic className="h-4 w-4" />}
      >
        <DeviceSelect
          value={d.micDeviceId ?? s?.mic_device_id ?? "default"}
          options={d.inputs}
          onChange={async (id) => { await d.setMicDevice(id); await save({ mic_device_id: id }); }}
        />

        <div className="mt-4 flex items-center justify-between">
          <Label className="flex items-center gap-2"><Volume2 className="h-4 w-4" /> Mikrofon aktiv</Label>
          <Switch
            checked={d.micEnabled}
            onCheckedChange={async (v) => { await d.setMicEnabled(v); await save({ mic_enabled: v }); }}
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Mic Gain</span>
            <span>{Math.round(d.micGain * 100)}%</span>
          </div>
          <Slider
            value={[d.micGain * 100]}
            min={0} max={150} step={1}
            onValueChange={([v]) => d.setMicGain(v / 100)}
            onValueCommit={([v]) => save({ mic_gain: v / 100 })}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Pegel</span>
            <span>{d.micEnabled ? `${Math.round(d.micLevel * 100)}%` : "—"}</span>
          </div>
          <Meter value={d.micEnabled ? d.micLevel : 0} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <Label>Auto-Ducking</Label>
            <p className="text-xs text-muted-foreground">Musik leiser, wenn du sprichst. (Preview)</p>
          </div>
          <Switch
            checked={s?.mic_ducking ?? false}
            onCheckedChange={(v) => save({ mic_ducking: v })}
          />
        </div>
      </Card>
    </div>
  );
}

function DeviceSelect({
  value, options, onChange,
}: { value: string; options: { deviceId: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
    >
      <option value="default">Standard-Gerät</option>
      {options.map((o) => (
        <option key={o.deviceId} value={o.deviceId}>{o.label}</option>
      ))}
    </select>
  );
}

function Meter({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-[width] duration-75 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Card({
  title, subtitle, icon, onRefresh, children,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="flex items-center gap-2 text-base font-semibold">
                {icon} {title}
              </h3>
            )}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="Geräte aktualisieren">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}