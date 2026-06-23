## Ziel
Den Prototyp `partyspark-v8.html` so in das bestehende `/cockpit` integrieren, dass der User **eine klare Oberfläche** hat statt der jetzigen Tab-Wüste — und dass die im Prototyp bewährten, **kurzen, hörbar sauberen** Übergänge die Engine treiben.

## Layout (ersetzt den oberen Bereich von `/cockpit`)

```text
┌──────────────┬──────────────┬──────────────┬──────────┐
│   DECK A     │   CENTER     │   DECK B     │ PLAYLIST │
│ (vorhanden)  │ Harmony-Ring │ (vorhanden)  │ sortiert │
│              │ Sync-Info    │              │ nach Fit │
│              │ 4 Recipes    │              │ 🟢🟡🔴   │
│              │ Bars-Slider  │              │          │
│              │ Bridge-Beat  │              │          │
│              │ Step-Seq     │              │          │
├──────────────┴──────────────┴──────────────┤  COPILOT │
│            CROSSFADER (A ←→ B)              │   LOG    │
└─────────────────────────────────────────────┴──────────┘
```

Bestehende Tabs darunter (Stems, Karaoke, FX, Coach, Export) bleiben erhalten — als sekundäre Schublade.

## Was neu kommt

### 1. Center-Panel — `CockpitCenter.tsx`
- **Harmony-Ring**: SVG-Kreis, Farbe = Camelot-Distanz (grün = 0/1, gelb = 2, rot = ≥3), Mitte zeigt `A: 8B → B: 5B`.
- **Sync-Info**: `124 → 128 BPM (+3.2 %)`, Warnung wenn > 8 % („Bridge empfohlen").
- **4 Recipe-Buttons**: Bass Swap · Beatmatch · Echo Out · Filter Fade · Auto.
- **Bars-Slider** 4–32 (default 16).
- **Bridge-Beat-Karte**: erzeugt 4-Takt-Drumloop im Live-Tempo → lädt direkt auf das nicht-live Deck.

### 2. Step-Sequencer-Erweiterung
Der vorhandene `StepSequencer` wandert ins Center (kompakt, 16 Steps, 4 Tracks: Kick/Snare/Hat/Clap). Neue Buttons: `→ A`, `→ B` rendern Pattern als AudioBuffer und laden es auf das Ziel-Deck.

### 3. Mixability-Playlist — `MixabilityPlaylist.tsx`
Rechte Spalte (270 px). Listet alle `tracks`, sortiert nach `matchScore(liveTrack, candidate)`:
- BPM-Distanz (octave-aware, mit 2×/0.5×-Folding)
- Camelot-Distanz (`harmonicDist`)
- Energie-Delta
Anzeige: 🟢 score ≥ 70 · 🟡 ≥ 45 · 🔴 < 45, plus Klick → lädt auf nicht-live Deck.

### 4. Copilot-Log — `CopilotLog.tsx`
Scrollender Log unterhalb der Playlist. Engine-Events (`smartMix`, Recipe-Wahl, Bridge-Vorschlag, Sync-Warnung) pushen in einen Zustand-Store, der hier gerendert wird. Bestehende `console.info`-Logs aus `twinDeckBus.ts` werden auf diesen Bus umgebogen.

### 5. Vier Recipes als saubere, kurze Übergänge — `cleanRecipes.v2.ts`
Port der Prototyp-Logik (`bassSwap`, `beatmatch`, `echoOut`, `filterFade`) gegen die bestehende Engine (`engine.ts` + `twinDeckBus.ts`). Wichtig:
- **bar-anchored** (warten aufs nächste Downbeat statt willkürlicher Ramps),
- **kein aggressives Time-Stretch** — bei > 8 % BPM-Delta Auto-Mix schlägt Bridge vor statt zu stretchen,
- Default-Länge 16 Takte (vom Slider gesteuert).
Die alten Stretch-getriebenen Pfade in `cleanDjTransitions.ts` bleiben für Edge-Cases als Fallback, sind aber nicht mehr Default.

## Technische Details

| Datei                                          | Aktion                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| `src/lib/dj/mixability.ts`                     | **neu** — `matchScore`, `harmonicDist`, `bpmFold`      |
| `src/lib/audio/cleanRecipes.v2.ts`             | **neu** — die 4 bar-anchored Recipes                   |
| `src/lib/audio/bridgeBeat.ts`                  | **neu** — `makeBridgeBeatBuffer(bpm, bars)`            |
| `src/lib/dj/copilotLog.ts`                     | **neu** — zustand-Store, `pushLog(msg, kind)`          |
| `src/components/cockpit/CockpitCenter.tsx`     | **neu** — Ring + Sync-Info + Recipes + Bridge + Slider |
| `src/components/cockpit/MixabilityPlaylist.tsx`| **neu**                                                |
| `src/components/cockpit/CopilotLog.tsx`        | **neu**                                                |
| `src/components/cockpit/StepSequencer.tsx`     | erweitern: `→A` / `→B` Render-Buttons                  |
| `src/lib/audio/twinDeckBus.ts`                 | Recipes-Quelle umstellen, Logs in `copilotLog` pushen  |
| `src/routes/_authenticated/cockpit.tsx`        | Layout-Grid umbauen, Center+Playlist+Log einsetzen     |

Der bestehende `TwinDeck` (Deck A/B mit EQ, Filter, FX-Pads, Hotcues, Waveforms) wird **nicht angefasst** — nur in das neue Grid eingehängt.

## Was NICHT Teil dieses Steps ist
- Keine neuen Engine-Algos (Pitch-Detection, Stem-Split, Autotune) — der Prototyp nutzt dort eigene Implementierungen, die Lovable-Engine ist schon besser.
- Keine UI-Redesigns der bestehenden Tabs (Stems, Karaoke, FX, Export, Coach).
- Kein Port des Prototyp-CSS — wir bleiben bei Tailwind + den vorhandenen Neon-Tokens, optisch im selben Stil wie das jetzige Cockpit.

## Verifikation
Nach dem Build:
1. Zwei Tracks laden → Harmony-Ring zeigt Distanz/Farbe live.
2. Klick **Auto-Mix** → Copilot-Log zeigt gewähltes Recipe + Bars; Übergang ist hörbar nach Recipe, nicht ein generischer Fade.
3. BPM-Delta > 8 % → Bridge wird vorgeschlagen, Klick darauf erzeugt Drumloop und lädt es auf B.
4. Playlist sortiert sich neu, sobald A → B promoted wird.
5. Sequencer-Pattern via `→A` als Loop hörbar.
