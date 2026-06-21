import { useEffect, useState } from "react";
import { getSkill, subscribeSkill, type SkillState } from "@/lib/dj/skill";
import { Trophy } from "lucide-react";

const BADGE_COLORS: Record<string, string> = {
  rookie:   "#9ca3af",
  bronze:   "#cd7f32",
  silver:   "#c0c0c0",
  gold:     "#facc15",
  platinum: "#e5e7eb",
  diamond:  "var(--neon-cyan)",
};

export function SkillBadge() {
  const [s, setS] = useState<SkillState>(() => getSkill());
  useEffect(() => subscribeSkill(setS), []);
  const avg = s.mixes > 0 ? Math.round(s.sumScore / s.mixes) : 0;
  const tone = BADGE_COLORS[s.badge] ?? "#fff";
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-mono"
      style={{ boxShadow: `0 0 10px ${tone}33` }}
      title={`${s.mixes} mixes · best ${s.bestScore} · avg ${avg}`}
    >
      <Trophy className="h-3 w-3" style={{ color: tone }} />
      <span className="font-bold uppercase tracking-widest" style={{ color: tone }}>{s.badge}</span>
      <span className="text-stage-foreground/50">·</span>
      <span className="text-stage-foreground/70">{s.mixes}</span>
      <span className="text-stage-foreground/50">mixes</span>
      <span className="text-stage-foreground/50">·</span>
      <span className="text-stage-foreground/70">avg {avg}</span>
    </div>
  );
}