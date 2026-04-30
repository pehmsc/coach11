export const PORTUGAL_TIMEZONE = "Europe/Lisbon";

export type PresencePromptState = "hidden" | "mark" | "close" | "closed";

function parseDateParts(dateValue: string | null | undefined) {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;

  const [year, month, day] = dateValue.split("-").map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return { year, month, day };
}

function parseTimeParts(timeValue: string | null | undefined) {
  if (!timeValue) return null;

  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeValue.trim());
  if (!match) return null;

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? "0"),
  };
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/**
 * Extrai a data calendário (YYYY-MM-DD) no timezone Europe/Lisbon a partir
 * de um timestamp ISO (com ou sem timezone). Devolve `null` se inválido.
 */
export function getPortugalDateKey(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PORTUGAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (!lookup.year || !lookup.month || !lookup.day) return null;
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/**
 * Formata um timestamp ISO como `HH:mm` no timezone Europe/Lisbon.
 * Devolve `null` se inválido.
 */
export function formatPortugalTime(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: PORTUGAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function portugalDateTimeToUtc(
  dateValue: string | null | undefined,
  timeValue: string | null | undefined,
) {
  const dateParts = parseDateParts(dateValue);
  const timeParts = parseTimeParts(timeValue);
  if (!dateParts || !timeParts) return null;

  const approxUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
  );
  const approxUtcDate = new Date(approxUtcMs);
  const zonedParts = getDatePartsInTimezone(approxUtcDate, PORTUGAL_TIMEZONE);
  const zonedUtcMs = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second,
  );

  return new Date(approxUtcMs - (zonedUtcMs - approxUtcMs));
}

export function shouldShowPresencePrompt(
  dateValue: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  status: string | null | undefined,
  now = new Date(),
) {
  const state = getPresencePromptState(
    dateValue,
    startTime,
    endTime,
    status,
    now,
  );

  return state === "mark" || state === "close";
}

export function getPresencePromptState(
  dateValue: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  status: string | null | undefined,
  now = new Date(),
): PresencePromptState {
  if (status === "completed") return "closed";

  const startAt = portugalDateTimeToUtc(dateValue, startTime);
  if (!startAt) return "hidden";

  const effectiveEndAt =
    portugalDateTimeToUtc(dateValue, endTime) ??
    new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
  const promptStartsAt = new Date(startAt.getTime() - 10 * 60 * 1000);

  if (now < promptStartsAt) return "hidden";
  if (now < effectiveEndAt) return "mark";
  return "close";
}
