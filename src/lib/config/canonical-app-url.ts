const DEV_FALLBACK_APP_URL = "http://localhost:3000";

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_URL_INVALID_PROTOCOL");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function getCanonicalAppUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured =
    env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim() || null;

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  if (env.NODE_ENV === "production") {
    throw new Error("APP_URL_MISSING");
  }

  return DEV_FALLBACK_APP_URL;
}
