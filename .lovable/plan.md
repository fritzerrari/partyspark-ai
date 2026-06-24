# Plan: Mixxx-Grade Transition Engine

Auf Basis der Tiefenanalyse aus **Mixxx**, **kckDeepak/AI-DJ-Mixing-System**, **teticio/Deej-AI** und **pnlong/artificial_dj** sind 4 zentrale Lücken identifiziert, die unsere Übergänge derzeit unprofessionell wirken lassen. Plus parallel das ai-remixmate Backlog (Camelot-Scoring abgestuft, Transition-Preview, LUFS, Setlist-CSV) aus dem vorherigen Plan.

## Kernproblem heute
- Beat-Snap ist einmalig → 32-Takt Blends driften 50–200 ms
- Doppelte Vocals werden nicht verhindert
- Blend-Fenster nutzt nicht das echte First/Last-Sound (Stille am Track-Anfang/Ende killt Timing)
- Phase-Cancellation (Kick gegen Kick) wird nicht korrigiert
- Crossfader-Kurve linear → −3 dB-Loch in der Mitte

## Sprint 1 — Correctness (Phase bleibt 32 Takte locked)

**1.1 P-Controller Phase-Lock im AudioWorklet**
Quelle: Mixxx `bpmcontrol.cpp:574` `calcSyncAdjustment()`.
Datei: `src/lib/audio/phaseLockProcessor.ts` (neuer AudioWorklet) + `twinDeckBus.ts` Integration.
Pro Audio-Callback: `beatDistance = (now − prevBeat)/(nextBeat − prevBeat)`, Leader-Distance vergleichen, Rate-Korrektur `rate *= 1 + clamp(-err*0.7, -0.05, 0.05)`. Kill-Switch ab 20 % Drift („train wreck").

**1.2 Equal-Power Crossfader-Kurve**
Quelle: Standard, fehlt in beiden Referenzen.
Datei: `src/lib/audio/engine.ts` Crossfade-Scheduler.
`outGain = cos(t·π/2)`, `inGain = sin(t·π/2)` via `setValueCurveAtTime()` mit 128er Float32Array.

**1.3 First/Last-Sound Trim auf −60 dBFS**
Quelle: Mixxx `autodjprocessor.cpp:1187` `N60dBSound` Cue.
Datei: `src/lib/audio/analyze.ts` neue Felder `trimInSec` / `trimOutSec`.
Bei Analyse: RMS-Scan @ 50 ms Hop, erste/letzte Frame > −60 dBFS speichern. Blend-Fenster nutzt diese statt 0 / duration.

**1.4 2×/0.5× BPM Auto-Korrektur**
Quelle: Mixxx `keycontrol` Ratio-Chain + kckDeepak `mixing_engine.py:645`.
Datei: `src/lib/audio/analyze.ts` `correctBpm()`.
Testet Ratios `[1, 2, 0.5, 1.5, 0.75]` gegen Metadaten-BPM, picks Min-Delta.

## Sprint 2 — Pro Feel (Blend klingt intentional)

**2.1 Vocal-Overlap-Gate**
Quelle: kckDeepak `generate_mixing_plan.py:193`.
Datei: `src/lib/audio/mixQuality.ts` neuer Faktor `vocalClash` (−20 pts).
Blockiert Blends mit Doppel-Vocals oder verschiebt Mixpunkt automatisch in instrumental window des Vocal Maps.

**2.2 Sub-Beat XCorr Phase-Alignment**
Quelle: kckDeepak `mixing_engine.py:208` `align_waveform_phase`.
Datei: `src/lib/audio/phaseAlign.ts` (neu).
`correlate(outgoing[0..3s], incoming[0..3s])`, Peak-Lag ≤50 ms, Shift via `AudioBufferSourceNode` offset. Wenn `corrcoef < -0.3` → Polarität invertieren.

**2.3 Downbeat-Alignment + Micro-Warp**
Quelle: kckDeepak `mixing_engine.py:750` `align_beats_perfect`.
Datei: `src/lib/audio/beatLock.ts` (neu).
Nach Time-Stretch: Beat-Paare iterieren, Drift >10 ms → playbackRate Micro-Ramp ±5 % pro Beat.

**2.4 10-Punkt Progressive EQ-Sweep**
Quelle: kckDeepak `mixing_engine.py:132` `apply_progressive_eq`.
Datei: `src/lib/audio/transitionRecipes.ts` (filterSweep upgraden).
Statt continuous: 10 äquidistante BiquadFilter-Stützstellen via `frequency.linearRampToValueAtTime()`. Outgoing LP 12k→4k, Incoming HP 100→300 Hz.

## Sprint 3 — Intelligence (System wählt bessere Recipes)

**3.1 6-Faktor Transition-Scorer**
Quelle: kckDeepak `generate_mixing_plan.py:165` + ai-remixmate Camelot-Cost.
Datei: `src/lib/audio/transitionScore.ts` erweitern: `genrePref ±15 / vocalRisk ±20 / energyCompat ±15 / keyCompat ±10 / bpmΔ ±5 / typeBonus +3..+10`.

**3.2 Directional Camelot-Energy**
Quelle: kckDeepak `generate_mixing_plan.py:59` + ai-remixmate.
Datei: `src/lib/audio/keyToCamelot.ts` Tabelle erweitern mit `energyDelta: +1|0|-1` pro Pair → fließt in Recipe-Wahl (Energy-Build bevorzugt +1).

**3.3 Genre × Overlap-Duration Scaling**
Quelle: kckDeepak `GENRE_MIXING_RULES`.
Datei: `src/lib/intel/genreBridge.ts`.
`overlapMultiplier`: EDM 2.0, HipHop 0.5, R&B 0.75, House 1.5.

**3.4 Energy-Curve Buildup/Drop Tagging**
Quelle: kckDeepak `structure_detector.py:118`.
Datei: `src/lib/audio/analyze.ts`.
RMS 2 s + Savitzky-Golay + 1. Ableitung → `events: {type:'buildup'|'drop', time, intensity}[]`. Transition-Planner snappt auf nächstes Event.

## Sprint 4 — Creative Differentiation

**4.1 32-Chunk Gradual Tempo-Ramp** (CDJ-Pitch-Bend Feel) — `playbackRate` AudioParam Ramp über letzte 16 s.
**4.2 Phrase-Snap (32 Beat)** — bridgeBeat erweitern: nächste Multiplikation von 32 Beats ab Downbeat.
**4.3 Mel-Spectrogram Embedding für Next-Track** (Deej-AI distilled, offline → Cosine im Browser).

## Bestehender Backlog (ai-remixmate, weiter gültig)
- Transition-Preview Button (16 Takte Render) im Set-Planner
- LUFS-Toggle im Export (-14 / -9)
- Setlist-CSV Import (Spotify/Exportify)
- Beat-Drift-Badge im Copilot Log (zeigt P-Controller-Performance live)

## Reihenfolge
**Phase A** (sofort, harte Pflicht): Sprint 1 komplett — ohne 1.1+1.3 bleibt jeder Mix amateurhaft.
**Phase B**: Sprint 2 — 2.1 (Vocal-Gate) und 2.2 (XCorr) sind die größten hörbaren Sprünge.
**Phase C**: Sprint 3 + Backlog (Preview, Beat-Drift-Badge sichtbar machen).
**Phase D**: Sprint 4 (Creative).

## Out of scope
- Mixxx KeyLock-Modi (Pitch/Tempo-Entkopplung) — würde unsere SoundTouch-Pipeline neu aufstellen
- Whisper-basierte Vocal-Erkennung (zu schwer fürs Frontend, wir nutzen unseren vocalMap)
- Demucs / yt-dlp (rechtlich + Performance)

## Erfolgskriterien
- Beat-Drift <40 ms über 32 Takte (live messbar im Copilot Log)
- Keine Doppel-Vocals in Auto-Mixes
- −3 dB Loudness-Loch im Crossfade verschwindet
- Phase-Cancellation Rating in MixScoreDial > 80
