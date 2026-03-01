import type { Session, SupabaseClient } from "@supabase/supabase-js";

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isSessionExpiringSoon(
  session: Session | null,
  thresholdSeconds = 5 * 60,
) {
  const expiresAt = session?.expires_at;
  if (!expiresAt) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds <= thresholdSeconds;
}

export async function waitForSessionPersistence(
  supabase: SupabaseClient,
  options?: {
    attempts?: number;
    delayMs?: number;
  },
) {
  const attempts = options?.attempts ?? 8;
  const delayMs = options?.delayMs ?? 80;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      return session;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}
