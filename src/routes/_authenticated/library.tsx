import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Music2, Heart, Play, Loader2, Search, Wand2,
  CheckSquare, Square as SquareIcon, Filter, X, ArrowRight,
  Disc3, Sparkles, AudioLines, Trash2, CheckCircle2,
} from "lucide-react";
import { tracksListOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEngine } from "@/lib/audio/engine";
import { useTwinDeck } from "@/lib/audio/twinDeckBus";
import { keyToCamelot } from "@/lib/audio/keyToCamelot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeAudio, decodeToBuffer } from "@/lib/audio/analyze";
import { findTransitionPoints } from "@/lib/audio/transitionScore";
import { SmartOrderPanel } from "@/components/playlist/SmartOrderPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Music Library — PartyPilot AI" }] }),
  component: Library,
});

function Library() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tracks = [] } = useQuery(tracksListOptions());
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzingSet, setAnalyzingSet] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(180);
  const [energyMin, setEnergyMin] = useState(0);
  const [keyFilter, setKeyFilter] = useState<Set<string>>(new Set());
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(false);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadingDeck, setLoadingDeck] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const engine = useEngine();
  const loadDeck = useTwinDeck((s) => s.loadDeck);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const path = `${user!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("tracks").upload(path, file, {
          contentType: file.type || "audio/mpeg",
        });
        if (upErr) throw upErr;

        // Probe duration via Audio element
        const dur = await new Promise<number>((resolve) => {
          const a = new Audio(URL.createObjectURL(file));
          a.addEventListener("loadedmetadata", () => resolve(Math.round(a.duration)));
          a.addEventListener("error", () => resolve(0));
        });

        const title = file.name.replace(/\.[^.]+$/, "");
        // Analyze on upload
        let analysisFields: Record<string, unknown> = { energy: 60, mood: "Build" };
        try {
          const buf = await decodeToBuffer(file);
          const a = await analyzeAudio(buf);
          const tp = findTransitionPoints(a.beatGrid, a.vocalMap, a.energyCurve, a.cues, buf.duration);
          analysisFields = {
            bpm: a.bpm,
            music_key: a.musicalKey,
            energy: 60,
            mood: "Build",
            beat_grid: a.beatGrid,
            energy_curve: a.energyCurve,
            cues: { ...a.cues, ...tp },
            vocal_map: a.vocalMap,
            analyzed_at: new Date().toISOString(),
          };
        } catch (e) {
          console.warn("Analyse fehlgeschlagen, fahre ohne fort", e);
        }
        await supabase.from("tracks").insert({
          owner_id: user!.id,
          title,
          artist: "You",
          storage_path: path,
          duration_sec: dur,
          ...analysisFields,
        });
      }
      toast.success(`Uploaded ${files.length} track${files.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["tracks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function play(t: (typeof tracks)[number]) {
    if (!t.storage_path) return;
    const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
    if (!data?.signedUrl) {
      toast.error("Could not load track");
      return;
    }
    engine.loadQueue([
      {
        id: t.id,
        title: t.title,
        artist: t.artist,
        url: data.signedUrl,
        durationSec: t.duration_sec,
        artwork: t.artwork_url,
        energy: t.energy,
        bpm: t.bpm,
        musicalKey: (t as { music_key?: string | null }).music_key ?? null,
        beatGrid: (t as { beat_grid?: number[] | null }).beat_grid ?? null,
        cues: (t as { cues?: { introEnd: number; firstDrop: number; outroStart: number } | null }).cues ?? null,
        vocalMap: (t as { vocal_map?: { t: number; voiced: number }[] | null }).vocal_map ?? null,
      },
    ]);
  }

  async function reanalyze(t: (typeof tracks)[number]) {
    if (!t.storage_path) return;
    setAnalyzingId(t.id);
    setAnalyzingSet((s) => new Set(s).add(t.id));
    try {
      const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
      if (!data?.signedUrl) throw new Error("Track nicht ladbar");
      const res = await fetch(data.signedUrl);
      const buf = await decodeToBuffer(await res.arrayBuffer());
      const a = await analyzeAudio(buf);
      const tp = findTransitionPoints(a.beatGrid, a.vocalMap, a.energyCurve, a.cues, buf.duration);
      await supabase.from("tracks").update({
        bpm: a.bpm,
        music_key: a.musicalKey,
        beat_grid: a.beatGrid,
        energy_curve: a.energyCurve,
        cues: { ...a.cues, ...tp },
        vocal_map: a.vocalMap,
        analyzed_at: new Date().toISOString(),
      }).eq("id", t.id);
      qc.invalidateQueries({ queryKey: ["tracks"] });
      toast.success(`Analysiert: ${Math.round(a.bpm)} BPM · ${a.musicalKey}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
    } finally {
      setAnalyzingId(null);
      setAnalyzingSet((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }
  }

  async function favorite(t: (typeof tracks)[number]) {
    await supabase.from("tracks").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["tracks"] });
  }

  async function deleteTrack(t: (typeof tracks)[number]) {
    if (!confirm(`"${t.title}" wirklich löschen?`)) return;
    setDeletingId(t.id);
    try {
      if (t.storage_path) {
        await supabase.storage.from("tracks").remove([t.storage_path]);
      }
      const { error } = await supabase.from("tracks").delete().eq("id", t.id);
      if (error) throw error;
      setSelectedIds((s) => s.filter((x) => x !== t.id));
      qc.invalidateQueries({ queryKey: ["tracks"] });
      toast.success("Track gelöscht");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (!confirm(`${count} Tracks wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setBulkDeleting(true);
    try {
      const toDelete = selectedIds
        .map((id) => tracks.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => !!t);
      const paths = toDelete.map((t) => t.storage_path).filter((p): p is string => !!p);
      if (paths.length > 0) {
        await supabase.storage.from("tracks").remove(paths);
      }
      const { error } = await supabase.from("tracks").delete().in("id", selectedIds);
      if (error) throw error;
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["tracks"] });
      toast.success(`${count} Tracks gelöscht`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Massenlöschen fehlgeschlagen");
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelectAll() {
    const ids = fullyFiltered.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((s) => s.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((s) => [...new Set([...s, ...ids])]);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function analyzeMissing() {
    const missing = selectedIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t && !(t as { analyzed_at?: string | null }).analyzed_at);
    for (const t of missing) {
      await reanalyze(t);
    }
  }

  async function loadOrderedToCockpit(orderedIds: string[]) {
    const ordered = orderedIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
    const queueItems = await Promise.all(ordered.map(async (t) => {
      const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path!, 60 * 60);
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        url: data?.signedUrl ?? "",
        durationSec: t.duration_sec,
        artwork: t.artwork_url,
        energy: t.energy,
        bpm: t.bpm,
        musicalKey: (t as { music_key?: string | null }).music_key ?? null,
        beatGrid: (t as { beat_grid?: number[] | null }).beat_grid ?? null,
        cues: (t as { cues?: { introEnd: number; firstDrop: number; outroStart: number } | null }).cues ?? null,
        vocalMap: (t as { vocal_map?: { t: number; voiced: number }[] | null }).vocal_map ?? null,
      };
    }));
    engine.loadQueue(queueItems);
    toast.success(`Queue an Cockpit gesendet (${queueItems.length} Tracks)`);
  }

  async function loadToDeck(side: "A" | "B", t: (typeof tracks)[number]) {
    if (!t.storage_path) return;
    setLoadingDeck(t.id + side);
    try {
      const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
      if (!data?.signedUrl) throw new Error("Track nicht ladbar");
      const musicalKey = (t as { music_key?: string | null }).music_key ?? null;
      await loadDeck(side, {
        id: t.id, title: t.title, artist: t.artist ?? null, url: data.signedUrl,
        artwork: t.artwork_url ?? null, bpm: t.bpm ?? null, musicalKey,
        camelot: keyToCamelot(musicalKey),
        beatGrid: (t as { beat_grid?: number[] | null }).beat_grid ?? null,
        cues: (t as { cues?: { introEnd: number; firstDrop: number; outroStart: number } | null }).cues ?? null,
        vocalMap: (t as { vocal_map?: { t: number; voiced: number }[] | null }).vocal_map ?? null,
        durationSec: t.duration_sec ?? null,
      });
      toast.success(`→ Deck ${side}: ${t.title}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Deck nicht laden");
    } finally {
      setLoadingDeck(null);
    }
  }

  const allCamelot = useMemo(() => {
    const s = new Set<string>();
    for (const t of tracks) {
      const k = (t as { music_key?: string | null }).music_key;
      const c = keyToCamelot(k ?? null);
      if (c) s.add(c);
    }
    return [...s].sort();
  }, [tracks]);

  const fullyFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tracks.filter((t) => {
      if (q && !((t.title + " " + (t.artist ?? "")).toLowerCase().includes(q))) return false;
      if (onlyFavs && !t.is_favorite) return false;
      const analyzed = !!(t as { analyzed_at?: string | null }).analyzed_at;
      if (onlyAnalyzed && !analyzed) return false;
      const bpm = t.bpm ?? null;
      if (bpm != null && (bpm < bpmMin || bpm > bpmMax)) return false;
      if ((t.energy ?? 0) < energyMin) return false;
      if (keyFilter.size > 0) {
        const cam = keyToCamelot((t as { music_key?: string | null }).music_key ?? null);
        if (!cam || !keyFilter.has(cam)) return false;
      }
      return true;
    });
  }, [tracks, search, onlyFavs, onlyAnalyzed, bpmMin, bpmMax, energyMin, keyFilter]);

  function toggleKey(k: string) {
    setKeyFilter((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }
  function resetFilters() {
    setSearch(""); setBpmMin(60); setBpmMax(180); setEnergyMin(0);
    setKeyFilter(new Set()); setOnlyAnalyzed(false); setOnlyFavs(false);
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    (bpmMin > 60 || bpmMax < 180 ? 1 : 0) +
    (energyMin > 0 ? 1 : 0) +
    (keyFilter.size > 0 ? 1 : 0) +
    (onlyAnalyzed ? 1 : 0) + (onlyFavs ? 1 : 0);

  const unanalyzedCount = tracks.filter((t) => !(t as { analyzed_at?: string | null }).analyzed_at).length;

  return (
    <div className="animate-fade-up pb-32 sm:pb-4">
      <input
        ref={fileRef} type="file" accept="audio/*" multiple
        className="hidden" onChange={onUpload}
      />

      {/* Hero header */}
      <div className="mb-4 rounded-3xl stage-gradient p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stage-foreground/60">Schritt 1</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-stage-foreground sm:text-3xl">
              Music Library
            </h1>
            <p className="mt-1 text-xs text-stage-foreground/60">
              {tracks.length} Tracks · {tracks.length - unanalyzedCount} analysiert
              {unanalyzedCount > 0 && ` · ${unanalyzedCount} brauchen noch Analyse`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => fileRef.current?.click()} disabled={busy}
              className="h-11 rounded-full bg-[var(--neon-cyan)] text-black hover:brightness-110 neon-glow-cyan"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-2 h-4 w-4" /> Tracks hochladen</>}
            </Button>
            <Button
              variant="outline"
              onClick={() => fullyFiltered.length > 0 && loadOrderedToCockpit(fullyFiltered.map((t) => t.id))}
              disabled={fullyFiltered.length === 0}
              className="h-11 rounded-full border-white/20 bg-white/10 text-stage-foreground hover:bg-white/20"
            >
              <ArrowRight className="mr-2 h-4 w-4" /> Auswahl → Cockpit
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Filter rail */}
        <aside className={cn(
          "rounded-3xl border border-border bg-card/60 p-4 backdrop-blur lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto",
          !filtersOpen && "hidden lg:block",
        )}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Filter</p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-[10px] uppercase tracking-widest text-[var(--neon-cyan)] hover:underline">
                Reset ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <FilterBlock label={`BPM · ${bpmMin}–${bpmMax}`}>
            <div className="flex gap-2">
              <input type="range" min={60} max={180} value={bpmMin} onChange={(e) => setBpmMin(+e.target.value)} className="flex-1 accent-[var(--neon-cyan)]" />
              <input type="range" min={60} max={180} value={bpmMax} onChange={(e) => setBpmMax(+e.target.value)} className="flex-1 accent-[var(--neon-magenta)]" />
            </div>
          </FilterBlock>

          <FilterBlock label={`Energy ≥ ${energyMin}`}>
            <input type="range" min={0} max={100} value={energyMin} onChange={(e) => setEnergyMin(+e.target.value)} className="w-full accent-[var(--neon-cyan)]" />
          </FilterBlock>

          <FilterBlock label={`Camelot${keyFilter.size > 0 ? ` · ${keyFilter.size}` : ""}`}>
            {allCamelot.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">Keine Keys erkannt — analysiere deine Tracks zuerst.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {allCamelot.map((k) => (
                  <button key={k} onClick={() => toggleKey(k)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] font-bold transition",
                      keyFilter.has(k)
                        ? "border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)]"
                        : "border-border bg-muted text-muted-foreground hover:text-foreground",
                    )}>
                    {k}
                  </button>
                ))}
              </div>
            )}
          </FilterBlock>

          <div className="mt-4 space-y-2">
            <ToggleRow checked={onlyAnalyzed} onChange={setOnlyAnalyzed} label="Nur analysierte" />
            <ToggleRow checked={onlyFavs} onChange={setOnlyFavs} label="Nur Favoriten" />
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--neon-magenta)]/30 bg-[var(--neon-magenta)]/10 p-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--neon-magenta)]">
                {selectedIds.length} ausgewählt
              </p>
              <SmartOrderPanel
                tracks={tracks as unknown as Parameters<typeof SmartOrderPanel>[0]["tracks"]}
                selectedIds={selectedIds}
                analyzingIds={analyzingSet}
                onToggle={toggleSelect}
                onAnalyzeMissing={analyzeMissing}
                onLoadToCockpit={loadOrderedToCockpit}
              />
            </div>
          )}
        </aside>

        {/* Smart list */}
        <div className="min-w-0">
          <div className="mb-2 flex min-h-[36px] flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                disabled={fullyFiltered.length === 0 || bulkDeleting}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition hover:bg-muted disabled:opacity-50"
              >
                {fullyFiltered.length > 0 && fullyFiltered.every((t) => selectedIds.includes(t.id)) ? (
                  <><CheckSquare className="h-3.5 w-3.5 text-[var(--neon-magenta)]" /> Keine</>
                ) : (
                  <><SquareIcon className="h-3.5 w-3.5" /> Alle</>
                )}
              </button>
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-[var(--neon-magenta)]/15 px-2.5 py-1 text-[10px] font-bold text-[var(--neon-magenta)]">
                  {selectedIds.length} ausgewählt
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <button
                  onClick={deleteSelected}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-500 transition hover:bg-red-500/25 disabled:opacity-50"
                >
                  {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {bulkDeleting ? "Löschen…" : "Löschen"}
                </button>
              )}
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest lg:hidden"
              >
              {filtersOpen ? <X className="h-3 w-3" /> : <Filter className="h-3 w-3" />}
              {filtersOpen ? "Filter zu" : "Filter"}
            </button>
          </div>

          {tracks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary">
                <Music2 className="h-8 w-8" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold">Deine Library ist leer</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lade MP3s hoch oder zieh sie einfach irgendwo auf die Seite.
              </p>
              <Button className="mt-5 rounded-full bg-[var(--neon-cyan)] text-black hover:brightness-110" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Tracks hochladen
              </Button>
            </div>
          ) : fullyFiltered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">Kein Track passt zu den Filtern.</p>
              <Button variant="ghost" onClick={resetFilters} className="mt-2 text-[var(--neon-cyan)]">Filter zurücksetzen</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {fullyFiltered.map((t) => {
                const analyzed = !!(t as { analyzed_at?: string | null }).analyzed_at;
                const cam = keyToCamelot((t as { music_key?: string | null }).music_key ?? null);
                const energy = t.energy ?? 0;
                const vocalMap = (t as { vocal_map?: { t: number; voiced: number }[] | null }).vocal_map ?? null;
                const vocalPct = vocalMap && vocalMap.length > 0
                  ? Math.round((vocalMap.filter((v) => v.voiced > 0.4).length / vocalMap.length) * 100)
                  : null;
                const selected = selectedIds.includes(t.id);
                return (
                  <div key={t.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-2xl border bg-card p-2 transition hover:border-[var(--neon-cyan)]/40 hover:bg-card/90",
                      selected ? "border-[var(--neon-magenta)] shadow-[0_0_24px_rgba(255,0,170,0.2)]" : "border-border",
                    )}>
                    <button onClick={() => toggleSelect(t.id)}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-[var(--neon-magenta)]" aria-label="Auswählen">
                      {selected ? <CheckSquare className="h-4 w-4 text-[var(--neon-magenta)]" /> : <SquareIcon className="h-4 w-4" />}
                    </button>

                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-accent/40">
                      <AudioLines className="absolute inset-0 m-auto h-5 w-5 text-white/70" />
                      {analyzed && (
                        <span
                          title="Analysiert"
                          className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--neon-cyan)] text-black shadow-[0_0_10px_rgba(0,255,255,0.6)] ring-2 ring-card"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.artist ?? "Unknown"}</p>
                    </div>

                    <div className="hidden items-center gap-1.5 sm:flex">
                      {t.bpm ? <Chip>{Math.round(t.bpm)} BPM</Chip> : <Chip muted>—</Chip>}
                      {cam ? <Chip accent>{cam}</Chip> : null}
                      {analyzed
                        ? <Chip ok>✓ analysiert</Chip>
                        : <Chip warn>unanalysiert</Chip>}
                    </div>

                    <div className="hidden w-16 shrink-0 md:block" title={`Energy ${energy}`}>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-magenta)]" style={{ width: `${energy}%` }} />
                      </div>
                      <p className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">E {energy}</p>
                    </div>

                    {vocalPct != null && (
                      <div className="hidden w-12 shrink-0 text-center md:block" title="Vocal-Anteil">
                        <p className="text-[11px] font-bold text-[var(--neon-magenta)]">{vocalPct}%</p>
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">vox</p>
                      </div>
                    )}

                    <button onClick={() => favorite(t)}
                      className={cn("shrink-0 rounded-lg p-1.5 transition", t.is_favorite ? "text-[var(--neon-magenta)]" : "text-muted-foreground hover:text-foreground")}
                      aria-label="Favorit">
                      <Heart className={cn("h-4 w-4", t.is_favorite && "fill-current")} />
                    </button>

                    <button onClick={() => reanalyze(t)} disabled={analyzingId === t.id}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-[var(--neon-cyan)] disabled:opacity-50"
                      title={analyzed ? "Erneut analysieren" : "Analysieren"}>
                      {analyzingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </button>

                    <button onClick={() => deleteTrack(t)} disabled={deletingId === t.id}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                      title="Track löschen">
                      {deletingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>

                    <div className="hidden shrink-0 items-center gap-1 sm:flex">
                      <button onClick={() => loadToDeck("A", t)} disabled={loadingDeck === t.id + "A"}
                        className="rounded-lg border border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/20 disabled:opacity-50"
                        title="In Deck A laden">
                        {loadingDeck === t.id + "A" ? <Loader2 className="h-3 w-3 animate-spin" /> : "A"}
                      </button>
                      <button onClick={() => loadToDeck("B", t)} disabled={loadingDeck === t.id + "B"}
                        className="rounded-lg border border-[var(--neon-magenta)]/40 bg-[var(--neon-magenta)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--neon-magenta)] hover:bg-[var(--neon-magenta)]/20 disabled:opacity-50"
                        title="In Deck B laden">
                        {loadingDeck === t.id + "B" ? <Loader2 className="h-3 w-3 animate-spin" /> : "B"}
                      </button>
                    </div>

                    <button onClick={() => play(t)}
                      className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-primary-foreground hover:bg-primary/90"
                      title="Vorhören">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {fullyFiltered.length > 0 && (
            <p className="mt-6 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Auswählen → unten in der Filter-Rail planst du die Reihenfolge ·
              <Disc3 className="h-3 w-3" />
              A/B = direkt auf das Deck
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{label}</p>
      {children}
    </div>
  );
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-[var(--neon-cyan)]" : "bg-muted",
        )}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

function Chip({ children, accent, warn, muted, ok }: { children: React.ReactNode; accent?: boolean; warn?: boolean; muted?: boolean; ok?: boolean }) {
  return (
    <span className={cn(
      "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest",
      accent && "bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]",
      warn && "bg-amber-500/20 text-amber-600 dark:text-amber-300",
      ok && "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300",
      !accent && !warn && !muted && !ok && "bg-muted text-foreground/80",
      muted && "text-muted-foreground/50",
    )}>{children}</span>
  );
}