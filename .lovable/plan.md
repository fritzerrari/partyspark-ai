# DJ-Cockpit Upgrade: Analyse, Transitions, Sing-along, FX, Timer-Auto-DJ

## Problem heute
- **Twin-Decks im Cockpit** nutzen ein eigenes `<audio>`-Element für Deck B und sind **nicht** an die Engine-Transition-Pipeline gekoppelt. Es gibt nur Sync (Pitch-Match), aber keinerlei künstlerische Übergänge zwischen A und B.
- Beim Laden eines Tracks ins Cockpit fehlt häufig die Analyse (BPM, Tonart, Beat-Grid, Cues, Vocal-Map). Ohne diese Daten kann die Transition-Planung nichts Profi-mäßiges berechnen → "transitions sind hier nicht möglich".
- Sing-along und Sound-FX existieren als Module (`VocalOverlay`, `fxPlayer`, FX-Pads), sind aber im DJ-Cockpit gar nicht eingebunden.
- Kein "alle XX Sekunden eine Transition"-Modus.

## Was gebaut wird

### 1. Persistente Track-Analyse (Cache)
- Beim Laden eines Tracks in **Deck A** oder **Deck B**: wenn `beatGrid`/`bpm`/`camelot`/`cues`/`vocalMap` fehlen, **lazy analysieren** (`analyzeAudio` aus `src/lib/audio/analyze.ts`) und in `tracks` schreiben (`bpm`, `musical_key`, `camelot`, `beat_grid`, `cues`, `vocal_map`, plus neu: `analyzed_at`).
- Bereits analysierte Tracks → direkt nutzen (DB-Spalten werden im Cockpit-Loader schon gemappt; nur das Nachanalysieren+Persistieren fehlt).
- Migration: Spalte `analyzed_at timestamptz` zur `tracks`-Tabelle (idempotent), plus passende GRANTs sind schon vorhanden.
- Toast: "Track analysiert · 124 BPM · Am · 8A" mit Fortschritt.

### 2. Echte A↔B Transitions im Cockpit
- Mixer-Spalte erweitern um:
  - **Transition-Mode-Select** mit den vorhandenen Optionen (`TRANSITION_LABELS`: Auto/Random/Crossfade/Cut/FadeGap/FilterSweep/EchoTail/Stinger/LoopRoll/DoubleDrop/BassSwap/ReverbWash).
  - Button **"Transition A→B"** (und **"B→A"**), führt eine echte choreografierte Transition zwischen den beiden Decks aus — gleicher Code-Pfad wie Engine-Auto-DJ, aber lokal in `TwinDeck`:
    - Beide Decks bekommen einen `BiquadFilter` + `GainNode` über `AudioContext` (Web-Audio-Graph wird in `TwinDeck` erstmalig aufgebaut, statt nur `audio.volume`).
    - Trigger-/Cut-Punkt aus `mixPlanner.planMix` mit beiden `EngineTrack`-Objekten ableiten (nutzt Cues, BeatGrid, Camelot, VocalMap).
    - Crossfade-Länge passt sich an BPM und Energie an; "Random" wählt jedes Mal eine andere virtuose Variante.
  - Anzeige: "Letzte Transition: FilterSweep · 8.2s · phrase-aligned".
- Crossfader bleibt manuelles Override; während programmatischer Transition wird er per `requestAnimationFrame` mitgeführt.

### 3. Timer-Auto-DJ ("alle XX Sekunden")
- Neue Mixer-Sektion **Auto-Transition**:
  - Toggle `Auto-Loop on/off`.
  - Slider **Intervall** 20–300 s (Default 90 s).
  - Quelle: gemeinsame Track-Liste (Library-Tracks aus Cockpit-Props). Bei `≥2` Tracks aktivierbar; sonst disabled mit Hint "mindestens 2 Tracks nötig".
  - Reihenfolge: shuffle oder linear (Toggle).
  - Bei jedem Tick: nächsten Track ins **gerade leise** Deck laden (wechselseitig A↔B), Transition starten, Crossfader animiert rüberziehen.
  - Transition-Mode = aktueller Select (Auto/Random respektiert).

### 4. Sing-along Layer
- Neuer Panel-Tab im Cockpit unter den Decks: **"Mit-singen"**.
  - Mic-Picker (nutzt `src/lib/audio/devices.ts`), Live-Pegel, Push-to-Talk + Latch.
  - Effekt-Chain (Reverb/Delay/Doubler) via vorhandene `vocalChain.ts` mit Auto-Gain.
  - Aufnahme-Button → schreibt Take in Project-Bus (`useProject`-Artefakt) für späteren Export.
  - Vocal-Bus läuft parallel zu Decks A+B in den Master-Out.

### 5. Sound-FX-Pads
- Neuer Panel-Tab **"FX-Pads"** mit 8 Pads (Air-Horn, Riser, Crash, Drop, Laser, Sweep, Vocal-Chop, eigene Uploads).
  - Standard-Sounds aus `fxPlayer.ts` / Soundpool.
  - One-Shot mit Choke-Gruppe; optional "Beat-quantisiert" (snappt auf nächste BeatGrid-Position des laufenden Decks).
  - Latch-Modus für Loops.
  - "+" Pad lädt Datei aus Library/Soundpool.

### 6. UI-Polish
- Cockpit-Header zeigt zusätzlich: `BPM A ↔ BPM B`, `Key-Compat`-Badge (camelotCompatible), nächster geplanter Transition-Typ.
- "Re-Analyze"-Knopf pro Deck (klein, neben BPM-Anzeige).
- Loading-Spinner während Analyse, Fortschritts-Prozent.

## Geänderte / neue Dateien
- **Neu**: `src/components/cockpit/MixerTransition.tsx` (Mode-Select, Trigger-Buttons, Timer-Auto-DJ Steuerung).
- **Neu**: `src/components/cockpit/SingAlongPanel.tsx` (Mic + VocalChain).
- **Neu**: `src/components/cockpit/FxPadGrid.tsx` (8 Pads, Choke, Beat-Quantize).
- **Neu**: `src/lib/audio/twinDeckBus.ts` (Web-Audio-Graph mit zwei Deck-Lanes, gemeinsamer Master/Recorder, Transition-Choreografie — wiederverwendet die Mode-Schalter aus `engine.ts`).
- **Edit**: `src/components/cockpit/TwinDeck.tsx` (über `twinDeckBus`, Auto-Analyse-Hook, neue Sub-Panels).
- **Edit**: `src/routes/_authenticated/cockpit.tsx` (Tabs für SingAlong/FX, BPM-Compat-Header).
- **Edit**: `src/lib/audio/mixPlanner.ts` (kleine Helper-Funktion `planBetween(trackA, trackB, mode, posSecA)` damit die Cockpit-Transition denselben Planner nutzt).
- **Migration**: `tracks.analyzed_at timestamptz` (optional, idempotent).

## Technische Hinweise
- Web-Audio: in `TwinDeckBus` werden beide `<audio>`-Elemente einmalig per `createMediaElementSource` in den geteilten `AudioContext` gehängt. **Ein Element kann nur einmal verknüpft werden** → Cockpit darf Deck A nicht parallel zur Engine `audio`-Pipe nutzen. Lösung: Cockpit benutzt **zwei eigene** Deck-Audios (A & B) im eigenen Bus; die globale Engine wird im Cockpit pausiert.
- Analyse läuft im UI-Thread mit `setTimeout(0)`-Yields (bereits implementiert). Persistenz schreibt nur Metadaten (~5 KB), kein Audio.
- Sing-along & Mic: braucht Mic-Permission; Fehlerzustand mit Toast.

## Risiken & Trade-offs
- True Stem-Separation für virtuose Übergänge im Browser nicht möglich → Übergänge bleiben "Vocal-Map-aware" (z. B. Crossfade nur über non-voiced Regions), keine echte Acapella-Isolation.
- Re-Analyse großer Bibliotheken kostet einmalig CPU; daher streng on-demand pro Deck-Load.
