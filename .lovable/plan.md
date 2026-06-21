
# Plan: Pro Studio & Live Setup

Ausbau der App zu einem vollwertigen DJ/Studio-Tool mit externer Hardware-Unterstützung, Cloud-Track-Quellen, erweitertem Mixer, Aufnahme-Vorhören und visuellen Outputs.

Umsetzung in 4 Phasen — jede Phase ist eigenständig lauffähig.

---

## Phase 1 — Externe Audio-Geräte (Hardware I/O)

**Ziel:** User kann externes Mikro, Lautsprecher, Cue-Kopfhörer auswählen und nutzen.

- Neuer `AudioDeviceManager` (`src/lib/audio/devices.ts`)
  - `navigator.mediaDevices.enumerateDevices()` → Input/Output Listen
  - Persistiert Auswahl in `settings` Tabelle (neue Spalten: `input_device_id`, `master_output_id`, `cue_output_id`, `mic_device_id`)
  - Permission-Flow (getUserMedia) mit klarem UI-Hinweis
- **Cue/Pre-Listen-Bus:** AudioContext mit `setSinkId()` für zweiten Output (Kopfhörer)
  - Pro Mixer-Kanal `Cue`-Button → Signal nur an Cue-Bus
- **Mikrofon-Kanal:** eigener Channel mit Gain, Mute, optional Ducking (auto-leiser bei Sprache)
- UI: neue Route `/settings/audio` mit Geräte-Dropdowns + Live Level-Meter zum Testen

## Phase 2 — Externe Track-Quellen

**Ziel:** Tracks aus lokalen Ordnern und Cloud laden, nicht nur Upload.

- **Lokale Festplatte/USB:** File System Access API
  - "Ordner verbinden" Button → `showDirectoryPicker()` → Handle in IndexedDB persistieren
  - Browser-Komponente in `/library` zeigt Ordner-Tree, Tracks streamen direkt von Disk (kein Upload)
- **Cloud-Quellen** via Lovable Connectors (alle vier OAuth-basiert):
  - Google Drive, Dropbox, OneDrive — je ein Connector linken
  - Eigene URL/WebDAV: einfaches URL-Input mit CORS-Hinweis
  - Server-Functions (`src/lib/sources/*.functions.ts`) listen Dateien und liefern Stream-URLs
- Neue Tabelle `track_sources` (source_type, credentials_ref, last_synced_at)
- Einheitlicher `TrackResolver` der je nach Quelle (upload/local/gdrive/dropbox/onedrive/url) eine playable URL liefert
- Tracks-Tabelle bekommt Spalte `source_type` + `external_ref`

## Phase 3 — Erweiterter 4-Kanal Mixer + Aufnahme-Preview

**Ziel:** Studio-Feeling mit 4 Decks, 3-Band EQ pro Kanal, Send-FX, plus Aufnahme die man vor dem Speichern anhört.

- **Mixer-Engine** (`src/lib/audio/mixer.ts`)
  - 4 Channel Strips: Gain, 3-Band EQ (Low/Mid/High BiquadFilter), Filter (HP/LP), Cue, Pan, Fader
  - 2 Send-FX Busse: Reverb (ConvolverNode), Delay (DelayNode + Feedback)
  - Crossfader (Channel-Assignment A/B)
  - Master Out + separater Cue Out
- **UI:** `/mix` Studio-View — 4 vertikale Channel-Strips, Send-Knobs, Master-Section
  - Mobile: horizontaler Swipe zwischen Kanälen, kompakte Strip-Ansicht
- **Aufnahme + Vorhören:**
  - `MediaRecorder` am Master-Bus → WebM/Opus Blob
  - Nach Stop: Waveform-Preview (`wavesurfer.js` oder Canvas), Play/Pause, Trim Start/Ende
  - Buttons: "Verwerfen" / "Neu aufnehmen" / "Speichern" (erst dann Upload zu `recordings` Bucket)
  - Während Aufnahme: roter REC-Indikator + Live-Timer + Live-VU

## Phase 4 — Visuelle Outputs

**Ziel:** Pro Kanal VU+Spectrum, Master-Waveform, Fullscreen-Visuals für Beamer, BPM-Lichtsteuerung.

- **Pro Kanal:** `AnalyserNode` → kleines VU-Meter + Mini-Spectrum (Canvas, 60fps via rAF)
- **Master:** großer Stereo-Waveform-Visualizer im Mix-View
- **Fullscreen Visuals** Route `/visuals`
  - Mehrere Modi: Spectrum-Bars, Particle-Field, Kaleidoskop, Waveform-Tunnel
  - Reagiert auf Master-Audio via AnalyserNode (FFT)
  - "Pop-out" Button → `window.open()` für zweiten Monitor/Beamer
  - BroadcastChannel sync zwischen Haupt-Tab und Visual-Tab
- **Beat/BPM-Lichtsteuerung** (browser-only, kein DMX)
  - BPM-Detection vorhanden? → falls nicht: einfache Tap-Tempo + optional Auto-Detect via `web-audio-beat-detector`
  - Visuelle "Lampen" (4–8 farbige Kacheln) blitzen auf Beat
  - Farb-Presets, Sync-Strength Slider

---

## Technische Details

**Neue Dependencies:** `wavesurfer.js` (Waveform), `web-audio-beat-detector` (BPM)

**Datenbank-Migration:**
- `settings`: + `input_device_id`, `master_output_id`, `cue_output_id`, `mic_device_id`, `mic_gain`, `mic_ducking`
- `tracks`: + `source_type` (enum: upload/local/gdrive/dropbox/onedrive/url), `external_ref`
- neue Tabelle `track_sources` (id, user_id, source_type, label, config jsonb, created_at)
- RLS: alles user-scoped via `auth.uid()`, plus GRANTs

**Connectors zu linken:** Google Drive, Dropbox, OneDrive (über `standard_connectors--connect` zum jeweiligen Zeitpunkt)

**Browser-Kompatibilität:**
- File System Access API: Chrome/Edge ✓, Safari/Firefox ✗ → Fallback auf File-Input (Multi-Select)
- `setSinkId()`: Chrome/Edge ✓, Safari/Firefox eingeschränkt → Fallback: Cue-Bus auf Master mit Warnung
- Klarer "Browser-Support"-Hinweis pro Feature

**Mobile-Optimierung:**
- Audio-Geräte-Seite & Mix-View responsive
- Touch-optimierte Fader/Knobs (vertikales Drag)
- Visualizer auf Mobile reduziert (Performance)

**Ordnerstruktur:**
```
src/lib/audio/
  devices.ts          (Phase 1)
  mixer.ts            (Phase 3)
  recorder.ts         (Phase 3)
  visualizer.ts       (Phase 4)
  beatDetect.ts       (Phase 4)
src/lib/sources/
  resolver.ts
  gdrive.functions.ts
  dropbox.functions.ts
  onedrive.functions.ts
src/routes/_authenticated/
  settings.audio.tsx  (Phase 1)
  library.tsx         (Phase 2 — Source Browser)
  mix.tsx             (Phase 3 — Studio Mixer)
  visuals.tsx         (Phase 4 — Fullscreen)
```

**Reihenfolge der Umsetzung:** Phase 1 → 2 → 3 → 4 (wie vom User priorisiert).

Bei "Plan implementieren" starte ich mit **Phase 1 (Externe Audio-Geräte)** und frage nach Abschluss, ob Phase 2 direkt folgen soll.
