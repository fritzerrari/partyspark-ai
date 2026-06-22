Das Projekt ist nicht verloren, aber die aktuelle Audio-Architektur ist in einem kaputten Zwischenzustand: es gibt tatsächlich zwei konkurrierende Systeme. Oben im Deck läuft noch ein alter Transition-Pfad, darunter der Moises-/Stem-Mixer. Zusätzlich erzeugen Pseudo-Stems und Filter-/EQ-Routings zu viel Klangverfärbung. Ich würde deshalb nicht weiter einzelne Rezepte „verbessern“, sondern die Transition-Schicht konsolidieren.

## Zielbild

Ein einziges DJ-System:

```text
Track laden
→ Audio analysieren: BPM, Beatgrid, Key, Energy, Cues, Vocal-Map
→ falls echte Stems vorhanden: Real Stem Performance
→ falls keine echten Stems: Clean DJ Mode auf dem unveränderten Originalsignal
→ Smart Mix entscheidet Rezept, Länge, Risiko und Timing
```

Wichtig: Kein Modus darf den laufenden Song dauerhaft durch pseudo-getrennte Filterbänder schicken. Der Originaltrack muss neutral, laut und erkennbar bleiben.

## Plan

1. **Zwei Systeme zu einem machen**
   - Die alten A→B/B→A-Buttons im oberen Mixer nicht mehr den alten `transition()`-Pfad ausführen lassen.
   - Alle manuellen Mix-, Smart-Mix- und Auto-DJ-Auslöser auf eine einzige Smart-Mix-Orchestrierung routen.
   - Den alten Transition-Stil-Selector entfernen oder klar als Legacy deaktivieren, damit es nicht mehr „Deck-Fade oben / Moises unten“ gibt.

2. **Audioqualität zuerst: neutraler Hauptpfad**
   - Standard-Wiedergabe strikt sauber halten: `source → deck gain → analyser → master`.
   - Pseudo-Stem-Filter nicht mehr im Hauptsignal oder als additive Overlay-Slider verwenden.
   - Pseudo Mode bleibt ehrlich: keine falschen Stem-Slider, keine „Real“-Benennung, keine Klangzerstörung.
   - EQ/Filter nur temporär während Clean-DJ-Transitions aktivieren und danach garantiert resetten.

3. **Real-Stems wirklich separat behandeln**
   - „Real“ nur erlauben, wenn alle vier getrennten Audiobuffer pro Deck aktiv sind: vocals, drums, bass, other.
   - Stem-Meter direkt an den echten Stem-Buffern messen, nicht an Pseudo-Bändern.
   - Beim Umschalten auf Real-Stems den Original-MediaElement-Pfad sauber muten und beim Zurückschalten sauber wieder öffnen.
   - Gain-Staging/Lautheit begrenzen, damit vier Stems zusammen nicht clippen oder dünn/zerstört klingen.

4. **Analysepflicht vor dem Mix**
   - Vor jedem Smart Mix prüfen: BPM, Beatgrid, Key/Camelot, Cues, Energy und Vocal-Map vorhanden?
   - Falls Analyse fehlt: erst analysieren, dann Mix freigeben.
   - UI zeigt klar: „Analyse läuft“, „Mix bereit“, „BPM/Key riskant“, „Stems fehlen“.

5. **Neue Transition-Entscheidung statt blindem Fade**
   - Smart Mix wählt nicht nur ein Rezept, sondern eine Strategie:
     - guter BPM/Key-Match: langer 16–32-Bar Blend
     - Vocal-Konflikt: keine gleichzeitigen Vocals, erst Drums/Instrumental rein
     - großer BPM/Key-Unterschied: kurzer Drop Cut, Drum Bridge oder Echo Cut
     - Energie-Sprung: Build-up und Drop-Switch
   - Clean DJ Mode nutzt nur Originalsignal + temporären EQ/Bass-Swap/Filter/kurze Teases, keine Fake-Stem-Isolation.
   - Real Stem Mode nutzt echte Stem-Fades: einzelne Drums, Vocal-Hooks, Bass-Swap, Melody-Bed, Vocal-Mute.

6. **Timing und Downbeats stabilisieren**
   - Transition-Events an Beatgrid/AudioContext-Zeit ausrichten statt über verstreute `setTimeout`-Phasen.
   - Incoming-Track an Cue/Intro/Drop sinnvoll positionieren, nicht zufällig mitten im Song.
   - Tempo-Anpassung begrenzen, damit Songs nicht unkenntlich werden; bei zu großer Differenz lieber Cut/Bridge statt hartes Time-Stretching.

7. **UI neu ordnen**
   - Aus dem separaten StemMixer wird ein integrierter „Smart Mix“-Bereich im Hauptmixer.
   - Nur ein großer Button: **Moises-style Smart Mix**.
   - Pro Deck klarer Status: **Original / Analysiert / Pseudo Mode / Real Stems ready**.
   - Manuelle Stem-Slider nur aktivieren, wenn echte Stems vorhanden sind; sonst anzeigen, dass Clean DJ Mode aktiv ist.
   - Live-Phase anzeigen: Cue → Tease → Layer → Strip → Switch → Reveal.

8. **Sicherheitsnetz gegen schlechte Mixes**
   - Warnung und schlechter Score bei zu großem BPM-/Key-Mismatch.
   - Keine langen Blends bei inkompatiblen Songs.
   - Automatisches Zurücksetzen aller EQs, Filter, Gains und Stem-Gains nach jeder Transition, auch bei Fehlern.

## Erwartetes Ergebnis

- Songs klingen im normalen Playback wieder wie das Original.
- Ohne echte Stems gibt es ehrliche, saubere DJ-Transitions statt zerstörter Fake-Stems.
- Mit echten Stems gibt es echte Moises-artige Stem-Performances.
- Es gibt nur noch ein Mix-System, eine Logik und einen klaren Smart-Mix-Workflow.