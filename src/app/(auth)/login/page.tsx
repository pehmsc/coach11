"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { waitForSessionPersistence } from "@/lib/supabase/browser-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markIOSInstallPromptAfterLogin } from "@/lib/pwa/install-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState(() => sp.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCode = sp.get("code") ?? sp.get("inviteCode") ?? null;

  async function checkBetaAccess(emailToCheck: string) {
    const res = await fetch("/api/auth/beta-access/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailToCheck }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        (payload as { error?: string })?.error || "Erro ao validar acesso beta.",
      );
    }

    return (payload as { allowed?: boolean }).allowed === true;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const allowed = await checkBetaAccess(normalizedEmail);
      if (!allowed) {
        router.replace("/invite-only?reason=beta_access_required");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao validar acesso beta.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("email not confirmed")) {
        setError("Confirma o teu email antes de entrar.");
      } else if (
        message.includes("invalid login credentials") ||
        message.includes("invalid_credentials")
      ) {
        setError("Email ou password incorretos.");
      } else {
        setError(error.message || "Não foi possível entrar. Tenta novamente.");
      }
      setLoading(false);
      return;
    }
    // Se há código de convite na URL, redirecionar para dashboard com o código
    const dest = inviteCode ? `/dashboard?code=${inviteCode}` : "/dashboard";
    await waitForSessionPersistence(supabase, {
      attempts: 10,
      delayMs: 100,
    });
    const ensureProfileRes = await fetch("/api/auth/ensure-profile", {
      method: "POST",
    }).catch(() => null);

    if (ensureProfileRes?.status === 403) {
      await supabase.auth.signOut().catch(() => null);
      router.replace("/invite-only?reason=beta_access_required");
      return;
    }

    markIOSInstallPromptAfterLogin();
    router.push(dest);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    const supabase = createClient();

    // Preservar o código de convite através do OAuth passando-o no next param
    const next = inviteCode ? `/dashboard?code=${inviteCode}` : "/dashboard";
    const callbackUrl = new URL("/auth/callback/client", window.location.origin);
    callbackUrl.searchParams.set("next", next);

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acede à tua conta Coach11</CardDescription>
      </CardHeader>

      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          {sp.get("error") === "exchange_failed" && (
            <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-md border border-amber-200">
              Ocorreu um problema com o Google. Por favor tenta novamente.
            </div>
          )}
          {sp.get("error") === "verify_failed" && (
            <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-md border border-amber-200">
              Não foi possível concluir a confirmação do email. Tenta abrir novamente o link de confirmação.
            </div>
          )}
          {sp.get("error") === "invalid_callback" && (
            <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-md border border-amber-200">
              O link de autenticação é inválido ou expirou. Tenta novamente.
            </div>
          )}

          {/* Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {googleLoading ? "A redirecionar..." : "Continuar com Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs text-slate-400 bg-white px-2">
              ou com email
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="treinador@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={loading}
          >
            {loading ? "A entrar..." : "Entrar"}
          </Button>
          <p className="text-sm text-slate-500 text-center">
            Não tens conta?{" "}
            <Link
              href={inviteCode ? `/register?code=${inviteCode}` : "/register"}
              className="text-emerald-600 font-medium hover:underline"
            >
              Registar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4">A carregar...</div>}>
      <LoginForm />
    </Suspense>
  );
}
