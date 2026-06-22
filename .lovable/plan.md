## Ziel

Die Transition darf nicht mehr wie ein Crossfade wirken. Sie soll wie eine DJ-Performance klingen: lange, bar-genaue Phrasen, frühe Teaser des nächsten Songs, einzelne Stems als Vorankündigung, Bass-/Drum-Swaps auf Downbeats, Vocal-Konflikt-Vermeidung und klare Spannungsbögen.

## Was ich ändern werde

1. **Crossfade aus dem Kern entfernen**
   - `Smart Mix` und die Stem-Recipes steuern nicht mehr primär Deck-Lautstärken oder den sichtbaren Crossfader.
   - Der Crossfader bleibt nur UI-/Safety-Fallback am Ende.
   - Der hörbare Mix läuft über einzelne Stem-Busse: vocals, drums, bass, other.

2. **Neue „Pro DJ“-Transition-Architektur**
   - Jede Transition bekommt mehrere echte Phasen statt einem linearen Fade:
     - **Preview / Tease**: nur ein einzelnes Element aus dem neuen Track kommt kurz rein, z. B. Vocal-Chop, Hi-Hat/Drums oder Melody.
     - **Groove Layer**: Incoming Drums oder Percussion laufen unter dem alten Track.
     - **Tension / Stripdown**: alter Track wird auf wenige Parts reduziert, z. B. nur Drums oder nur Vocal.
     - **Downbeat Switch**: Bass/Drums wechseln hart und musikalisch auf dem Downbeat.
     - **Reveal**: neuer Track öffnet sich vollständig.
   - Übergänge werden länger: typischerweise 12–16 Bars statt 8 Bars.

3. **Recipes komplett verschärfen**
   Die vorhandenen sechs Recipes bleiben namentlich, werden aber musikalisch neu choreografiert:
   - **Vocal-Out / Drums-In**: Incoming Drums teasen früh, outgoing Vocals werden gezielt beantwortet/geduckt, dann rhythmischer Swap.
   - **Bass Swap**: Incoming Melody/Drums kommen ohne Bass rein, Bass wechselt hart auf Downbeat, danach erst Full Reveal.
   - **Drum Bridge**: beide Tracks werden temporär auf Rhythmus reduziert, Incoming Drums übernehmen schrittweise, ideal für schlechte BPM/Key-Matches.
   - **Acapella Intro**: Outgoing Vocal steht fast allein, Incoming Instrumental baut darunter Spannung auf, dann Vocal-Trade.
   - **Instrumental Bed**: Outgoing Instrumental wird als Bett genutzt, Incoming Vocal/Lead nur kurz angedeutet, dann vollständige Öffnung.
   - **Drop Switch**: kurzer Build mit einzelnen Incoming-Parts, dann simultaner Bass+Drums-Switch auf dem Drop.

4. **„Andeutung, dass neues Lied kommt“ erzwingen**
   - Jede Recipe muss innerhalb der ersten 1–2 Bars hörbar einen einzelnen Part des neuen Tracks einblenden.
   - Nicht immer derselbe Part: je nach Track-Kontext wählt die Engine Drums, Vocal, Bass oder Melody als Teaser.
   - Teaser werden kurz wieder rausgenommen, damit es nach DJ-Ride statt permanentem Fade klingt.

5. **Phrase- und Downbeat-Logik verbessern**
   - Start auf nächstem Downbeat, bei vorhandener Beatgrid-Analyse eher auf 4-/8-Bar-Phrasen.
   - Switch-Punkte liegen auf Bar-Grenzen, nicht irgendwo im Fade.
   - Wenn Beatgrid fehlt, fallback auf BPM-basierte Bar-Schätzung.

6. **Konflikte aktiv vermeiden**
   - Vocals beider Tracks dürfen nicht lange gleichzeitig offen sein.
   - Bass beider Tracks darf nur sehr kurz gleichzeitig offen sein.
   - Mindestens ein Drum-Bus bleibt in der Mitte der Transition hörbar, damit der Groove nicht zusammenbricht.

7. **Smart Mix wird mutiger**
   - Die automatische Wahl entscheidet nicht nur „welches Recipe“, sondern auch:
     - Transition-Länge: 8 / 12 / 16 Bars
     - Teaser-Stem: vocals / drums / bass / other
     - Aggressivität: smooth / performance / emergency
   - Bei schlechtem BPM/Key-Match wird Drum Bridge oder Drop Switch bevorzugt, nicht ein softer Fade.

8. **UI ehrlicher machen**
   - Der Button wird als Performance-Mix klarer erkennbar.
   - Quality Panel zeigt zusätzlich:
     - gewählte Länge in Bars
     - Teaser-Stem
     - Warnung, wenn nur Pseudo-Stems aktiv sind
   - „Real“ bleibt nur erlaubt, wenn beide Decks echte getrennte AudioBuffer nutzen.

## Technische Umsetzung

- `src/lib/audio/transitionRecipes.ts`
  - Recipes von linearen Gain-Ramps zu phasenbasierten Stem-Choreografien umbauen.
  - Helper für `teaseStem`, `killConflicts`, `holdGroove`, `barWait`, `setDeckStemScene` ergänzen.

- `src/lib/audio/twinDeckBus.ts`
  - `runStemRecipe` um 12–16-Bar-Optionen, Phrase-Waiting und Smart-Mix-Parameter erweitern.
  - Crossfader während der Transition nicht mehr als hörbaren Hauptmechanismus verwenden.
  - Erst am Ende Deck-State und UI-Crossfader finalisieren.

- `src/lib/audio/transitionQuality.ts`
  - Empfehlung um `bars`, `teaserStem`, `aggression` und `riskReason` erweitern.
  - Stärkere Penalty für Pseudo-Modus und große BPM/Key-Risiken.

- `src/components/cockpit/StemMixer.tsx`
  - Quality Panel um die neue Performance-Entscheidung erweitern.
  - Pseudo-Hinweis deutlicher machen, aber keine falsche „Real“-Sprache verwenden.

## Akzeptanzkriterien

- Smart Mix klingt nicht mehr wie ein linearer Fade.
- Innerhalb der ersten Bars ist hörbar ein einzelner Part des nächsten Tracks als Teaser da.
- Längere Übergänge über 12–16 Bars sind möglich und Standard für gute Matches.
- Bass/Drums wechseln musikalisch auf Downbeats.
- Vocals kollidieren nicht dauerhaft.
- Pseudo-Modus wird klar als begrenzter Fallback gezeigt.
- Real-Modus wird nur angezeigt, wenn echte getrennte Stem-Buffers beider Decks aktiv sind.