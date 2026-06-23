# Virtuoser Profi-Mixer: generative Transitions

## Idee in einem Satz
Bevor der eigentliche Übergang startet, blendet der Mixer **musikalisches Material aus dem neuen Track** (Teaser-Hook) sowie **selbst generierte Begleit-Layer** (Drums/Bass/Gitarre/Pads) ein — alles automatisch in Key & BPM des laufenden Tracks, das sich dann langsam Richtung neuer Track verbiegt. So klingt jeder Mix wie von einem Profi-DJ, nie wie ein Fade.

## Was die App schon kann (wird genutzt, nicht neu gebaut)
- `analyze.ts`: BPM, Camelot/Key, Beat-Grid, Cues (introEnd, firstDrop, outroStart), `vocalMap`, `energyCurve`
- `bridgeBuilder.ts`: Offline-Render eines Schnipsels mit SoundTouch (Pitch+Tempo lock)
- `stemSplit.ts` + `transitionRecipes.ts`: 6 stem-basierte Rezepte (BassSwap, DrumBridge, AcapellaIntro, DropSwitch, …)
- `synth.ts`: prozeduraler Synth (Osc, Filter, LFO, Reverb) — wird für Pads/Risers genutzt
- `bridgeBeat.ts`: neutraler 4/4-Beat im Live-Tempo
- `mixability.ts`, `copilotLog.ts`, `CockpitCenter`: Harmony-Ring, Rezept-Buttons, Log

## Was neu dazukommt

### 1. Best-Transition-Point-Finder (pro Track, einmalig)
`src/lib/intel/transitionPoints.ts`
- Scannt `vocalMap` + `energyCurve` + `beatGrid` und gibt **Outro-Slots** (gute Stellen zum Rausmixen) und **Intro-Hooks** (gute Stellen zum Reinmixen / Teaser) zurück — jeweils auf Downbeat gesnapped, mit Score (vocal-frei, stabile Energie, Phrasenlänge 8/16/32 Takte).
- Wird beim Track-Analyse-Lauf zusätzlich zur bestehenden Analyse berechnet und in `EngineTrack` mitgeführt (`outroSlots[]`, `introHooks[]`).

### 2. Teaser-Snippet-Renderer ("Profi-Vorhören")
`src/lib/audio/teaserBuilder.ts`
- Schneidet aus dem **neuen Track** den besten Intro-Hook (z. B. 4 Takte Vocal-Lick oder Melodie-Phrase).
- Rendert ihn offline mit SoundTouch in **Key & BPM des laufenden Tracks** (Wiederverwendung von `bridgeBuilder`'s Pipeline).
- Filtert ihn (HighPass → später LowPass-Sweep), legt ihn als Layer **vor** der eigentlichen Transition über den laufenden Track. Hörer hört „Vorgeschmack", merkt es kaum.
- Dann während des Übergangs: Teaser-Pitch/Tempo wird über 4–8 Takte **kontinuierlich Richtung Originalwerte des neuen Tracks zurückgefahren** ("Morph") → nahtloser Reveal.

### 3. Generative Begleit-Layer (instrumentale Tarnung)
`src/lib/audio/genLayers.ts` — pure WebAudio, kein externer Service:
- **Drum-Layer**: erweitert `bridgeBeat` um Kick-Pattern-Varianten (4-on-floor, Breakbeat, Halftime), Hi-Hat-Shuffle, Claps auf 2 & 4 — gewürfelt aus Pool, im Live-BPM.
- **Bass-Layer**: Sub-Bass-Linie aus `synth.ts` (Sine + Sub-Osc) auf Wurzelton des Live-Keys, folgt einer **Camelot-Akkordfolge** Richtung neuer Key (z. B. 8A → 9A → 9B über 8 Takte).
- **Gitarren-/Pluck-Layer**: Triangle/Saw mit kurzer Decay-Envelope spielt arpeggierten Akkord der aktuellen Tonart (I–V–vi–IV-Varianten), Tempo am Beat-Grid.
- **Pad-/Riser-Layer**: Filter-Sweep + Noise-Riser zur Drop-Anchor-Zeit, getriggert 2 Takte vor Phase-D des Recipes.
- Alle Layer rendern offline in einen `AudioBuffer`, werden als zusätzlicher Bus in `twinDeckBus` zugemischt und am Phrasenende automatisch ausgeblendet.

### 4. Morph-Engine (Key & Tempo gleiten)
`src/lib/audio/morphEngine.ts`
- Statt SoundTouch fest auf Live-Werte zu locken: **lineare Automation** von (BPM_live → BPM_new) und (Pitch_live → Pitch_new) über N Takte. Implementiert über segmentweises Offline-Rendering (kleine Chunks à 1 Takt mit interpolierten SoundTouch-Parametern, dann Concat) — vermeidet hörbare Sprünge.
- Greift für Teaser-Snippet **und** Generativ-Layer.

### 5. Virtuoser Auto-Mix Director
`src/lib/dj/director.ts`
- Wählt pro Übergang eine **Choreographie aus 3 Phasen**:
  1. **Preview** (4–8 Takte vor Outro-Slot): Teaser-Snippet + ggf. Pad-Layer einblenden, gefiltert.
  2. **Transform** (8–16 Takte): Generativ-Layer (Drums/Bass/Pluck) wandern via Morph-Engine von Live-Key/BPM Richtung neuer Track; vorhandenes Recipe (z. B. BassSwap) läuft parallel.
  3. **Reveal**: neuer Track läuft solo, Teaser & Layer faden aus.
- **Variation**: Director würfelt aus mehreren Choreographien (z. B. „Vocal-Tease + DrumBridge", „Pluck-Arp + BassSwap", „Pad-Riser + DropSwitch") und merkt sich die letzten 5, damit nichts wiederholt klingt.
- Loggt jeden Schritt in `copilotLog`.

### 6. UI im /cockpit
`CockpitCenter.tsx` bekommt einen neuen Abschnitt **„Director"**:
- Toggle „Virtuose Übergänge" (an/aus)
- Slider „Kreativität" (0 = nur Recipe, 1 = volle Layer + Teaser + Morph)
- Anzeige des nächsten geplanten Outro-Slot / Intro-Hook mit Countdown in Takten
- Buttons „Variation neu würfeln" und „Vorhören" (rendert offline 8-Takte-Preview)

## Technische Anmerkungen
- Alles **clientseitig & offline gerendert** (OfflineAudioContext + SoundTouch + WebAudio-Synth). Keine zusätzliche KI-API nötig, kein Server-Roundtrip im Mixer.
- Track-Analyse für Outro/Intro läuft als Erweiterung der bestehenden `analyzeTrack`-Funktion — bestehende Tracks werden lazy nachanalysiert beim ersten Laden ins Deck.
- Latenz: Teaser & Layer werden beim Laden des Next-Decks im Hintergrund vorgerendert (Web Worker optional), so dass der Übergang ohne Wartezeit startet.
- Generierte Audio-Layer sind **musikalisch korrekt** (Camelot-konform), aber nicht KI-generiert wie z. B. ein Suno-Stem — bewusste Entscheidung für Latenz/Kosten. Optional später: Lovable-AI-Hook für richtige Stem-Generation, derselbe Director-Code kann das Buffer dann einspeisen.

## Verifikation
- Zwei Tracks unterschiedlicher Tonart/BPM laden → 8 Takte vor Outro-Slot startet ein hörbares Teaser-Snippet (HighPass, leise) **bevor** der eigentliche Mix beginnt.
- Im Copilot-Log erscheinen 3 Phasen: `Preview → Transform → Reveal` mit gewählter Choreographie.
- „Variation neu würfeln" verändert die Layer-Kombination hörbar.
- BPM- und Pitch-Slider zeigen während des Übergangs ihren glatten Verlauf (kein Sprung).

## Out of Scope
- Echte neuronale Stem-Generation (Suno/MusicGen) — nicht in dieser Iteration.
- Re-Design existierender Tabs (Stems, Karaoke, FX) bleibt unangetastet.
- Live-Stretch der Original-Tracks wird **nicht** verändert; Morph betrifft nur Teaser + generierte Layer.

## Neue Dateien
- `src/lib/intel/transitionPoints.ts`
- `src/lib/audio/teaserBuilder.ts`
- `src/lib/audio/genLayers.ts`
- `src/lib/audio/morphEngine.ts`
- `src/lib/dj/director.ts`

## Geänderte Dateien
- `src/lib/audio/analyze.ts` (Outro/Intro-Slots dazu)
- `src/lib/audio/engine.ts` (Track-Typ-Felder)
- `src/lib/audio/twinDeckBus.ts` (Director-Hook in `smartMix`)
- `src/components/cockpit/CockpitCenter.tsx` (Director-UI)
