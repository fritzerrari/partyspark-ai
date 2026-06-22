## Goal

Replace the current crossfade-leaning transition engine with a **stem-first engine**. Every transition rides 4 independent buses (vocals, drums, bass, other) on each deck. Crossfader becomes a fallback safety net, not the mechanism.

## What changes

### 1. Stem-first audio graph (`twinDeckBus.ts`, `realStemPlayer.ts`, `stemSplit.ts`)
- Real-stem mode becomes the **canonical** path. When 4 buffers are attached:
  - MediaElement output to the deck gain is muted (already exists, harden it).
  - Pseudo `stems.input` is muted (already exists, harden it).
  - The 4 `BufferSourceNode`s feed `stems.gains[stem]` directly → recipes operate on real audio.
- Pseudo split stays as fallback only. Source of truth for the deck "mode" is exposed:
  - `stemsMode: "pseudo" | "loading" | "real"` (exists) — UI labels strictly tied to this.
  - A transition is labeled **Real** only when BOTH decks report `stemsMode === "real"`.

### 2. Six transition recipes (`transitionRecipes.ts`)
Rewrite the recipe table to the exact six requested, all beat-aligned via `waitForNextBeat`, and all stem-only (no master crossfade):

1. **vocalOutDrumsIn** — outgoing vocals duck → silence, incoming drums fade in on the bar, then everything else swaps.
2. **bassSwap** — bass swap on the downbeat (hard cut on bass bus), everything else crossfaded slowly.
3. **drumBridge** — outgoing collapses to drums-only for 2 bars, incoming drums layered, then incoming reveals melody + bass.
4. **acapellaIntro** — outgoing reduced to vocals only, incoming starts drums + bass under it, then incoming vocals replace outgoing.
5. **instrumentalBed** — outgoing vocals out, outgoing other/bass form a bed, incoming full mix fades in.
6. **dropSwitch** — both decks ride to the next downbeat, swap bass + drums simultaneously on the drop, melody/vocals crossfade behind.

Automatic conflict-mute helper: when both decks have vocals active during the swap window, the outgoing vocals are force-ducked to 0 within 100 ms.
Drums/rhythm stability: a min-floor (≥ 0.25) on at least one drums bus through the middle 50 % of the recipe.

### 3. Pre-transition beat & key alignment
Wrap every recipe with a single `prepareTransition(from, to)`:
- `syncTempo` (exists) → playback-rate match (half/double-time aware).
- `beatAlign` (exists) → align next downbeats.
- Compute BPM delta % and key compatibility (`camelotCompatible`).
- Returns a `TransitionQuality` object (see #5).

### 4. Smart Mix button + UI (`StemMixer.tsx`)
- Add a **Moises-style Smart Mix** primary button: picks the best recipe from BPM delta, key compat, vocal overlap, and stem mode; runs `prepareTransition` then the recipe.
- Replace the existing recipe `<select>` with the 6 new recipes (keep Auto).
- Header pill shows aggregated mode: **Real** (both decks real), **Hybrid** (one real), **Pseudo** (none).
- Per-deck card now shows:
  - **4 live VU meters** (vocals / drums / bass / other) driven by an AnalyserNode tapped off each stem `gains[stem]`.
  - **4 vertical sliders** (already there) — keep, but values shown next to live meter.
- **Quality scoring panel** below the button:
  - `score 0–100`, color-coded.
  - Sub-scores: BPM match, key compat, energy delta, vocal-conflict risk.
- **Warnings**:
  - If `|bpmDelta| > 8 %` or key not Camelot-compatible → red banner with the offending number + suggestion (e.g. "Pitch Deck B by −2 semitones" or "Use Drum Bridge to hide tempo gap").

### 5. New module `src/lib/audio/transitionQuality.ts`
Pure function: `scoreTransition({fromTrack, toTrack, fromRate, toRate, stemsMode}) → { score, bpmScore, keyScore, energyScore, vocalConflict, warnings[], recommendedRecipe }`. Used by both the score panel and the Smart Mix auto-pick.

### 6. New module `src/lib/audio/stemMeter.ts`
Tiny helper attaching a `AnalyserNode` to each `stems.gains[stem]` and returning a `getLevels(): Record<StemId, number>` (RMS 0..1). `StemMixer.tsx` polls at 30 fps.

### 7. Mute-conflict + rhythm-stable safety pass (`twinDeckBus.ts`)
Inside `runStemRecipe`:
- Before recipe runs: detect vocal overlap (both `vocals` > 0.2) → schedule auto-duck on outgoing.
- Throughout: enforce drums floor by clamping any `setGain("drums", v)` below 0.25 during phase 2–3 to 0.25 on at least one side.

### 8. Strictly correct "Real vs Pseudo" labeling
- Single source: `getTransitionMode(state) → "real" | "hybrid" | "pseudo"` computed from `A.stemsMode` + `B.stemsMode`.
- Used by the Smart Mix button label, the per-deck badges, and the post-transition toast.

## Files

**Edit**
- `src/lib/audio/twinDeckBus.ts` — harden real-stem routing mute, add `prepareTransition`, conflict-mute, rhythm-floor, expose `getTransitionMode`, expose stem-level meters.
- `src/lib/audio/transitionRecipes.ts` — replace 5 recipes with the 6 requested; tighten `pickRecipe`.
- `src/components/cockpit/StemMixer.tsx` — Smart Mix button, meters, quality panel, warning banner, mode pill.
- `src/lib/audio/realStemPlayer.ts` — ensure pseudo mute on attach + restore on detach (already partially there).

**New**
- `src/lib/audio/transitionQuality.ts` — pure scoring + recommendation.
- `src/lib/audio/stemMeter.ts` — per-stem RMS analyser helper.

**No DB / no server changes.** Stems pipeline (HF Space, `track_stems` table, `stems.functions.ts`, `useTrackStems`) stays as is.

## Acceptance

- Clicking **Smart Mix** with two analyzed tracks runs an audible, beat-locked stem transition (not a master crossfade).
- Per-deck 4 live meters move with the music.
- Badge says **Real** only when both decks have 4 attached AudioBuffers.
- BPM > 8 % off or incompatible key → visible red warning + recommended recipe.
- Quality score updates whenever a deck/pitch changes.
