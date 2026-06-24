// Live beat-drift monitor — polls both decks at 8 Hz and publishes the
// signed drift in ms (B − A) for the BeatDriftBadge HUD.
// Pure measurement, no rate correction. The corrective P-controller in
// phaseLock.ts is invoked separately during scheduled transitions.
import { useTwinDeck } from "./twinDeckBus";
import { beatDriftMs } from "./proTransition";
import { publishLiveDrift } from "./phaseLock";

let timer: number | null = null;

export function startDriftMonitor() {
  if (typeof window === "undefined" || timer != null) return;
  timer = window.setInterval(() => {
    const s = useTwinDeck.getState();
    if (!s.A.isPlaying || !s.B.isPlaying) {
      publishLiveDrift(0);
      return;
    }
    const gridA = s.A.track?.beatGrid ?? null;
    const gridB = s.B.track?.beatGrid ?? null;
    if (!gridA?.length || !gridB?.length) {
      publishLiveDrift(0);
      return;
    }
    const drift = beatDriftMs(
      gridA,
      s.A.position,
      s.A.pitch || 1,
      gridB,
      s.B.position,
      s.B.pitch || 1,
    );
    publishLiveDrift(drift);
  }, 125);
}

export function stopDriftMonitor() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}