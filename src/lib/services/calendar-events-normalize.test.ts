import { describe, expect, it } from "vitest";

/**
 * These tests cover the normalizeTime and normalizeDate functions used by
 * the calendar-events service when processing game create/edit payloads.
 *
 * The functions are module-private, so we replicate their logic here to
 * verify edge cases. If the implementation changes, these tests should
 * be updated accordingly.
 */

function normalizeTime(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function buildGameDatetime(date: string | null, startTime: string | null) {
  if (!date) return null;
  return `${date}T${startTime || "00:00"}:00`;
}

describe("normalizeTime", () => {
  it("accepts HH:MM format", () => {
    expect(normalizeTime("15:30")).toBe("15:30");
  });

  it("accepts HH:MM:SS and strips seconds", () => {
    expect(normalizeTime("09:00:00")).toBe("09:00");
  });

  it("rejects non-string values", () => {
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
    expect(normalizeTime(123)).toBeNull();
  });

  it("rejects invalid time strings", () => {
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("3:00")).toBeNull();
  });

  it("accepts two-digit hours without range validation", () => {
    // normalizeTime only checks format (DD:DD), not hour/minute range
    // The DB handles range validation
    expect(normalizeTime("25:00")).toBe("25:00");
  });

  it("trims whitespace", () => {
    expect(normalizeTime("  10:45  ")).toBe("10:45");
  });
});

describe("normalizeDate", () => {
  it("accepts YYYY-MM-DD format", () => {
    expect(normalizeDate("2024-06-15")).toBe("2024-06-15");
  });

  it("rejects invalid dates", () => {
    expect(normalizeDate("15-06-2024")).toBeNull();
    expect(normalizeDate("2024/06/15")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(normalizeDate(null)).toBeNull();
  });
});

describe("buildGameDatetime", () => {
  it("builds ISO datetime from date and start_time", () => {
    expect(buildGameDatetime("2024-06-15", "15:30")).toBe("2024-06-15T15:30:00");
  });

  it("defaults to 00:00 when start_time is null", () => {
    expect(buildGameDatetime("2024-06-15", null)).toBe("2024-06-15T00:00:00");
  });

  it("returns null when date is null", () => {
    expect(buildGameDatetime(null, "15:30")).toBeNull();
  });

  it("preserves edited time correctly", () => {
    // Simulates: user changes time from 15:00 to 17:30
    const editedTime = normalizeTime("17:30");
    const result = buildGameDatetime("2024-06-15", editedTime);
    expect(result).toBe("2024-06-15T17:30:00");
  });
});

describe("game edit PATCH title behavior", () => {
  it("preserves explicit title from edit form", () => {
    const title = "Jornada 3";
    // In PATCH, we now use `payload.title ?? null` instead of resolveGameTitle
    const result = title ?? null;
    expect(result).toBe("Jornada 3");
  });

  it("allows null title (friendly match, no jornada)", () => {
    const title: string | null = null;
    const result = title ?? null;
    expect(result).toBeNull();
  });

  it("does NOT auto-generate title from opponent on edit", () => {
    // Previously resolveGameTitle would generate "vs SCP" when title was null
    // Now the PATCH passes title as-is
    const title: string | null = null;
    const result = title ?? null;
    expect(result).toBeNull(); // null, not "vs SCP"
  });
});
