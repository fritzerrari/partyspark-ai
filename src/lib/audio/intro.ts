// Karaoke intros: countdown beep, 4-bar click, custom file, AI TTS announcement.
export type IntroKind = "none" | "countdown" | "click" | "tts" | "file";

export type IntroConfig = {
  kind: IntroKind;
  bpm?: number;          // for click
  singerName?: string;   // for tts
  songTitle?: string;    // for tts
  fileUrl?: string;      // for file
  voice?: string;        // for tts (alloy, sage, ...)
};

/** Generate a short beep buffer. */
function beep(ctx: BaseAudioContext, freq: number, durMs: number, vol = 0.4): AudioBufferSourceNode {
  const sr = ctx.sampleRate;
  const len = Math.floor((durMs / 1000) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.min(1, i / 100) * Math.min(1, (len - i) / 500);
    d[i] = Math.sin((2 * Math.PI * freq * i) / sr) * env * vol;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

export async function playCountdown(
  ctx: AudioContext,
  onTick?: (n: number) => void,
): Promise<void> {
  const start = ctx.currentTime + 0.1;
  for (let i = 0; i < 3; i++) {
    const src = beep(ctx, 880, 150);
    src.connect(ctx.destination);
    src.start(start + i);
  }
  // GO beep
  const go = beep(ctx, 1320, 300, 0.5);
  go.connect(ctx.destination);
  go.start(start + 3);
  // visual ticks
  if (onTick) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => onTick(3 - i), i * 1000);
    }
    setTimeout(() => onTick(0), 3000);
  }
  await new Promise((r) => setTimeout(r, 3500));
}

export async function playClick(ctx: AudioContext, bpm = 100, bars = 1): Promise<void> {
  const beatSec = 60 / bpm;
  const start = ctx.currentTime + 0.05;
  const beats = bars * 4;
  for (let i = 0; i < beats; i++) {
    const accent = i % 4 === 0;
    const src = beep(ctx, accent ? 1500 : 1000, accent ? 60 : 40, accent ? 0.5 : 0.3);
    src.connect(ctx.destination);
    src.start(start + i * beatSec);
  }
  await new Promise((r) => setTimeout(r, beats * beatSec * 1000 + 200));
}

/** Play TTS intro via existing /api/ai/party-host-speak SSE endpoint. */
export async function playTtsIntro(text: string, voice = "alloy"): Promise<void> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  let playhead = 0;
  let pending = new Uint8Array(0);

  const playChunk = (incoming: Uint8Array) => {
    const bytes = new Uint8Array(pending.length + incoming.length);
    bytes.set(pending);
    bytes.set(incoming, pending.length);
    const usable = bytes.length - (bytes.length % 2);
    pending = bytes.slice(usable);
    if (usable === 0) return;
    const samples = new Int16Array(bytes.buffer, 0, usable / 2);
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const buf = ctx.createBuffer(1, floats.length, 24000);
    buf.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (playhead === 0) playhead = ctx.currentTime + 0.05;
    else playhead = Math.max(playhead, ctx.currentTime);
    src.start(playhead);
    playhead += buf.duration;
  };

  const res = await fetch("/api/ai/party-host-speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok || !res.body) throw new Error(`TTS failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
        const bin = atob(payload.audio);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        playChunk(arr);
      } catch { /* noop */ }
    }
  }

  // Wait for playhead to finish
  const remain = Math.max(0, playhead - ctx.currentTime);
  await new Promise((r) => setTimeout(r, remain * 1000 + 200));
  await ctx.close();
}

export async function playFileIntro(url: string): Promise<void> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
}

export async function runIntro(cfg: IntroConfig): Promise<void> {
  if (cfg.kind === "none") return;
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  if (cfg.kind === "countdown") {
    await playCountdown(ctx);
    await ctx.close();
    return;
  }
  if (cfg.kind === "click") {
    await playClick(ctx, cfg.bpm ?? 100, 1);
    await ctx.close();
    return;
  }
  await ctx.close();
  if (cfg.kind === "tts") {
    const name = cfg.singerName?.trim() || "der nächste Star";
    const song = cfg.songTitle?.trim();
    const text = song
      ? `Als Nächstes — ${name} singt ${song}! Macht euch bereit!`
      : `Als Nächstes auf der Bühne — ${name}! Macht euch bereit!`;
    await playTtsIntro(text, cfg.voice ?? "alloy");
    return;
  }
  if (cfg.kind === "file" && cfg.fileUrl) {
    await playFileIntro(cfg.fileUrl);
  }
}