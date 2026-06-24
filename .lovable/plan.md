## Ziel
Echtes DJ-Beatmatching beim Übergang: vor dem Mix wird das eingehende Deck auf BPM und Tonart des laufenden Decks gezogen, während des Crossfades laufen beide synchron, danach gleitet das nun führende Deck sanft zurück auf sein Original-Tempo und seine Original-Tonart.

## Aktueller Stand (kurz)
- `transitionDecision.ts` erzwingt seit der Stabil-Refaktorierung `syncRate = 1` und es passiert kein Pitch-/Tempo-Glide mehr.
- `runStableDeckBlend` in `twinDeckBus.ts` fadet nur Gain/EQ linear, ohne `playbackRate` zu bewegen.
- Dadurch klingen zwei Tracks mit z. B. 100 BPM (A) und 94 BPM (B) im Mix wie zwei verschiedene Songs übereinander statt wie ein DJ-Übergang.

## Plan in 4 Phasen

### Phase 1 — Sync-Ziele berechnen
- In `transitionDecision.ts` ein gemeinsames Sync-Target ermitteln:
  - `targetBpm = fromDeck.bpm` (Master = aktuell spielendes Deck).
  - `toRate = clamp(targetBpm / toDeck.bpm, 0.94, 1.06)` (max ±6 % wie heute angezeigt).
  - `keyShiftSemitones = camelotShortestPath(fromKey, toKey)` (−6…+6, bevorzugt ±0/±1/±2; bei zu großem Abstand kein Pitch-Shift, nur EQ-Mix).
- Ergebnis als `SyncPlan { toRate, keySemis, glideInSec, holdSec, glideOutSec }` an die Bus-Ebene reichen.

### Phase 2 — Pre-Sync (vor dem hörbaren Mix)
- 2–4 s bevor Deck B hörbar einsetzt: `toDeck.source.playbackRate` per `linearRampToValueAtTime` auf `toRate` ziehen (kein abruptes Setzen → kein Stottern).
- Tonart: vorhandenen `pitchShift`-Node (sofern verfügbar) auf `keySemis` rampen; wenn nicht verfügbar oder `|keySemis| > 2`, Key-Shift überspringen und nur via EQ-Swap mischen (heutiges Verhalten).
- Phasenstart-Korrektur bleibt der existierende Beat-Quantize (kein neuer Phase-Lock-Loop).

### Phase 3 — Hold während des Crossfades
- Während `runStableDeckBlend` läuft: Rate und Key des eingehenden Decks fix auf den Sync-Werten halten.
- Keine weiteren Rate-Änderungen in dieser Phase → schützt vor Rucklern.

### Phase 4 — Post-Sync (Rückkehr aufs Original)
- Sobald der Crossfade beendet ist und Deck A ausgeblendet wurde, startet ein langsamer Glide auf dem jetzt führenden Deck B:
  - `playbackRate` rampt über `glideOutSec` (Default 8 s, konfigurierbar 4–16 s) zurück auf `1.0`.
  - `pitchShift` (falls genutzt) rampt parallel auf `0` Halbtöne.
- Glide ist linear in Cents/Sek., damit er musikalisch unauffällig bleibt (~3–6 Cent/s).
- Wenn Deck A noch nicht ganz stummgeschaltet ist, startet der Glide erst nach `gain < −60 dB`, damit kein hörbares Mitziehen entsteht.

## Sichtbarkeit im UI (minimal)
- Im Übergangs-Footer (bereits vorhanden, „kein Stretch / stabil / 8 bars"):
  - Anzeige umschalten auf `Sync B→A 100↔94 · Glide 8s` während Pre-Sync,
  - `Hold` während Crossfade,
  - `Drift→Original` während Post-Glide.
- Keine neuen Buttons; alles automatisch.

## Sicherheits-Leitplanken gegen erneutes Stottern
- Nur **ein** Rate-Ramp gleichzeitig pro Deck (`cancelScheduledValues` vor jedem neuen Ramp).
- Keine `setValueAtTime`-Sprünge auf `playbackRate`, ausschließlich `linearRampToValueAtTime`.
- Rate-Clamp ±6 %; bei größerem Bedarf wird der Sync verworfen und ein reiner EQ-/Echo-Swap gefahren (heutiger Fallback).
- Key-Shift nur aktiv, wenn ein vorhandener Pitch-Node existiert; sonst überspringen — kein neuer SoundTouch/Worklet, der erneut CPU-Spikes auslösen könnte.
- Kein Eingriff in `Turntable.tsx` oder die Stem-Kette — Deck-A-Performance-Fix bleibt unverändert.

## Betroffene Dateien (Vorschau)
- `src/lib/audio/transitionDecision.ts` — `SyncPlan` berechnen, `syncRate`-Hardcode entfernen.
- `src/lib/audio/twinDeckBus.ts` — Pre-Sync-Ramp vor `runStableDeckBlend`, Post-Glide-Ramp nach Crossfade-Ende.
- `src/lib/audio/proTransition.ts` — kleine Helfer (`rampRate`, `rampSemis`, `camelotShortestPath`).
- `src/components/cockpit/NextMoveCard.tsx` (oder vorhandener Übergangs-Footer) — Status-Label „Sync / Hold / Drift→Original".

## Offene Frage
Soll der Rück-Glide standardmäßig **immer** laufen (klassischer DJ-Stil, Track endet auf Originaltempo) oder nur, wenn die Differenz ≤ 3 % beträgt (sonst auf Sync-Tempo bleiben, damit die nächste Mischung leichter wird)?
