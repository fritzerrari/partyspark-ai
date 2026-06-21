
# Karaoke Studio — Gamechanger-Upgrade

Aktuell ist Karaoke ein **Single-Take Recorder**. Damit es einen Level höher kommt, mache ich daraus ein **Multitrack-Loop-Studio mit KI-Coach** — wie eine Ed-Sheeran-Loop-Station kombiniert mit einem Vocal-Trainer.

Alles, was hier steht, ist mit **Lovable AI (kostenlos in deinem Plan)** + Web Audio API umsetzbar. Keine externen Bezahl-APIs.

---

## TEIL A — Das Multitrack-Studio (die Hauptsache)

### A1. DAW-Style Multitrack-Recorder
- **Mehrere Tonspuren parallel** auf einem Timeline-Grid
- Jede Spur: eigene Wellenform, Mute/Solo/Volume/Pan, eigene FX-Bypass
- **Overdub**: während die alten Spuren laufen, neue Spur dazu aufnehmen (Beatbox-Layer, Harmonies, Ad-libs)
- **Loop-Station Mode**: Loop-Länge in Takten setzen (z. B. 4 Bars @ 100 BPM), jeder Durchgang fügt eine neue Layer hinzu — perfekt für spontane Songs auf der Party
- **Punch-In / Punch-Out**: nur ein Abschnitt einer Spur neu aufnehmen
- **Mixdown**: alle Spuren als eine WAV exportieren
- **Sessions speichern**: Projekt mit allen Spuren in DB + Storage, später weiterbearbeiten

### A2. Visueller Mixer
- Channel-Strips wie bei einem echten Mischpult
- Live-Pegel-Meter pro Spur
- Stereo-Master-Output mit Limiter

### A3. Sync-Click + Tempo-Map
- Globaler Tempo + Taktart fürs Projekt
- Optional metronom-synchrones Recording (jede Spur startet automatisch auf dem 1er)

---

## TEIL B — KI-Features (alle kostenlos via Lovable AI)

### B1. Live Vocal Coach (Pitch + Score) ⭐ Gamechanger
- Während des Singens: **scrollende Pitch-Linie** + Ziel-Tonleiter overlay
- Sofort sichtbar wo du daneben singst
- Nach dem Take: **Score 0–100** (Pitch-Accuracy, Timing-Konsistenz, Energie)
- Funktioniert per Web Audio (kein KI-Call nötig), zusätzlich Gemini-Feedback ("Refrain war 🔥, Strophe 2 leicht flach")

### B2. Live KI-Untertitel (Speech-to-Text)
- Nimmt während des Singens mit, **transkribiert live** via `openai/gpt-4o-mini-transcribe`
- Zeigt Lyrics karaoke-mäßig auf dem Bildschirm — auch ohne offizielle Lyric-Datei
- Speichert Transkript zur Aufnahme

### B3. KI-Lyric-Writer (Text Generation)
- "Schreibe einen Song über [Thema] im Stil von [Künstler]" → Gemini liefert komplette Lyrics
- Auto-Scrolling Teleprompter-View für die Performance
- Optional: Reim-Schema, Strophenzahl, Sprache wählen

### B4. KI-Song-Identifier (Multimodal Audio→Text) ⭐
- Sing oder summe 5–10 s — **Gemini 3 Flash kann Audio direkt verarbeiten** und rät den Song
- "Klingt nach 'Bohemian Rhapsody' von Queen" — perfekt fürs Party-Quiz

### B5. KI-Cover-Art für jede Aufnahme
- Jede gespeicherte Aufnahme bekommt automatisch ein generiertes **Cover-Bild** (Gemini Flash Image)
- Basiert auf Song-Titel + Vibe — die "Tonight's moments"-Gallery wird zum Vinyl-Cover-Wand

### B6. KI-Roast & Toast Generator (TTS)
- Nach jedem Take: Gemini schreibt einen 2-Sätze-Roast oder Toast über den Sänger
- TTS spricht ihn mit gewählter Stimme — instant Party-Moment

### B7. KI-Duett-Partner
- Du singst Strophe 1, KI-Stimme (TTS) singt Strophe 2 → Duett-Aufnahme
- Lyrics liefert B3, Gesang B6-Voice
- Begrenzung: TTS spricht, "singt" aber nicht melodisch — gut für Rap/Spoken-Word-Sektionen

### B8. Karaoke-Battle-Modus + Leaderboard
- Mehrere Sänger nacheinander, gleicher Song, B1-Scores zählen
- Live-Leaderboard pro Party
- Sieger-Stinger nach jeder Runde

### B9. Auto-Mashup
- Wähle 2 Tracks → BPM/Key-Detection → automatisches Time-Stretch + Crossfade → ein Mashup
- Nutzt vorhandenes `soundtouchjs` + neue Beat-Erkennung

---

## Prioritäten / Reihenfolge

1. **A1 + A2 Multitrack-Studio** — die zentrale Vision deiner Anfrage
2. **B1 Live Vocal Coach** — visuelles Wow für jeden Sänger
3. **B5 KI-Cover-Art** — sofortiger Hingucker in der Gallery
4. **B2 Live-Untertitel** — gameplay-relevant
5. **B6 Roast/Toast** — schnell gebaut, hohe Party-Wirkung
6. **B4 Song-Identifier** — Quiz-Feature
7. **B3 Lyric-Writer** + **B7 Duett**
8. **B8 Battle-Modus** + **B9 Mashup**

---

## Technik (kurz)

### Neue Dateien
- `src/lib/audio/multitrack.ts` — Track-Klassen, Mixer, OfflineAudioContext-Bouncer
- `src/lib/audio/loopStation.ts` — Loop-Sync-Engine
- `src/lib/audio/beatDetect.ts` — BPM + Key Detection (autocorrelation + chromagram)
- `src/lib/audio/scoring.ts` — Pitch-Accuracy + Timing-Score
- `src/lib/ai/coach.functions.ts` — Score → Feedback via Gemini
- `src/lib/ai/lyrics.functions.ts` — Lyric Generator
- `src/lib/ai/songId.functions.ts` — Multimodal Audio → Song-Guess (Gemini 3 Flash)
- `src/lib/ai/cover.functions.ts` — Cover-Art via Gemini Flash Image
- `src/lib/ai/roast.functions.ts` — Roast/Toast generator
- `src/routes/api/ai/transcribe-stream.ts` — Live STT-Stream-Endpoint
- `src/routes/_authenticated/studio.tsx` — neuer Multitrack-Studio Screen
- `src/components/studio/Timeline.tsx`, `TrackLane.tsx`, `Mixer.tsx`, `PitchCoach.tsx`, `Teleprompter.tsx`, `LoopPad.tsx`
- Neue DB-Tabelle `karaoke_sessions` (Projekt mit JSON für Tracks-Metadata) + `karaoke_session_tracks`

### Geänderte Dateien
- `src/routes/_authenticated/karaoke.tsx` — Link zum neuen Studio, Cover-Bilder in Gallery, Score-Badges
- `src/components/layout/AppShell.tsx` — Studio-Navigation
- `src/integrations/supabase/types.ts` — neue Tabellen

---

## Zeitlicher Aufwand

Das ist **viel** — realistisch in Etappen liefern. Mein Vorschlag:

**Etappe 1 (jetzt):** A1, A2, B1, B5 — Multitrack-Studio + Live-Coach + Cover-Art
**Etappe 2:** B2, B6, B4 — Untertitel, Roast, Song-Identifier
**Etappe 3:** B3, B7, B8, B9 — Lyric-Writer, Duett, Battle, Mashup

**Soll ich mit Etappe 1 starten, oder willst du eine andere Auswahl?**
