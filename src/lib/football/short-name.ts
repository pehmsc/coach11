const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
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
  const cleaned = sanitize(value).replace(/\s+/g, " ").toUpperCase();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function deriveShortName(name: string | null | undefined, maxLength = 3) {
  if (typeof name !== "string") return null;
  const cleaned = sanitize(name);
  if (!cleaned) return null;

  const words = cleaned
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  const significantWords = words.filter(
    (word) => !STOP_WORDS.has(word.toLowerCase()),
  );
  const sourceWords = significantWords.length > 0 ? significantWords : words;

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
