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

export function extractTimeFromDateTime(value: string | null | undefined) {
  if (typeof value !== "string") return null;

  const isoMatch = /T(\d{2}:\d{2})/.exec(value.trim());
  if (isoMatch) return isoMatch[1];

  return normalizeTimeValue(value);
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
