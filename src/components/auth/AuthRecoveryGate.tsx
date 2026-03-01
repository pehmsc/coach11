"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  isSessionExpiringSoon,
  waitForSessionPersistence,
} from "@/lib/supabase/browser-session";

const MAX_RECOVERY_ATTEMPTS = 2;
const RECOVERY_WINDOW_MS = 60 * 1000;

function getRecoveryStorageKey(pathname: string, search: string) {
  return `coach11:auth-recovery:${pathname}${search ? `?${search}` : ""}`;
}

function getRecoveryAttemptCount(storageKey: string) {
  if (typeof window === "undefined") return 0;

  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return 0;

  try {
    const parsed = JSON.parse(raw) as {
      attempts?: number;
      timestamp?: number;
    };
    if (
      typeof parsed.timestamp !== "number" ||
      Date.now() - parsed.timestamp > RECOVERY_WINDOW_MS
    ) {
      window.sessionStorage.removeItem(storageKey);
      return 0;
    }

    return typeof parsed.attempts === "number" ? parsed.attempts : 0;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return 0;
  }
}

function setRecoveryAttemptCount(storageKey: string, attempts: number) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      attempts,
      timestamp: Date.now(),
    }),
  );
}

function clearRecoveryAttemptCount(storageKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey);
}

export function AuthRecoveryGate() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState("A restaurar sessão...");

  useEffect(() => {
    let cancelled = false;
    const search = searchParams.toString();
    const storageKey = getRecoveryStorageKey(pathname, search);
    const debugAuth = process.env.NODE_ENV !== "production";

    async function recoverSession() {
      const previousAttempts = getRecoveryAttemptCount(storageKey);
      if (previousAttempts >= MAX_RECOVERY_ATTEMPTS) {
        if (debugAuth) {
          console.warn("[auth.debug] max recovery attempts reached", {
            pathname,
            attempts: previousAttempts,
          });
        }
        router.replace("/login");
        return;
      }

      setRecoveryAttemptCount(storageKey, previousAttempts + 1);

      try {
        let session = await waitForSessionPersistence(supabase, {
          attempts: 4,
          delayMs: 120,
        });

        if (session && isSessionExpiringSoon(session)) {
          setStatus("A renovar sessão...");
          const { data, error } = await supabase.auth.refreshSession();
          if (debugAuth) {
            console.info("[auth.debug] refresh on recovery", {
              pathname,
              refreshed: !!data.session,
              error: error?.message || null,
            });
          }
          if (data.session) {
            session = data.session;
          }
        }

        if (cancelled) return;

        if (session) {
          clearRecoveryAttemptCount(storageKey);
          router.refresh();
          return;
        }

        router.replace("/login");
      } catch (error) {
        if (debugAuth) {
          console.error("[auth.debug] recovery failed", {
            pathname,
            error,
          });
        }
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    void recoverSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, supabase]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <Loader2 size={24} className="animate-spin text-emerald-600" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{status}</p>
          <p className="text-xs text-slate-500">
            A validar a tua sessão antes de reabrir a app.
          </p>
        </div>
      </div>
    </div>
  );
}
