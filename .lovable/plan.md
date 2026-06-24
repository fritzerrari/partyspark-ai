# Sprint 3 + 4 — Noch professionellere Übergänge & besserer Sound

Aufbauend auf den bereits gebauten Bausteinen (Equal-Power-Crossfade, Phase-Lock P-Loop, Silence-Trim, BPM-Fold, Vocal-Clash, Beat-Drift-HUD) gibt es noch klare Lücken gegenüber Mixxx / Rekordbox / kckDeepak / Deej-AI / pnlong. Diese Lücken sind hörbar — der Mix klingt sonst nach „Auto-Mix" statt nach echtem DJ.

## Was noch fehlt (Tiefen-Check gegen Referenzen)

**Klang / Loudness**
- Kein True-Peak-Limiter am Master → Clipping bei doppeltem Sub-Bass (Mixxx `enginemaster.cpp`)
- Keine LUFS-Normalisierung pro Deck → Track-zu-Track-Lautstärke springt 3–6 LU
- Linearer Bass-Kill statt LinkwitzRiley-24dB → Bass „bröckelt" statt sauber zu trennen (Mixxx `enginefilterlinkwitzriley.cpp`)
- Kein DC-Block / kein Soft-Knee-Compressor auf Sub → Pumpen bei Drops

**Timing / Phase**
- Phase-Lock korrigiert nur globale Rate, nicht Sub-Beat-Offset → Erster Beat liegt richtig, Beat 3 schon wieder daneben
- Kein XCorr-Polaritäts-Flip bei Phase-Cancellation (Kick vs Kick „löscht" Bass)
- Kein Downbeat-Alignment (Mix startet mitten in 4-Takt-Phrase)
- Loop-Roll / Beat-Repeat als Lücken-Füller fehlt (Standard-Trick bei BPM-Sprung >8%)

**Kurven / Automation**
- EQ-Sweep läuft in 1 Schritt statt 8/16/32-Punkt linearRamp (Mixxx 32-Takt-Mix)
- Filter-Sweep nutzt nicht musikalische Q-Kurve (resonance steigt nicht zum Drop)
- Kein „Echo-Out-Tail" beim Bass-Cut (Rekordbox Standard: 1/2-Beat-Delay-Throw)

**Intelligenz**
- 6-Faktor-Scorer noch nicht im Planner aktiv
- Phrasen-Erkennung (16/32-Beat) fehlt → Mix landet mitten in Hookline
- Keine Energie-Kurve mit Buildup/Drop-Tagging → System weiß nicht, wann „bombing" passt
- Kein Genre×Overlap-Mapping (EDM 64 Takte, HipHop 8 Takte)

## Plan

### Sprint 3a — Pro Sound Chain (hörbarer Sprung)
1. **True-Peak-Limiter am Master** (`src/lib/audio/master.ts`)
   - DynamicsCompressorNode + 1-Sample-Lookahead-Saturator, ceiling −1 dBTP, release 50 ms
2. **LUFS-Normalisierung pro Deck** (`src/lib/audio/analyze.ts` → `lufsIntegrated`)
   - K-weighted RMS während Analyse → `targetGain = 10^((-14 − lufs)/20)`, automatisch in twinDeckBus angewandt
3. **Linkwitz-Riley 24 dB Bass-Cut** (neu: `src/lib/audio/filters/lr24.ts`)
   - 2× BiquadFilter „lowpass" + „highpass" in Reihe → echte 24 dB/oct ohne Phasendreher
   - Ersetzt linearen Bass-Kill in `twinDeckBus.runStemRecipe` / `runCleanRecipe`
4. **Sub-Bass Soft-Knee-Compressor** (Master, vor Limiter)
   - Threshold −12 dB, ratio 3:1, knee 6 dB → kein Pumpen bei Drops

### Sprint 3b — Sub-Beat Phase Polish
5. **XCorr Polaritäts-Flip** (`proTransition.ts` schon vorhanden → in twinDeckBus aktivieren)
   - Wenn `peakCorr < −0.3` → eingehende Bass-Spur via GainNode × −1 oder 1-Sample-Delay
6. **Downbeat-Snap im AiMixBuilder** (`src/lib/audio/mixPlanner.ts`)
   - `mixInAt = nearestDownbeat(introEnd, downbeats)` statt nur Beat
7. **Phrase-Aware Mix-Length** (`transitionRecipes.ts`)
   - 16/32/64-Beat-Auswahl je Genre-Mapping (EDM 64, House 32, HipHop 8, Pop 16)
8. **Echo-Tail beim Bass-Cut** (Rekordbox-Style)
   - 1/2-Beat Delay-Send-Bus, feedback 0.35, mit −24 dB Cut sync gestartet

### Sprint 4 — Intelligenz / Scoring
9. **6-Faktor Transition-Scorer aktivieren** (`transitionDecision.ts` + `mixability.ts`)
   - Genre/Vocal/Energy/Key/BPM/Type-Bonus → Score 0–100 zeigt im NextMoveCard
10. **Buildup/Drop-Tagging** (`analyze.ts` → `energyEvents: {t, kind: 'buildup'|'drop'}[]`)
    - RMS 2 s + Savitzky-Golay + 1. Ableitung → planner triggert Filter-Riser/White-Noise-Sweep an Drops
11. **Loop-Roll Lückenfüller** (`twinDeckBus`): bei drift >120 ms oder BPM-Sprung >8% automatisch 1/4-Beat-Loop auf Out-Deck statt Train-Wreck
12. **8-Punkt EQ-Sweep** statt 1-Punkt (`twinDeckBus` setStemEQ)
    - `frequency.linearRampToValueAtTime` über 8 Stützstellen je Band

### Technische Details
- **Reihenfolge**: Sprint 3a zuerst (sofort hörbar, blockiert nichts), 3b parallel, 4 danach
- **Keine Breaking Changes** an `runCleanRecipe`/`runStemRecipe` Signatur — nur interne Routing-Erweiterung
- **Performance**: Limiter/LUFS-Gain laufen offline (Analyse) → kein Audio-Thread-Cost zur Laufzeit
- **Testbar**: BeatDriftBadge + MixScoreDial zeigen Verbesserung sofort

### Out of Scope (bewusst nicht jetzt)
- Stem-Separation client-side (zu schwer, läuft bereits über Edge Function)
- Eigene Spleeter-Variante (kckDeepak nutzt Demucs, blockiert Browser-Thread)
- Mixxx HID-Controller-Mapping (kein User-Bedarf signalisiert)

### Erfolgs-Kriterium
- LUFS-Streuung zwischen Tracks <1.5 LU (vorher 3–6)
- Beat-drift über 32 Takte <25 ms (vorher 40–80)
- Keine Phase-Cancellation-Bass-Löcher hörbar
- MixScore-Durchschnitt >75 (vorher ~60)
- Übergänge fühlen sich wie CDJ-Long-Mix an, nicht wie 8-Sek-Crossfade

Sag „weiter" / „go" / „ok" und ich baue Sprint 3a (Limiter + LUFS + LR24-Filter) als ersten hörbaren Schritt.
