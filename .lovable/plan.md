## Problem-Analyse

**1. Pads lassen sich nicht ausblenden / Fenster überlagert alles**
`LoopPadOverlay` und `VocalOverlay` werden **doppelt** gerendert: einmal in `TransportBar.tsx` (eigener State `padsOpen`/`vocalOpen`) und einmal in `ModuleDock.tsx` (State `open: Set<ModuleId>`). Wer das Pad über den Dock öffnet, kann es mit dem X im Pad-Header nicht schließen — denn der X-Button steuert nur den lokalen State der jeweiligen Instanz. Beide Overlays liegen außerdem als `fixed` mit eigenem z-index über dem Inhalt und können nicht verschoben oder minimiert werden.

**2. Auto-DJ macht keine echten Übergänge**
- Im `engine.ts` läuft die Auto-DJ-Logik **nur** im manuellen `skip()`-Pfad. Endet ein Track normal (`ended`-Event), wird zwar `skip()` aufgerufen, aber es gibt nur **eine** `<audio>`-Instanz → die Songs überlappen **nicht** wirklich; "Crossfade" verblendet ins Nichts und startet danach den nächsten Track.
- `planMix()` liefert `startAtSecOfNext`, `triggerAtSecOfCurrent` und `bpmRatio` — alle drei Werte werden vom Engine **ignoriert**.
- Transitions-Auswahl ist deterministisch und arm: nur 3 Pfade (crossfade / filterSweep / echoTail). Keine "random"-Option, kein Loop-Roll, kein Double-Drop, kein Stinger-Mix.
- Songs müssen analysiert sein (BPM, Camelot, Cues) — das ist im Upload-Pfad bereits vorhanden, aber Tracks ohne Analyse fallen lautlos auf langweiligen Linear-Fade zurück, ohne Hinweis.

---

## Plan

### Teil A · Modul-Overlays entdoppeln & dockbar machen

1. **`TransportBar.tsx`**: Lokalen `padsOpen`/`vocalOpen` State entfernen. Buttons "Vocal" und "Pads" rufen stattdessen einen neuen globalen Zustand `useDock` (siehe 3) auf — `toggle("loop-pads")` / `toggle("vocal")`. JSX-Render der beiden Overlays am Ende der Datei entfernen.
2. **`ModuleDock.tsx`**: Bleibt einzige Render-Quelle. `LoopPadOverlay` und `VocalOverlay` werden ebenfalls in einen `FloatingPanel` gewrappt (statt eigener fixed-Position), damit sie verschoben, minimiert **und** verlässlich geschlossen werden können. `LoopPadOverlay` / `VocalOverlay` bekommen dazu eine schlanke "headless"-Variante (innerer Inhalt ohne eigenen Card-Rahmen / X-Button).
3. **Neuer Mini-Store `src/lib/dock.ts`** (zustand): `open: Set<ModuleId>`, `toggle(id)`, `close(id)`, `openIds()`. `ModuleDock` und `TransportBar` greifen beide darauf zu → eine einzige Quelle der Wahrheit, kein Doppel-Render mehr.
4. **z-index-Ordnung sauber**: FloatingPanel z-40, TransportBar z-20, FAB z-50. Damit liegt der Pad-Header garantiert über der TransportBar und der X-Button funktioniert immer.

### Teil B · Echtes virtuoses Auto-DJ mit Dual-Deck-Engine

5. **`engine.ts`** um zweites Deck erweitern:
   - `audioElB`, `sourceB`, `gainA`, `gainB`, `filterB`, `delayB` — gespiegelte Graph-Kette.
   - Neuer interner Scheduler: läuft per `requestAnimationFrame`, prüft `positionSec` gegen `plan.triggerAtSecOfCurrent`. Wenn `autoDj === true` und `queue[0]` vorhanden → startet die geplante Transition vorzeitig **vor** Songende, sodass beide Decks gleichzeitig laufen.
   - Plan wird beim Laden des nächsten Tracks vorab gebaut (nicht erst im `skip`) → wird in State als `pendingPlan` gehalten und in der Coach-HUD angezeigt.
   - Nach dem Übergang: Decks tauschen Rollen (Deck B wird zum neuen Deck A), Plan für den dann nächsten Track wird gebaut.

6. **`mixPlanner.ts`** um virtuose Modi erweitern:
   - Neue Modi (zusätzlich zu den bestehenden): `loopRoll` (letzten 4 Beats des Outros loopen, dabei Filter-High-Pass + neuer Track startet auf Drop), `doubleDrop` (Outro-Drop ↔ Intro-Drop frame-genau übereinanderlegen), `bassSwap` (Lo-Cut auf A, Lo-Boost auf B, dann wechseln), `reverbWash` (langer Reverb-Tail + Filter), bestehende `echoTail`, `filterSweep`, `crossfade`, `stinger`.
   - Auswahl-Strategie:
     - **BPM nahe (≤3 %) + Key kompatibel + beide Cues bekannt → `doubleDrop` oder `bassSwap` (random gewichtet)**
     - **BPM nahe + Key inkompatibel → `loopRoll` oder `echoTail`**
     - **BPM-Sprung >12 % → `filterSweep` oder `reverbWash`**
     - **Energie-Sprung >30 → `loopRoll` mit Build-up**
     - **Modus `"random"`** schaltbar: planMix mischt aus den passenden Kandidaten zufällig → "Profi-DJ-Feeling".
   - `planMix` gibt zusätzlich `startAtSecOfNext`, `triggerAtSecOfCurrent`, `bpmRatio` zurück (bereits da) — Engine **nutzt sie jetzt**: `audioElB.currentTime = startAtSecOfNext` und `audioElB.playbackRate = bpmRatio` (clamped 0.92–1.08, damit es musikalisch bleibt).

7. **Transition-Mode-Wahl im UI**:
   - `TransitionMode` Typ um die neuen Modi erweitern. `TRANSITION_LABELS` Mapping anpassen.
   - `setTransitionMode("auto" | "random" | <fest>)` — `auto` (default) lässt planMix entscheiden, `random` würfelt aus allen passenden, alle anderen Werte erzwingen den jeweiligen Modus.
   - TransportBar: kleines Dropdown neben dem Auto-DJ-Switch („Auto · Random · Crossfade · Double-Drop · Loop-Roll · …").

8. **Analyse-Hinweis**: Wenn ein Track in der Queue keine BPM/Cues hat, läuft Auto-DJ auf "safe crossfade" zurück und der `CoachHud` zeigt einen gelben Hinweis „Track ‚X' nicht analysiert — Übergang reduziert. Jetzt analysieren?" mit Button → triggert die bestehende Re-Analyse aus `library.tsx`.

### Teil C · Verifikation
- Mit zwei kurzen Test-Uploads (z. B. 30 s) Auto-DJ einschalten → echte Überlappung im Waveform sichtbar, beide Tracks gleichzeitig hörbar.
- Pad-Button in TransportBar öffnen, X im Pad-Header schließen → wirklich geschlossen, kein Geist-Overlay mehr.

## Technische Details

Geänderte / neue Dateien:
- `src/lib/dock.ts` (neu) — globaler Modul-Open-State.
- `src/lib/audio/engine.ts` — zweites Deck, Auto-DJ-Scheduler, `pendingPlan`, neue Transition-Modi-Execution.
- `src/lib/audio/mixPlanner.ts` — neue Modi (`loopRoll`, `doubleDrop`, `bassSwap`, `reverbWash`), Random-Selektor.
- `src/components/player/TransportBar.tsx` — entkoppelt, Transition-Dropdown.
- `src/components/player/LoopPadOverlay.tsx` / `VocalOverlay.tsx` — Inhalt vom Card-Rahmen trennen, von `FloatingPanel` wrappen lassen.
- `src/components/dashboard/ModuleDock.tsx` — alle Module via `useDock`, alle in `FloatingPanel`.
- `src/components/cockpit/CoachHud.tsx` — zeigt `pendingPlan.notes` und Analyse-Warnungen.

Risiken: zweite `MediaElementAudioSourceNode` für `audioElB` muss separat verbunden werden (eine Source pro Element); Playback-Rate-Drift bei langen Songs minimieren wir durch das Clamping 0.92–1.08.
