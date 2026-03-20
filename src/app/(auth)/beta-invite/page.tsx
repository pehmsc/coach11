"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function BetaInviteContent() {
  const sp = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const email = decodeURIComponent(sp.get("email") ?? "").trim();
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const callbackUrl = new URL("/auth/callback", baseUrl);
    callbackUrl.searchParams.set("next", "/dashboard");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-slate-900">
            COACH<span className="text-emerald-500">11</span>
          </h1>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Convite de Coordenador
            </h2>
            <p className="text-sm text-slate-600">
              Foste convidado para coordenar um clube no Coach11.
              Vais configurar o teu clube, criar escalões, e gerir a equipa técnica.
            </p>
          </div>

          {email && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-xs text-slate-500">Email do convite</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{email}</p>
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => void handleGoogleLogin()}
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continuar com Google
                </>
              )}
            </Button>

            <a
              href={`/register${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="block rounded-2xl border px-4 py-3 text-center text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Criar conta com email →
            </a>
          </div>

          <p className="text-center text-xs text-slate-400">
            Usa o mesmo email para o qual recebeste o convite.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function BetaInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <BetaInviteContent />
    </Suspense>
  );
}
