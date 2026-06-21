import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Music2, Heart, Play, Loader2, Search } from "lucide-react";
import { tracksListOptions } from "@/lib/db/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEngine } from "@/lib/audio/engine";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [search, setSearch] = useState("");
  const engine = useEngine();

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
        await supabase.from("tracks").insert({
          owner_id: user!.id,
          title,
          artist: "You",
          storage_path: path,
          duration_sec: dur,
          energy: 60,
          mood: "Build",
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
      },
    ]);
  }

  async function favorite(t: (typeof tracks)[number]) {
    await supabase.from("tracks").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["tracks"] });
  }

  const filtered = tracks.filter((t) =>
    (t.title + " " + (t.artist ?? "")).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Music Library"
        subtitle="Upload your MP3s. PartyPilot will use them to fill the night."
        action={
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-11 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-2 h-4 w-4" /> Upload MP3s</>}
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={onUpload}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tracks"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 rounded-full pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Music2 className="h-6 w-6" />
          </div>
          <p className="mt-4 font-display text-lg font-semibold">Your library is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop in a few MP3s to give PartyPilot something to work with.
          </p>
          <Button
            className="mt-5 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" /> Upload MP3s
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className="group rounded-2xl border border-border bg-card p-4">
              <div className="aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-accent/40">
                <div className="h-full w-full animate-float" />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.artist ?? "Unknown"}</p>
                </div>
                <button
                  onClick={() => favorite(t)}
                  className={"shrink-0 rounded-full p-2 transition " + (t.is_favorite ? "text-accent" : "text-muted-foreground hover:text-foreground")}
                  aria-label="Favorite"
                >
                  <Heart className={"h-4 w-4 " + (t.is_favorite ? "fill-current" : "")} />
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => play(t)}
                className="mt-3 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Play className="mr-2 h-4 w-4" /> Play
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}