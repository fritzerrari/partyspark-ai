import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { storageQuotaOptions } from "@/lib/db/queries";
import {
  sha256,
  probeAudio,
  bytesToHuman,
  FX_MAX_DURATION_SEC,
  FX_MAX_FILE_BYTES,
  FX_CATEGORIES,
} from "@/lib/fx/utils";
import type { Database } from "@/integrations/supabase/types";

type FxCategory = Database["public"]["Enums"]["fx_category"];

export const Route = createFileRoute("/_authenticated/fx/upload")({
  head: () => ({ meta: [{ title: "FX hochladen — PartyPilot AI" }] }),
  component: FxUpload,
});

function FxUpload() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FxCategory>("drop");
  const [tagsRaw, setTagsRaw] = useState("");
  const [bpm, setBpm] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: quota } = useQuery({ ...storageQuotaOptions(user?.id ?? ""), enabled: !!user?.id });
  const fxUsed = quota?.fx_bytes_used ?? 0;
  const fxQuota = quota?.fx_quota_bytes ?? FX_MAX_FILE_BYTES * 25;
  const fxRemaining = Math.max(0, fxQuota - fxUsed);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > FX_MAX_FILE_BYTES) {
      toast.error(`Datei zu groß (max ${bytesToHuman(FX_MAX_FILE_BYTES)})`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!user || !file || !title.trim()) return;
    if (file.size > fxRemaining) {
      toast.error("Deine FX-Quota reicht nicht. Lösche alte FX oder upgrade.");
      return;
    }

    setBusy(true);
    try {
      const { duration } = await probeAudio(file);
      if (!duration) throw new Error("Konnte Audio nicht lesen");
      if (duration > FX_MAX_DURATION_SEC) throw new Error(`Max ${FX_MAX_DURATION_SEC}s erlaubt`);

      const hash = await sha256(file);

      // Dedup: wenn dieser Hash bereits existiert (eigener Upload), abbrechen
      const { data: existing } = await supabase
        .from("community_fx")
        .select("id, title, status")
        .eq("file_hash", hash)
        .eq("uploader_id", user.id)
        .maybeSingle();
      if (existing) {
        toast.warning(`Du hast diesen Sound bereits hochgeladen als "${existing.title}"`);
        setBusy(false);
        return;
      }

      const ext = file.name.split(".").pop() || "mp3";
      const path = `${user.id}/${hash}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("community-fx")
        .upload(path, file, { contentType: file.type || "audio/mpeg", upsert: false });
      if (upErr && !upErr.message.toLowerCase().includes("already exists")) throw upErr;

      const tags = tagsRaw
        .split(/[,#\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);

      const { error: insErr } = await supabase.from("community_fx").insert({
        uploader_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        tags,
        duration_s: Number(duration.toFixed(2)),
        bpm: bpm ? Number(bpm) : null,
        storage_path: path,
        file_hash: hash,
        file_size: file.size,
        mime_type: file.type || "audio/mpeg",
      });
      if (insErr) throw insErr;

      // Quota updaten (best effort — Auto-Cleanup-Hook konsolidiert)
      await supabase
        .from("storage_quotas")
        .update({ fx_bytes_used: fxUsed + file.size })
        .eq("user_id", user.id);

      toast.success("Hochgeladen — wartet auf Admin-Freigabe");
      qc.invalidateQueries({ queryKey: ["community_fx"] });
      qc.invalidateQueries({ queryKey: ["storage_quota", user.id] });
      navigate({ to: "/fx" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const pct = fxQuota ? Math.min(100, (fxUsed / fxQuota) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-up">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/fx"><ArrowLeft className="mr-1 h-4 w-4" /> Zurück zur FX-Library</Link>
      </Button>

      <PageHeader
        title="FX hochladen"
        subtitle="Kurze Sound-FX (max 30s, 2 MB). Wird nach Admin-Freigabe live."
      />

      {/* Quota */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Dein FX-Speicher</span>
          <span className="text-muted-foreground">
            {bytesToHuman(fxUsed)} / {bytesToHuman(fxQuota)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={pct > 90 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct > 90 && (
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" /> Fast voll — lösche alte FX in „Mine".
          </p>
        )}
      </div>

      <div className="space-y-4 rounded-3xl border border-border bg-card p-6">
        <div>
          <Label>Audio-Datei</Label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Upload className="h-5 w-5" />
            {file ? `${file.name} (${bytesToHuman(file.size)})` : "Datei wählen (max 30s, 2 MB)"}
          </button>
        </div>

        <div>
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Festival Drop Mega"
            maxLength={80}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="desc">Beschreibung (optional)</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Was macht diesen FX besonders?"
            maxLength={300}
            rows={2}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Kategorie</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {FX_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value as FxCategory)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-medium " +
                  (category === c.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tags">Tags (komma-getrennt)</Label>
            <Input
              id="tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="party, edm, festival"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="bpm">BPM (optional)</Label>
            <Input
              id="bpm"
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="128"
              className="mt-1"
            />
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={!file || !title.trim() || busy}
          className="h-12 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Zur Prüfung einreichen"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Mit dem Upload bestätigst du, dass du die Rechte am Audio besitzt.
        </p>
      </div>
    </div>
  );
}