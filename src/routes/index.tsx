import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Music2, Wand2, Mic, Gauge, Heart, PartyPopper, Play,
  Headphones, Zap, Cake, MonitorPlay, Upload, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PartyPilot AI — Your AI Party DJ" },
      { name: "description", content: "An AI DJ that mixes, reacts and reads the room. Drop your MP3s — PartyPilot does the rest." },
      { property: "og:title", content: "PartyPilot AI — Your AI Party DJ" },
      { property: "og:description", content: "An AI DJ that mixes, reacts and reads the room. Drop your MP3s — PartyPilot does the rest." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070713] text-white">
      <NoiseLayer />
      <SpotlightCursor />
      <MarketingNav />
      <Hero />
      <MarqueeRow />
      <Features />
      <ControlPreview />
      <HowItWorks />
      <DropDemo />
      <CtaBand />
      <Footer />
    </div>
  );
}

/* ───────────────────────  EFFECTS  ─────────────────────── */

function NoiseLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-[0.08] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/></svg>\")",
      }}
    />
  );
}

function SpotlightCursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0, x = 0, y = 0, tx = 0, ty = 0;
    const onMove = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    const loop = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.transform = `translate3d(${x - 240}px, ${y - 240}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", onMove); };
  }, []);
  return (
    <div ref={ref} aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[2] hidden h-[480px] w-[480px] rounded-full opacity-60 blur-3xl md:block"
      style={{ background: "radial-gradient(closest-side, oklch(0.72 0.27 330 / 0.5), transparent 70%)" }}
    />
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0.5, y: 0.5, hot: 0 });
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const onMove = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.current.x = (e.clientX - r.left) / r.width;
      mouse.current.y = (e.clientY - r.top) / r.height;
      mouse.current.hot = 1;
    };
    window.addEventListener("mousemove", onMove);
    let raf = 0, t = 0;
    const BARS = 56;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.016;
      mouse.current.hot *= 0.96;
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * mouse.current.x, h * mouse.current.y, 0, w / 2, h / 2, Math.max(w, h));
      g.addColorStop(0, "rgba(236,72,153,0.18)");
      g.addColorStop(0.5, "rgba(34,211,238,0.10)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const baseY = h * 0.78;
      const bw = (w * 0.85) / BARS;
      const startX = (w - bw * BARS) / 2;
      for (let i = 0; i < BARS; i++) {
        const k = (i / BARS) * 2 - 1;
        const wave = (Math.sin(t * 2 + i * 0.4) * 0.5 + 0.5) * 0.6 + (Math.sin(t * 5 + i * 0.18) * 0.5 + 0.5) * 0.4;
        const prox = 1 - Math.min(1, Math.abs(k - (mouse.current.x * 2 - 1)) * 1.2);
        const boost = mouse.current.hot * prox * 0.6;
        const env = 1 - Math.abs(k) * 0.6;
        const v = Math.max(0.06, wave * env + boost);
        const bh = v * h * 0.55;
        const x = startX + i * bw;
        const hue = 290 - i * 2 + Math.sin(t + i * 0.1) * 30;
        const grad = ctx.createLinearGradient(0, baseY - bh, 0, baseY);
        grad.addColorStop(0, `hsla(${hue}, 95%, 70%, 0.95)`);
        grad.addColorStop(1, `hsla(${(hue + 60) % 360}, 95%, 45%, 0.15)`);
        ctx.fillStyle = grad;
        roundRect(ctx, x + bw * 0.1, baseY - bh, bw * 0.8, bh, bw * 0.35);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        const grad2 = ctx.createLinearGradient(0, baseY, 0, baseY + bh * 0.6);
        grad2.addColorStop(0, `hsla(${hue}, 95%, 60%, 0.5)`);
        grad2.addColorStop(1, "transparent");
        ctx.fillStyle = grad2;
        ctx.fillRect(x + bw * 0.1, baseY, bw * 0.8, bh * 0.6);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.ellipse(w / 2, baseY, w * 0.42, h * 0.06, 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}

function MagneticButton({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > 120) { el.style.transform = "translate(0,0)"; return; }
      const pull = (1 - dist / 120) * 0.4;
      el.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
    };
    const reset = () => { el.style.transform = "translate(0,0)"; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", reset);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseleave", reset); };
  }, []);
  return <div ref={ref} className="transition-transform duration-200 ease-out">{children}</div>;
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setShown(true)), { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ transitionDelay: `${delay}ms` }}>
      <div className={"transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] " + (shown ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-8 blur-md")}>
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────  HERO  ──────────────────────── */

function Hero() {
  const words = ["unforgettable", "iconic", "legendary", "magical", "wild", "yours"];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % words.length), 2200); return () => clearInterval(t); }, [words.length]);
  return (
    <section className="relative isolate min-h-[92vh] overflow-hidden">
      <HeroCanvas />
      <div className="absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-[#070713] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#070713] to-transparent" />
      <div className="relative z-20 mx-auto flex max-w-6xl flex-col items-center px-5 pt-24 pb-16 text-center sm:pt-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/80 backdrop-blur animate-fade-up">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.72_0.27_330)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[oklch(0.72_0.27_330)]" />
          </span>
          Early access · v0.9
        </span>
        <h1 className="mt-8 max-w-5xl text-balance font-display text-5xl font-black leading-[0.92] tracking-tight sm:text-7xl md:text-[88px]">
          Throw an{" "}
          <span className="relative inline-grid">
            {words.map((w, idx) => (
              <span key={w} className={
                "col-start-1 row-start-1 bg-gradient-to-r from-[oklch(0.82_0.18_200)] via-[oklch(0.72_0.27_330)] to-[oklch(0.85_0.18_75)] bg-clip-text text-transparent transition-all duration-500 " +
                (idx === i ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-3 blur-sm")
              }>{w}</span>
            ))}
          </span>
          <br />night with one button.
        </h1>
        <p className="mt-7 max-w-xl text-balance text-base leading-relaxed text-white/70 sm:text-lg">
          PartyPilot is an AI DJ that mixes, reacts, and reads the room.
          Drop your MP3s anywhere on this page — we take it from there.
        </p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <MagneticButton>
            <Link to="/auth" className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-bold text-black shadow-[0_10px_50px_-10px_oklch(0.72_0.27_330_/_0.7)] transition hover:scale-[1.02]">
              <PartyPopper className="h-5 w-5" /> Start a party
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </MagneticButton>
          <a href="#how" className="inline-flex h-14 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-base text-white backdrop-blur transition hover:bg-white/10">
            <Play className="h-4 w-4" /> Watch it work
          </a>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-white/40">
          <span>No credit card</span><span>·</span><span>2-minute setup</span><span>·</span><span>Beamer-ready visuals</span>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────  MARQUEE  ──────────────────── */

function MarqueeRow() {
  const tags = [
    { icon: Cake, label: "Birthdays" },
    { icon: Heart, label: "Weddings" },
    { icon: PartyPopper, label: "House parties" },
    { icon: Headphones, label: "BBQs" },
    { icon: Zap, label: "Office parties" },
    { icon: Music2, label: "After-hours" },
    { icon: Sparkles, label: "Festivals" },
  ];
  const row = [...tags, ...tags, ...tags];
  return (
    <section className="relative z-20 -mt-6 overflow-hidden border-y border-white/5 bg-black/40 py-5 backdrop-blur">
      <div className="flex animate-[pp-marquee_36s_linear_infinite] gap-10 whitespace-nowrap">
        {row.map(({ icon: Icon, label }, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-white/40">
            <Icon className="h-4 w-4 text-[oklch(0.72_0.27_330)]" /> {label}
            <span className="ml-10 text-white/15">✶</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes pp-marquee{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
    </section>
  );
}

/* ─────────────────────  FEATURES  ───────────────────── */

function FeatureCard({ Icon, title, body, tint }: { Icon: typeof Sparkles; title: string; body: string; tint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMove}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-white/20">
      <div className={"pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-30 " + tint} />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(220px circle at var(--mx) var(--my), rgba(255,255,255,0.10), transparent 60%)" }}
      />
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <h3 className="mt-6 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
    </div>
  );
}

function Features() {
  const items = [
    { icon: Wand2, title: "AI mixes for you", body: "Smart crossfades, key-matched transitions, energy curves. Like a $5k DJ in a button.", tint: "from-[oklch(0.82_0.18_200)] to-transparent" },
    { icon: Gauge, title: "Reads the room", body: "Mood engine + energy meter tune the next song to the moment — warm-up, peak, comedown.", tint: "from-[oklch(0.72_0.27_330)] to-transparent" },
    { icon: Mic, title: "Karaoke moments", body: "One-tap karaoke, vocal FX, guest voice drops. Everyone becomes the show.", tint: "from-[oklch(0.85_0.18_75)] to-transparent" },
    { icon: Music2, title: "Your music, smarter", body: "Drop MP3s anywhere. We analyse BPM, key, vibe — instantly mix-ready.", tint: "from-[oklch(0.86_0.21_140)] to-transparent" },
    { icon: MonitorPlay, title: "Beamer visuals", body: "Open the visualizer on a second screen. Audio-reactive lights for any room.", tint: "from-[oklch(0.82_0.18_200)] to-transparent" },
    { icon: Sparkles, title: "Guest screen", body: "Share a link. Friends request songs, drop reactions, grab the mic — from their phones.", tint: "from-[oklch(0.72_0.27_330)] to-transparent" },
  ];
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[oklch(0.72_0.27_330)]">// what&apos;s inside</p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-6xl">
            A full DJ booth, <span className="italic font-light text-white/60">disguised as an app.</span>
          </h2>
        </div>
      </Reveal>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body, tint }, idx) => (
          <Reveal key={title} delay={idx * 60}>
            <FeatureCard Icon={Icon} title={title} body={body} tint={tint} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ──────────────  CONTROL PREVIEW  ────────────── */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className={"mt-1 font-display text-lg font-bold " + (accent ? "text-[oklch(0.85_0.18_75)]" : "text-white")}>{value}</p>
    </div>
  );
}

function ControlPreview() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0f0a25] via-[#0a0a1c] to-[#100517] p-6 shadow-[0_60px_120px_-40px_oklch(0.72_0.27_330_/_0.4)] sm:p-10">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-full bg-[oklch(0.72_0.27_330)] opacity-20 blur-3xl" />
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> The Cockpit
              </span>
              <h2 className="mt-5 font-display text-4xl font-black sm:text-5xl">
                A command deck<br /><span className="italic font-light text-white/60">for the dancefloor.</span>
              </h2>
              <p className="mt-4 max-w-md text-white/70">
                See what&apos;s playing, what&apos;s next, where the energy is, and how the night is unfolding — at a glance, on any phone.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Twin Decks", "Auto-DJ", "Stem mixer", "Beat-matched", "Beamer mode", "Mic FX"].map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">{t}</span>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 shrink-0 animate-float rounded-2xl bg-gradient-to-br from-[oklch(0.82_0.18_200)] to-[oklch(0.72_0.27_330)] shadow-[0_10px_40px_-10px_oklch(0.72_0.27_330)]" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Now playing</p>
                    <p className="truncate font-display text-lg font-semibold">Dancing on Tables</p>
                    <p className="truncate text-sm text-white/60">The Late Bloomers · 124 BPM · 8A</p>
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-2/3 animate-shimmer rounded-full bg-gradient-to-r from-[oklch(0.82_0.18_200)] to-[oklch(0.72_0.27_330)]" />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Stat label="Energy" value="78" accent />
                  <Stat label="Mood" value="Peak" />
                  <Stat label="Next in" value="2:14" />
                </div>
                <div className="mt-5 grid grid-cols-4 gap-2">
                  {["⏮", "⏯", "⏭", "⚡"].map((g, i) => (
                    <button key={i} className={
                      i === 3
                        ? "rounded-2xl bg-gradient-to-br from-[oklch(0.85_0.18_75)] to-[oklch(0.72_0.27_330)] py-3 text-black shadow-lg"
                        : "rounded-2xl bg-white/10 py-3 text-white hover:bg-white/20"
                    }>
                      <span className="text-lg">{g}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 animate-pulse-ring rounded-full bg-[oklch(0.72_0.27_330)]/40 blur-2xl" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────  HOW IT WORKS  ─────────────── */

function HowItWorks() {
  const steps = [
    { n: "01", title: "Drop your tracks", body: "Drag any MP3 onto the page. We auto-detect BPM, key, energy, vocals." },
    { n: "02", title: "AI builds the set", body: "A timeline of phases tuned to your crowd — warm-up, peak, sing-along, comedown." },
    { n: "03", title: "Press play & enjoy", body: "Smart crossfades, key-matched transitions, beamer visuals. You dance." },
  ];
  return (
    <section id="how" className="relative mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[oklch(0.82_0.18_200)]">// flow</p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-6xl">From zero to <span className="italic font-light text-white/60">dancefloor</span> in 2 min.</h2>
        </div>
      </Reveal>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 120}>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7">
              <span className="font-display text-[80px] font-black leading-none text-white/[0.06]">{s.n}</span>
              <h3 className="-mt-10 font-display text-2xl font-bold">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ──────────────  DROP DEMO  ────────────── */

function DropDemo() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-16">
      <Reveal>
        <div className="group relative grid place-items-center overflow-hidden rounded-[2rem] border border-dashed border-white/20 bg-white/[0.02] py-16 text-center transition hover:border-[oklch(0.72_0.27_330)] hover:bg-white/[0.04]">
          <Upload className="h-10 w-10 text-white/40 transition group-hover:-translate-y-1 group-hover:text-[oklch(0.72_0.27_330)]" />
          <h3 className="mt-4 font-display text-2xl font-bold sm:text-3xl">Drop an MP3 anywhere on this page</h3>
          <p className="mt-2 max-w-md text-sm text-white/60">Once signed in, every screen accepts files. We analyse, key-match, and queue them automatically.</p>
          <Link to="/auth" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02]">
            Sign in &amp; try it <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────  CTA  ─────────────── */

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-black p-10 text-center sm:p-20">
        <div className="absolute inset-0 -z-10 bg-[conic-gradient(from_120deg_at_50%_50%,oklch(0.82_0.18_200)_0deg,oklch(0.72_0.27_330)_120deg,oklch(0.85_0.18_75)_240deg,oklch(0.82_0.18_200)_360deg)] opacity-30 blur-3xl" />
        <h2 className="font-display text-4xl font-black sm:text-6xl">
          Your next party deserves<br />
          <span className="italic font-light text-white/70">better than shuffle.</span>
        </h2>
        <p className="mt-4 text-white/70">It&apos;s free to start. No credit card.</p>
        <Button asChild size="lg" className="mt-8 h-14 rounded-full bg-white px-8 text-base font-bold text-black transition hover:scale-[1.02] hover:bg-white/90">
          <Link to="/auth"><PartyPopper className="mr-2 h-5 w-5" /> Start a party</Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-white/50 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-white">PartyPilot AI</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/pricing" className="hover:text-white">Pricing</Link>
          <a href="mailto:hello@partypilot.ai" className="hover:text-white">Contact</a>
        </div>
      </div>
    </footer>
  );
}