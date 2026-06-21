
# DJ-Studio Ausbau: Turntables, Modul-Dashboard & Power-Design

## Ziel
Der Auto-Mix wird zu einem vollwertigen Live-Cockpit mit zwei interaktiven Plattentellern, freier Modul-Anordnung in jedem Screen und einem konsistenten "Virtuoso DJ"-Design mit reaktiven Controls, Status-LEDs und Hilfs-/Empfehlungs-Layer.

## 1) Twin-Turntable Deck (neu)
Zwei realistische, drag-bare Plattenteller — sowohl im Auto-Mix als auch als einblendbares Modul überall verfügbar.

- `src/components/player/Turntable.tsx`
  - SVG/Canvas-Plattenteller mit Label-Print (Cover), Tonarm, Slipmat-Grafik
  - Pointer/Touch-Drag → scrub (vor/zurück) inkl. Pitch-Bend, Trägheit beim Loslassen
  - Modi: **Free Scratch** (volle Kontrolle, Auto-Mix pausiert kurz), **Nudge** (±2 % Pitch), **Hold** (Stop & Cue), **Reverse**
  - Zustand spiegelt `engine.currentTime` + lokales `scratchOffset`
- `src/components/player/TwinDeck.tsx`
  - Deck A / Deck B nebeneinander, mittig Crossfader + EQ-3-Band + Filter-Knob + Cue/Play
  - Sync-Button (BPM/Phase), Loop-In/Out, Hot-Cue-Pads (1–4)
  - VU-Meter pro Deck (animiert), Beat-Phase-Ring um Plattenteller
- Engine-Erweiterung (`src/lib/audio/engine.ts`)
  - Zweiter `GainNode`-Pfad (`deckB`) + Crossfader-Gain
  - `scrub(deck, deltaSec)`, `setPitch(deck, semitones, tempoLink)`, `setEQ`, `setFilter`
  - Zusatzspuren (Sequencer-Layer) hängen am Master nach Crossfader

## 2) Auto-Mix Sequencer & Layer
Im laufenden Auto-Mix Tonspuren überlagern & Sequenzen einspielen.

- `src/components/player/SequencerLane.tsx` — 16-Step Grid pro Sample (Kick/Snare/Perc/Bass/Lead/FX/Vocal-Chop/User-Upload), pro Step Velocity, Swing-Slider, Tempo folgt Master-BPM
- `src/components/player/LayerMixer.tsx` — Liste aktiver Layer (Sequencer, Loop-Pads, Vocals, externer Track auf Deck B), pro Layer: Mute (blinkt rot), Solo, Volume, Send-FX, Side-Chain-Toggle
- Erweiterung `mixPlanner.ts`: Vorschläge welche Layer im aktuellen Energy-Segment passen (z. B. "Add Perc Layer @ Drop")

## 3) Dashboard-Modus mit floatenden Modulen
Aus jedem Screen heraus weitere Module einblenden & frei anordnen.

- `src/components/dashboard/ModuleDock.tsx` (FAB unten rechts, immer sichtbar)
  - Liste aller verfügbaren Module mit Kompatibilitäts-Badge: TwinDeck, Sequencer, LoopPads, VocalLayer, FX-Rack, Waveform-Zoom, Lyrics, Coach-Tipps, Crowd-Mood, Energy-Curve, Key/BPM-Wheel, Hot-Cue-Bank, Recorder
- `src/components/dashboard/FloatingPanel.tsx`
  - Drag/Resize/Minimize/Pin, Snap-to-Grid (4er), pro User-Layout in `settings.dashboard_layout` (JSONB) gespeichert
- Neue Route `src/routes/_authenticated/studio.tsx` — Default-Dashboard mit Twin-Deck + Sequencer + LoopPads + Waveform + Vocal
- DB-Migration: `settings.dashboard_layout JSONB`, `settings.theme_preset TEXT`

## 4) Power-Design "Virtuoso"
Kohärentes futuristisches DJ-Design über alle Module.

- `src/styles.css`: neue Tokens — `--neon-cyan`, `--neon-magenta`, `--neon-amber`, `--deck-graphite`, `--glass-surface`, Glow-Shadows, Gradient-Mesh-Backgrounds, Scanline-Overlay
- Globale Komponenten:
  - `NeonButton` (Variants: idle/active/armed/danger – Farbwechsel + Glow)
  - `LedIndicator` (pulsiert grün/orange/rot je nach Status, blinkt bei Mute/Clip)
  - `MeterBar`, `RotaryKnob` (drag-rotate, Wertanzeige), `MotorSlider` (Color-Track ändert mit Wert)
  - Module-Header mit dünner Animated-Beam-Linie (MagicUI), Background „Flickering Grid" dezent
- Typo: Display-Font für Werte (z. B. JetBrains Mono / Orbitron-ähnlich via Google Fonts `<link>` im `__root.tsx`), Body bleibt clean

## 5) Hilfe / Empfehlungen / Optimierung
- `src/components/dashboard/CoachHud.tsx` — kleines Overlay mit Live-Tipps von `coach.functions.ts` (BPM-Drift, Key-Clash, leiser Vocal, Loudness > -6 dB)
- Tooltip-Layer auf allen neuen Controls (kurzer Tipp + „Mehr"-Link)
- Onboarding-Tour (1× pro User, in `settings.onboarded_studio`) führt durch Decks, Sequencer, Module-Dock
- „Optimize Mix"-Button: ruft `planMix` + `coach` und passt EQ/Volume automatisch an, mit „Undo"

## 6) Konsolidierung & Konsistenz
- Bestehende Routen (`/loops`, `/karaoke`, `/remix`, `/sound-designer`, `/wizard`) bekommen Deep-Link-Buttons „In Studio öffnen" → öffnen jeweiliges Modul als FloatingPanel
- `TransportBar` zeigt zusätzlich Deck-A/B-Indikatoren, Crossfader-Position, aktive Layer-Anzahl

## Technische Notizen
- Scratch/Scrub via `AudioBufferSourceNode.playbackRate` + Re-Schedule bei Richtungswechsel; Touch-Events mit `pointercancel`-Cleanup
- Sequencer-Clock: `AudioContext.currentTime` + Lookahead-Scheduler (25 ms Tick, 100 ms Ahead)
- Floating Panels: einfache eigene Implementierung (pointer-events, `position: fixed`, transform), kein extra Lib
- Alle neuen AI-Calls über vorhandenes Gateway, Modell `gemini-3-flash-preview`
- DB: 1 Migration für `dashboard_layout`, `theme_preset`, `onboarded_studio`

## Lieferung
Ein Rutsch (~20–25 neue/geänderte Dateien). Reihenfolge intern:
1. Design-Tokens + Basis-UI-Primitives (NeonButton, Led, Knob, Slider)
2. Engine-Erweiterung (Deck B, Crossfader, Scratch)
3. Twin-Deck + Turntable
4. Sequencer + LayerMixer
5. ModuleDock + FloatingPanel + `/studio`-Route
6. CoachHud + Onboarding + Optimize-Button
7. Migration + Settings-Persistenz

## Offen vor dem Bauen
- Soll der `/studio`-Screen die neue **Standard-Startseite nach Login** werden, oder bleibt `/library` Default und Studio ist via Nav/FAB erreichbar?
