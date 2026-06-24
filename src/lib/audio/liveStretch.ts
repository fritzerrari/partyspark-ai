// Live pitch-preserving time-stretch via SoundTouch AudioWorklet.
//
// Goal: when a deck's playbackRate is changed for BPM matching, the audible
// pitch must stay at the original musical key — no "chipmunk" or "robot"
// vocals. We do this by routing the deck's source through a SoundTouchNode
// and setting its `playbackRate` AudioParam to the same value the
// HTMLMediaElement is using. The SoundTouchNode then time-stretches the
// audio so that pitch is restored to the original.
//
// Falls back gracefully: if the worklet module cannot be loaded (older
// browser, blocked CDN, etc.) we return a "null" stretch node and callers
// continue to drive `el.playbackRate` only. The chipmunk effect is then
// the only fallback — but most evergreen browsers support AudioWorklet.

const registered = new WeakMap<BaseAudioContext, Promise<unknown>>();

async function registerOnce(ctx: BaseAudioContext): Promise<typeof import("@soundtouchjs/audio-worklet").SoundTouchNode> {
  const { SoundTouchNode } = await import("@soundtouchjs/audio-worklet");
  const { default: processorUrl } = await import("@soundtouchjs/audio-worklet/processor?url");
  let p = registered.get(ctx);
  if (!p) {
    p = SoundTouchNode.register(ctx, processorUrl).catch((err) => {
      console.warn("[liveStretch] worklet register failed", err);
      throw err;
    });
    registered.set(ctx, p);
  }
  await p;
  return SoundTouchNode;
}

export type LiveStretchNode = {
  /** Web-Audio node to insert in the deck graph. Connect upstream → input → downstream. */
  node: AudioNode;
  /** Set live tempo ratio (1 = original). Caller must also set `el.playbackRate` to the same value. */
  setRate(rate: number): void;
  dispose(): void;
};

/** Build a SoundTouchNode wrapped in our small API. Resolves to null if worklet unavailable. */
export async function createLiveStretch(ctx: AudioContext): Promise<LiveStretchNode | null> {
  if (typeof AudioWorkletNode === "undefined") return null;
  try {
    const SoundTouchNode = await registerOnce(ctx);
    const st = new SoundTouchNode({ context: ctx });
    // Pitch stays at 1.0; we let `playbackRate` control time and the processor
    // automatically compensates pitch so vocals/melodies retain their original key.
    st.pitch.value = 1;
    st.pitchSemitones.value = 0;
    st.playbackRate.value = 1;
    return {
      node: st,
      setRate(rate: number) {
        const r = Math.max(0.5, Math.min(2, rate || 1));
        try { st.playbackRate.value = r; } catch { /* noop */ }
      },
      dispose() {
        try { st.disconnect(); } catch { /* noop */ }
      },
    };
  } catch {
    return null;
  }
}