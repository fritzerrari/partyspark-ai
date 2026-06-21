import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Passwort zurücksetzen — PartyPilot AI" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase returns access_token + type=recovery in URL hash and auto-signs the user in.
    // Wait briefly for the session to be established.
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Mindestens 8 Zeichen.");
    if (pw !== confirm) return toast.error("Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Passwort gesetzt ✓");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] brand-gradient">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-8">
        <Logo className="mx-auto" />
        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-stage">
          <h1 className="font-display text-2xl font-bold">Neues Passwort</h1>
          <p className="mt-1 text-sm text-muted-foreground">Setze ein neues Passwort für deinen Account.</p>
          {!ready ? (
            <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="pw">Neues Passwort</Label>
                <Input id="pw" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 h-11" />
              </div>
              <div>
                <Label htmlFor="cpw">Bestätigen</Label>
                <Input id="cpw" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 h-11" />
              </div>
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="mr-2 h-4 w-4" />Passwort setzen</>}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}