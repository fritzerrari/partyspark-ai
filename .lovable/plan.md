# Plan: Neue Erkenntnisse aus ai-remixmate + High-Contrast Redesign

## Teil A — Was wir aus ai-remixmate übernehmen

ai-remixmate ist ein Python/FastAPI DJ-Engine mit Fokus auf **renderbare, beat-locked Transitions**. Relevante Konzepte, die unser System ergänzen (nicht ersetzen):

1. **Camelot-Modulation-Scoring als eigene Funktion**
   `from_key → to_key` liefert `modulation_type` (perfect/energy_boost/mood_shift/clash), `cost` (0-1) und `safe_to_blend` Flag. Bei uns aktuell nur "kompatibel ja/nein" — wir bauen ein abgestuftes Scoring.

2. **Transition-Preview vs. Full-Render**
   ai-remixmate trennt `/dj-remix/preview` (nur Crossfade-Fenster, schnell) von `/dj-remix` (vollständig). Übertragen: Im Set-Planner ein **"Preview Transition"**-Button, der nur 16 Takte um den Mixpunkt rendert/abspielt.

3. **Bridge-Beat mit Genre + Intensität**
   Bridge-Beat haben wir bereits, aber ohne Tuning. Wir ergänzen Slider **Intensität (0-1)** und **Genre-Auto-Detect** für das Live-Deck.

4. **LUFS-Mastering auf Export**
   ITU-R BS.1770 LUFS-Normalisierung beim Set-Export (Ziel -14 LUFS Streaming, -9 Club). Neuer Toggle im Export-Modul.

5. **Setlist-Arc Import (CSV)**
   Spotify/Exportify-CSV Upload → Auto-Arc (`warmup → peak → cooldown`) als Erweiterung des Set-Planners.

6. **Beat-Alignment-Toleranz als Test-Metrik**
   Wir loggen pro Übergang die Beat-Drift in ms (Ziel <40 ms) und zeigen sie als Qualitäts-Badge im Copilot-Log.

Nicht übernommen: Demucs (zu schwer für Edge/Browser — wir nutzen weiter unsere Stem-Pipeline), yt-dlp (rechtlich heikel), Streamlit (anderer Stack).

## Teil B — Komplettes Redesign Cockpit (High Contrast)

Aktuelles Problem (Screenshot): Karten verschwimmen mit Hintergrund, Labels sind kontrastarm, Buttons wirken wie Platzhalter, keine klare Hierarchie zwischen Primär/Sekundär-Aktionen.

### Designprinzipien
- **AAA-Kontrast** für Text auf Cards (mind. 7:1)
- **Cards mit echter Tiefe**: dunkler Surface + heller Inner-Border statt Verlauf-Wash
- **Eine Akzentfarbe pro Aktionsebene**: Orange = primär/Engine, Magenta = Live/AI, Slate = neutral
- **Klare Zonen-Trennung** durch Section-Header mit Trennlinie + Icon-Badge

### Konkrete Änderungen pro Modul
- **Mix Lab Card**: weißer/heller Surface-Layer (`oklch(0.18 0.04 280)`), 1px Inner-Glow Border, Buttons mit gefüllter Primary-Variante für "Auto-Mix" + "Virtuoso-Mix starten", restliche Aktionen als Outline-Tiles mit Hover-State.
- **Energy Timeline / Playlist / Copilot Log**: einheitliche Card-Höhe im rechten Rail, Section-Headers fett (Space Grotesk 600) statt dünn, Status-Pills mit gefülltem Hintergrund (nicht nur Border).
- **KPI-Strip**: Werte in 28px statt 14px, Label klein darunter, farbiger Akzent-Dot pro KPI.
- **Director-Block**: eigener "Premium"-Card-Style (Magenta-Border, leichter Innen-Glow), Slider mit großem Thumb + Live-Wert-Bubble.
- **Buttons**: 3 klare Varianten — `primary` (gefüllt orange), `live` (gefüllt magenta), `ghost` (transparent + Border).
- **Module-Rail unten**: aktive Pille mit Akzent-Fill + Subline, inaktive in Slate.

### Neue/erweiterte Komponenten
- `CamelotScore.tsx` — visualisiert Modulation-Type + Cost als Wheel-Indikator
- `TransitionPreview.tsx` — 16-Takt Audio-Preview Button + Waveform
- `LufsToggle.tsx` — im Export-Panel
- `BridgeBeatTuner.tsx` — Intensität + Genre Slider
- `BeatDriftBadge.tsx` — Qualitäts-Indikator im Copilot Log
- `SetlistCsvImport.tsx` — im Set-Planner

### Tech
- `src/styles.css`: `.cockpit-pro` Token-Set überarbeiten (höhere Lightness-Spreads, echte Surface-Layer L1/L2/L3, fokussierte Glow-Shadows nur auf Primär-Aktionen).
- Neue Util-Klassen: `sb-surface-1/2/3`, `sb-btn-primary/live/ghost`, `sb-section-header`.
- Server-Functions: `previewTransition.functions.ts`, `camelotScore.ts`, `lufsNormalize.server.ts`.
- DB-Migration: `set_exports.lufs_target`, `transitions.beat_drift_ms`, `transitions.camelot_cost`.

### Out of scope
Demucs-Integration, yt-dlp-Downloads, kompletter Library-Browser-Umbau.

## Reihenfolge
1. CSS-Token + Utility-Klassen (Basis für alles)
2. Cockpit-Layout + Komponenten-Restyle (sichtbarer Kontrast-Fix)
3. Camelot-Score + Transition-Preview (größter funktionaler Mehrwert)
4. Bridge-Beat-Tuner + Beat-Drift-Badge
5. LUFS-Export + Setlist-CSV-Import
