"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { waitForSessionPersistence } from "@/lib/supabase/browser-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function BackofficeLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Autologin: se sessao Supabase ja existe e utilizador e super_coordinator,
  // redirige directamente para /admin sem passar pelo formulario.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      try {
        const res = await fetch("/api/me/super-user", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });
        if (!cancelled && res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { is_super_coordinator?: boolean }
            | null;
          if (payload?.is_super_coordinator) {
            router.replace("/admin");
            return;
          }
        }
      } catch {
        // ignore — caira no formulario manual
      }

      if (!cancelled) setCheckingSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      const message = signInError.message.toLowerCase();
      if (
        message.includes("invalid login credentials") ||
        message.includes("invalid_credentials")
      ) {
        setError("Email ou password incorrectos.");
      } else if (message.includes("email not confirmed")) {
        setError("Confirma o teu email antes de entrar.");
      } else {
        setError(signInError.message || "Nao foi possivel entrar.");
      }
      setLoading(false);
      return;
    }

    await waitForSessionPersistence(supabase, { attempts: 10, delayMs: 100 });

    // Validar acesso a backoffice antes de redirigir.
    const res = await fetch("/api/me/super-user", {
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    }).catch(() => null);

    const payload = res?.ok
      ? ((await res.json().catch(() => null)) as
          | { is_super_coordinator?: boolean }
          | null)
      : null;

    if (!payload?.is_super_coordinator) {
      await supabase.auth.signOut().catch(() => null);
      setError("Acesso reservado ao backoffice.");
      setLoading(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center">
        <p className="text-sm text-slate-300">A validar sessao...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck size={22} className="text-emerald-400" />
        <div>
          <h1 className="text-base font-semibold">
            <span className="text-white">Backoffice · Coach</span>
            <span className="text-emerald-400">11</span>
          </h1>
          <p className="text-xs text-slate-400">
            Acesso reservado a coordenadores principais.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="bo-email" className="text-slate-300">
            Email
          </Label>
          <Input
            id="bo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
            placeholder="admin@email.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bo-password" className="text-slate-300">
            Password
          </Label>
          <Input
            id="bo-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500"
        >
          {loading ? "A entrar..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}

export default function BackofficeLoginPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4"
      style={{
        paddingTop:
          "calc(2rem + max(env(safe-area-inset-top, 0px), env(titlebar-area-height, 0px)))",
      }}
    >
      <Suspense
        fallback={
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center">
            <p className="text-sm text-slate-300">A carregar...</p>
          </div>
        }
      >
        <BackofficeLoginForm />
      </Suspense>
    </div>
  );
}
