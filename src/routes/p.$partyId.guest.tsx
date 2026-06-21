import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PartyPopper, Mic, Sparkles, Heart, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$partyId/guest")({
  head: () => ({ meta: [{ title: "Join the party — PartyPilot AI" }] }),
  component: GuestScreen,
});

type Party = {
  id: string;
  name: string;
  event_type: string;
  status: string;
  current_mood: string;
  current_energy: number;
} | null;

function GuestScreen() {
  const { partyId } = Route.useParams();
  const [party, setParty] = useState<Party>(null);
  const [request, setRequest] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("parties")
      .select("id,name,event_type,status,current_mood,current_energy")
      .eq("id", partyId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setParty(data as Party);
      });
    const ch = supabase
      .channel(`guest-${partyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${partyId}` },
        (payload) => setParty(payload.new as Party),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [partyId]);

  return (
    <div className="min-h-screen stage-gradient text-stage-foreground">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo size="sm" />
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur">
          <Radio className="h-3.5 w-3.5" /> Guest mode
        </span>
      </header>

      <main className="mx-auto max-w-md px-5 pb-16 pt-4">
        {!party ? (
          <p className="text-center text-stage-foreground/70">Loading party…</p>
        ) : (
          <>
            <div className="text-center animate-fade-up">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-stage-foreground/70">
                {party.event_type}
              </span>
              <h1 className="mt-4 font-display text-3xl font-bold">{party.name}</h1>
              <p className="mt-2 text-stage-foreground/70">
                {party.status === "live" ? "🎉 The party is live" : "Waiting to kick off"}
              </p>
            </div>

            <div className="mt-8 rounded-3xl border border-stage-border bg-white/5 p-5 backdrop-blur">
              <p className="text-[10px] uppercase tracking-widest text-stage-foreground/60">Mood</p>
              <p className="mt-1 font-display text-2xl font-bold">{party.current_mood}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${party.current_energy}%` }} />
              </div>
              <p className="mt-2 text-xs text-stage-foreground/60">Energy {party.current_energy}/100</p>
            </div>

            <div className="mt-6 rounded-3xl border border-stage-border bg-white/5 p-5 backdrop-blur">
              <p className="font-display text-lg font-semibold">Request a song</p>
              <p className="text-sm text-stage-foreground/70">The host gets to pick what makes it in.</p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="Mr. Brightside — The Killers"
                  className="h-11 border-stage-border bg-white/10 text-stage-foreground placeholder:text-stage-foreground/40"
                />
                <Button
                  onClick={() => {
                    if (!request.trim()) return;
                    toast.success("Sent to the booth ✨");
                    setRequest("");
                  }}
                  className="h-11 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <PartyPopper className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { i: Heart, label: "Love it" },
                { i: Sparkles, label: "Hype" },
                { i: Mic, label: "Karaoke" },
              ].map(({ i: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => toast.success(`${label} sent!`)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-stage-border bg-white/5 py-4 backdrop-blur hover:bg-white/10"
                >
                  <Icon className="h-6 w-6 text-accent" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-stage-foreground/50">
              Powered by PartyPilot AI
            </p>
          </>
        )}
      </main>
    </div>
  );
}