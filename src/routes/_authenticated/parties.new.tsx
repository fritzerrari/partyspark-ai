import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, PartyPopper, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/parties/new")({
  head: () => ({ meta: [{ title: "New Party — PartyPilot AI" }] }),
  component: NewParty,
});

const EVENT_TYPES = [
  { id: "birthday", label: "Birthday", emoji: "🎂" },
  { id: "wedding", label: "Wedding", emoji: "💍" },
  { id: "bbq", label: "BBQ / Cookout", emoji: "🍔" },
  { id: "house", label: "House party", emoji: "🏠" },
  { id: "office", label: "Office party", emoji: "💼" },
  { id: "other", label: "Something else", emoji: "✨" },
];
const AGES = [
  { id: "kids", label: "Kids", body: "0–12" },
  { id: "teens", label: "Teens", body: "13–19" },
  { id: "20s30s", label: "Twenties / Thirties", body: "20–39" },
  { id: "mixed", label: "Mixed crowd", body: "All ages" },
  { id: "mature", label: "Mature", body: "40+" },
];
const VIBES = [
  "Pop", "Hip Hop", "Dance / EDM", "Rock", "Country", "Latin", "R&B / Soul", "Throwbacks", "Indie",
];
const DURATIONS = [
  { id: 120, label: "2h" },
  { id: 180, label: "3h" },
  { id: 240, label: "4h" },
  { id: 300, label: "5h+" },
];

function NewParty() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({
    name: "",
    event_type: "birthday",
    guest_age_range: "20s30s",
    vibes: ["Pop", "Hip Hop"] as string[],
    duration_min: 180,
  });

  function update<K extends keyof typeof data>(k: K, v: (typeof data)[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function create() {
    setBusy(true);
    try {
      const { data: row, error } = await supabase
        .from("parties")
        .insert({
          host_id: user!.id,
          name: data.name || `${data.event_type} party`,
          event_type: data.event_type,
          guest_age_range: data.guest_age_range,
          duration_min: data.duration_min,
          vibe_prefs: { vibes: data.vibes },
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Party created — let's tune it.");
      navigate({ to: "/parties/$partyId", params: { partyId: row.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create party");
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Vibe", "Crowd", "Sound", "Length"];

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Create your party</h1>
        <span className="text-xs text-muted-foreground">
          Step {step + 1} of {steps.length}
        </span>
      </div>

      <div className="mb-6 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition",
              i <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <Label htmlFor="pname">Party name</Label>
              <Input
                id="pname"
                placeholder="Mia's 30th"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                className="mt-1 h-11"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">What kind of party?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EVENT_TYPES.map((t) => (
                  <Tile
                    key={t.id}
                    active={data.event_type === t.id}
                    onClick={() => update("event_type", t.id)}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <span className="text-sm font-medium">{t.label}</span>
                  </Tile>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Who&apos;s coming?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AGES.map((a) => (
                <Tile
                  key={a.id}
                  active={data.guest_age_range === a.id}
                  onClick={() => update("guest_age_range", a.id)}
                  className="items-start text-left"
                >
                  <span className="font-display text-base font-semibold">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.body}</span>
                </Tile>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Pick a few favorite vibes</p>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => {
                const on = data.vibes.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      update(
                        "vibes",
                        on ? data.vibes.filter((x) => x !== v) : [...data.vibes, v],
                      )
                    }
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">How long is the night?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DURATIONS.map((d) => (
                <Tile
                  key={d.id}
                  active={data.duration_min === d.id}
                  onClick={() => update("duration_min", d.id)}
                >
                  <span className="font-display text-2xl font-bold">{d.label}</span>
                </Tile>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {step < steps.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={create}
              disabled={busy}
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <PartyPopper className="mr-2 h-4 w-4" /> Create party
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border bg-card hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}