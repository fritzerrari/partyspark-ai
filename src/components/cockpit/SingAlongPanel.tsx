import { useEffect, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { useDevices } from "@/lib/audio/devices";
import { NeonButton } from "@/components/ui/NeonButton";
import { cn } from "@/lib/utils";

export function SingAlongPanel() {
  const inputs = useDevices((s) => s.inputs);
  const micDeviceId = useDevices((s) => s.micDeviceId);
  const micEnabled = useDevices((s) => s.micEnabled);
  const micGain = useDevices((s) => s.micGain);
  const micLevel = useDevices((s) => s.micLevel);
  const setMicDevice = useDevices((s) => s.setMicDevice);
  const setMicEnabled = useDevices((s) => s.setMicEnabled);
  const setMicGain = useDevices((s) => s.setMicGain);
  const refresh = useDevices((s) => s.refresh);
  const requestPermission = useDevices((s) => s.requestPermission);
  const [latch, setLatch] = useState(true);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="neon-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/60 flex items-center gap-1">
          <Mic className="h-3 w-3" /> Mit-Singen
        </span>
        <NeonButton
          onClick={async () => {
            if (!micEnabled) {
              if (inputs.length === 0) await requestPermission();
              await setMicEnabled(true);
            } else {
              await setMicEnabled(false);
            }
          }}
          variant={micEnabled ? "active" : "idle"}
          size="sm"
        >
          {micEnabled ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
          {micEnabled ? "Live" : "Mic an"}
        </NeonButton>
      </div>

      <select
        value={micDeviceId ?? ""}
        onChange={(e) => setMicDevice(e.target.value || null)}
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-stage-foreground"
      >
        <option value="">Standard-Mikrofon</option>
        {inputs.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>

      <div>
        <div className="flex items-center justify-between text-[9px] text-stage-foreground/60">
          <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" /> Gain</span>
          <span className="font-mono">{(micGain * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range" min={0} max={1.5} step={0.01}
          value={micGain}
          onChange={(e) => setMicGain(parseFloat(e.target.value))}
          className="w-full accent-[var(--neon-magenta)]"
        />
      </div>

      {/* Live-Pegel */}
      <div>
        <div className="text-[9px] text-stage-foreground/60">Pegel</div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn("h-2 transition-all", micLevel > 0.85 ? "bg-red-500" : micLevel > 0.6 ? "bg-yellow-400" : "bg-emerald-400")}
            style={{ width: `${Math.min(100, micLevel * 120)}%` }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[10px] text-stage-foreground/70">
        <input type="checkbox" checked={latch} onChange={(e) => setLatch(e.target.checked)} />
        Latch (Mic immer offen statt Push-to-Talk)
      </label>

      <p className="text-[9px] text-stage-foreground/50">
        Tipp: für klingt-wie-Studio öffne zusätzlich das Vocal-Layer Modul (✨ unten rechts) für Reverb/Delay/Doubler.
      </p>
    </div>
  );
}