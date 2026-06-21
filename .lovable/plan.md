
# Karaoke Upgrade — Vocal Chain, Intro & Transitions

Alles läuft im Browser über Web Audio API — kostenlos, kein externer Service.

## 1) Vocal Chain für Karaoke

Zwei Ebenen, weil **live** und **offline** technisch unterschiedlich sind:

### A) Live während der Aufnahme (Web Audio Realtime-Kette)
Mic → Compressor → EQ (3-Band) → Reverb → Delay → Monitor-Out (Kopfhörer)

- **Vocal-FX live** (alles über native Web Audio Nodes):
  - Compressor (Threshold, Ratio)
  - 3-Band EQ (Lo/Mid/Hi)
  - Reverb (ConvolverNode + 4 Presets: Room / Hall / Plate / Cathedral)
  - Delay/Echo (Time, Feedback, Mix)
  - Doubler (kurzer Delay 20–40ms für Fülle)
- **Live-Pitch-Monitor** (wie schon in `/autotune`): zeigt während des Singens Note + Cents-Abweichung — kein Realtime-Pitch-Shift (das bräuchte einen handgeschriebenen AudioWorklet-PSOLA, Wochen-Aufwand)
- **Bypass-Toggle** pro Effekt

### B) Nach der Aufnahme — KI-Vocal-Producer
Auf die fertige Aufnahme angewandt, ein Klick im Recordings-Panel:

- **Autotune** (bereits gebaut, hier auf Karaoke-Aufnahme anwendbar machen)
- **AI Harmonies**: per `soundtouchjs` Pitch-Shifts der Stimme erzeugen
  - Terz oben (+4 HT) · Quinte oben (+7 HT) · Oktave (+12 / –12)
  - User wählt Intervalle, jede Harmonie kommt als zusätzliche Spur (gemischt 30–40 %)
- **AI Choir**: 6–10 leicht detunte Kopien (±10 cents) + Mikro-Delays (5–30 ms) + leichtes Stereo-Spread → klingt wie Chor
- **Vocal FX-Presets** als One-Click:
  - "Stadion" (Big Reverb + Slap Delay)
  - "Whisper" (Compressor + High-Pass + close Reverb)
  - "T-Pain" (Hard Autotune + Doubler)
  - "Telephone" (Bandpass 300–3000 Hz)
  - "Megafon" (Distortion + Bandpass)

Output: gemischte WAV-Datei, wird zurück in Storage gespeichert als neue Recording-Variante.

## 2) Intro-Feature (vor jedem Karaoke-Take)

Wählbar im Karaoke-Screen vor dem Aufnahme-Start:

- **Countdown** 3-2-1 (visuell + Beep)
- **Beat-Count** 4-Bar Click bei einstellbarer BPM
- **AI-Voice-Intro**: "Als Nächstes — [Name] singt [Titel]!" via Lovable AI TTS (nutzt bestehende Party-Host-Infra) — kostenlos via `openai/gpt-4o-mini-tts`
- **Custom Audio**: eigene Intro-Datei (1–10 s Clip)
- **Stille / Kein Intro** (Default)

Eingabefelder: Singer-Name + Song-Titel, werden in die TTS-Ansage eingesetzt. Auswahl pro Take, Standard merken in `settings`.

## 3) Track-Transitions (Übergänge zwischen Songs)

Aktuell macht die Engine nur Linear-Crossfade. Erweitert auf 6 Modi, wählbar im Player:

| Modus | Was passiert |
|---|---|
| **Crossfade** | Equal-power, Länge 0–12 s |
| **Cut** | Harter Schnitt |
| **Fade-Gap** | A faded out → Pause (0–3 s) → B faded in |
| **Filter-Sweep** | Tiefpass-Filter schließt auf A während B startet |
| **Echo-Tail** | A bekommt Delay-Feedback-Tail beim Verschwinden |
| **Stinger** | Kurzer FX-Sound (DJ-Drop, Scratch) zwischen A und B |

UI: Modus-Dropdown im Player, Crossfade-Slider bleibt für die Modi, die Länge nutzen. Bei "Stinger" Auswahl aus FX-Library.

## Technische Details

### Neue Dateien
- `src/lib/audio/vocalChain.ts` — Live Web Audio Kette (Compressor, EQ, Reverb, Delay)
- `src/lib/audio/vocalPost.ts` — Offline Harmonies/Choir/Presets
- `src/lib/audio/intro.ts` — Countdown/Click/TTS-Intro Generierung
- `src/lib/audio/transitions.ts` — 6 Transition-Modi (Filter, Echo-Tail, Stinger)
- `src/components/karaoke/VocalChainPanel.tsx`
- `src/components/karaoke/IntroPicker.tsx`
- `src/components/karaoke/PostProcessSheet.tsx`

### Geänderte Dateien
- `src/routes/_authenticated/karaoke.tsx` — Vocal-Chain Panel, Intro-Picker, Post-Process-Button pro Recording
- `src/lib/audio/engine.ts` — `transitionMode` Feld + Implementierungen
- Player-UI: Transition-Mode-Selector

### Reverb-Impulse
4 kurze Impulse-Responses (WAV, je < 80 KB) generieren wir synthetisch im Browser (exponentieller Decay-Noise) — keine Asset-Downloads nötig.

### Speicherung
Post-processed Vocal-Versionen als zusätzliche Spalte `processed_path` in `recordings`, plus `vocal_preset` als JSON.

### TTS für Intro
Reuse von `/api/ai/party-host-speak` — kein neuer Endpoint, nur ein neues Frontend-Aufruf-Pattern.

## Aufwand & Reihenfolge

1. **Live Vocal-Chain + FX** (Reverb/Delay/EQ/Compressor) — Sofort spürbarer Effekt
2. **Intro-Feature** (Countdown + TTS) — Klein, hoher Wow-Faktor
3. **Harmonies + Choir + Presets** (offline) — Mehr DSP-Arbeit
4. **6 Transitions** im Engine — Berührt zentrale Engine-Logik, am Ende

Soll ich alles in dieser Reihenfolge bauen, oder nur Teile?
