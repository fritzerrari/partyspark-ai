# DJ-Cockpit + integriertes Live-Vocal-System

Ziel: Aus den heute eigenständigen Modulen (Library, Loops, Karaoke, Remix, Autotune, Choir) wird **ein zusammenhängendes Live-Tool** mit einem zentralen Player, Zeitleiste, vorbereiteten Transitions und Vocal-Recording über laufende Songs.

## 1) Zentraler Player mit Zeitleiste & Seek

Heute: `engine.ts` spielt Tracks ab, aber die UI hat keinen sichtbaren Zeitstrahl mit Vor-/Zurückspulen, und Karaoke/Loops/Remix nutzen ihre eigenen Mini-Player.

Neu: **Persistente Transport-Bar** unten in `AppShell` (analog Spotify), die `useEngine` nutzt:
- Waveform-Zeitstrahl (gerendert via `buildPeaks` aus `multitrack.ts`) + Playhead
- Klick/Drag zum Spulen → `engine.seek(sec)`
- Play/Pause, Skip, Lautstärke, aktueller Track + Cover
- Mini-Buttons: "Vocal aufnehmen", "Loop-Pads", "Auto-Mix" → öffnen Overlays statt zu navigieren
- Sichtbar auf allen Routen außer `/auth`

## 2) Upload-Analyse-Pipeline (BPM, Key, Energy, Beat-Grid, Hot-Cues)

Heute: Uploads in `library.tsx` speichern nur Dauer. Keine BPM/Key/Beat-Analyse → "perfekte virtuose Transitions" sind nicht möglich.

Neu: Beim Upload (und nachträglich per Button "Analysieren") läuft eine **Web-Audio-Analyse im Browser**:
- BPM via `estimateBPM` (existiert in `mashup.ts`) + verfeinert durch Onset-Detection
- **Beat-Grid** (Array von Beat-Timestamps) → ermöglicht beat-synchrones Mixen
- **Key/Tonart** via Chroma-Feature + Krumhansl-Profil (Pure-JS, neue `keyDetect.ts`)
- **Energy-Kurve** (RMS pro 1s) → für Drop-Detection
- **Hot-Cues**: Intro-Ende, erster Drop, Outro-Start (Heuristik aus Energy-Kurve)
- **Vocal-Pausen-Map** (laute Sektionen vs. instrumentale Breaks via Spektral-Flatness) → für Vocal-Layering & Mix-In-Punkte

Persistenz: Erweiterung Tabelle `tracks` um Spalten `bpm float`, `musical_key text`, `beat_grid jsonb`, `energy_curve jsonb`, `cues jsonb`, `vocal_map jsonb`, `analyzed_at timestamptz`. Analyse läuft als Web-Worker → blockiert UI nicht.

## 3) Virtuoses Auto-DJ-System

Heute: `engine.ts` hat Transition-Modi (crossfade, filterSweep, echoTail …), aber wählt nicht intelligent nach Tracks aus.

Neu: **AI-Mix-Planner** (`mixPlanner.ts` + Gemini `planMix.functions.ts`):
- Nimmt die nächsten 2–3 Tracks aus der Queue
- Berechnet **Kompatibilität** (BPM-Differenz < 8%, harmonischer Key via Camelot-Wheel)
- Wählt **Transition-Typ + Länge** abhängig vom Material:
  - Ähnliche Energy/BPM → **langer harmonischer Crossfade** (16–32 Beats) am nächsten Phrasen-Ende von A + Intro von B
  - Großer Energy-Sprung → **Filter Sweep + Drop-Sync** (B startet exakt auf Drop)
  - Verschiedene Keys → **Echo-Tail + Cut** auf Beat
  - Wenn A noch nicht zu Ende: **kurzes In-Mix** von B als "Loop-Snippet" (8 Beats vom Hook) während A's instrumentaler Sektion läuft, dann zurück zu A
- Time-Stretch (existiert in `remix.ts`) angleicht BPM **ohne Tonhöhenverschiebung** (Pitch-Korrektur ist schon drin)
- Phrase-aligned: Mix-Punkte snappen auf Beat-Grid + 8/16/32-Takt-Grenzen

UI: Im Player-Bar Button "Auto-Mix an", optional Slider "Mix-Stil" (Smooth ↔ Creative).

## 4) Loop-Pads über laufendem Song

Heute: `/loops` hat ein Pad-Grid, aber spielt unabhängig vom Library-Player und nicht beat-synchron.

Neu: **Loop-Pad-Overlay** (aufrufbar aus Player-Bar):
- 4×4 Pad-Grid mit eigenen Loops + Preset-Packs (Drums, Vocal-Chops, FX, Bass)
- Klick startet Loop **quantisiert auf nächsten Beat** des laufenden Songs (Beat-Grid kommt aus Schritt 2)
- Loops werden auto-time-stretched auf Song-BPM
- Per-Pad: Volume, Mute, Loop-Length (1/2/4/8 Takte), Pitch-Shift in Semitönen
- "Record Performance" → mischt Song + alle gespielten Pads + Vocal in eine neue Aufnahme (`recordings`)
- Loops können auch aus jedem `recordings`-Eintrag gemacht werden ("Slice & Pad")

## 5) Live-Vocal-Layer auf Song mit Smart-Autotune

Das Kernstück. Heute: Karaoke nimmt Vocals auf, aber ohne laufenden Song als Background, und Autotune ist ein separater Schritt.

Neu: **Vocal-Live-Layer** (Sheet/Overlay über Player):
- Großer **"Mic"-Button** → startet Aufnahme während Song läuft
- Song läuft weiter, Mikrofon-Input geht durch **Live-VocalChain** (`vocalChain.ts` existiert): EQ, Kompressor, optional Live-Autotune zur Song-Tonart (aus Schritt 2), Reverb, Echo
- **Monitoring**: User hört eigene Stimme mit Effekten (Kopfhörer-Modus, mit Latenz-Hinweis)
- **DJ-Button "Drop Vocal"**: Bei Klick markiert das Tool den Zeitpunkt; Tool platziert die Vocal-Phrase **automatisch an der musikalisch passenden Stelle**:
  - Snap auf nächsten Downbeat
  - Wenn die laufende Song-Sektion gerade Vocals hat → schiebt es in nächste instrumentale Lücke (aus `vocal_map`)
  - Tonart-Korrektur via existierendem `pitchShiftBuffer` an Song-Key
  - Optionaler Echo-Tail auf Beat-Grid
- **Auto-Modus**: AI entscheidet anhand `vocal_map` + Energy-Kurve selbst, wann die letzte aufgenommene Phrase eingespielt wird (z. B. nur in Breaks oder als Echo-Layer im Drop)
- Export als neue `recordings` (Song-Mix + Vocal-Layer) per Offline-Render

## 6) Modul-Konsolidierung (alles arbeitet zusammen)

Statt 12 unabhängiger Routen → **eine zentrale `/studio`-Surface** mit Tabs:
- **Decks** (Library + Queue + Player)
- **Pads** (Loops, beat-sync)
- **Mic** (Vocal-Layer + Autotune)
- **FX** (existierende FX-Bibliothek)
- **Mixdown** (Multitrack-Editor — `multitrack.ts` existiert bereits)

Bestehende Routen (`/loops`, `/karaoke`, `/autotune`, `/choir`, `/remix`, `/lyric-writer`) bleiben als Deep-Links bestehen, aber teilen sich denselben globalen Engine-State (`engine.ts`), dieselbe `recordings`-Tabelle, denselben Vocal-Chain. Der Studio-Wizard wird auf diese Tabs umgestellt.

## Umfang (in dieser Etappe)

Vorschlag: in **3 Sub-Etappen** liefern, jede testbar:

- **3a — Player & Analyse-Fundament**: Persistente Transport-Bar mit Waveform & Seek + Upload-Analyse (BPM/Key/Beat-Grid/Energy/Vocal-Map) + DB-Migration + Re-Analyse-Button in Library.
- **3b — Auto-DJ + Loop-Pads über Song**: Mix-Planner + intelligente Transitions + beat-quantisierte Loop-Pads als Overlay.
- **3c — Live-Vocal-Layer + Studio-Konsolidierung**: Vocal-Live-Recording über Song mit Smart-Drop, Live-Autotune zur Song-Key, `/studio` als zentrale Tab-Surface.

## Technische Hinweise

- Alle Audio-Analyse läuft client-seitig im Web-Worker (keine Kosten, kein Upload-Roundtrip).
- AI-Aufrufe nur für: Mix-Plan-Vorschläge, Vocal-Auto-Drop-Entscheidungen, Lyric-Vorschläge — alles über Lovable AI (`gemini-3-flash-preview`).
- Migration für `tracks`-Spalten + GRANTs.
- Web-Worker via `?worker`-Import in Vite; Worker-Code in `src/lib/audio/workers/`.
- Beat-Grid + Vocal-Map in `jsonb` reicht (≤ 50 KB pro Track typisch).

## Frage vor Start

Soll ich **alle 3 Sub-Etappen in einem Rutsch** bauen (umfangreich, ~15–20 Dateien neu/geändert), oder mit **3a starten und nach jedem Schritt Zwischenfreigabe** holen?
