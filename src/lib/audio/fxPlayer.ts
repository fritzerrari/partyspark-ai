// Tiny one-shot FX player. Plays a single audio URL with low latency.
// Independent of the main DJ engine to keep crossfade state untouched.
let el: HTMLAudioElement | null = null;

export function previewFx(url: string) {
  if (typeof window === "undefined") return;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  el.src = url;
  el.currentTime = 0;
  void el.play().catch(() => {});
}

export function stopFx() {
  el?.pause();
}