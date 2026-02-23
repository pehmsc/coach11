const DEFAULT_FALLBACK_PATH = "/dashboard";
const SAFE_BASE_ORIGIN = "https://coach11.local";

function normalizeInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasBlockedRawPattern(value: string) {
  const lowered = value.toLowerCase();
  return (
    lowered.startsWith("http:") ||
    lowered.startsWith("https:") ||
    lowered.includes("%2f%2f")
  );
}

function isSafeInternalPath(value: string) {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("\r") || value.includes("\n")) return false;

  try {
    const parsed = new URL(value, SAFE_BASE_ORIGIN);
    return parsed.origin === SAFE_BASE_ORIGIN;
  } catch {
    return false;
  }
}

function resolveFallbackPath(fallbackPath: string) {
  return isSafeInternalPath(fallbackPath) ? fallbackPath : DEFAULT_FALLBACK_PATH;
}

export function sanitizeNextPath(
  rawNext: string | null | undefined,
  fallbackPath = DEFAULT_FALLBACK_PATH,
) {
  const fallback = resolveFallbackPath(fallbackPath);
  if (typeof rawNext !== "string") return fallback;

  const rawValue = normalizeInput(rawNext);
  if (!rawValue) return fallback;
  if (hasBlockedRawPattern(rawValue)) return fallback;
  if (isSafeInternalPath(rawValue)) return rawValue;

  try {
    const decoded = normalizeInput(decodeURIComponent(rawValue));
    if (!decoded) return fallback;
    if (hasBlockedRawPattern(decoded)) return fallback;
    if (isSafeInternalPath(decoded)) return decoded;
  } catch {
    // Ignore decode failures and fallback.
  }

  return fallback;
}
