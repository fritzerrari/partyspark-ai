import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PartyPopper, Radio, Calendar, Music2, Sparkles, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { partiesListOptions } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — PartyPilot AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: parties = [] } = useQuery(partiesListOptions(user!.id));
  const live = parties.filter((p) => p.status === "live");
  const drafts = parties.filter((p) => p.status === "draft");
  const past = parties.filter((p) => p.status === "ended");

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title={`Hey ${user?.email?.split("@")[0] ?? "host"} 👋`}
        subtitle="Your AI DJ booth. Let's throw something unforgettable."
        action={
          <Button asChild className="h-11 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/parties/new">
              <PartyPopper className="mr-2 h-4 w-4" /> New party
            </Link>
          </Button>
        }
      />

      {/* Featured */}
      <section className="relative overflow-hidden rounded-3xl stage-gradient p-6 text-stage-foreground shadow-stage sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Tonight could be the one
        </span>
        <h2 className="mt-4 max-w-xl font-display text-2xl font-bold sm:text-3xl">
          Two minutes to a party your friends will talk about for months.
        </h2>
        <p className="mt-2 max-w-xl text-stage-foreground/80">
          Pick the vibe. Drop in your music. Let PartyPilot run the night.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/parties/new"><Plus className="mr-2 h-4 w-4" /> Create party</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full border-white/20 bg-white/10 text-stage-foreground hover:bg-white/20">
            <Link to="/library"><Music2 className="mr-2 h-4 w-4" /> Open library</Link>
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Radio} label="Live now" value={String(live.length)} />
        <Stat icon={Calendar} label="Drafts" value={String(drafts.length)} />
        <Stat icon={PartyPopper} label="Parties hosted" value={String(past.length)} />
      </section>

      <Section title="Drafts & upcoming" empty="No upcoming parties — start your first one.">
        {drafts.concat(live).map((p) => (
          <PartyCard key={p.id} party={p} />
        ))}
      </Section>

      <Section title="Past parties" empty="Your past parties will appear here.">
        {past.map((p) => (
          <PartyCard key={p.id} party={p} />
        ))}
      </Section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Radio; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.filter(Boolean).length > 0;
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {hasItems ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      )}
    </section>
  );
}

function PartyCard({ party }: { party: { id: string; name: string; event_type: string; status: string; current_mood: string; current_energy: number } }) {
  return (
    <Link
      to="/parties/$partyId"
      params={{ partyId: party.id }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary">
          {party.event_type}
        </span>
        <StatusPill status={party.status} />
      </div>
      <h3 className="mt-3 truncate font-display text-lg font-semibold">{party.name}</h3>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{party.current_mood}</span>
        <span className="font-semibold text-foreground">Energy {party.current_energy}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${party.current_energy}%` }} />
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-success/15 text-success",
    draft: "bg-muted text-muted-foreground",
    ended: "bg-foreground/10 text-foreground",
  };
  return (
    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest " + (map[status] ?? "bg-muted")}>
      {status === "live" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success align-middle" />}
      {status}
    </span>
  );
}