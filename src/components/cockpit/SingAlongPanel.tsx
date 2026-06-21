import { useEffect, useState } from "react";
import { Mic, MicOff, Volume2, Wand2, Lock, LockOpen } from "lucide-react";
import { useDevices } from "@/lib/audio/devices";
import { NeonButton } from "@/components/ui/NeonButton";
import { cn } from "@/lib/utils";
import { useNowPlaying } from "@/lib/audio/nowPlaying";
import { NOTE_NAMES } from "@/lib/audio/pitch";
import type { ScaleMode } from "@/lib/audio/micAutotune";

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
  const autotuneOn = useDevices((s) => s.autotuneOn);
  const autotuneLockToSong = useDevices((s) => s.autotuneLockToSong);
  const autotuneStrength = useDevices((s) => s.autotuneStrength);
  const autotuneMode = useDevices((s) => s.autotuneMode);
  const autotuneRoot = useDevices((s) => s.autotuneRoot);
  const autotuneDetune = useDevices((s) => s.autotuneDetune);
  const autotuneHz = useDevices((s) => s.autotuneHz);
  const setAutotune = useDevices((s) => s.setAutotune);
  const setAutotuneTargetFromKey = useDevices((s) => s.setAutotuneTargetFromKey);
  const now = useNowPlaying();
  const [latch, setLatch] = useState(true);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live-Lock: jedes Mal wenn sich Tonart des laufenden Songs ändert → Target nachziehen.
  useEffect(() => {
    if (autotuneOn && autotuneLockToSong) {
      setAutotuneTargetFromKey(now.musicalKey);
    }
  }, [autotuneOn, autotuneLockToSong, now.musicalKey, setAutotuneTargetFromKey]);

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

      {/* --- Autotune (Sing-Along) --- */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-stage-foreground/70 flex items-center gap-1">
            <Wand2 className="h-3 w-3 text-[var(--neon-amber)]" /> Autotune
          </span>
          <button
            onClick={() => setAutotune({ on: !autotuneOn })}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              autotuneOn
                ? "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)]"
                : "border-white/10 text-stage-foreground/60",
            )}
          >
            {autotuneOn ? "ON" : "OFF"}
          </button>
        </div>

        {/* Lock to Song */}
        <button
          onClick={() => setAutotune({ lockToSong: !autotuneLockToSong })}
          className={cn(
            "flex w-full items-center justify-between rounded border px-2 py-1 text-[10px]",
            autotuneLockToSong
              ? "border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]"
              : "border-white/10 text-stage-foreground/60",
          )}
        >
          <span className="flex items-center gap-1">
            {autotuneLockToSong ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            Lock to Song
          </span>
          <span className="font-mono">
            {now.musicalKey ? `${now.musicalKey} · ${now.bpm ?? "—"} BPM` : "kein Song"}
          </span>
        </button>

        {/* Manueller Scale-Picker, nur wenn nicht gelockt */}
        {!autotuneLockToSong && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {(["chromatic", "major", "minor"] as ScaleMode[]).map((m) => (
                <button key={m}
                  onClick={() => setAutotune({ mode: m })}
                  className={cn(
                    "flex-1 rounded border px-1 py-1 text-[10px] capitalize",
                    autotuneMode === m
                      ? "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)]"
                      : "border-white/10 text-stage-foreground/60",
                  )}
                >
                  {m === "chromatic" ? "Chroma" : m === "major" ? "Dur" : "Moll"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-0.5">
              {NOTE_NAMES.map((n, i) => (
                <button key={n}
                  onClick={() => setAutotune({ root: i })}
                  className={cn(
                    "rounded border px-1 py-0.5 text-[9px] font-mono",
                    autotuneRoot === i
                      ? "border-[var(--neon-amber)] bg-[var(--neon-amber)]/15 text-[var(--neon-amber)]"
                      : "border-white/10 text-stage-foreground/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Strength */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-stage-foreground/60">
            <span>Strength</span>
            <span className="font-mono">{Math.round(autotuneStrength * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.01}
            value={autotuneStrength}
            onChange={(e) => setAutotune({ strength: parseFloat(e.target.value) })}
            className="w-full accent-[var(--neon-amber)]"
          />
        </div>

        {/* Live-Detune-Meter */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-stage-foreground/60">
            <span>Pitch-Korrektur</span>
            <span className="font-mono">
              {autotuneHz > 0 ? `${autotuneHz.toFixed(1)} Hz` : "—"}
              {"  "}
              {autotuneDetune ? `${autotuneDetune > 0 ? "+" : ""}${autotuneDetune.toFixed(0)}¢` : ""}
            </span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-1.5 w-px bg-white/30" />
            <div
              className="absolute top-0 h-1.5 bg-[var(--neon-amber)]"
              style={{
                left: autotuneDetune >= 0 ? "50%" : `${50 + (autotuneDetune / 300) * 50}%`,
                width: `${Math.min(50, Math.abs(autotuneDetune / 300) * 50)}%`,
              }}
            />
          </div>
        </div>

        {!autotuneOn && (
          <p className="text-[9px] text-stage-foreground/50">
            Schalte Autotune ein und sing zum laufenden Song — die Stimme wird auf die Tonart gezogen.
          </p>
        )}
        {autotuneOn && autotuneLockToSong && !now.musicalKey && (
          <p className="text-[9px] text-amber-300/80">
            Lade einen analysierten Song ins Deck (Library → Analyse), damit Lock to Song greift.
          </p>
        )}
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