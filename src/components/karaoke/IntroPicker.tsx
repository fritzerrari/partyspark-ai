import { useState } from "react";
import { Timer, Music2, Bot, Upload, BellOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type IntroConfig, type IntroKind } from "@/lib/audio/intro";

const OPTIONS: { kind: IntroKind; label: string; Icon: typeof Timer; desc: string }[] = [
  { kind: "none",      label: "Kein Intro",   Icon: BellOff, desc: "Sofort starten" },
  { kind: "countdown", label: "Countdown",    Icon: Timer,   desc: "3 · 2 · 1 · Go" },
  { kind: "click",     label: "Beat-Click",   Icon: Music2,  desc: "4-Bar Click @ BPM" },
  { kind: "tts",       label: "KI-Ansage",    Icon: Bot,     desc: "„Als Nächstes …" },
  { kind: "file",      label: "Eigene Datei", Icon: Upload,  desc: "MP3/WAV Snippet" },
];

type Props = { value: IntroConfig; onChange: (cfg: IntroConfig) => void };

export function IntroPicker({ value, onChange }: Props) {
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const set = <K extends keyof IntroConfig>(k: K, v: IntroConfig[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-display text-base font-semibold">Intro</h3>
      <div className="grid gap-2 sm:grid-cols-5 grid-cols-2">
        {OPTIONS.map(({ kind, label, Icon, desc }) => {
          const active = value.kind === kind;
          return (
            <button
              key={kind}
              onClick={() => set("kind", kind)}
              className={
                "rounded-2xl border p-3 text-left transition " +
                (active ? "border-primary bg-primary-soft text-primary" : "border-border bg-muted/30 hover:bg-muted")
              }
            >
              <Icon className="h-4 w-4" />
              <div className="mt-1 text-xs font-semibold">{label}</div>
              <div className="text-[10px] text-muted-foreground">{desc}</div>
            </button>
          );
        })}
      </div>

      {value.kind === "click" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">BPM:</span>
          <Input
            type="number"
            min={60} max={200}
            value={value.bpm ?? 100}
            onChange={(e) => set("bpm", Number(e.target.value) || 100)}
            className="w-24 rounded-full"
          />
        </div>
      )}

      {value.kind === "tts" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Name (z. B. Lisa)"
            value={value.singerName ?? ""}
            onChange={(e) => set("singerName", e.target.value)}
            className="rounded-full"
          />
          <Input
            placeholder="Song-Titel (optional)"
            value={value.songTitle ?? ""}
            onChange={(e) => set("songTitle", e.target.value)}
            className="rounded-full"
          />
          <Select value={value.voice ?? "alloy"} onValueChange={(v) => set("voice", v)}>
            <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["alloy","sage","verse","ballad","shimmer","echo","coral"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.kind === "file" && (
        <label className="block">
          <span className="text-sm text-muted-foreground">Audio-Datei</span>
          <input
            type="file"
            accept="audio/*"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
              const url = URL.createObjectURL(f);
              setFileObjectUrl(url);
              set("fileUrl", url);
            }}
          />
        </label>
      )}
    </div>
  );
}