import { useEffect, useRef } from "react";
import { getDeckSignal, type DeckSide } from "@/lib/audio/twinDeckBus";

export function DeckSpectrum({ side, color }: { side: DeckSide; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx2 = cv.getContext("2d");
    if (!ctx2) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sig = getDeckSignal(side);
      ctx2.clearRect(0, 0, cv.width, cv.height);
      if (!sig.analyser) return;
      const N = sig.analyser.frequencyBinCount;
      const data = new Uint8Array(N);
      sig.analyser.getByteFrequencyData(data);
      const BANDS = 32;
      const binsPerBand = Math.max(1, Math.floor(N / BANDS));
      const w = cv.width;
      const h = cv.height;
      const bw = w / BANDS;
      for (let i = 0; i < BANDS; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBand; j++) sum += data[i * binsPerBand + j];
        const v = sum / binsPerBand / 255;
        const bh = v * h;
        ctx2.fillStyle = color;
        ctx2.globalAlpha = 0.25 + v * 0.75;
        ctx2.fillRect(i * bw + bw * 0.15, h - bh, bw * 0.7, bh);
      }
      ctx2.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [side, color]);
  return <canvas ref={ref} className="h-10 w-full rounded-md bg-black/40 border border-white/5" />;
}