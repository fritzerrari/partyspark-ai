import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2, Play, Pause } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { AutoMagicButton } from "@/components/ui/AutoMagicButton";
import { SCALES, type ScaleId, snapToScale, detectDominantMidi, midiToName } from "@/lib/audio/pitch";
import { pitchShiftBuffer } from "@/lib/audio/pitchShift";
import { useProject, useArtifactsByKind, type ProjectArtifact } from "@/lib/project/store";
import { useEngine } from "@/lib/audio/engine";
import { decodeToBuffer } from "@/lib/audio/analyze";
import { Button } from "@/components/ui/button";

async function loadBuffer(art: ProjectArtifact): Promise<AudioBuffer> {
  if (art.buffer) return art.buffer;
  if (!art.url) throw new Error("Quelle hat keine URL");
  return decodeToBuffer(await (await fetch(art.url)).arrayBuffer());
}

export function AutotunePanel() {
  const sources = useArtifactsByKind(["recording", "vocal"]);
  const addArtifact = useProject((s) => s.addArtifact);
  const toEngineTrack = useProject((s) => s.toEngineTrack);
  const loadQueue = useEngine((s) => s.loadQueue);
  const [sel, setSel] = useState<string>("");
  const [scaleId, setScaleId] = useState<ScaleId>("c-major");
  const [strength, setStrength] = useState(70);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const preview = useState<{ a: HTMLAudioElement | null }>({ a: null })[0];
  const selected = useMemo(() => sources.find((s) => s.id === sel) ?? sources[0] ?? null, [sources, sel]);

  async function run(auto: boolean) {
    if (!selected) { toast.error("Quelle wählen (Aufnahme)"); return; }
    setBusy(true);
    try {
      const buf = await loadBuffer(selected);
      const detected = detectDominantMidi(buf);
      if (detected === null) { toast.error("Keine erkennbare Tonhöhe"); return; }
      const target = snapToScale(detected, auto ? "c-major" : scaleId);
      const shift = (target - detected) * ((auto ? 80 : strength) / 100);
      const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
      const tuned = await pitchShiftBuffer(ctx, buf, shift);
      const id = addArtifact({
        kind: "vocal", title: `${selected.title} — tuned ${midiToName(target)}`,
        buffer: tuned, sourceId: selected.id,
        meta: { detectedMidi: detected, targetMidi: target, scaleId: auto ? "c-major" : scaleId, strength: auto ? 80 : strength },
      });
      setLastId(id);
      toast.success(`Getunt: ${shift > 0 ? "+" : ""}${shift.toFixed(2)} Halbtöne`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  function playPreview() {
    if (!lastId) return;
    if (preview.a) { preview.a.pause(); preview.a = null; setPreviewing(false); return; }
    const t = toEngineTrack(lastId); if (!t?.url) return;
    const a = new Audio(t.url); a.onended = () => { setPreviewing(false); preview.a = null; };
    a.play().catch(() => {}); preview.a = a; setPreviewing(true);
  }

  function sendToDeck() {
    if (!lastId) return;
    const t = toEngineTrack(lastId);
    if (t) { loadQueue([t], { autoplay: false }); toast.success("Auf Deck geladen"); }
  }

  return (
    <div className="space-y-3 text-sm text-stage-foreground">
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-stage-foreground/60">Aufnahme</label>
        <select value={selected?.id ?? ""} onChange={(e) => setSel(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
          {sources.length === 0 && <option>— erst Aufnahme importieren —</option>}
          {sources.map((a) => <option key={a.id} value={a.id}>{a.kind === "vocal" ? "🎙️" : "🎤"} {a.title}</option>)}
        </select>
      </div>
      <AutoMagicButton onClick={() => run(true)} loading={busy} disabled={!selected} hint="Erkennt die Tonart und tunet sanft auf die nächste Skala-Note." />
      <details className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stage-foreground/80">Erweitert</summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-xs">Tonart</div>
            <select value={scaleId} onChange={(e) => setScaleId(e.target.value as ScaleId)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
              {Object.entries(SCALES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <div className="flex justify-between text-xs"><span>Stärke</span><span className="font-mono">{strength}%</span></div>
            <Slider value={[strength]} onValueChange={([v]) => setStrength(v)} min={0} max={100} step={5} />
          </div>
          <Button size="sm" onClick={() => run(false)} disabled={busy || !selected} className="rounded-full"><Wand2 className="mr-2 h-3 w-3" /> Manuell tunen</Button>
        </div>
      </details>
      {lastId && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
          <span className="line-clamp-1 flex-1 text-xs">Vocal getunt — bereit</span>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={playPreview}>
            {previewing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={sendToDeck}>→ Deck</Button>
        </div>
      )}
    </div>
  );
}