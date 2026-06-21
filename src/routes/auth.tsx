import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PartyPilot AI" },
      { name: "description", content: "Sign in or create your PartyPilot AI account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Only redirect AFTER the initial session restore has completed — otherwise
  // a transient `user=null` during loading can race with `_authenticated`'s
  // redirect-to-/auth and cause the auth screen to flash and disappear.
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name || email.split("@")[0] },
            emailRedirectTo: window.location.origin + "/dashboard",
          },
        });
        if (error) throw error;
        toast.success("Welcome to PartyPilot! 🎉");
        if (data.session) navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] brand-gradient">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-8 sm:py-10">
        <Logo className="mx-auto" />
        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-stage sm:mt-8 sm:p-7">
          <h1 className="font-display text-2xl font-bold">
            {mode === "signup" ? "Start your first party" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Create an account in seconds — no credit card."
              : "Sign in to your control center."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="DJ Mom"
                  className="mt-1 h-11"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-11"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <PartyPopper className="mr-2 h-4 w-4" />
                  {mode === "signup" ? "Create account" : "Sign in"}
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
        <Link
          to="/"
          className="mt-6 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back home
        </Link>
      </div>
    </div>
  );
}