import { Sliders } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type VocalChainSettings } from "@/lib/audio/vocalChain";
import { REVERB_PRESETS } from "@/lib/audio/vocalPost";

type Props = {
  settings: VocalChainSettings;
  onChange: (s: VocalChainSettings) => void;
  disabled?: boolean;
};

export function VocalChainPanel({ settings, onChange, disabled }: Props) {
  const set = <K extends keyof VocalChainSettings>(k: K, v: VocalChainSettings[K]) =>
    onChange({ ...settings, [k]: v });

  return (
    <div className={"space-y-4 rounded-3xl border border-border bg-card p-5 " + (disabled ? "opacity-60" : "")}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" /> Vocal Chain
        </h3>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Kopfhörer-Monitor</span>
          <Switch checked={settings.monitor} onCheckedChange={(v) => set("monitor", v)} />
        </label>
      </div>

      <FxBlock title="Compressor" enabled={settings.compressor} onToggle={(v) => set("compressor", v)}>
        <Knob label="Threshold" value={settings.threshold} min={-60} max={0} step={1} unit="dB" onChange={(v) => set("threshold", v)} />
        <Knob label="Ratio" value={settings.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => set("ratio", v)} />
      </FxBlock>

      <FxBlock title="EQ (3-Band)" enabled={true}>
        <Knob label="Low" value={settings.eqLow} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => set("eqLow", v)} />
        <Knob label="Mid" value={settings.eqMid} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => set("eqMid", v)} />
        <Knob label="High" value={settings.eqHigh} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => set("eqHigh", v)} />
      </FxBlock>

      <FxBlock title="Reverb" enabled={settings.reverb} onToggle={(v) => set("reverb", v)}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Raum:</span>
          <Select value={settings.reverbPreset} onValueChange={(v) => set("reverbPreset", v as VocalChainSettings["reverbPreset"])}>
            <SelectTrigger className="w-[140px] rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REVERB_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Knob label="Mix" value={settings.reverbMix} min={0} max={1} step={0.05} unit="" onChange={(v) => set("reverbMix", v)} />
      </FxBlock>

      <FxBlock title="Delay / Echo" enabled={settings.delay} onToggle={(v) => set("delay", v)}>
        <Knob label="Time" value={settings.delayTime} min={0.05} max={1.0} step={0.01} unit="s" onChange={(v) => set("delayTime", v)} />
        <Knob label="Feedback" value={settings.delayFeedback} min={0} max={0.9} step={0.05} unit="" onChange={(v) => set("delayFeedback", v)} />
        <Knob label="Mix" value={settings.delayMix} min={0} max={1} step={0.05} unit="" onChange={(v) => set("delayMix", v)} />
      </FxBlock>

      <FxBlock title="Doubler" enabled={settings.doubler} onToggle={(v) => set("doubler", v)}>
        <Knob label="Amount" value={settings.doublerAmount} min={0} max={1} step={0.05} unit="" onChange={(v) => set("doublerAmount", v)} />
      </FxBlock>
    </div>
  );
}

function FxBlock({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle?: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={"rounded-2xl bg-muted/30 p-3 space-y-3 " + (enabled ? "" : "opacity-60")}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
        {onToggle && <Switch checked={enabled} onCheckedChange={onToggle} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Knob({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} />
    </div>
  );
}