"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next";
import { markIOSInstallPromptAfterLogin } from "@/lib/pwa/install-state";
import { waitForSessionPersistence } from "@/lib/supabase/browser-session";

function parseOtpType(rawType: string | null): EmailOtpType | null {
  if (!rawType) return null;
  if (
    rawType === "signup" ||
    rawType === "magiclink" ||
    rawType === "recovery" ||
    rawType === "invite" ||
    rawType === "email_change" ||
    rawType === "email"
  ) {
    return rawType;
  }
  return null;
}

function buildLoginRedirectUrl(next: string, errorCode: string) {
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("error", errorCode);

  try {
    const nextUrl = new URL(next, window.location.origin);
    const inviteCode = nextUrl.searchParams.get("code");
    if (inviteCode) loginUrl.searchParams.set("code", inviteCode);
  } catch {
    // next inválido; sem código de convite na volta ao login.
  }

  return loginUrl.toString();
}

async function redirectToInviteOnly() {
  const supabase = createClient();
  await supabase.auth.signOut().catch(() => null);
  window.location.replace("/invite-only?reason=beta_access_required");
}

function OAuthCallbackClientContent() {
  const searchParams = useSearchParams();
  const oauthCode = searchParams.get("code");
  const otpTokenHash = searchParams.get("token_hash");
  const otpType = useMemo(() => parseOtpType(searchParams.get("type")), [searchParams]);
  const next = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    const hasOauthCode = typeof oauthCode === "string" && oauthCode.length > 0;
    const hasOtpFlow = typeof otpTokenHash === "string" && otpTokenHash.length > 0 && !!otpType;
    if (!hasOauthCode && !hasOtpFlow) return;

    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      let sessionEstablished = false;
      let lastErrorCode: string | null = null;

      const { data: { user: existingUser } } = await supabase.auth.getUser();
      if (existingUser) {
        sessionEstablished = true;
      }

      if (!sessionEstablished && hasOauthCode) {
        for (let attempt = 0; attempt < 8 && !sessionEstablished; attempt += 1) {
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
      }

      if (!sessionEstablished && hasOtpFlow) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: otpTokenHash,
          type: otpType,
        });

        if (!error && data.session) {
          sessionEstablished = true;
        } else {
          const maybeCode =
            error && typeof error === "object" && "code" in error
              ? String((error as { code?: string }).code || "")
              : "";
          lastErrorCode = maybeCode || "otp_verify_failed";
        }

        if (!sessionEstablished) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            sessionEstablished = true;
          }
        }
      }

      if (!sessionEstablished && !cancelled) {
        const fallbackError = hasOtpFlow ? "verify_failed" : "exchange_failed";
        console.error("[auth.callback] failed to establish session", {
          hasOauthCode,
          hasOtpFlow,
          lastErrorCode,
        });
        window.location.replace(buildLoginRedirectUrl(next, fallbackError));
        return;
      }

      await waitForSessionPersistence(supabase, {
        attempts: 12,
        delayMs: 120,
      });
      const ensureProfileRes = await fetch("/api/auth/ensure-profile", {
        method: "POST",
      }).catch(() => null);

      if (ensureProfileRes?.status === 403) {
        await redirectToInviteOnly();
        return;
      }

      const inviteSyncRes = await fetch("/api/invite/sync", {
        method: "POST",
      }).catch(() => null);

      if (inviteSyncRes?.status === 403) {
        await redirectToInviteOnly();
        return;
      }

      if (!cancelled) {
        markIOSInstallPromptAfterLogin();
        window.location.replace(next);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [next, oauthCode, otpTokenHash, otpType]);

  if (oauthCode || (otpTokenHash && otpType)) {
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
      <p className="mt-2 text-sm text-slate-600">Dados de autenticação em falta.</p>
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
