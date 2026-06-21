## Befund nach Tiefenanalyse

Das System ist technisch fast vollständig, aber die "Auto-DJ"-Erfahrung scheitert an mehreren konkreten Bugs und Brüchen zwischen den Modulen. Hauptprobleme:

### Auto-DJ (Cockpit Timer)
1. **Tote Logik bei kaltem Start**: `autoTimer` setzt `from = crossfader < 0.5 ? "A" : "B"`. Wenn weder Deck A noch B läuft (frischer Cockpit-Aufruf), feuert der Timer trotzdem alle XX Sekunden eine "Transition" — ohne Audio.
2. **Inkomingsdeck wird nie aktiviert**: `loadDeck` setzt nur `src`, ruft kein `play()`. Bei `transition()` wird `el.play()` versucht, aber ohne vorherige User-Geste in iOS/Safari → stiller Fehler, kein Sound.
3. **Track-Doppelung**: `pickNextTrack` darf den Track wählen, der bereits im anderen Deck läuft. Keine Dedup-Logik.
4. **Countdown-UI lügt**: Sekunden zählen weiter runter, springen aber bei Transition zurück auf `autoTimerSec` — wirkt eingefroren.
5. **Analyse-Pflicht fehlt**: Transitions ohne BPM/Cues fallen auf 6s-Crossfade zurück → klingt billig. Auto-DJ sollte vor Start sicherstellen, dass beide Decks analysiert sind.
6. **Keine Vorschau / kein "Aufnehmen"** des Auto-DJ-Sets in den Project-Bus.

### Modul-Symbiose
7. Cockpit-Aufnahmen (SingAlong, FX) landen nicht im **Project-Bus** → Remix/Mashup sehen sie nicht.
8. Remix/Mashup-Output kann zwar auf "Deck A" geschickt werden — geht aber an die globale `useEngine`-Pipeline, nicht in `useTwinDeck`. Cockpit zeigt es nie.
9. Library-Tracks werden im Cockpit geladen, aber **nicht in den Project-Bus** gespiegelt → Studio-Bench-Module finden sie nicht ohne Re-Import.
10. Keine geteilte "now playing"-Quelle: SingAlong-Monitor, FX-Quantize, Coach-HUD wissen nichts vom Cockpit-Beat.

### Mobile / UX
11. Turntable 220px sprengt mobile Viewports < 360px. Auto-Timer-Slider hat Mini-Hitbox. Keine animierte Crossfader-Visualisierung. FAB-Dock-State unklar.
12. Kein "Onboarding-Pfad": Neuer User landet im Cockpit ohne Tracks und sieht nur leere Decks.

---

## Plan (in einem Rutsch, keine Phasen-Rückfragen)

### A. Auto-DJ-Kern reparieren (`src/lib/audio/twinDeckBus.ts`)
- **Kalt-Start**: Bei `setAutoTimerOn(true)` prüfen, ob mind. ein Deck spielt; sonst nächsten Track in Deck A laden, `ensureAnalysis` abwarten, `play()` direkt im User-Klick-Kontext starten.
- **Dedup**: `pickNextTrack` schließt aktuell geladene IDs in beiden Decks aus; Cursor merkt sich Verlauf (letzte 4).
- **Saubere `from`-Erkennung**: `from = A.isPlaying && (crossfader < 0.5 || !B.isPlaying) ? "A" : "B"`.
- **Garantierter Inkoming-Play**: Vor `runTransition` Deck-`to` analysieren, `play()` aufrufen, bei `NotAllowedError` Flag `needsUserGesture` setzen und Toast "Tippe Play, um Auto-DJ zu starten".
- **Countdown-Korrektheit**: Während `transitionInFlight` Countdown auf "Mixing…" setzen, danach exakt auf `autoTimerSec` zurück.
- **Plan-Aufruf**: `planMix` mit echten Cues, sonst zuerst `ensureAnalysis(to, force:true)`.
- **Auto-DJ-Recorder**: `MediaStreamDestination` am masterGain → optional als Artefakt "Auto-DJ Set" in den Project-Bus.

### B. Project-Bus-Symbiose
- `src/lib/project/store.ts`: neue Helfer `addEngineTrack(t)` und Selector `useLibraryTracks()` (Project-Tracks + Cockpit-Tracks vereint).
- `cockpit.tsx`: nach Library-Load alle Tracks via `addArtifact({kind:"track", url, analysis})` registrieren (mit Dedup über id).
- `SingAlongPanel`: Aufnahme-Buffer beim Stop → `addArtifact({kind:"recording"})`.
- `FxPadGrid`: One-Shots, die der User hochlädt → `addArtifact({kind:"fx"})`; "An Deck" und "An Remix" Mini-Buttons.
- `RemixPanel`/`MashupPanel`: neuer `→ Deck B` Button (zusätzlich zu Deck A) ruft `useTwinDeck.loadDeck("B", …)` statt `useEngine.loadQueue`.
- Globaler **Now-Playing-Bus** (`src/lib/audio/nowPlaying.ts`): einzige Wahrheit über aktuell hörbaren Track + BPM + Beat-Phase, abgeleitet aus dem dominierenden TwinDeck-Side. Wird genutzt von Coach, FxPad-Quantize und SingAlong-Monitor.

### C. Cockpit-Erweiterungen
- **Header-Toolbar**: "Auto-DJ", "Set aufnehmen", "Add Track aus Library", "Mix → Projekt-Bus".
- **Deck-Picker**: bei leerer Library Empty-State mit CTA "Tracks importieren" (→ `/library`).
- **Visualisierter Crossfader** mit animiertem Laser-Sweep während Transition.
- **BPM-Sync-Badge** zeigt Live-Drift; pulsiert grün wenn locked.

### D. Mobile-First-Politur
- Turntable: dynamische Größe `min(46vw, 220px)`.
- Cockpit-Layout: 1-Spalte mobil mit Sticky-Mixer-Bar unten (Crossfader + Play A/B + Auto-DJ-Toggle).
- Tap-Targets ≥ 44px; Slider-Tracks 8px hoch.
- Mikro-Animationen: `animate-fade-in`, Transition-LED pulsiert, Auto-DJ-Knopf glüht, Pad-Press scale-95.

### E. Studio-Bench-Symbiose
- Module-Dock-FAB sichtbar auf allen Auth-Routen, mit aktivem Badge wenn Modul offen.
- "Open everywhere": Module als Overlays (bereits vorhanden) — sicherstellen, dass `RemixPanel`/`MashupPanel` ihre Quellen aus **Project-Bus + Library** lesen.
- `studio-bench.tsx`: zusätzliche "Recent Artifacts"-Lane oberhalb der Modul-Picker.

### F. Bugfix-Liste während des Refactors
- `engine.ts`: `transitionMode: "crossfade"` → Default `"auto"` (sonst ignoriert die UI-Auswahl).
- `RemixPanel`: `previewRef` per `useRef` statt `useState({a:null})`-Anti-Pattern → verhindert verlorene Refs nach Re-Render.
- `MashupPanel`: gleiche Korrektur.
- `cockpit.tsx`: `vocalMap`-JSON-Parse-Crash bei Strings absichern.

### Technische Details (für Devs)
- Datei-Touches: `twinDeckBus.ts`, `cockpit.tsx`, `TwinDeck.tsx`, `SingAlongPanel.tsx`, `FxPadGrid.tsx`, `RemixPanel.tsx`, `MashupPanel.tsx`, `studio-bench.tsx`, `project/store.ts`, `engine.ts`, neu: `nowPlaying.ts`, `CrossfaderViz.tsx`, `StickyMixerBar.tsx`, `RecorderTap.ts`.
- Keine DB-Migration notwendig (Spalten `bpm/music_key/beat_grid/cues/vocal_map/analyzed_at` existieren bereits).
- Recorder nutzt `MediaRecorder` auf `MediaStreamDestination` von `masterGain` (TwinDeck-Bus), Audio/webm-opus → Blob → AudioBuffer → Artefakt.

### Akzeptanzkriterien
1. Frischer Cockpit-Aufruf, ≥2 Tracks vorhanden: ein Klick auf "Auto-DJ" startet Deck A, analysiert beide Tracks, mixt nach XX Sekunden in Deck B mit gewähltem Stil — ohne weitere User-Klicks.
2. Aufnahmen aus SingAlong/FX erscheinen sofort als Quelle in Remix-/Mashup-Panel.
3. Remix-Output kann mit einem Klick in Deck B des Cockpit landen und in der nächsten Auto-Transition gespielt werden.
4. Mobile (375×812): kein horizontales Scrollen, alle Steuerungen erreichbar.
5. Auto-DJ-Recorder produziert ein Artefakt im Project-Bus, das wieder als Quelle für Remix/Mashup dient.
