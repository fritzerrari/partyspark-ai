## Befund

Die aktuelle Version klingt grundsätzlich kaputt, weil das normale Deck-Signal permanent durch die pseudo-Stem-Spektralaufteilung läuft. Diese Pseudo-Stems sind keine echte Trennung: Bass, Drums, Vocals und Melody werden nur per Filtern aus demselben Song herausgeschnitten und danach wieder summiert. Dadurch ist selbst „neutral“ kein sauberer Originaltrack mehr, sondern ein gefiltertes, dünnes, phasiges Rebuild-Signal. Wenn dann zwei solcher Signale ineinander gemischt werden, klingt es wie zwei schlecht generierte Songs plus Fade.

Zusätzlich animiert die Transition zwar Stem-Gains, aber die Quelle ist in Pseudo-Mode akustisch nicht belastbar. Die Engine versucht also „Moises-Workflow“ zu spielen, obwohl keine echten getrennten Signale vorhanden sind. Das muss getrennt werden: Originalaudio bleibt immer sauber; nur echte Stems dürfen als Stem-Mix-Core verwendet werden.

## Neuer Ansatz

### 1. Audioqualität reparieren

- Normales Playback wird wieder direkt aus dem Originaltrack gespeist.
- Pseudo-Stems werden nicht mehr dauerhaft als Hauptsignal benutzt.
- In Pseudo-Mode bleibt der Track klar erkennbar; Übergänge nutzen dann professionelle DJ-Techniken auf sauberem Originalaudio: EQ-Isolator, Filter, rhythmische Cuts, Loop-/Drop-Ins, kurze Teaser.
- „Real Stem Mode“ wird nur aktiviert, wenn echte getrennte Buffers für beide Decks geladen sind.

### 2. Zwei ehrliche Mix-Modi

```text
Real Stem Mode
Original track muted, echte buffers: vocals / drums / bass / other
→ vollständige stem-basierte Choreografie

Clean DJ Mode / Pseudo Mode
Original track bleibt Hauptsignal
→ keine fake-vocal/bass-isolation als Hauptmix
→ EQ, Filter, Rhythm-Gates, Cue-Teaser, Bass-Kill, Drum-Bridge nur soweit sauber möglich
```

Pseudo darf nicht mehr versuchen, wie echte Stems zu klingen. Pseudo soll musikalisch brauchbar sein, aber ehrlich limitiert.

### 3. Transition-Engine neu bauen

Ich ersetze die aktuelle Recipe-Ausführung durch einen Performance-Sequencer mit klarer Timeline:

- absolute AudioContext-Zeit statt viele `setTimeout`-Rampen
- Phasen über 16/24/32 Beats, nicht nur kurzer Fade
- erkennbare Ankündigung des nächsten Songs innerhalb der ersten Phrase
- Downbeat-Switches statt linearer Pegelüberblendung
- outgoing bleibt bis zum Switch musikalisch sauber
- incoming wird erst als Teaser, dann als Groove-/Hook-Layer eingeführt

Beispielstruktur:

```text
1. Cue / Tease
   kurzer Hook, Drum-Top oder Vocal-Shout vom neuen Track

2. Return to groove
   Teaser wieder raus, alter Track bleibt klar

3. Layer build
   incoming drums/highs/other langsam rein, Bass noch blockiert

4. Strip / tension
   outgoing reduziert: Bass oder Vocals raus, Rhythmus bleibt

5. Downbeat switch
   Bass/Drums wechseln hart oder halb-hart auf Bar-Grenze

6. Reveal
   neuer Track öffnet vollständig, alter Track geht sauber raus
```

### 4. Real-Stem-Choreografien verbessern

Für echte Stems werden die bestehenden Rezepte nicht nur „Gain-Fades“, sondern echte DJ-Moves:

- **Vocal Guard:** nie zwei dominante Vocals gleichzeitig
- **Bass Mutex:** nie zwei volle Basslines gleichzeitig außer extrem kurz vor Switch
- **Drum Anchor:** mindestens ein Drum-/Rhythmusbus bleibt stabil
- **Hook Teaser:** ein kurzer erkennbarer Hook/Part des neuen Tracks kommt früh rein und verschwindet wieder
- **Phrase Lock:** große Wechsel nur auf Bar-/Phrase-Grenzen
- **Energy Ramp:** Energie wird nicht zufällig dünn, sondern bewusst aufgebaut oder abgeräumt

### 5. Pseudo-/Clean-DJ-Rezepte statt kaputter fake-Stems

Wenn keine echten Stems verfügbar sind:

- kein vollständiges pseudo-vocal/pseudo-bass-Rebuild als Hauptsignal
- originaler Track bleibt trocken/sauber
- Incoming-Preview über kurze Originalaudio-Cues bei reduziertem EQ
- Bass-Swap über echte EQ-Low-Kills, nicht über fake-bass-Stem
- Drum-Bridge nur als sauberer Highpass-/Lowcut-/Loop-artiger Groove, nicht als zerstörte Drum-Isolation
- schlechte BPM/Key-Kombinationen nutzen Cut/Drop/echo/short tease statt langer Matsch-Blend

### 6. Mix-Auswahl strenger machen

Smart Mix wird konservativer und musikalischer:

- Gute BPM + gute Key-Kompatibilität → längere blends, hook tease, bass swap
- Gute BPM + schlechte Key-Kompatibilität → drum/high-only tease, kein melodischer Layer
- Schlechte BPM → kurze Performance-Transition, Drop Switch oder Echo/Cut, kein langer Blend
- Zwei Vocal-Tracks → incoming vocals bleiben bis nach Switch gemutet
- Keine echten Stems → Score sichtbar gedeckelt, aber Audio bleibt sauber

### 7. UI-Anpassung

- Status klarer: **Real Stems**, **Clean DJ Mode**, **Pseudo Preview only**
- Smart Mix zeigt, welche Engine wirklich läuft: `Real Stem Performance` oder `Clean DJ Transition`
- Warnung, wenn versucht wird, Real-Stem-Rezepte ohne echte Stems zu fahren
- Transition-Status zeigt aktuelle Phase: `Tease`, `Layer`, `Strip`, `Switch`, `Reveal`
- Manual stem sliders steuern echte Stems nur in Real Mode; in Pseudo/Clean Mode werden sie als EQ-/preview-limited Controls dargestellt, damit keine falsche Erwartung entsteht

## Dateien, die ich ändere

- `src/lib/audio/stemSplit.ts`
  - Pseudo-Split aus dem normalen Playback entfernen oder auf Preview/Analyse begrenzen.

- `src/lib/audio/twinDeckBus.ts`
  - Audio-Graph umbauen: clean original bus + real stem bus + DJ EQ bus.
  - Smart Mix entscheidet zwischen Real-Stem-Engine und Clean-DJ-Engine.
  - Crossfader nicht mehr als Kern der Transition verwenden.

- `src/lib/audio/transitionRecipes.ts`
  - Real-Stem-Rezepte als echte Performance-Timelines neu schreiben.

- Neue Datei `src/lib/audio/cleanDjTransitions.ts`
  - Saubere Übergänge ohne fake-Stem-Zerstörung: EQ-swap, hook tease, drum/top tease, bass kill, drop cut.

- Neue Datei `src/lib/audio/performanceScheduler.ts`
  - AudioParam-sichere Timeline für beat-/bar-genaue Events.

- `src/lib/audio/transitionQuality.ts`
  - Scoring und Recipe-Auswahl auf Real-vs-Clean Mode trennen.

- `src/components/cockpit/StemMixer.tsx`
  - UI ehrlich machen: Real-Stem Controls vs Clean-DJ Controls, Phase-Anzeige, klare Warnungen.

## Ziel der neuen Version

Das Ergebnis soll nicht mehr so klingen, als würden zwei zerstörte Songs ineinander verschwimmen. Ohne echte Stems bleibt die Musik erkennbar und sauber, mit DJ-artigen EQ-/Cue-Übergängen. Mit echten Stems entsteht dann die eigentliche Moises-artige Performance: einzelne Parts des nächsten Songs werden hörbar angekündigt, Konflikte werden vermieden, Bass/Drums wechseln bewusst auf Downbeats, und Übergänge wirken länger, musikalischer und virtuoser.