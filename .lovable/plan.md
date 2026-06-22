## Diagnose: Warum die Übergänge aktuell beide Songs zerstören

Beim Code-Review der Live-Engine (`src/lib/audio/engine.ts`) habe ich die Ursachen gefunden:

1. **Chipmunk-Vocals**: `audioElB.playbackRate = plan.bpmRatio` ändert Speed UND Pitch zusammen. Bei 124→128 BPM klingt der Track ~5 % höher — das ist die "verzerrte" Stimme.
2. **Stretch-Schäden**: Es gibt zwar `timestretch.ts` (SoundTouchJS), aber sie wird nur offline für Buffer benutzt, nicht in der Live-Engine. Live läuft alles über `playbackRate`.
3. **Keine Phrase-Erkennung**: Transitions starten beim ersten "Beat", nicht am Phrasen-Boundary (8/16/32 Bars). Vocals werden mitten im Wort gecuttet.
4. **Stems ungenutzt**: Auch wenn Real-Stems geladen sind, fallen wir auf EQ-Swaps zurück. Vocal-Out / Drum-Bridge / Acapella-Intro existieren nicht.
5. **Auto-Pick zu simpel**: `engine.ts` schaltet pauschal auf "crossfade" bei Auto. Die intelligentere `pickCleanRecipe` (BPM/Key/Vocals/Energy) wird nicht gerufen.
6. **Kein Vocal-Clash-Schutz**: Vocal-Maps werden analysiert, aber im Live-Mix nicht abgefragt.

## Ziel: Profi-AI-DJ-Verhalten

Beide Songs bleiben erkennbar. Pitch bleibt original. Übergänge passieren musikalisch (Phrase-Boundary, Vocal-Pausen). Stems werden genutzt, wenn vorhanden. Das System wählt automatisch die richtige Strategie.

## Umsetzung in 5 Stufen

### Stufe 1 — Pitch-Preservation (kritisch, sofort spürbar)
- Live-Time-Stretch über Web-Audio `AudioWorkletNode` mit SoundTouchJS-Worklet (statt `playbackRate`).
- Neuer Helper `src/lib/audio/liveStretch.ts`: erzeugt ein Worklet, das Deck B in Echtzeit auf Ziel-BPM zieht ohne Pitch-Shift.
- `engine.ts`: Deck B nicht mehr per `audioElB.playbackRate`; stattdessen rate=1, Tempo-Korrektur im Worklet.
- BPM-Annäherung gradual: statt sofort 124→128, in 8 Bars von 124→126 (Meet-in-the-Middle). Maximaler Live-Stretch ±6 %; darüber wechselt der Picker automatisch auf "Echo Exit" oder "Drop Cut".

### Stufe 2 — Phrase-Aware Triggering
- Phrase-Marker zur Analyse hinzufügen: Beat-Grid → 4-Bar/8-Bar/16-Bar/32-Bar Boundaries; Intro/Verse/Chorus/Drop/Outro werden aus `cues` + Energie-Hüllkurve abgeleitet (bereits vorhanden, nur nicht genutzt).
- Trigger-Punkt im Auto-Scheduler: nächste 8-Bar-Phrase vor `outroStart`, nicht beliebige Sekunden-Schwelle.
- Vocal-Gate: Wenn `vocalMap` zur Trigger-Zeit > 0.5, verschiebt der Scheduler auf den nächsten Vocal-Gap (oder wählt eine Vocal-schonende Recipe).

### Stufe 3 — Stem-basierte Recipes (wenn Stems da sind)
- Neuer Pfad `src/lib/audio/stemRecipes.ts`:
  - **Vocal Out**: Vocals A fade-out 2 bars vor Switch, Drums/Bass A bleiben.
  - **Drum Bridge**: Beide nur Drums für 4 bars, dann Vocals B rein.
  - **Bass Swap**: Bass A → Bass B exakt auf Downbeat, Rest sanft.
  - **Acapella Intro**: Vocals B solo über letzte 4 bars A, dann full B.
  - **Drop Switch**: Hard cut auf den Drop von B, A einen Beat vorher stumm.
- `engine.ts` prüft, ob beide Tracks Real-Stems haben → Stem-Recipes; sonst → Clean-Recipes.

### Stufe 4 — Song-Teasing
- `teaser.ts`: 2 oder 4 Bars vor der eigentlichen Transition spielt Deck B kurz mit Lowpass-Filter (~600 Hz) und niedrigem Gain. Schafft Anticipation.
- Picker entscheidet ob Tease: bei kompatiblem Key + Energie-Sprung > 0.2.

### Stufe 5 — Quality-Score & AI-Auto-Pick
- `transitionQuality.ts` erweitern: BPM-, Key-, Energy-, Vocal-Clash-, Stem-Compat-Score (jeweils 0–1), Gesamtnote.
- `pickRecipe()` als zentraler Entscheider: nimmt beide Tracks + Phrasen-Kontext, gibt Recipe + Score + Begründung zurück.
- UI-Anzeige im Cockpit: "Auto: Vocal Out · Score 87 · 8A→9A · ΔBPM 2 %" — User sieht, warum welche Transition gewählt wird.

## Technische Details (für mich)

- **Worklet-Setup**: SoundTouchJS hat `soundtouchjs/dist/soundtouch-worklet.js` — als statisches Asset einbinden, via `audioCtx.audioWorklet.addModule()` laden, `AudioWorkletNode(audioCtx, 'soundtouch-processor')`, Parameter `tempo`, `pitch`, `rate`. Source = `MediaElementAudioSourceNode` aus `audioElB` → Worklet → bestehender Filter/Gain-Graph.
- **Phrase-Detect**: bei Analyse-Pass `analyze.ts` zusätzliche Spalte `phrase_grid: number[]` (jede 8. Bar-Zeit) und `vocal_gaps: [start, end][]` (Lücken > 1.5 s, voiced < 0.3).
- **Migration**: Neue Spalten in `tracks` (`phrase_grid jsonb`, `vocal_gaps jsonb`); kein Re-Upload nötig, Re-Analyse pro Track.
- **Fallback-Reihenfolge im Picker**:
  ```text
  ΔBPM > 12 %                    → dropCut
  Stems beidseits + Vocal-Clash → vocalOut
  Stems beidseits + Energy ↑   → drumBridge
  Stems nur B + B startet leise → acapellaIntro
  Key inkompatibel              → echoOut
  Key 8A→9A/8B kompatibel       → bassSwap / hookTease
  sonst                         → djEqSwap
  ```
- **Quality-Anzeige im Cockpit**: Über `NextMoveCard` Begründung anzeigen ("Vocal-Clash erkannt → Vocal Out gewählt, Score 87").

## Was sich für dich ändert

- Vocals klingen nicht mehr "Chipmunk" oder "Robot" — Pitch bleibt original.
- Songs werden an Phrase-Boundaries gewechselt, nicht mitten im Wort.
- Wenn Stems vorhanden sind, läuft die Transition wie bei Pioneer/Serato-Stem-Mode.
- Im Cockpit siehst du Auto-Pick + Score + Begründung — das vermittelt das Profi-DJ-Feeling.

## Reichweite

Dauer geschätzt: groß (5 Stufen, mehrere neue Audio-Module, DB-Migration, UI-Update). Ich kann auch nur Stufe 1+2 zuerst bauen (das eliminiert das Pitch-/Phrase-Problem) und Stufen 3-5 in folgender Runde. Sag mir kurz, ob ich **alles auf einmal** baue oder erst **Stufe 1+2** (Pitch + Phrase), damit du den Effekt schneller hörst.