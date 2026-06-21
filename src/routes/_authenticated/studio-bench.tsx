import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles, FolderOpen, Disc3, Wand2, Combine, Mic2, Grid3X3, Lightbulb, Layers } from "lucide-react";
import { useDock, type ModuleId } from "@/lib/dock";
import { useProject } from "@/lib/project/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/studio-bench")({
  head: () => ({ meta: [{ title: "Studio Bench — PartyPilot AI" }] }),
  component: StudioBench,
});

const QUICK: { id: ModuleId; label: string; icon: typeof Disc3; hint: string }[] = [
  { id: "project-tray", label: "Projekt-Bus",  icon: FolderOpen,  hint: "Alle Quellen & Ergebnisse." },
  { id: "twin-deck",    label: "Twin Decks",   icon: Disc3,       hint: "Zwei Plattenteller + Crossfader." },
  { id: "remix",        label: "Remix",        icon: Wand2,       hint: "Auto-Dance-Edit aus jeder Quelle." },
  { id: "autotune",     label: "Autotune",     icon: Mic2,        hint: "Vocal-Aufnahme auf Skala einrasten." },
  { id: "mashup",       label: "Mashup",       icon: Combine,     hint: "Zwei Tracks tempo-synchron mischen." },
  { id: "sequencer",    label: "Sequencer",    icon: Grid3X3,     hint: "16-Step Drums + Bass." },
  { id: "loop-pads",    label: "Loop-Pads",    icon: Layers,      hint: "16 beat-quantisierte Performance-Pads." },
  { id: "vocal",        label: "Vocal-Layer",  icon: Mic2,        hint: "Live-Stimme über laufendem Track." },
  { id: "coach",        label: "Coach",        icon: Lightbulb,   hint: "Tipps zur Live-Performance." },
];

function StudioBench() {
  const open = useDock((s) => s.open);
  const openModule = useDock((s) => s.openModule);
  const close = useDock((s) => s.close);
  const name = useProject((s) => s.name);
  const setName = useProject((s) => s.setName);
  const artifactCount = useProject((s) => s.artifacts.length);

  // Open Projekt-Tray and Twin Decks by default — guides the user.
  useEffect(() => {
    if (!open["project-tray"]) openModule("project-tray");
    if (!open["twin-deck"])    openModule("twin-deck");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="rounded-3xl stage-gradient p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] uppercase tracking-[0.25em] text-stage-foreground/60">Studio Bench</p>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-transparent text-2xl font-black uppercase tracking-[0.2em] text-stage-foreground outline-none placeholder:text-stage-foreground/40"
              placeholder="Session-Name"
            />
            <p className="mt-1 text-xs text-stage-foreground/60">
              <Sparkles className="mr-1 inline h-3 w-3 text-[var(--neon-cyan)]" />
              Beliebig viele Module gleichzeitig — Output eines Moduls wird sofort Quelle für jedes andere.
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px]">{artifactCount} Artefakte im Bus</span>
            </p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {QUICK.map(({ id, label, icon: Icon, hint }) => {
          const isOpen = !!open[id];
          return (
            <button
              key={id}
              onClick={() => isOpen ? close(id) : openModule(id)}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all",
                isOpen
                  ? "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_18%,transparent)] neon-glow-cyan text-stage-foreground"
                  : "border-white/10 bg-white/5 text-stage-foreground hover:border-white/30 hover:bg-white/10",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className={cn("h-5 w-5", isOpen ? "text-[var(--neon-cyan)]" : "text-stage-foreground/70")} />
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
                  isOpen ? "bg-[var(--neon-cyan)] text-black" : "bg-white/10 text-stage-foreground/60",
                )}>{isOpen ? "Offen" : "Einblenden"}</span>
              </div>
              <span className="text-sm font-bold">{label}</span>
              <span className="text-[10px] text-stage-foreground/60">{hint}</span>
            </button>
          );
        })}
      </section>

      <p className="text-center text-[11px] text-stage-foreground/60">
        💡 Klicke unten rechts auf <span className="text-[var(--neon-cyan)]">✨</span> um Module jederzeit auf jeder Seite ein- oder auszublenden.
      </p>
    </div>
  );
}