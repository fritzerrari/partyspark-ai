## Status der 6 „Coming Soon"-Karten

| Karte | Status | Was wir kostenlos liefern können |
|---|---|---|
| **AI Mashups** | ✅ bereits live (`/battle`) | Karte auf "Open" umstellen, auf `/battle` linken |
| **AI Vocal Producer** | ✅ bereits live (`PostProcessSheet` in `/karaoke`) | Karte auf "Open" umstellen, FX-Sheet öffnen |
| **AI Choir** | ✅ Engine vorhanden (`vocalPost.ts`) | Eigene Route `/choir` mit Preset-Auswahl (3/5/8/16/50 Stimmen), Detune-Spread, Reverb-Halle |
| **AI Sound Designer** | 🆕 neu, machbar | Gemini gibt JSON-FX-Parameter zurück (Oscillator-Typ, Hüllkurve, Filter, FM-Mod) → Web Audio synthetisiert in Echtzeit + Download als WAV |
| **AI Crowd Reactions** | 🆕 neu, machbar | Procedurale Crowd-Engine (Noise + viele Stimmen-TTS gemischt) + Preset-Buttons "Jubel/Lacher/Applaus/Pfiffe/Buh"; Gemini wählt passendes Preset zur Szene |
| **AI Remix** | 🆕 neu, machbar | 90-Sek Dance-Edit: BPM-Detect (vorhanden) → Time-Stretch auf Ziel-BPM → Intro/Drop/Outro-Struktur via Filter-Sweeps & Loop-Wiederholungen aus bestehendem `engine.ts` |

Alles funktioniert kostenlos: Lovable AI Gateway (Gemini Text + TTS, schon im Projekt) + Web Audio API. Keine zusätzlichen API-Keys nötig.

## Umsetzung

### 1. AI Lab Karten aktualisieren (`ai-lab.tsx`)
- "Mashups", "Vocal Producer", "Choir" → grüner "Open" Badge + Link
- Neue Karten "Sound Designer", "Crowd Reactions", "Remix" → eigene Routen

### 2. AI Choir — `/choir`
- Auswahl Recording aus `recordings`
- Slider: Stimmenzahl (1–50), Detune-Spread (Cents), Stereo-Spread, Hall-Größe
- Nutzt `pitchShiftBuffer` × N mit zufälligem Detune/Timing-Offset → Offline-Mixdown → Upload als neue Aufnahme

### 3. AI Sound Designer — `/sound-designer`
- Textprompt: "Laser-Schuss", "UFO-Landung", "Tropfen im Eimer", "Cyber-Drone 4s"
- Server-Function: Gemini → strikt JSON `{ oscType, freqStart, freqEnd, duration, attack, decay, sustain, release, filterType, filterFreq, filterQ, lfoRate, lfoDepth, distortion, reverb }`
- Client synthetisiert via `OfflineAudioContext` → WAV-Download + Speichern als Recording

### 4. AI Crowd Reactions — `/crowd`
- 5 Presets: Jubel, Lacher, Applaus, Buhrufe, "Ohhhh"
- Procedural Engine: 6–40 TTS-Clips ("Yeaaah", "Bravo", "Hahaha"…) mit unterschiedlichen Voices + leichtem Pitch-Offset + Stereo-Spread + Crowd-Noise-Layer (gefiltertes Pink Noise)
- "AI Pick": Gemini bekommt Szenenbeschreibung → wählt Preset + Intensität
- Direkt abspielen oder in FX-Library speichern

### 5. AI Remix — `/remix`
- Wähle ein Recording (oder Track aus `tracks`)
- Slider: Ziel-BPM (default 128), Länge (60/90/120s), Style (House/Techno/Disco)
- Pipeline: `estimateBPM` → time-stretch → Aufbau: Intro (8 bars, Lowpass-Sweep) → Body (16 bars, full) → Break (4 bars, Highpass + Echo-Tail) → Drop (16 bars) → Outro (8 bars, Fade)
- Nutzt vorhandene `mashup.ts`-Bausteine + `engine.ts` Filter-Logik
- Mixdown als WAV + Save

### 6. Neue Server-Funktionen
- `src/lib/ai/soundDesigner.functions.ts` — Gemini JSON → FX-Parameter
- `src/lib/ai/crowdPick.functions.ts` — Szene → Preset-Empfehlung
- Wiederverwendung: `duet.functions.ts` (TTS für Crowd), bestehende `lyrics`/`coach`

### 7. Audio-Module
- `src/lib/audio/synth.ts` — Parameter → AudioBuffer (Oscillator + ADSR + Filter + LFO + Distortion + Reverb)
- `src/lib/audio/choir.ts` — N-stimmiger Chor via Pitch-Shift + Detune
- `src/lib/audio/crowd.ts` — TTS-Layering + Noise-Bett
- `src/lib/audio/remix.ts` — BPM-sync Dance-Edit-Builder

### 8. Nav (`AppShell.tsx`)
- `/choir`, `/sound-designer`, `/crowd`, `/remix` in SECONDARY-Nav aufnehmen (oder als Untergruppe „AI Lab")

## Reihenfolge

1. AI Lab Karten umstellen + 3 ✅-Karten verlinken (5 min)
2. AI Choir Route (existing engine, schnellster Win)
3. AI Crowd Reactions (TTS-Layering)
4. AI Sound Designer (synth engine)
5. AI Remix (komplexester Build)

Soll ich alle 4 neuen Routen + Card-Updates in einem Rutsch bauen, oder Schritt für Schritt mit Zwischenfreigabe?