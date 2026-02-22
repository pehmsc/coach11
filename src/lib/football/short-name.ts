const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
]);

const GENERIC_WORDS = new Set([
  "clube",
  "club",
  "futebol",
  "football",
  "futebolclube",
  "footballclub",
]);

const OPTIONAL_SUFFIX_WORDS = new Set([
  "fc",
  "sc",
  "ac",
  "cd",
  "cf",
  "cp",
  "ud",
  "afc",
]);

function sanitize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim();
}

export function normalizeShortName(value: string | null | undefined, maxLength = 5) {
  if (typeof value !== "string") return null;
  const cleaned = sanitize(value).replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function normalizeManualShortName(value: string | null | undefined, maxLength = 5) {
  return normalizeShortName(value, maxLength);
}

export function isValidManualShortName(
  value: string | null | undefined,
  minLength = 2,
  maxLength = 5,
) {
  const normalized = normalizeManualShortName(value, maxLength);
  if (!normalized) return true;
  return normalized.length >= minLength && normalized.length <= maxLength;
}

export function deriveShortName(name: string | null | undefined, maxLength = 3) {
  if (typeof name !== "string") return null;
  const cleaned = sanitize(name);
  if (!cleaned) return null;

  const words = cleaned
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  const withoutStopWords = words.filter(
    (word) => !STOP_WORDS.has(word.toLowerCase()),
  );
  const sourceAfterStops = withoutStopWords.length > 0 ? withoutStopWords : words;

  // Remove termos genéricos ("Clube", "Futebol") apenas quando existem outras palavras relevantes.
  const withoutGenericWords = sourceAfterStops.filter(
    (word) => !GENERIC_WORDS.has(word.toLowerCase()),
  );
  const sourceAfterGeneric =
    withoutGenericWords.length > 0 ? withoutGenericWords : sourceAfterStops;

  // Remove sufixos comuns (FC/SC/...) só quando sobrarem pelo menos 2 palavras.
  const withoutOptionalSuffixes = sourceAfterGeneric.filter(
    (word) => !OPTIONAL_SUFFIX_WORDS.has(word.toLowerCase()),
  );
  const sourceWords =
    withoutOptionalSuffixes.length >= 2 ? withoutOptionalSuffixes : sourceAfterGeneric;

  if (sourceWords.length === 1) {
    return sourceWords[0].slice(0, maxLength).toUpperCase();
  }

  return sourceWords
    .slice(0, maxLength)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("")
    .slice(0, maxLength);
}

export function resolveShortName(
  preferred: string | null | undefined,
  fallbackName: string | null | undefined,
  fallbackLiteral = "---",
) {
  return (
    normalizeShortName(preferred) ||
    deriveShortName(fallbackName) ||
    fallbackLiteral
  );
}
