import { SUPABASE_AUTH_COOKIE_OPTIONS } from "@/lib/supabase/config";

type CookieLike = {
  name: string;
};

export function hasSupabaseAuthCookies(cookies: CookieLike[]) {
  const baseName = SUPABASE_AUTH_COOKIE_OPTIONS.name;

  return cookies.some(
    (cookie) =>
      cookie.name === baseName || cookie.name.startsWith(`${baseName}.`),
  );
}
