## Ziel

1. **Harmonische Auto-Anpassung beider Decks** — beide Songs nähern sich aktiv an (Tempo & Tonart), statt nur einseitig. Drei abwechslungsreiche Strategien wählbar oder per Auto.
2. **Cockpit-Upgrade**: Virtuosen-UI mit „Next-Move"-Vorschau, Live-Mix-Score, Skill-Progression, mehr sichtbaren Instrumenten.
3. **Live-Recording-Komponente**: Echtzeit-Wellenform + Pre-FX-Kette (Pitch, Reverb, Delay, Autotune, Distortion) — überall wiederverwendbar.

---

## Teil A — Harmonische Mutual-Sync Engine

### A1. Drei Adaption-Strategien (`src/lib/audio/harmonicSync.ts`)

Aktuelle Engine schiebt nur das einkommende Deck Richtung Outgoing. Neu: drei Profi-Moves, vom Planner pro Übergang gewählt — oder vom User per Picker im Cockpit erzwingbar.

**1. „Meet-In-The-Middle" (Tempo-Bend)**
Beide Decks treffen sich am Mittel-BPM. Outgoing rampt über die letzten 8 Bars sanft von `bpmFrom → midBpm`, Incoming startet bei `midBpm` und gleitet über die ersten 8 Bars nach Crossfade auf seinen `bpmTo`. Erzielt durch `playbackRate`-Automatisierung mit Cubic-Ease, immer geclamped auf ±10 % damit kein Chipmunk-Effekt entsteht. Funktioniert bei BPM-Δ bis ~12 %.

**2. „Pitch-Lock Pre-Shift" (Key-Match)**
Über `soundtouchjs` (bereits installiert) wird offline ein 32-Takt-Snippet des Incoming-Tracks vor-prozessiert: gleichzeitig auf `bpmFrom` UND auf die Tonart des Outgoing-Tracks (semitonbasierter Pitch-Shift via `shiftKey`-Delta). Das Snippet wird in einen zweiten AudioBufferSourceNode geladen, ersetzt für die Übergangsdauer den Live-Stream. Danach Crossfade zurück in den nativen Stream → Hörer merkt keinen Sprung. Erweitert das bestehende `bridgeBuilder`-Pattern um Pitch-Shift.

**3. „Tonal Pedal-Drone"**
Bei harten Key-Wechseln (>4 Semitones) generiert die Engine einen sanft hereinblendenden Drone-Pad (3 Oscillatoren = root + Quinte + Oktave) auf der **gemeinsamen Note** beider Tonarten (oder Common-Tone-Pivot per Tonart-Theorie-Tabelle). Der Drone überdeckt den Tonart-Sprung tonal für 8–12 Bars, dann ausfade. Outgoing/Incoming behalten native BPM bei. Brutalst kreativ — wirkt wie ein bewusstes „Breakdown".

**4. „Half/Double-Time Lock"** *(Bonus, vorhanden, wird erweitert)*
Bei BPM-Δ > 25 % wird Incoming auf ×½ oder ×2 gelockt; Kick fällt weiter auf den Beat → keine Time-Stretch nötig.

Auswahlheuristik im `mixPlanner` (erweitert):
- BPM-Δ ≤ 4 % UND Key kompatibel → **Meet-In-The-Middle** (sanftester Übergang).
- BPM-Δ ≤ 12 % UND Key inkompatibel → **Pitch-Lock Pre-Shift**.
- Key-Δ > 4 Semitones ODER Genre-Bridge → **Tonal Pedal-Drone**.
- BPM-Δ > 25 % → **Half/Double-Time Lock** zusätzlich vor jedem anderen Modus.

### A2. Mutual-Tempo-Automation in `twinDeckBus.ts`

Neue Funktion `mutualTempoRamp(from, to, midBpm, durationMs)`:
- Schedule sample-genaue `playbackRate`-Linear-Ramps für `from.el` und `to.el` über `setTargetAtTime`-Äquivalent in JS (rAF-Loop).
- Nach Übergang: `from.playbackRate` → original (oder Track endet), `to.playbackRate` → 1.

### A3. Persistierung der Adaption-Wahl pro Übergang

Im `lastTransitionNote` zusätzlich `strategy` und `keyShiftSemis` mitspeichern → wird im Cockpit angezeigt und fließt in den Mix-Score ein (siehe B2).

---

## Teil B — Cockpit Virtuosen-Upgrade

### B1. „Next-Move"-Karte (`src/components/cockpit/NextMoveCard.tsx`)

Über den Decks, immer sichtbar wenn Auto-DJ läuft:
- Großer Countdown-Ring (SVG-Stroke-Dasharray) bis nächster Trigger.
- Modus-Badge: „Bass-Swap • Meet-In-Middle • 8 bars".
- BPM- und Key-Zielwerte mit Pfeilen: `124 BPM → 122 ← 120` (Treffpunkt-Visualisierung).
- Vocal-Status-Icon (clean / clash) am Ziel-Cue.
- Animierter Energie-Pfeil (steigend ↗ / haltend → / fallend ↘).

### B2. Live „Mix-Score" Meter (`src/lib/audio/mixQuality.ts` + `MixScoreDial.tsx`)

Pro 250 ms berechneter Echtzeit-Score 0–100 während Crossfade-Phase:
- **Phase-Coherence** (40 %): Cross-Correlation L/R beider Decks über AnalyserNode-FFT → wie „phasig" der Mix ist.
- **Bass-Clash-Penalty** (25 %): Summe der LF-Energie (<150 Hz) aus beiden Decks; >Threshold = Strafe (Bass-Mud).
- **Beat-Drift** (20 %): zeitliche Distanz zwischen letztem Downbeat beider Decks.
- **Key-Compat** (15 %): Camelot-Match nach allen Pitch-Shifts (`effectiveKey`).

UI: pulsierende kreisförmige Dial-Anzeige mit Farbring (rot < 50, gelb < 75, grün ≥ 75), darunter Mini-Sparkline der letzten 30 s.

### B3. Skill-Progression (`dj_skill` Tabelle + `SkillBadge.tsx`)

Migration:
```sql
CREATE TABLE public.dj_skill (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  total_mixes int NOT NULL DEFAULT 0,
  best_score int NOT NULL DEFAULT 0,
  avg_score numeric NOT NULL DEFAULT 0,
  badge text NOT NULL DEFAULT 'rookie', -- rookie|bronze|silver|gold|platinum|diamond
  perfect_count int NOT NULL DEFAULT 0,
  last_mixed_at timestamptz
);
-- + GRANTs + RLS scoped to auth.uid()
```
- Bei jedem fertigen Crossfade: avg-Score persistiert → Schwellen erhöhen Badge (5/25/100/250/500/1000 Mixe + min Avg-Score).
- Cockpit-Header zeigt Badge mit subtiler Animation bei Aufstieg + Toast „🏆 Silver DJ unlocked!".

### B4. Sichtbarere Instrumente

Erweiterungen am bestehenden `TwinDeck.tsx`:
- **CDJ-Style Jog-Wheel pro Deck**: existierendes Turntable bekommt rotierenden Waveform-Ring (canvas) der den aktuellen Audio-Ausschnitt zeigt.
- **3-Band-EQ-Knöpfe** (sichtbar machen — Engine hat sie schon): drei vertikale Mini-Knobs Lo/Mid/Hi pro Deck, mit Glow.
- **Spektrum-Analyzer pro Deck**: kleine 64-Band-FFT-Bar (Canvas, rAF) aus existierendem AnalyserNode.
- **Beat-Radar**: zwei pulsierende konzentrische Kreise zwischen den Decks, die sich farblich vereinen sobald sync drift < 30 ms.

### B5. „Lernende Engine"

Lokale Heuristik (kein ML-Service nötig): pro User wird `localStorage`-Mapping `(fromBpm-Bucket, toBpm-Bucket, keyDelta) → preferredStrategy + avgScore` geführt. Bei künftigen Übergängen mit ähnlichen Buckets bevorzugt der Planner Strategien mit dem höchsten historischen Score. → fühlt sich an wie „der DJ wird besser, je länger man spielt".

---

## Teil C — Live-Recording mit Wellenform + Pre-FX

### C1. Wiederverwendbare Komponente `src/components/recording/MicRecorder.tsx`

```text
┌──────────────────────────────────────────────┐
│ ●REC 00:23   ▁▂▄▆█▇▆▅▄▃▂▁  scrolling wave   │
├──────────────────────────────────────────────┤
│ Pitch [−7 ──●── +7]   Reverb [0 ──●── 100]   │
│ Delay [0 ──●── 100]   AutoSnap [Off/Maj/Min] │
│ Tone  [0 ──●── 100]   Distort [0 ──●── 100]  │
│                       [ 🎧 Monitor ] [ ⏺ ]    │
└──────────────────────────────────────────────┘
```

- `MediaStream` → `MediaStreamAudioSourceNode` → Pitch-Shift → AutoSnap → Distort (Waveshaper) → Delay → Reverb (Convolver) → AnalyserNode → `MediaStreamAudioDestinationNode` → `MediaRecorder`.
- **Pitch-Shift**: `soundtouchjs` läuft online via `ScriptProcessorNode`-Adapter (bzw. `AudioWorklet` wo verfügbar). Fallback bei niedriger Performance: `playbackRate`-Trick auf Monitor-Out only.
- **AutoSnap (Tune)**: bestehender `pitch.ts` snappt erkannte Frequenz auf Skalenton, mappt zu Cents-Korrektur die der Pitch-Shifter live anwendet.
- **Live-Wellenform**: scrollende Canvas-Visualisierung aus AnalyserNode `getFloatTimeDomainData` à 60 fps (Pre-Roll + Recording).
- **Monitor-Toggle**: routet zusätzlich auf `ctx.destination` (Headphone Recommended Toast).
- **Output**: Blob (webm/opus) + `peaks`-Array für sofortige Vorschau.

### C2. Einsatzorte

Drop-in-Replacement in:
- **Loops** (statt aktueller nackter `MediaRecorder`-Logik) → User sieht Wellenform + kann mit Pitch/Reverb experimentieren bevor die Loop in den Set fließt.
- **Karaoke**, **Autotune**, **Studio**, **Choir** — wo aktuell `getUserMedia` ohne Visualisierung läuft.

Bestehender Aufnahme-Code bleibt erhalten, nur das UI/Mic-Routing wird durch die neue Komponente ersetzt — gleiche Output-API (`onRecordingComplete(blob)`) damit Aufrufer unverändert bleiben.

---

## Dateien

**Neu:**
- `src/lib/audio/harmonicSync.ts` — drei Adaption-Strategien
- `src/lib/audio/mixQuality.ts` — Live-Score-Rechner
- `src/components/cockpit/NextMoveCard.tsx`
- `src/components/cockpit/MixScoreDial.tsx`
- `src/components/cockpit/SkillBadge.tsx`
- `src/components/cockpit/DeckSpectrum.tsx` — FFT-Bar
- `src/components/cockpit/DeckEqKnobs.tsx`
- `src/components/recording/MicRecorder.tsx`
- `src/lib/audio/recording/fxChain.ts` — Web-Audio Pre-FX Graph + soundtouch worklet adapter

**Geändert:**
- `src/lib/audio/twinDeckBus.ts` — neue `mutualTempoRamp`, Drone-Player, Pre-Shift-Snippet-Hook + Score-Hook
- `src/lib/audio/mixPlanner.ts` — wählt eine der drei neuen Strategien
- `src/components/cockpit/TwinDeck.tsx` — bindet NextMoveCard, MixScoreDial, SkillBadge, DeckSpectrum, EqKnobs, Beat-Radar ein
- `src/components/cockpit/DeckLiveHud.tsx` — zeigt aktuelle Strategie + Pitch-Lock-Status
- `src/routes/_authenticated/loops.tsx` — Recording über `<MicRecorder/>`
- `src/routes/_authenticated/karaoke.tsx`, `studio.tsx`, `autotune.tsx`, `choir.tsx` — gleicher Drop-in
- `src/lib/db/queries.ts` — `djSkillOptions`

**Migration:**
- `dj_skill` Tabelle anlegen (Schema oben) inkl. GRANTs, RLS, Trigger für `last_mixed_at`.

---

## Akzeptanzkriterien

1. Im Cockpit kann ich pro Übergang die Strategie sehen UND optional erzwingen („Meet-In-Middle / Pitch-Lock / Pedal-Drone / Auto").
2. Bei aktiver Transition rampen beide Decks gleichzeitig im Tempo (sichtbar in Live-HUD-BPM-Anzeigen), nicht nur eins.
3. „Next-Move"-Karte zeigt mit Countdown-Ring, was in den nächsten X Sekunden passiert, inkl. BPM-/Key-Treffpunkt.
4. Während Crossfade pulsiert der Mix-Score-Dial live; nach Abschluss steigt die DJ-Skill-Stat sichtbar.
5. Im Loop Creator (und in Karaoke/Studio) sehe ich während der Mic-Aufnahme eine flüssige Wellenform UND kann Pitch/Reverb/Delay live verändern; die gespeicherte Datei klingt mit FX.
6. Nach 5 Übergängen merkt sich der Planner pro BPM-/Key-Bucket den besten Strategie-Score und bevorzugt ihn — verifizierbar via `localStorage`-Inhalt.
