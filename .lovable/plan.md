# Studio Overhaul — Phasen 1-3 (ausgeliefert)

## Phase 1 · Audio-Qualität
- `src/lib/audio/timestretch.ts` — SoundTouch Tempo-only stretch (kein Aliasing, Pitch bleibt erhalten)
- `src/lib/audio/master.ts` — Brick-Wall Limiter + Tanh-Soft-Clip für offline Renders
- `src/lib/audio/remix.ts` — Komplett-Rewrite: nutzt `analyzeAudio` (BPM/Beat-Grid/Cues/Vocal-Map), wählt Vocal-Hook für Drop/Verse + instrumentales Window für Intro/Build/Outro, beat-snapped Loops mit Fade-in/out gegen Naht-Klicks, zwei Buses (Main + Break-Delay), finaler Master-Pass
- `src/lib/audio/mashup.ts` — neuer Stretch + Master statt linearer Resample + tanh
- `src/lib/audio/vocalChain.ts` — Gain-Compensation: dry trim + capped FX-Returns; Doubler/Reverb/Delay können sich nicht mehr ins Clipping addieren

## Phase 2 · Project-Bus
- `src/lib/project/store.ts` — zustand Store für Artifacts (track/recording/vocal/remix/mashup/fx/lyrics) inkl. `toEngineTrack()` und in-memory WAV-Encoding für Buffer-only Artifacts
- `useArtifactsByKind()` Selector für Modul-„Quelle"-Dropdowns

## Phase 3 · Multi-Modul Workbench
- `src/lib/dock.ts` — neue ModuleIds: `remix`, `autotune`, `mashup`, `project-tray`
- `src/components/modules/RemixPanel.tsx` — embeddable Remix mit Auto-Magic + Progress-Bar + „→ Deck A"
- `src/components/modules/AutotunePanel.tsx` — embeddable Autotune mit Auto-Magic
- `src/components/modules/MashupPanel.tsx` — embeddable Mashup mit Auto-Magic
- `src/components/modules/ProjectTrayPanel.tsx` — Tray mit allen Artifacts, importiert Library + Recordings, Drag-to-Deck
- `src/components/ui/AutoMagicButton.tsx` — beginner-freundlicher One-Click Button
- `src/components/dashboard/ModuleDock.tsx` — alle neuen Panels eingehängt
- `src/routes/_authenticated/studio-bench.tsx` — Workbench-Route mit Picker-Grid; öffnet automatisch Projekt-Tray + Twin-Decks
- `src/components/layout/AppShell.tsx` — Studio Bench in Sidebar
- `src/routes/_authenticated/remix.tsx` — pusht Ergebnis in Project-Bus

## Was bewusst verschoben ist
- **AI-Producer-Agent** (Lovable AI Gateway tool-calling) — Architektur steht (Project-Bus + Auto-Magic), Agent kann als nächstes draufgesetzt werden
- **Echte Stem-Separation** (Demucs WASM) — Heuristik via vocalMap ist drin, voll-ML braucht ~50 MB Modell und sollte separat als optionales Feature kommen