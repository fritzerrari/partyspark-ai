import { useEngine } from "@/lib/audio/engine";
import { Led } from "@/components/ui/LedIndicator";
import { Lightbulb } from "lucide-react";

export function CoachHud() {
  const current = useEngine((s) => s.current);
  const position = useEngine((s) => s.positionSec);
  const duration = useEngine((s) => s.durationSec);
  const autoDj = useEngine((s) => s.autoDj);
  const pendingPlan = useEngine((s) => s.pendingPlan);
  const queue = useEngine((s) => s.queue);

  const tips: { color: "cyan" | "amber" | "magenta" | "lime"; text: string }[] = [];
  if (!current) {
    tips.push({ color: "amber", text: "Wähle einen Track in der Library oder lade einen auf Deck A." });
  } else {
    if (!current.bpm) tips.push({ color: "amber", text: `„${current.title}" hat noch keine BPM-Analyse — reanalysieren in Library.` });
    if (duration > 0 && duration - position < 20) tips.push({ color: "magenta", text: "Outro in <20s — Party-Modus aktivieren oder Deck B starten." });
    if (current.bpm && current.bpm > 0) tips.push({ color: "cyan", text: `Tempo Deck A: ${Math.round(current.bpm)} BPM — Sync verwenden für saubere Übergänge.` });
    if (current.cues?.firstDrop && Math.abs(position - current.cues.firstDrop) < 4) tips.push({ color: "lime", text: "Drop nähert sich — perfekte Stelle für Vocal-Layer!" });
    if (autoDj && pendingPlan) {
      tips.push({ color: "cyan", text: `Nächster Übergang: ${pendingPlan.notes} @ ${pendingPlan.triggerAtSecOfCurrent.toFixed(1)}s (${pendingPlan.crossfadeSec.toFixed(1)}s)` });
    }
    if (autoDj && queue[0] && (!queue[0].bpm || !queue[0].cues)) {
      tips.push({ color: "amber", text: `Nächster Track „${queue[0].title}" nicht analysiert — Übergang fällt auf safe Crossfade zurück.` });
    }
  }
  if (tips.length === 0) tips.push({ color: "lime", text: "Alles im grünen Bereich — viel Spaß beim Mixen ✨" });

  return (
    <div className="neon-surface rounded-2xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb className="h-3.5 w-3.5 text-[var(--neon-amber)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-stage-foreground/80">Coach</span>
      </div>
      <ul className="space-y-1.5 text-xs text-stage-foreground/90">
        {tips.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1"><Led color={t.color} blink={t.color === "magenta"} /></span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}