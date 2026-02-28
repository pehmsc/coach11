"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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

function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(() => sp.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inviteCode = sp.get("code") ?? sp.get("inviteCode") ?? null;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    if (password.length < 6) {
      setError("A password deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const next = inviteCode ? `/dashboard?code=${inviteCode}` : "/dashboard";
    const callbackUrl = new URL("/auth/callback/client", window.location.origin);
    callbackUrl.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "coordinator" },
        emailRedirectTo: callbackUrl.toString(),
      },
    });
    if (error) {
      setError("Erro ao criar conta. Verifica os dados.");
      setLoading(false);
      return;
    }
    if (!data.session) {
      setNotice("Conta criada. Confirma o teu email para concluir o registo e entrar.");
      setLoading(false);
      return;
    }

    markIOSInstallPromptAfterLogin();
    const dest = next;
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
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          {inviteCode
            ? "Cria conta para aceitar o convite"
            : "Começa a gerir o teu escalão hoje"}
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleRegister}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}
          {notice && (
            <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded-md border border-blue-200">
              {notice}
            </div>
          )}

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
            <Label htmlFor="fullName">Nome completo</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="João Silva"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="treinador@email.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
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
            {loading ? "A criar conta..." : "Criar conta"}
          </Button>
          <p className="text-sm text-slate-500 text-center">
            Já tens conta?{" "}
            <Link
              href={inviteCode ? `/login?code=${inviteCode}` : "/login"}
              className="text-emerald-600 font-medium hover:underline"
            >
              Entrar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-4">A carregar...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
