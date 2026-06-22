import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  PartyPopper,
  Music2,
  Settings as SettingsIcon,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Disc3 } from "lucide-react";
import { type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { isAdminOptions } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TransportBar } from "@/components/player/TransportBar";
import { ModuleDock } from "@/components/dashboard/ModuleDock";

// Aggressive: only 5 core pages. Everything else lives inside Cockpit/Party tabs.
const NAV = [
  { to: "/dashboard", label: "Home", icon: Home, hint: "Übersicht & Start" },
  { to: "/library", label: "1 · Library", icon: Music2, hint: "Tracks hochladen, analysieren" },
  { to: "/parties/new", label: "2 · Party", icon: PartyPopper, accent: true, hint: "Event planen" },
  { to: "/cockpit", label: "3 · Cockpit", icon: Disc3, hint: "Mixen · Singen · FX · Aufnehmen" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: isAdmin } = useQuery({ ...isAdminOptions(user?.id ?? ""), enabled: !!user?.id });

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/", replace: true });
  }

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  const linkClass = (to: string) =>
    cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
      isActive(to)
        ? "bg-primary-soft text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="min-h-[100dvh] brand-gradient">
      {/* Compact mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size="sm" to="/dashboard" />
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {user?.email}
          </span>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {(user?.email ?? "?")[0]?.toUpperCase()}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-0 lg:gap-6 lg:px-6 lg:py-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-3xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur lg:flex">
          <div className="px-2 pb-3">
            <Logo to="/dashboard" />
          </div>

          <Button
            asChild
            className="mb-3 h-11 w-full rounded-full bg-accent text-accent-foreground shadow-stage hover:bg-accent/90"
          >
            <Link to="/parties/new">
              <PartyPopper className="mr-2 h-4 w-4" /> Start a party
            </Link>
          </Button>

          <nav className="flex flex-col gap-1">
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Dein Pfad
            </p>
            {NAV.map(({ to, label, icon: Icon, hint }) => (
              <Link key={to} to={to} className={linkClass(to)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{label}</span>
                  {hint && (
                    <span className="truncate text-[10px] font-normal text-muted-foreground/70">
                      {hint}
                    </span>
                  )}
                </span>
              </Link>
            ))}

            <div className="mt-2 border-t border-border pt-2">
              <Link to="/settings" className={linkClass("/settings")}>
                <SettingsIcon className="h-4 w-4 shrink-0" /> Settings
              </Link>
              {isAdmin && (
                <Link to="/admin/fx-review" className={linkClass("/admin/fx-review")}>
                  <ShieldCheck className="h-4 w-4 shrink-0" /> FX Review
                </Link>
              )}
            </div>
          </nav>

          <div className="mt-auto border-t border-border pt-3">
            <div className="flex items-center gap-3 px-2 pb-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                {(user?.email ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground">Host</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start gap-3 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 lg:px-0 lg:pb-0 lg:pt-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => {
            const accent = "accent" in rest && rest.accent;
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition",
                  accent
                    ? "bg-accent text-accent-foreground shadow-stage"
                    : active
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", accent && "h-6 w-6")} />
                <span className="truncate">{label.replace(/^\d+\s·\s/, "")}</span>
              </Link>
            );
          })}
          <Link
            to="/settings"
            
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition",
              isActive("/settings") ? "text-primary" : "text-muted-foreground",
            )}
          >
            <SettingsIcon className="h-5 w-5" />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      <TransportBar />
      <ModuleDock />
    </div>
  );
}