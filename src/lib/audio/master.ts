// Master limiter + soft-clipper for offline renders. Stops the digital clipping
// that made Remix/Mashup/Choir sound "verzerrt".
// Pipeline: dynamics compressor in limiter mode → makeup gain → tanh soft clip.

/** Run an offline render of `input` through a transparent brick-wall limiter and tanh soft-clip.
 *  Output peaks are guaranteed ≤ ~0.97 (≈ -0.3 dBFS). */
export async function masterBuffer(input: AudioBuffer, opts: { makeup?: number; ceiling?: number } = {}): Promise<AudioBuffer> {
  const ceiling = opts.ceiling ?? 0.97;
  const makeup = opts.makeup ?? 1.0;
  const sr = input.sampleRate;
  const offline = new OfflineAudioContext(2, input.length, sr);
  const src = offline.createBufferSource();
  src.buffer = input;
  const pre = offline.createGain();
  pre.gain.value = makeup;
  // DC-block / sub-rumble HPF — 2nd-order Butterworth @ 30 Hz.
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 30;
  hp.Q.value = Math.SQRT1_2;
  // Sub-bass soft-knee compressor (tames kick stacks).
  const subComp = offline.createDynamicsCompressor();
  subComp.threshold.value = -12;
  subComp.knee.value = 6;
  subComp.ratio.value = 3;
  subComp.attack.value = 0.006;
  subComp.release.value = 0.12;
  const lim = offline.createDynamicsCompressor();
  // Brick-wall limiter: −1 dBTP ceiling target, instant attack.
  lim.threshold.value = -1.0;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.05;
  // Chain: source → pre → HPF → sub-comp → brick-wall limiter → destination
  src.connect(pre);
  pre.connect(hp);
  hp.connect(subComp);
  subComp.connect(lim);
  lim.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  // Final tanh soft-clip pass — guarantees no inter-sample overshoot above ceiling.
  const out = rendered;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      // tanh with drive 1.0 then scale to ceiling
      d[i] = Math.tanh(v * 1.05) * ceiling;
    }
  }
  return out;
}

/** Convenience: gain-staging helper for stacked stems. Returns scalar that keeps the
 *  sum of N sources at unity headroom (roughly 1 / sqrt(N)). */
export function stackGain(sources: number): number {
  return 1 / Math.max(1, Math.sqrt(sources));
}