import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Play, Pause, Music, Plus, Loader2, RefreshCw } from "lucide-react";
import { loopsOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Metronome, computePeaks } from "@/lib/audio/metronome";
import { LoopLane } from "@/components/loops/LoopLane";

export const Route = createFileRoute("/_authenticated/loops")({
  head: () => ({ meta: [{ title: "Loop Creator — PartyPilot AI" }] }),
  component: Loops,
});

const LOOP_COLORS = [
  "from-rose-500 to-orange-400",
  "from-cyan-500 to-blue-400",
  "from-fuchsia-500 to-pink-400",
  "from-emerald-500 to-lime-400",
  "from-amber-500 to-yellow-400",
  "from-indigo-500 to-violet-400",
];

type LoopRow = {
  id: string;
  name: string;
  storage_path: string | null;
  color: string | null;
  is_muted: boolean | null;
  volume: number | null;
  bpm: number | null;
  bars: number | null;
  peaks: unknown;
  duration_sec: number | null;
};

type LiveLoop = {
  id: string;
  name: string;
  color: string;
  buffer: AudioBuffer;
  peaks: number[];
  bpm: number;
  bars: number;
  durationSec: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  storagePath?: string;
};

function Loops() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery(loopsOptions());

  const [bpm, setBpm] = useState(120);
  const [bars, setBars] = useState(2);
  const [metroOn, setMetroOn] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [loops, setLoops] = useState<LiveLoop[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const metroRef = useRef<Metronome | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Map<string, { src: AudioBufferSourceNode; gain: GainNode; startedAt: number }>>(new Map());
  const masterRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- bootstrap audio context lazily ---
  function ctx(): AudioContext {
    if (!ctxRef.current) {
      const Cls = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new Cls();
      ctxRef.current = c;
      const master = c.createGain();
      master.gain.value = 0.9;
      master.connect(c.destination);
      masterRef.current = master;
      metroRef.current = new Metronome(c, { bpm });
    }
    return ctxRef.current;
  }

  // --- hydrate loops from DB on mount (decode peaks/buffers on demand) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const newOnes = rows.filter((r: LoopRow) => !loops.some((l) => l.id === r.id));
      if (!newOnes.length) return;
      const c = ctx();
      for (const r of newOnes as LoopRow[]) {
        if (!r.storage_path) continue;
        try {
          const { data } = await supabase.storage.from("recordings").createSignedUrl(r.storage_path, 60 * 60);
          if (!data?.signedUrl) continue;
          const res = await fetch(data.signedUrl);
          const ab = await res.arrayBuffer();
          const buf = await c.decodeAudioData(ab.slice(0));
          if (cancelled) return;
          const peaksArr = Array.isArray(r.peaks) ? (r.peaks as number[]) : computePeaks(buf);
          setLoops((prev) => prev.find((p) => p.id === r.id) ? prev : [...prev, {
            id: r.id,
            name: r.name,
            color: r.color ?? LOOP_COLORS[prev.length % LOOP_COLORS.length],
            buffer: buf,
            peaks: peaksArr,
            bpm: r.bpm ?? 120,
            bars: r.bars ?? 2,
            durationSec: r.duration_sec ?? buf.duration,
            volume: r.volume ?? 80,
            muted: !!r.is_muted,
            soloed: false,
            storagePath: r.storage_path,
          }]);
        } catch (e) { console.warn("loop load fail", e); }
      }
    })();
    return () => { cancelled = true; };
  }, [rows]);

  // --- BPM live update of metronome ---
  useEffect(() => { metroRef.current?.setBpm(bpm); }, [bpm]);

  // --- master transport ---
  function startTransport() {
    const c = ctx();
    if (c.state === "suspended") c.resume();
    setPlaying(true);
    const metro = metroRef.current!;
    if (metroOn) metro.start(0);
    // Start all unmuted loops aligned to next downbeat
    const startAt = c.currentTime + 0.06;
    const anySolo = loops.some((l) => l.soloed);
    for (const l of loops) {
      const muteIt = l.muted || (anySolo && !l.soloed);
      if (muteIt) continue;
      playLoop(l, startAt);
    }
    // also store start time for positional RAF
    transportStartRef.current = startAt;
    tickRAF();
  }

  const transportStartRef = useRef(0);

  function stopTransport() {
    setPlaying(false);
    metroRef.current?.stop();
    for (const [, n] of sourcesRef.current) {
      try { n.src.stop(); } catch { /* ignore */ }
    }
    sourcesRef.current.clear();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPositionSec(0);
  }

  function tickRAF() {
    const c = ctxRef.current;
    if (!c) return;
    setPositionSec(c.currentTime - transportStartRef.current);
    rafRef.current = requestAnimationFrame(tickRAF);
  }

  function playLoop(l: LiveLoop, when: number) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = l.buffer;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.value = l.volume / 100;
    src.connect(gain).connect(masterRef.current!);
    src.start(when);
    sourcesRef.current.set(l.id, { src, gain, startedAt: when });
  }

  function stopLoop(id: string) {
    const n = sourcesRef.current.get(id);
    if (!n) return;
    try { n.src.stop(); } catch { /* ignore */ }
    sourcesRef.current.delete(id);
  }

  // --- mute / solo / volume react to running playback ---
  function toggleMute(id: string) {
    setLoops((prev) => prev.map((l) => l.id === id ? { ...l, muted: !l.muted } : l));
    const l = loops.find((x) => x.id === id);
    if (!l) return;
    void supabase.from("loops").update({ is_muted: !l.muted }).eq("id", id);
    if (playing) {
      if (!l.muted) stopLoop(id);
      else if (ctxRef.current) playLoop({ ...l, muted: false }, ctxRef.current.currentTime + 0.02);
    }
  }
  function toggleSolo(id: string) {
    setLoops((prev) => {
      const next = prev.map((l) => l.id === id ? { ...l, soloed: !l.soloed } : l);
      if (!playing) return next;
      const anySolo = next.some((l) => l.soloed);
      for (const l of next) {
        const shouldPlay = !l.muted && (!anySolo || l.soloed);
        const isPlaying = sourcesRef.current.has(l.id);
        if (shouldPlay && !isPlaying && ctxRef.current) playLoop(l, ctxRef.current.currentTime + 0.02);
        if (!shouldPlay && isPlaying) stopLoop(l.id);
      }
      return next;
    });
  }
  function setVolume(id: string, v: number) {
    setLoops((prev) => prev.map((l) => l.id === id ? { ...l, volume: v } : l));
    const n = sourcesRef.current.get(id);
    if (n && ctxRef.current) n.gain.gain.setTargetAtTime(v / 100, ctxRef.current.currentTime, 0.01);
    void supabase.from("loops").update({ volume: v }).eq("id", id);
  }
  async function remove(id: string) {
    stopLoop(id);
    setLoops((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("loops").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["loops"] });
  }

  // --- recording: count-in (optional), then capture exactly bars*beats at BPM ---
  async function record() {
    try {
      const c = ctx();
      if (c.state === "suspended") c.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await saveTake(blob);
      };

      const targetLen = bars * 4 * (60 / bpm);
      const metro = metroRef.current!;
      if (countIn) {
        // Start metronome with 1-bar count-in, then start recording on countin-done.
        const unsub = metro.subscribe((e) => {
          if (e.type === "countin-done") {
            unsub();
            setRecording(true);
            mr.start();
            window.setTimeout(() => { try { mr.stop(); } catch { /* ignore */ } setRecording(false); }, targetLen * 1000);
          }
        });
        if (!metro.isPlaying) metro.start(1);
      } else {
        if (metroOn && !metro.isPlaying) metro.start(0);
        setRecording(true);
        mr.start();
        window.setTimeout(() => { try { mr.stop(); } catch { /* ignore */ } setRecording(false); }, targetLen * 1000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mic denied");
    }
  }

  async function saveTake(blob: Blob) {
    if (!user) return;
    try {
      const c = ctx();
      const ab = await blob.arrayBuffer();
      const decoded = await c.decodeAudioData(ab.slice(0));
      // Trim to exact loop length
      const targetLen = bars * 4 * (60 / bpm);
      const targetFrames = Math.floor(targetLen * decoded.sampleRate);
      const trimmed = c.createBuffer(decoded.numberOfChannels, Math.min(targetFrames, decoded.length), decoded.sampleRate);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const src = decoded.getChannelData(ch);
        const dst = trimmed.getChannelData(ch);
        dst.set(src.subarray(0, dst.length));
        // 10ms fade-out tail
        const fade = Math.min(dst.length, Math.floor(0.01 * decoded.sampleRate));
        for (let i = 0; i < fade; i++) dst[dst.length - 1 - i] *= i / fade;
      }
      const peaks = computePeaks(trimmed);
      const path = `${user.id}/loop-${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("recordings").upload(path, blob);
      if (upErr) throw upErr;
      const color = LOOP_COLORS[loops.length % LOOP_COLORS.length];
      const name = `Loop ${loops.length + 1}`;
      const { data: row, error } = await supabase.from("loops").insert({
        owner_id: user.id,
        name,
        storage_path: path,
        volume: 80,
        color,
        bpm,
        bars,
        peaks,
        duration_sec: trimmed.duration,
      }).select().single();
      if (error) throw error;
      const live: LiveLoop = {
        id: row.id,
        name,
        color,
        buffer: trimmed,
        peaks,
        bpm,
        bars,
        durationSec: trimmed.duration,
        volume: 80,
        muted: false,
        soloed: false,
        storagePath: path,
      };
      setLoops((prev) => [...prev, live]);
      if (playing && masterRef.current) {
        playLoop(live, ctxRef.current!.currentTime + 0.04);
      }
      qc.invalidateQueries({ queryKey: ["loops"] });
      toast.success(`Loop saved · ${bars} bar${bars !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  // --- tap tempo ---
  function tap() {
    const now = performance.now();
    const recent = [...tapTimes.filter((t) => now - t < 2000), now].slice(-4);
    setTapTimes(recent);
    if (recent.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1]);
      const avgMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const newBpm = Math.round(60000 / avgMs);
      if (newBpm >= 40 && newBpm <= 220) setBpm(newBpm);
    }
  }

  const totalDur = useMemo(() => bars * 4 * (60 / bpm), [bars, bpm]);

  return (
    <div className="space-y-5 animate-fade-up pb-20">
      <PageHeader
        title="Loop Creator"
        subtitle="Tap to record. Stack BPM-locked loops. Build a vibe from your own voice and room."
      />

      {/* Transport bar */}
      <div className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1">
            <Music className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">BPM</span>
            <Input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(220, parseInt(e.target.value || "120", 10))))}
              className="h-7 w-16 border-0 bg-transparent text-center text-sm font-bold tabular-nums focus-visible:ring-0"
            />
            <Button size="sm" variant="ghost" onClick={tap} className="h-7 rounded-full px-2 text-[10px]">TAP</Button>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-border bg-background/60 p-1">
            {[1, 2, 4, 8].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={bars === n ? "default" : "ghost"}
                onClick={() => setBars(n)}
                className="h-7 rounded-full px-3 text-[11px]"
              >{n} bar{n !== 1 ? "s" : ""}</Button>
            ))}
          </div>

          <Button
            size="sm"
            variant={metroOn ? "default" : "outline"}
            onClick={() => {
              const next = !metroOn;
              setMetroOn(next);
              if (next && !playing) metroRef.current?.start(0);
              if (!next) metroRef.current?.stop();
            }}
            className="h-9 rounded-full"
          >
            {metroOn ? "Metronome ●" : "Metronome ○"}
          </Button>

          <Button
            size="sm"
            variant={countIn ? "default" : "outline"}
            onClick={() => setCountIn((v) => !v)}
            className="h-9 rounded-full"
          >
            Count-In {countIn ? "●" : "○"}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={playing ? stopTransport : startTransport}
              className={cn(
                "h-10 rounded-full px-5 shadow-stage",
                playing ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
              )}
              disabled={loops.length === 0 && !metroOn}
            >
              {playing ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Play className="mr-2 h-4 w-4" /> Play</>}
            </Button>

            <Button
              onClick={recording ? undefined : record}
              disabled={recording}
              className={cn(
                "h-10 rounded-full px-5 shadow-stage",
                recording
                  ? "animate-pulse bg-destructive text-destructive-foreground"
                  : "bg-accent text-accent-foreground hover:bg-accent/90",
              )}
            >
              {recording ? <><Mic className="mr-2 h-4 w-4" /> Recording…</> : <><Mic className="mr-2 h-4 w-4" /> Record</>}
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground">
          Loop length: <span className="font-medium text-foreground">{totalDur.toFixed(2)}s</span>
          {" "}· One bar = {(60 / bpm * 4).toFixed(2)}s · {countIn ? "1-bar count-in armed" : "Recording starts immediately"}.
        </p>
      </div>

      {/* Lanes */}
      {loops.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Plus className="h-6 w-6" />
          </div>
          <p className="mt-4 font-display text-lg font-semibold">No loops yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hit <strong>Record</strong> and lay down your first vocal, beatbox or sound.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {loops.map((l) => (
            <LoopLane
              key={l.id}
              name={l.name}
              color={l.color}
              peaks={l.peaks}
              durationSec={l.durationSec}
              bpm={l.bpm}
              bars={l.bars}
              volume={l.volume}
              muted={l.muted}
              soloed={l.soloed}
              active={playing && !l.muted && (!loops.some((x) => x.soloed) || l.soloed)}
              positionSec={positionSec}
              onMute={() => toggleMute(l.id)}
              onSolo={() => toggleSolo(l.id)}
              onVolume={(v) => setVolume(l.id, v)}
              onRemove={() => remove(l.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
