import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mic, Square, Play, Pause, Save, ArrowLeft, Wand2, Loader2, Layers, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { TrackLane } from "@/components/studio/TrackLane";
import { PitchCoach, type PitchSample } from "@/components/studio/PitchCoach";
import {
  MultitrackPlayer, type Track, pickColor, buildPeaks, mixdown, decodeBlob,
} from "@/lib/audio/multitrack";
import { LivePitchTracker, freqToMidi, midiToName, snapToScale } from "@/lib/audio/pitch";
import { analyzeRecording, scoreLabel } from "@/lib/audio/scoring";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateCoverArt } from "@/lib/ai/cover.functions";
import { generateCoachFeedback } from "@/lib/ai/coach.functions";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({ meta: [{ title: "Karaoke Studio — PartyPilot AI" }] }),
  component: Studio,
});

const PX_PER_SEC = 60;

function Studio() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const coverFn = useServerFn(generateCoverArt);
  const coachFn = useServerFn(generateCoachFeedback);

  const [projectName, setProjectName] = useState("Untitled Session");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [overdub, setOverdub] = useState(true); // record while existing tracks play
  const [busy, setBusy] = useState(false);

  // Pitch coach state
  const [pitchHistory, setPitchHistory] = useState<PitchSample[]>([]);
  const [pitchNow, setPitchNow] = useState<{ midi: number; cents: number; clarity: number; noteName: string } | null>(null);

  // Refs for stable audio state
  const playerRef = useRef<MultitrackPlayer | null>(null);
  const recCtxRef = useRef<AudioContext | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartedAtRef = useRef(0);
  const pitchTrackerRef = useRef<LivePitchTracker | null>(null);
  const pitchAnalyserRef = useRef<AnalyserNode | null>(null);
  const positionRafRef = useRef<number | null>(null);

  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) playerRef.current = new MultitrackPlayer();
    return playerRef.current;
  }, []);

  useEffect(() => () => {
    playerRef.current?.dispose();
    if (positionRafRef.current) cancelAnimationFrame(positionRafRef.current);
  }, []);

  const projectDuration = Math.max(0, ...tracks.map((t) => t.startSec + t.durationSec));

  /* ---------- Playback ---------- */

  const startPlayback = useCallback(async (fromSec = positionSec) => {
    if (!tracks.length) return;
    const player = ensurePlayer();
    await player.play(tracks, fromSec);
    setPlaying(true);
    const tick = () => {
      const p = player.position();
      setPositionSec(p);
      if (p >= projectDuration) {
        player.stop();
        setPlaying(false);
        setPositionSec(0);
        return;
      }
      positionRafRef.current = requestAnimationFrame(tick);
    };
    positionRafRef.current = requestAnimationFrame(tick);
  }, [tracks, positionSec, ensurePlayer, projectDuration]);

  const stopPlayback = useCallback(() => {
    playerRef.current?.stop();
    setPlaying(false);
    if (positionRafRef.current) cancelAnimationFrame(positionRafRef.current);
  }, []);

  /* ---------- Recording (with optional overdub) ---------- */

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      recStreamRef.current = stream;
      const ctx = new AudioContext();
      recCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      pitchAnalyserRef.current = analyser;
      pitchTrackerRef.current = new LivePitchTracker(analyser);

      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const buf = await decodeBlob(blob);
          const startSec = overdub && tracks.length > 0 ? recStartedAtRef.current : 0;
          const id = crypto.randomUUID();
          const newTrack: Track = {
            id,
            name: `Take ${tracks.length + 1}`,
            buffer: buf,
            blob,
            volume: 0.9, pan: 0, muted: false, soloed: false,
            color: pickColor(tracks.length),
            startSec,
            durationSec: buf.duration,
            peakData: buildPeaks(buf),
          };
          setTracks((prev) => [...prev, newTrack]);
          toast.success(`Spur ${tracks.length + 1} aufgenommen (${buf.duration.toFixed(1)}s)`);
        } catch (e) {
          console.error(e);
          toast.error("Aufnahme konnte nicht decodiert werden");
        }
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
        recStreamRef.current = null;
        recCtxRef.current = null;
        pitchTrackerRef.current = null;
        pitchAnalyserRef.current = null;
        setPitchHistory([]);
        setPitchNow(null);
      };
      recRef.current = mr;

      // Overdub: start existing track playback in sync
      if (overdub && tracks.length > 0) {
        recStartedAtRef.current = positionSec;
        await startPlayback(positionSec);
      } else {
        recStartedAtRef.current = 0;
        setPositionSec(0);
      }

      mr.start();
      setRecording(true);

      // Pitch tracking loop
      const tStart = performance.now();
      const loop = () => {
        if (!pitchTrackerRef.current) return;
        const { hz, clarity } = pitchTrackerRef.current.read();
        if (clarity > 0.85 && hz > 70 && hz < 1200) {
          const midi = freqToMidi(hz);
          const target = snapToScale(Math.round(midi), "chromatic");
          const cents = (midi - target) * 100;
          const sample: PitchSample = { t: (performance.now() - tStart) / 1000, midi, cents };
          setPitchHistory((h) => {
            const next = [...h, sample];
            return next.length > 400 ? next.slice(-400) : next;
          });
          setPitchNow({ midi, cents, clarity, noteName: midiToName(target) });
        } else {
          setPitchNow(null);
        }
        if (pitchTrackerRef.current) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      toast.error("Mikrofon-Zugriff verweigert");
    }
  }, [overdub, tracks, positionSec, startPlayback]);

  const stopRecording = useCallback(() => {
    recRef.current?.stop();
    setRecording(false);
    stopPlayback();
  }, [stopPlayback]);

  /* ---------- Track edits ---------- */

  const updateTrack = (id: string, next: Track) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? next : t)));
    if (playerRef.current?.playing) {
      const updated = tracks.map((t) => (t.id === id ? next : t));
      const anySolo = updated.some((t) => t.soloed);
      playerRef.current.liveUpdate(next, anySolo);
    }
  };

  const removeTrack = (id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  /* ---------- Save mixdown ---------- */

  const saveMixdown = async () => {
    if (!user || !tracks.length) return;
    setBusy(true);
    try {
      toast.loading("Mixdown läuft…", { id: "mix" });
      const blob = await mixdown(tracks);
      const buf = await decodeBlob(blob);
      const score = analyzeRecording(buf);
      const path = `${user.id}/studio-${Date.now()}.wav`;
      const { error: upErr } = await supabase.storage.from("recordings").upload(path, blob);
      if (upErr) throw upErr;

      toast.loading("KI generiert Cover-Art…", { id: "mix" });
      let coverUrl: string | null = null;
      try {
        const { dataUrl } = await coverFn({ data: { title: projectName, score: score.overall } });
        // Upload cover to artwork bucket
        const coverBlob = await (await fetch(dataUrl)).blob();
        const coverPath = `${user.id}/cover-${Date.now()}.png`;
        const { error: cErr } = await supabase.storage.from("artwork").upload(coverPath, coverBlob);
        if (!cErr) {
          const { data: pub } = supabase.storage.from("artwork").getPublicUrl(coverPath);
          coverUrl = pub.publicUrl;
        }
      } catch (e) {
        console.warn("Cover generation skipped:", e);
      }

      toast.loading("KI-Coach analysiert…", { id: "mix" });
      let feedback: string | null = null;
      try {
        const r = await coachFn({
          data: {
            title: projectName,
            pitchAccuracy: score.pitchAccuracy,
            stability: score.stability,
            energy: score.energy,
            overall: score.overall,
            language: "de",
          },
        });
        feedback = r.feedback;
      } catch (e) {
        console.warn("Coach feedback skipped:", e);
      }

      await supabase.from("recordings").insert({
        owner_id: user.id,
        storage_path: path,
        kind: "karaoke",
        title: projectName,
        score: score.overall,
        cover_url: coverUrl,
        metadata: {
          trackCount: tracks.length,
          pitchAccuracy: score.pitchAccuracy,
          stability: score.stability,
          energyScore: score.energy,
          feedback,
        },
      });

      qc.invalidateQueries({ queryKey: ["recordings"] });
      toast.success(
        `Gespeichert! Score: ${score.overall} — ${scoreLabel(score.overall)}`,
        { id: "mix", duration: 5000 },
      );
      if (feedback) toast(feedback, { duration: 7000 });
    } catch (e) {
      console.error(e);
      toast.error("Speichern fehlgeschlagen", { id: "mix" });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Layout ---------- */

  const ticks = Math.max(8, Math.ceil(projectDuration) + 4);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <Link to="/karaoke" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader
          title="Karaoke Studio"
          subtitle="Multitrack-Recorder mit Live Pitch-Coach"
        />
      </div>

      {/* Project + Master controls */}
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-card p-4">
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="max-w-xs rounded-full"
          placeholder="Session-Name"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={overdub} onChange={(e) => setOverdub(e.target.checked)} />
            <Layers className="h-3.5 w-3.5" /> Overdub
          </label>
          {!recording ? (
            <Button onClick={startRecording} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Mic className="mr-2 h-4 w-4" /> Aufnehmen
            </Button>
          ) : (
            <Button onClick={stopRecording} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse">
              <Square className="mr-2 h-4 w-4" /> Stop
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => (playing ? stopPlayback() : startPlayback())}
            disabled={!tracks.length || recording}
            className="rounded-full"
          >
            {playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button onClick={saveMixdown} disabled={!tracks.length || busy || recording} className="rounded-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Mixdown + KI
          </Button>
        </div>
      </section>

      {/* Pitch Coach (only while recording) */}
      {recording && (
        <PitchCoach active history={pitchHistory} current={pitchNow} />
      )}

      {/* Multitrack timeline */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        {/* Ruler */}
        <div className="flex border-b border-border bg-muted/40">
          <div className="w-56 shrink-0 border-r border-border px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
            Tracks
          </div>
          <div className="relative h-8 flex-1 overflow-x-auto">
            <div style={{ width: `${ticks * PX_PER_SEC}px` }} className="relative h-full">
              {Array.from({ length: ticks }).map((_, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-border/60 pl-1 text-[10px] text-muted-foreground" style={{ left: `${i * PX_PER_SEC}px` }}>
                  {i}s
                </div>
              ))}
              <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-accent" style={{ left: `${positionSec * PX_PER_SEC}px` }} />
            </div>
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <Disc3 className="h-12 w-12 animate-spin-slow text-muted-foreground/50" />
            <p>Noch keine Spuren. Klicke <strong>Aufnehmen</strong> für deine erste Tonspur.</p>
            <p className="text-xs">Mit aktivem <em>Overdub</em> kannst du weitere Layer dazumischen.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${224 + ticks * PX_PER_SEC}px` }}>
              {tracks.map((t) => (
                <TrackLane
                  key={t.id}
                  track={t}
                  positionSec={positionSec - t.startSec < 0 ? -1 : positionSec}
                  pxPerSec={PX_PER_SEC}
                  onChange={(next) => updateTrack(t.id, next)}
                  onRemove={() => removeTrack(t.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {tracks.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          <Wand2 className="mr-1 inline h-3 w-3" />
          „Mixdown + KI" rendert alle Spuren zusammen, scort die Performance und generiert ein Cover-Bild.
        </p>
      )}
    </div>
  );
}