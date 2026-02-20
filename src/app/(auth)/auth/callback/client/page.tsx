"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function sanitizeNext(rawNext: string | null) {
  if (!rawNext) return "/dashboard";

  try {
    const decoded = decodeURIComponent(rawNext);
    if (decoded.startsWith("/")) return decoded;
  } catch {
    if (rawNext.startsWith("/")) return rawNext;
  }

  return "/dashboard";
}

function OAuthCallbackClientContent() {
  const searchParams = useSearchParams();
  const oauthCode = searchParams.get("code");
  const next = useMemo(() => sanitizeNext(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!oauthCode) return;

    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      let sessionEstablished = false;
      let lastErrorCode: string | null = null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(oauthCode);

        if (!error && data.session) {
          sessionEstablished = true;
          break;
        }

        lastErrorCode =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code || "")
            : null;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          sessionEstablished = true;
          break;
        }

        const isPkceMissing = lastErrorCode === "pkce_code_verifier_not_found";
        const waitMs = isPkceMissing ? 250 + attempt * 200 : 120 + attempt * 80;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      if (!sessionEstablished && !cancelled) {
        const loginUrl = new URL("/login", window.location.origin);
        loginUrl.searchParams.set("error", "exchange_failed");

        try {
          const nextUrl = new URL(next, window.location.origin);
          const inviteCode = nextUrl.searchParams.get("code");
          if (inviteCode) loginUrl.searchParams.set("code", inviteCode);
        } catch {
          // next inválido; sem código de convite na volta ao login.
        }

        window.location.replace(loginUrl.toString());
        return;
      }

      await fetch("/api/auth/ensure-profile", { method: "POST" }).catch(() => null);
      await fetch("/api/invite/sync", { method: "POST" }).catch(() => null);

      if (!cancelled) {
        window.location.replace(next);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [next, oauthCode]);

  if (oauthCode) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">A concluir autenticação…</h1>
        <p className="mt-2 text-sm text-slate-600">Só um segundo.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Falha no login</h1>
      <p className="mt-2 text-sm text-slate-600">Código OAuth em falta.</p>
      <Link className="mt-4 inline-block underline" href="/login">
        Voltar ao login
      </Link>
    </main>
  );
}

export default function OAuthCallbackClientPage() {
  return (
    <Suspense fallback={<div className="p-4">A carregar…</div>}>
      <OAuthCallbackClientContent />
    </Suspense>
  );
}
