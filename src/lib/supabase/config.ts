export const SUPABASE_AUTH_COOKIE_OPTIONS = {
  name: "coach11-auth-token",
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  secure: true,
};
