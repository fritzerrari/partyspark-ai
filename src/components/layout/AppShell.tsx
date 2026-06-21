import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  PartyPopper,
  Music2,
  Mic,
  Repeat,
  Sparkles,
  Settings as SettingsIcon,
  Layers,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/library", label: "Music Library", icon: Music2 },
  { to: "/soundpool", label: "Sound Pool", icon: Layers },
  { to: "/loops", label: "Loop Creator", icon: Repeat },
  { to: "/karaoke", label: "Karaoke", icon: Mic },
  { to: "/ai-lab", label: "AI Lab", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen brand-gradient">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-card/70 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size="sm" to="/dashboard" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle nav"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-0 lg:gap-6 lg:px-6 lg:py-6">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-0 top-[57px] z-20 flex flex-col gap-1 overflow-y-auto border-r border-border bg-card p-4 transition lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-64 lg:rounded-3xl lg:border lg:bg-card/80 lg:shadow-sm lg:backdrop-blur",
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="hidden px-2 pb-3 lg:block">
            <Logo to="/dashboard" />
          </div>

          <Button
            asChild
            className="mb-3 h-11 w-full rounded-full bg-accent text-accent-foreground shadow-stage hover:bg-accent/90"
            onClick={() => setOpen(false)}
          >
            <Link to="/parties/new">
              <PartyPopper className="mr-2 h-4 w-4" /> Start a party
            </Link>
          </Button>

          <nav className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || pathname.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border pt-3">
            <div className="flex items-center gap-3 px-2 pb-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
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

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 lg:px-0 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}