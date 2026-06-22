## Ziel

Wir verabschieden uns vom Konzept "DJ-Mixer mit AI-Effekten". Stattdessen bauen wir eine **AI Music Intelligence Platform**, in der jede Transition aus einem vorher berechneten, deterministischen **Transition Plan (JSON)** ausgeführt wird. Das löst die Hauptursache der bisherigen Probleme: blinde Fades ohne musikalisches Verständnis, doppelte Engines, Pseudo-Stems die als echte Stems behandelt werden, und nicht beat-synchrone Choreografie.

Inspiration: kckDeepak/AI-DJ-Mixing-System (Analyse → Plan → Render). Keine Code-Kopie, nur Architektur.

## Bestehende Probleme (aus Audit), die der Plan adressiert

- Zwei konkurrierende Engines (`engine.ts` + `twinDeckBus.ts`) → eine Engine.
- Pseudo-Stems werden mit voller Verstärkung additiv auf den Dry-Path gelegt → klingt wie EQ-Pumping. Recipes laufen sogar im Pseudo-Modus.
- `setTimeout`-basierte Choreografie → off-beat Glitches.
- `applyCrossfader` überschreibt während Transitions die AudioParam-Ramps.
- `resetFilter` setzt `filter.type` nicht zurück → stiller Deck-State nach `loopRoll`.
- BPM/Key-Analyse mit Oktav-Fehlern und schlechtem First-Beat-Anchor.

## Architektur (5 Layer)

```text
Upload → [L1 Music Analysis] → [L2 Stem Analysis (Demucs)] → Track Profile (JSON)
                                                                  │
            Playlist + zwei Track Profile ──► [L3 Mixability Engine] ──► Score + Empfehlung
                                                                  │
                                          [L4 Transition Planner] ──► Transition Plan (JSON)
                                                                  │
                                          [L5 Execution Engine] ──► Audio Output / Mix Export
```

### Layer 1: Music Analysis (`src/lib/intel/analysis/`)

Erweitert `analyze.ts`. Liefert pro Track ein `TrackProfile`:

- BPM (mit Oktav-Korrektur: ½×, 1×, 2× testen, an Grid anlegen)
- Beatgrid (Downbeats + Beats, AudioContext-Zeit)
- Key (Camelot, Chroma über 3–4 Oktaven, nicht nur C4)
- Phrase-Marker (8/16/32-Takt)
- Intro/Outro, Drops, Breakdowns
- Energy-Curve (RMS + Spektral-Flux, normiert 0–1, pro Sekunde)
- Vocal-Density-Map (pro Sekunde 0–1, aus Spectral-Centroid + ML-Heuristik bzw. später aus Demucs-Vocal-Stem)

### Layer 2: Stem Analysis (`src/lib/intel/stems/`)

- Wrapper um bestehende `stems.functions.ts` (Demucs via HF).
- Persistiert vocals/drums/bass/other URLs + Dauer im Track-Profil.
- `stemsAvailable: boolean` Flag im Profil.
- Pseudo-Modus: **kein** "Fake-Stem" mehr. Stattdessen nur 3-Band-EQ-Slots (Low/Mid/High) für Clean-DJ. Klar getrennt vom echten Stem-Pfad.

### Layer 3: Mixability Engine (`src/lib/intel/mixability.ts`)

Reiner Funktionsblock, keine Audio-Side-Effects. Input: 2 `TrackProfile`. Output:

```ts
interface MixabilityReport {
  overall: number;          // 0–100
  bpm: { ratio: number; needsTempoShift: number; score: number };
  key: { camelotDelta: number; relation: "match"|"adjacent"|"relative"|"clash"; score: number };
  energy: { delta: number; direction: "up"|"flat"|"down"; score: number };
  vocalClash: { overlapSeconds: number; score: number };
  stems: { both: boolean; score: number };
  warnings: string[];
}
```

### Layer 4: Transition Planner (`src/lib/intel/planner.ts`)

Wählt deterministisch einen von acht Transition-Typen anhand `MixabilityReport`:

- `vocalOut` – Outgoing-Vocals raus, Drum/Instrumental halten
- `drumBridge` – nur Drums beider Tracks für N Bars
- `bassSwap` – Bass A↘ + Bass B↗ auf Phrase-Grenze
- `instrumentalBed` – Instrumental B unter Vocals A
- `echoExit` – Delay-Tail auf A, dann B
- `dropSwitch` – harter Cut auf Drop B
- `acapellaIntro` – Vocals B über Outro A
- `energyRamp` – Filter/EQ-Build mit Tempo-Glide

Liefert ein **Transition Plan JSON**, AudioContext-Zeit-basiert:

```ts
interface TransitionPlan {
  id: string;
  type: TransitionType;
  fromTrackId: string; toTrackId: string;
  startAtCtxTime: number; durationSec: number;
  tempoGlide?: { fromBpm: number; toBpm: number; bars: number };
  keyShiftSemitones?: number;
  events: TransitionEvent[];   // sample-akkurat, alle Zeiten in ctxTime
  qualityScore: number;        // 0–100, aus MixabilityReport abgeleitet
  fallbackUsed: boolean;       // true wenn Pseudo-Mode
}
type TransitionEvent =
  | { t: number; kind: "gain"; target: "deckA"|"deckB"|"stem"; stem?: Stem; to: number; ramp: "lin"|"exp" }
  | { t: number; kind: "filter"; deck: "A"|"B"; filterType: "lowpass"|"highpass"; freq: number; ramp: "lin"|"exp" }
  | { t: number; kind: "eq"; deck: "A"|"B"; band: "low"|"mid"|"high"; gainDb: number }
  | { t: number; kind: "tempo"; deck: "A"|"B"; rate: number }
  | { t: number; kind: "cut";  deck: "A"|"B"; action: "play"|"pause"|"seek"; seekTo?: number };
```

Plan ist **vor** dem Mix vollständig bekannt → testbar, exportierbar, anzeigbar.

### Layer 5: Execution Engine (`src/lib/audio/twinDeckBus.ts`, refactored)

- `engine.ts` wird stillgelegt; alle Callsites auf `useTwinDeck` migrieren.
- `executePlan(plan: TransitionPlan)` ersetzt `runTransition`/`runCleanRecipe`/`runStemRecipe`.
- Alle Events werden **einmal** über `AudioParam.linearRampToValueAtTime` / `setValueAtTime` mit `ctx.currentTime + t` geplant. Kein `setTimeout` für Musik-Timing mehr.
- `applyCrossfader` ist während `transitionInFlight=true` no-op (Audit Fix).
- `resetFilter` setzt `type='lowpass'` + 22 kHz (Audit Fix).
- Real-Stems-Pfad nur wenn beide Decks `stemsAvailable && stemsMode==='real'`. Sonst Clean-DJ via EQ/Filter auf dem Dry-Path. **Keine Pseudo-Stem-Recipes mehr.**
- Smart Mix, Echo Transition, Bass Swap, Drum Bridge, Vocal Out, Drop Switch = ausschließlich Plan-Templates aus Layer 4. Manuelle Mix-Buttons rufen Planner mit erzwungenem Typ auf.

### Auto-DJ ("Create Perfect Party Mix")

`src/lib/intel/autodj.ts`:

1. Erwartet Playlist (Track-IDs mit Profilen).
2. Greedy-Order: sucht Reihenfolge mit höchstem Durchschnitts-`MixabilityReport.overall` und sanfter Energy-Kurve.
3. Erzeugt für jedes Paar einen `TransitionPlan`.
4. Liefert `MixSet = { tracks, plans }`.
5. Optional `renderMixToMp3(mixSet)` via OfflineAudioContext + `lamejs` → Download.

### Datenpersistenz

Neue Lovable-Cloud Tabelle `track_profiles` (1 Zeile pro Track):

```text
id uuid pk, user_id uuid, source_url text, duration_sec numeric,
bpm numeric, beatgrid jsonb, key text, camelot text,
energy_curve jsonb, vocal_map jsonb, phrases jsonb,
stems_available bool, stem_urls jsonb, profile jsonb, updated_at timestamptz
```

RLS: per `user_id = auth.uid()`, GRANTs für `authenticated` + `service_role`.

Optional `mix_sets` Tabelle für gespeicherte Auto-DJ-Sets (Plan-JSON + Reihenfolge).

## Umsetzung in Phasen (UI bleibt unangetastet bis Phase 5)

1. **Phase 1 – Datenmodell & Analyse**
   - `TrackProfile`-Typ + Zod-Schema in `src/lib/intel/types.ts`.
   - `analyzeTrack()` erweitert `analyze.ts` (Oktav-Fix, Multi-Oktav-Chroma, Energy + Vocal-Map).
   - Cloud-Tabelle `track_profiles` + Serverfunktion `saveTrackProfile`/`getTrackProfile`.

2. **Phase 2 – Mixability & Planner**
   - `mixability.ts`, `planner.ts` mit den 8 Transition-Templates, jeweils als reine Plan-Generatoren.
   - Unit-Tests für Score-Funktion und Plan-Form (keine Audio-IO).

3. **Phase 3 – Execution-Refactor**
   - `executePlan` in `twinDeckBus.ts`, Audit-Fixes (Crossfader-Suspend, resetFilter-Type, stems-mode-Guard, `cancelScheduledValues` vor `setValueAtTime`).
   - Alte `runTransition`/`runCleanRecipe`/`runStemRecipe` Pfade entfernen.
   - `engine.ts` stilllegen.

4. **Phase 4 – Stems**
   - Demucs-Ergebnis ins Profil persistieren.
   - Real-Stem-Player nur über `executePlan` ansteuern.
   - Pseudo-Stem-Slider im UI deaktivieren bzw. als "EQ Bands" relabeln.

5. **Phase 5 – UI-Anbindung (minimal-invasiv)**
   - Smart-Mix-Button → `planner.plan(...) → executePlan(...)`.
   - Manuelle Buttons (Bass Swap, Drum Bridge, Vocal Out, Drop Switch, Echo Exit) → planner mit forciertem Typ.
   - `TransitionQualityHUD`: zeigt Score + gewählten Typ + Phase-Timeline aus dem Plan.

6. **Phase 6 – Auto-DJ & Export (optional)**
   - "Create Perfect Party Mix"-Flow.
   - MP3-Export via OfflineAudioContext.

## Technische Details (für Entwickler)

- **Keine** Imports von `.server.ts` in `*.functions.ts` Top-Level (Worker-Bundle-Schutz).
- Analyse läuft client-seitig in einem Web Worker (kein Server-Round-Trip für DecodeAudioData), Ergebnis wird via `createServerFn` persistiert.
- Demucs bleibt serverseitig via bestehende `stems.functions.ts` + HF.
- Sample-akkurate Choreografie ausschließlich über `AudioParam` Scheduling auf `ctx.currentTime`.
- `applyCrossfader` während `transitionInFlight` no-op; nach Plan-Ende Crossfader auf finalen Wert snappen.
- Pseudo-Stem-Code-Pfad in `stemSplit.ts` wird auf reinen 3-Band-EQ reduziert; additive Bandpasses entfernt.

## Was sich für den Nutzer ändert

- Vor jedem Mix: sichtbarer **Transition-Plan + Score**, kein Blindfade mehr.
- Stem-Slider arbeiten nur, wenn echte Stems da sind; sonst klare EQ-Bedienung statt heimlichem Spectral-Bleeding.
- Auto-DJ-Modus für ganze Playlists mit MP3-Export.
- Keine UI-Umbauten bis Phase 5 — bestehende Cockpit-Optik bleibt.

## Nicht im Scope

- Komplettes UI-Redesign.
- Neue ML-Modelle jenseits Demucs.
- Live-Mikrofon-Routing-Änderungen.
