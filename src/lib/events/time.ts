export function normalizeTimeValue(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

export function buildDateTimeFromDateAndTime(
  date: string | null | undefined,
  time: string | null | undefined,
) {
  if (typeof date !== "string" || !date.trim()) return null;
  return `${date.trim()}T${normalizeTimeValue(time) || "00:00"}:00`;
}

/**
 * Extrai HH:MM de um valor de data/hora.
 *
 * - Se o valor incluir indicador de timezone (Z, +XX, -XX), converte
 *   para `timeZone` (default Europe/Lisbon) via Intl.DateTimeFormat.
 *   Em PT (DST+1), "2026-05-23T08:00:00+00" -> "09:00".
 * - Se for ISO naive (sem timezone) ou string HH:MM, extrai
 *   literalmente (fallback legacy).
 *
 * `timeZone` aceita qualquer IANA TZ. Default Europe/Lisbon porque
 * Coach11 e 100% PT hoje; quando internacionalizar (PR futuro), o
 * caller passa o timezone do clube/escalao.
 */
export function extractTimeFromDateTime(
  value: string | null | undefined,
  timeZone: string = "Europe/Lisbon",
) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  // Detecta indicador de timezone ISO 8601: Z, +HH, +HHMM, +HH:MM (idem -).
  // Aceita ambas as formas curtas (Postgres serializa por vezes como "+00")
  // e completas (Supabase PostgREST normalmente devolve "+00:00").
  const hasTimezone =
    /T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(
      trimmed,
    );

  if (hasTimezone) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      // en-GB com hour12:false garante saida "HH:MM" 24h.
      return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }
    // Fall through ao fallback se Date() falhou
  }

  // Fallback: ISO naive (sem TZ) ou string HH:MM literal.
  const isoMatch = /T(\d{2}:\d{2})/.exec(trimmed);
  if (isoMatch) return isoMatch[1];

  return normalizeTimeValue(trimmed);
}

export function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  const start = normalizeTimeValue(startTime);
  const end = normalizeTimeValue(endTime);

  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return "--:--";
}

export function addMinutesToTime(
  time: string | null | undefined,
  minutesToAdd: number,
) {
  const normalized = normalizeTimeValue(time);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const totalMinutes = ((hours * 60 + minutes + minutesToAdd) % 1440 + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");

  return `${nextHours}:${nextMinutes}`;
}
