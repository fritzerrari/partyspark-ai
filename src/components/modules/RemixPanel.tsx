import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Wand2, Play, Pause, Plus, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { AutoMagicButton } from "@/components/ui/AutoMagicButton";
import { Led } from "@/components/ui/LedIndicator";
import { useProject, useArtifactsByKind, type ProjectArtifact } from "@/lib/project/store";
import { useEngine } from "@/lib/audio/engine";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { buildRemix, type RemixStyle } from "@/lib/audio/remix";
import { decodeToBuffer } from "@/lib/audio/analyze";

const STYLES: RemixStyle[] = ["house", "techno", "tropical", "disco", "drum-and-bass"];

async function loadBuffer(art: ProjectArtifact): Promise<AudioBuffer> {
  if (art.buffer) return art.buffer;
  if (!art.url) throw new Error("Quelle hat keine URL");
  const ab = await (await fetch(art.url)).arrayBuffer();
  return decodeToBuffer(ab);
}

export function RemixPanel() {
  const sources = useArtifactsByKind(["track", "recording", "vocal", "remix", "mashup"]);
  const addArtifact = useProject((s) => s.addArtifact);
  const toEngineTrack = useProject((s) => s.toEngineTrack);
  const loadQueue = useEngine((s) => s.loadQueue);
  const loadDeck = useTwinDeck((s) => s.loadDeck);
  const [sel, setSel] = useState<string>("");
  const [bpm, setBpm] = useState(124);
  const [length, setLength] = useState<60 | 90 | 120 | 150>(90);
  const [style, setStyle] = useState<RemixStyle>("house");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const selected = useMemo(() => sources.find((s) => s.id === sel) ?? sources[0] ?? null, [sources, sel]);

  async function autoMagic() {
    if (!selected) { toast.error("Wähle erst eine Quelle"); return; }
    setBusy(true); setProgress({ label: "Start", pct: 0 });
    try {
      const buf = await loadBuffer(selected);
      // Auto-pick: target BPM nearest 124 (house default); 90s; style "house" unless analysis suggests fast → DnB.
      const sourceBpm = selected.analysis?.bpm ?? null;
      const tgt = sourceBpm && sourceBpm > 160 ? Math.round(sourceBpm) : 124;
      const autoStyle: RemixStyle = sourceBpm && sourceBpm > 160 ? "drum-and-bass" : "house";
      const res = await buildRemix(buf, {
        targetBpm: tgt, lengthSec: 90, style: autoStyle, analysis: selected.analysis ?? undefined,
        onProgress: (label, pct) => setProgress({ label, pct }),
      });
      const id = addArtifact({
        kind: "remix",
        title: `${selected.title} — ${autoStyle} ${res.targetBpm} BPM`,
        buffer: res.buffer,
        sourceId: selected.id,
        meta: { sections: res.sections, sourceBpm: res.sourceBpm, targetBpm: res.targetBpm, style: res.style },
      });
      setLastId(id);
      toast.success(`Auto-Magic Remix fertig: ${res.sourceBpm} → ${res.targetBpm} BPM`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); setProgress(null); }
  }

  async function render() {
    if (!selected) { toast.error("Quelle wählen"); return; }
    setBusy(true); setProgress({ label: "Start", pct: 0 });
    try {
      const buf = await loadBuffer(selected);
      const res = await buildRemix(buf, {
        targetBpm: bpm, lengthSec: length, style,
        analysis: selected.analysis ?? undefined,
        onProgress: (label, pct) => setProgress({ label, pct }),
      });
      const id = addArtifact({
        kind: "remix",
        title: `${selected.title} — ${style} ${res.targetBpm} BPM`,
        buffer: res.buffer,
        sourceId: selected.id,
        meta: { sections: res.sections, sourceBpm: res.sourceBpm, targetBpm: res.targetBpm, style: res.style },
      });
      setLastId(id);
      toast.success(`Remix gerendert (${res.sourceBpm} → ${res.targetBpm} BPM)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); setProgress(null); }
  }

  function preview() {
    if (!lastId) return;
    if (previewRef.current) { previewRef.current.pause(); previewRef.current = null; setPreviewing(false); return; }
    const engineTrack = toEngineTrack(lastId);
    if (!engineTrack?.url) return;
    const a = new Audio(engineTrack.url);
    a.onended = () => { setPreviewing(false); previewRef.current = null; };
    a.play().catch(() => {});
    previewRef.current = a;
    setPreviewing(true);
  }

  function sendToDeck() {
    if (!lastId) return;
    const t = toEngineTrack(lastId);
    if (!t) { toast.error("Konnte nicht laden"); return; }
    loadQueue([t], { autoplay: false });
    toast.success("Auf Deck A geladen");
  }

  async function sendToTwinDeck(side: "A" | "B") {
    if (!lastId) return;
    const t = toEngineTrack(lastId);
    if (!t) { toast.error("Konnte nicht laden"); return; }
    await loadDeck(side, t);
    toast.success(`Cockpit-Deck ${side} bereit`);
  }

  return (
    <div className="space-y-3 text-sm text-stage-foreground">
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-stage-foreground/60">Quelle</label>
        <select
          value={selected?.id ?? ""}
          onChange={(e) => setSel(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
        >
          {sources.length === 0 && <option value="">— erst Track/Aufnahme importieren —</option>}
          {sources.map((a) => (
            <option key={a.id} value={a.id}>
              {a.kind === "track" ? "🎵" : a.kind === "recording" ? "🎤" : a.kind === "vocal" ? "🎙️" : a.kind === "remix" ? "🪩" : "🎚️"} {a.title}
              {a.analysis?.bpm ? ` · ${Math.round(a.analysis.bpm)} BPM` : ""}
            </option>
          ))}
        </select>
      </div>

      <AutoMagicButton onClick={autoMagic} loading={busy} disabled={!selected} hint="Wählt BPM, Stil & Länge automatisch — ein Klick, fertiger Remix." />

      <details className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stage-foreground/80">Erweitert</summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex justify-between text-xs"><span>Ziel-BPM</span><span className="font-mono">{bpm}</span></div>
            <Slider value={[bpm]} min={90} max={180} step={1} onValueChange={(v) => setBpm(v[0])} />
          </div>
          <div>
            <div className="text-xs">Länge</div>
            <div className="mt-1 flex gap-1">
              {([60, 90, 120, 150] as const).map((l) => (
                <button key={l} onClick={() => setLength(l)}
                  className={"rounded-full px-3 py-1 text-[10px] uppercase tracking-widest " + (length === l ? "bg-[var(--neon-cyan)] text-black" : "bg-white/10 text-stage-foreground/70 hover:bg-white/20")}>
                  {l}s
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs">Stil</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {STYLES.map((s) => (
                <button key={s} onClick={() => setStyle(s)}
                  className={"rounded-full px-3 py-1 text-[10px] uppercase tracking-widest " + (style === s ? "bg-[var(--neon-magenta)] text-black" : "bg-white/10 text-stage-foreground/70 hover:bg-white/20")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={render} disabled={busy || !selected} size="sm" className="rounded-full">
            <Wand2 className="mr-2 h-4 w-4" /> Manuell rendern
          </Button>
        </div>
      </details>

      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-stage-foreground/60">
            <span>{progress.label}</span><span>{Math.round(progress.pct)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--neon-cyan)] transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {lastId && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
          <Led color={previewing ? "lime" : "cyan"} blink={previewing} label="Mix" />
          <span className="line-clamp-1 flex-1 text-xs text-stage-foreground/90">Letzter Remix bereit</span>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={preview}>
            {previewing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={sendToDeck} title="Auf Deck A">
            <Plus className="h-3 w-3" /> Deck
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={() => sendToTwinDeck("B")} title="Cockpit Deck B">
            <Disc3 className="h-3 w-3" /> B
          </Button>
        </div>
      )}
    </div>
  );
}