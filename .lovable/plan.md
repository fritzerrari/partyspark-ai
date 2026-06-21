## Ziel

1. **Smart Playlist**: Tracks anhand der Analyse paarweise bewerten, optimale Reihenfolge automatisch finden, und pro Track die *besten Transition-Punkte* (Ein- und Aussteiger) im Lied markieren. Neue Tracks werden beim Hinzufügen automatisch analysiert.
2. **Loop Creator**: vollwertiger Live-Looper mit Metronom, BPM-gelocktem Playback, sichtbaren Wellenform-Spuren und Quantisierung — angelehnt an Boss RC-505 / Ableton Live Loops / Loopy Pro.

---

## Teil A — Smart Playlist & Transition-Routing

### A1. Pairwise Transition-Score (neues Modul `src/lib/audio/transitionScore.ts`)

Berechnet einen Score 0–100 für `from → to` basierend auf vorhandenen Analyse-Daten:

```text
score = wBpm·bpmScore + wKey·keyScore + wEnergy·energyScore + wCue·cueScore + wVocal·vocalScore
```

- **bpmScore**: 100 bei ≤2 % Δ, linear fallend, plus Half/Double-Time-Bonus.
- **keyScore**: 100 wenn Camelot-kompatibel (gleich, ±1, A↔B), 60 bei Quint-Sprung, 30 sonst.
- **energyScore**: 100 wenn `|Δenergy| ≤ 15`, fällt bei Bruch nach unten weicher als nach oben (Aufbauten ok, Absturz schlecht).
- **cueScore**: Bonus wenn `from.outroStart` existiert UND `to.introEnd` < 16 s (saubere Drop-Übergabe).
- **vocalScore**: Strafe wenn beide an der Transition-Stelle stark voiced sind (Vocal-Clash via `vocalMap`).

Plus: empfohlener `TransitionMode` und prognostizierte Dauer (übernimmt `mixPlanner.planMix` → Score wird damit konsistent zur Engine).

### A2. Optimale Reihenfolge (`reorderPlaylist`)

Greedy + 2-opt für n ≤ 50 Tracks (mehr als ausreichend für DJ-Sets):
1. Start = vom User gewählter Opener (oder Track mit niedrigster Energy).
2. Greedy: nächster Track = Argmax-Score gegen letzten Track.
3. 2-opt: paarweise Swaps wenn sie Gesamt-Score erhöhen (max. 200 Iterationen).
4. Ergebnis: `{ orderedIds, totalScore, edges: [{from,to,score,mode,note}] }`.

### A3. Beste Transition-Punkte pro Track (`findTransitionPoints`)

Aus der bereits vorhandenen `cues` + `beatGrid` + `vocalMap` + `energyCurve`:
- **Ausstiege (Outro-Kandidaten)**: Beat-Downbeats wo `vocalMap.voiced < 0.2` und `energyCurve` für 8+ Sekunden plateau-mäßig fällt. Top 3 zurückgeben mit Score und Zeitstempel.
- **Einstiege (Intro-Kandidaten)**: Beat-Downbeats nach `cues.introEnd` mit niedrigem Vocal-Anteil und steigender Energy. Top 3.

Wird beim Hinzufügen eines Tracks **einmalig** berechnet und in `tracks.cues` als JSONB-Erweiterung gespeichert (existierende Spalte, neue Felder `outroPoints`, `introPoints: number[]`). Kein Migration nötig — JSONB.

### A4. Smart Auto-Order UI (`src/routes/_authenticated/playlists.tsx`)

Neue Seite (falls noch nicht vorhanden — sonst integriert in `library.tsx`):
- Drag-and-Drop Liste der ausgewählten Tracks.
- Header-Button **"Smart-Order"** → ruft `reorderPlaylist` → animierte Neusortierung.
- Zwischen jedem Paar: **Edge-Chip** zeigt Score (Farbe: grün ≥80, gelb 60–79, orange <60), empfohlener Modus, BPM-Δ, Key-Δ. Klick → führt zu Live-Preview im Cockpit.
- Floating "**+ Track hinzufügen**" → Library-Picker → bei Auswahl: Track wird sofort analysiert wenn noch nicht (Spinner-Badge in der Liste), danach Smart-Order-Refresh-Button blinkt sanft.

### A5. Auto-Analyse beim Hinzufügen

Bereits in `library.tsx` vorhanden für neue Uploads. Erweiterung:
- Vor dem Pairwise-Scoring prüfen ob `analyzed_at` existiert; wenn nicht, `analyzeAudio` ausführen und Ergebnis (inkl. neuer `outroPoints`/`introPoints`) persistieren.
- Bulk-Mode: "Alle nicht analysierten Tracks analysieren" Button im Library-Header (sequentiell mit Queue, max 1 parallel, weil CPU-intensiv).

### A6. Cockpit-Integration

- `useTwinDeck.setPool` bekommt zusätzlich die `transitionPoints` von `findTransitionPoints` mit übergeben.
- `runTransition` nutzt den vorgeschlagenen Ausstiegs-Punkt des `from`-Decks statt `cues.outroStart` falls vorhanden → enger gewählte, vocal-freie Übergänge.
- Im DeckLiveHud erscheint unter dem Bridge-Badge eine kleine Zeile **"nächster Drop-Out @ 2:47"** mit Live-Countdown.

---

## Teil B — Loop Creator Overhaul

### B1. Metronom-Engine (`src/lib/audio/metronome.ts`)

Web-Audio-basiert (keine externe Lib nötig — siehe etablierte Pattern à la Chris Wilson's "A Tale of Two Clocks"):
- Lookahead-Scheduler (25 ms Tick, 100 ms Schedule-Window) für rock-stabiles Timing.
- BPM 40–220, Taktart 2/4 / 3/4 / 4/4 / 6/8.
- Zwei Click-Sounds (Downbeat hell, Off-Beat dunkel) via OscillatorNode + EnvelopeGain.
- Master-Out auf gleichen Bus wie Loops → Headphone-Cue möglich.
- Optionaler **Count-In** (1 Takt vor Aufnahme).

### B2. BPM-Lock + Quantisierung

- Beim ersten aufgenommenen Loop wird seine Länge als "Loop Bar" gemerkt (oder vom User auf 1/2/4/8 Bars gesetzt).
- Folgende Aufnahmen werden auf das nächste Vielfache der Loop Bar getrimmt (Tail-Snap mit kurzem Crossfade, damit kein Click entsteht).
- Optional: Time-Stretch via vorhandenem `soundtouchjs` (offline beim Speichern) falls User-Take leicht daneben war.

### B3. Sichtbare Tonspuren (`src/components/loops/LoopLane.tsx`)

Wiederverwendung des existierenden `TrackLane.tsx` als Vorlage:
- Pro Loop eine horizontale Spur mit Canvas-Wellenform (Peak-Daten aus `decodeToBuffer`).
- Playhead-Linie wandert in Echtzeit (rAF).
- Beat-Gitter im Hintergrund (vertikale Linien aus Metronom-BPM).
- Mute/Solo/Volume/Pan pro Spur.
- Loop "groovt" wenn Indikator-Punkt links blinkt (LED).

### B4. Live-Looper UI Rewrite

Neue Seite-Struktur in `src/routes/_authenticated/loops.tsx`:

```text
┌─────────────────────────────────────────────────────┐
│ [BPM 120▲▼] [4/4] [Metronom ●] [Count-In ●] [REC ●] │
├─────────────────────────────────────────────────────┤
│ Spur 1: Vocal     ▶ ━━━━━━━━━●━━━━━━━━━━ 🔊 🎧 ✖  │
│ Spur 2: Beatbox   ▶ ━━━━━━━━━●━━━━━━━━━━ 🔊 🎧 ✖  │
│ Spur 3: ...                                          │
├─────────────────────────────────────────────────────┤
│  [+ Take]  [Tap-Tempo]  [Snap: 1/4/8 Bars]  [Save]  │
└─────────────────────────────────────────────────────┘
```

- Master-Transport: globale Play-Pause läuft synchron zum Metronom-Clock.
- "Tap Tempo": 4 Taps mitten in der Session → BPM live anpassen, Loops re-time-stretchen (Background-Worker, Toast bei Fertigstellung).
- "+ Take": Live-Recording → automatisch quantisiert in Spurenliste.

### B5. Persistenz

Bestehende `loops`-Tabelle bekommt zwei neue JSONB-Felder via Migration:
- `bpm` (numeric) — BPM zum Aufnahme-Zeitpunkt.
- `bars` (numeric) — Loop-Länge in Takten.
- `peaks` (jsonb) — pre-rendered Peak-Array (~256 Werte), spart Decode-Kosten beim Reload.

### B6. Referenz-Recherche

Das Pattern ist gut etabliert; ich modelliere nach:
- **Boss RC-505 Loop Station** für die Spur-Anordnung.
- **Ableton Live Loops** für Quantisierung & BPM-Lock.
- **Chris Wilson's Web Audio Metronom-Tutorial** (de-facto Standard, lookahead-Scheduler).

Externe JS-Libs werden nicht benötigt — alles auf bestehendem Web-Audio-Stack + `soundtouchjs` (bereits installiert).

---

## Dateien

**Neu:**
- `src/lib/audio/transitionScore.ts` — Pairwise Score + reorderPlaylist + findTransitionPoints
- `src/lib/audio/metronome.ts` — Lookahead-Scheduler Klick
- `src/components/playlist/SmartOrderList.tsx` — DnD-Liste mit Edge-Chips
- `src/components/loops/LoopLane.tsx` — Canvas-Wellenform pro Loop
- `src/components/loops/MetronomeBar.tsx` — Tempo/Taktart/Count-In Controls
- (optional) `src/routes/_authenticated/playlists.tsx` falls eigene Route gewünscht

**Geändert:**
- `src/routes/_authenticated/loops.tsx` — komplettes Rewrite mit Metronom + Lanes
- `src/routes/_authenticated/library.tsx` — Smart-Order-Button + Bulk-Analyse
- `src/lib/audio/twinDeckBus.ts` — nutzt `outroPoints` aus Track-Meta
- `src/components/cockpit/DeckLiveHud.tsx` — Drop-Out-Countdown
- `src/lib/db/queries.ts` — `playlistTracksOptions`, ggf. `smartOrderPlaylist` Aktion

**Migration:**
- `loops` Tabelle: Spalten `bpm numeric`, `bars numeric`, `peaks jsonb` hinzufügen.
- (Kein Schema-Change für `tracks` nötig — `cues`-JSONB wird um `introPoints`/`outroPoints` erweitert.)

---

## Akzeptanzkriterien

1. In der Library kann ich ≥3 analysierte Tracks markieren → **"Smart-Order"** sortiert sie und zeigt Score zwischen jedem Paar.
2. Beim Hinzufügen eines neuen, nicht analysierten Tracks startet die Analyse automatisch; Smart-Order rechnet danach neu.
3. Im Cockpit-Auto-DJ wird die Transition exakt am vorgeschlagenen Outro-Punkt (vocal-frei) gestartet — sichtbar im Live-HUD als Countdown.
4. Loop Creator: BPM-Eingabe + Metronom-Toggle + Count-In funktionieren. Erste Aufnahme definiert Loop-Länge, weitere snappen automatisch.
5. Jede Loop-Spur hat eine sichtbare Wellenform mit wanderndem Playhead.
6. Loops bleiben nach Refresh erhalten und reloaden ohne erneutes Decoden (dank `peaks`-Cache).
