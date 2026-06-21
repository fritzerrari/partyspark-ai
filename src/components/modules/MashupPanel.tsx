import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Combine, Play, Pause } from "lucide-react";
import { AutoMagicButton } from "@/components/ui/AutoMagicButton";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useProject, useArtifactsByKind, type ProjectArtifact } from "@/lib/project/store";
import { useEngine } from "@/lib/audio/engine";
import { autoMashup } from "@/lib/audio/mashup";
import { decodeToBuffer } from "@/lib/audio/analyze";

async function loadBuffer(art: ProjectArtifact): Promise<AudioBuffer> {
  if (art.buffer) return art.buffer;
  if (!art.url) throw new Error("Quelle hat keine URL");
  return decodeToBuffer(await (await fetch(art.url)).arrayBuffer());
}

export function MashupPanel() {
  const sources = useArtifactsByKind(["track", "recording", "vocal", "remix"]);
  const addArtifact = useProject((s) => s.addArtifact);
  const toEngineTrack = useProject((s) => s.toEngineTrack);
  const loadQueue = useEngine((s) => s.loadQueue);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const [xf, setXf] = useState(4);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const pv = useState<{ a: HTMLAudioElement | null }>({ a: null })[0];

  const A = useMemo(() => sources.find((s) => s.id === a) ?? sources[0] ?? null, [sources, a]);
  const B = useMemo(() => sources.find((s) => s.id === b) ?? sources[1] ?? null, [sources, b]);

  async function run(auto: boolean) {
    if (!A || !B || A.id === B.id) { toast.error("Zwei unterschiedliche Quellen wählen"); return; }
    setBusy(true);
    try {
      const bufA = await loadBuffer(A);
      const bufB = await loadBuffer(B);
      const ctx = new OfflineAudioContext(2, 1024, bufA.sampleRate);
      const res = await autoMashup(ctx, bufA, bufB, { crossfadeSec: auto ? 6 : xf });
      const id = addArtifact({
        kind: "mashup",
        title: `${A.title} × ${B.title}`,
        buffer: res.buffer,
        meta: { bpmA: res.bpmA, bpmB: res.bpmB },
      });
      setLastId(id);
      toast.success(`Mashup: ${Math.round(res.bpmA)} BPM × ${Math.round(res.bpmB)} BPM`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  function preview() {
    if (!lastId) return;
    if (pv.a) { pv.a.pause(); pv.a = null; setPreviewing(false); return; }
    const t = toEngineTrack(lastId); if (!t?.url) return;
    const audio = new Audio(t.url); audio.onended = () => { setPreviewing(false); pv.a = null; };
    audio.play().catch(() => {}); pv.a = audio; setPreviewing(true);
  }

  function sendToDeck() {
    if (!lastId) return;
    const t = toEngineTrack(lastId);
    if (t) { loadQueue([t], { autoplay: false }); toast.success("Auf Deck A"); }
  }

  return (
    <div className="space-y-3 text-sm text-stage-foreground">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-stage-foreground/60">Track A</label>
          <select value={A?.id ?? ""} onChange={(e) => setA(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-xs">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-stage-foreground/60">Track B</label>
          <select value={B?.id ?? ""} onChange={(e) => setB(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-xs">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
      </div>

      <AutoMagicButton onClick={() => run(true)} loading={busy} disabled={!A || !B || A?.id === B?.id} hint="Macht zwei Quellen tempo-synchron + crossfaded sie automatisch." />

      <details className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stage-foreground/80">Erweitert</summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex justify-between text-xs"><span>Crossfade</span><span className="font-mono">{xf}s</span></div>
            <Slider value={[xf]} min={1} max={16} step={1} onValueChange={(v) => setXf(v[0])} />
          </div>
          <Button size="sm" onClick={() => run(false)} disabled={busy} className="rounded-full"><Combine className="mr-2 h-3 w-3" /> Manuell rendern</Button>
        </div>
      </details>

      {lastId && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
          <span className="line-clamp-1 flex-1 text-xs">Mashup fertig</span>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={preview}>
            {previewing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full text-stage-foreground" onClick={sendToDeck}>→ Deck</Button>
        </div>
      )}
    </div>
  );
}