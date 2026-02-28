const SUPABASE_AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const SUPABASE_AUTH_COOKIE_OPTIONS = {
  name: "coach11-auth-token",
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: SUPABASE_AUTH_COOKIE_MAX_AGE,
};
