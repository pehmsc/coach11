import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractTimeFromDateTime,
  formatGameDateTime,
  formatGameDateTimeParts,
  parseGameDateTime,
  toPortugalDateKey,
  toPortugalWallClock,
} from "./time";

// game_datetime e wall-clock PT — todas as funcoes devem produzir o mesmo
// resultado em qualquer TZ de runtime. Forcamos TZ=UTC para simular Vercel
// (onde o bug invertido apareceria) e garantir que nada depende do fuso do
// processo.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("extractTimeFromDateTime — wall-clock literal", () => {
  it("extrai HH:MM com separador T", () => {
    expect(extractTimeFromDateTime("2026-05-30T12:00:00")).toBe("12:00");
    expect(extractTimeFromDateTime("2026-05-30T09:30:00")).toBe("09:30");
  });

  it("aceita formato com espaco em vez de T (legacy PostgREST)", () => {
    expect(extractTimeFromDateTime("2026-05-30 12:00:00")).toBe("12:00");
  });

  it("aceita HH:MM/HH:MM:SS isolado", () => {
    expect(extractTimeFromDateTime("08:00")).toBe("08:00");
    expect(extractTimeFromDateTime("08:00:00")).toBe("08:00");
  });

  it("devolve null para input null/undefined/nao-string", () => {
    expect(extractTimeFromDateTime(null)).toBeNull();
    expect(extractTimeFromDateTime(undefined)).toBeNull();
    // @ts-expect-error defensivo
    expect(extractTimeFromDateTime(123)).toBeNull();
  });
});

describe("formatGameDateTime — runtime UTC nao altera hora local", () => {
  const SUMMER_INPUT = "2026-05-30T12:00:00"; // PT verao (DST)
  const WINTER_INPUT = "2026-01-15T08:00:00"; // PT inverno

  it("longWithoutYear", () => {
    expect(formatGameDateTime(SUMMER_INPUT, "longWithoutYear")).toBe(
      "sábado, 30 de maio · 12:00",
    );
  });

  it("longWithYear", () => {
    expect(formatGameDateTime(SUMMER_INPUT, "longWithYear")).toBe(
      "sábado, 30 de maio de 2026 · 12:00",
    );
  });

  it("shortWithYear", () => {
    expect(formatGameDateTime(SUMMER_INPUT, "shortWithYear")).toBe(
      "30/05/2026 · 12:00",
    );
  });

  it("shortWithoutYear", () => {
    expect(formatGameDateTime(SUMMER_INPUT, "shortWithoutYear")).toBe(
      "30/05 · 12:00",
    );
  });

  it("monthYear", () => {
    expect(formatGameDateTime(SUMMER_INPUT, "monthYear")).toBe("maio de 2026");
  });

  it("preserva hora inverno (sem deslocacao por DST)", () => {
    expect(formatGameDateTime(WINTER_INPUT, "shortWithoutYear")).toBe(
      "15/01 · 08:00",
    );
  });

  it("NAO desloca 1h em TZ=UTC (bug invertido teria '11:00' ou '13:00')", () => {
    const result = formatGameDateTime(SUMMER_INPUT, "shortWithoutYear");
    expect(result).toContain("12:00");
    expect(result).not.toContain("11:00");
    expect(result).not.toContain("13:00");
  });
});

describe("formatGameDateTime — edge cases", () => {
  it("devolve fallback para null/undefined/vazio", () => {
    expect(formatGameDateTime(null, "longWithoutYear")).toBe("Data por definir");
    expect(formatGameDateTime(undefined, "longWithoutYear")).toBe(
      "Data por definir",
    );
    expect(formatGameDateTime("   ", "longWithoutYear")).toBe(
      "Data por definir",
    );
  });

  it("devolve input original se parse falha", () => {
    expect(formatGameDateTime("not-a-date", "longWithoutYear")).toBe(
      "not-a-date",
    );
  });
});

describe("formatGameDateTimeParts", () => {
  it("decompoe em day/monthShort/time", () => {
    expect(formatGameDateTimeParts("2026-05-30T12:00:00")).toEqual({
      day: "30",
      monthShort: "mai",
      time: "12:00",
    });
  });

  it("aceita formato com espaco", () => {
    expect(formatGameDateTimeParts("2026-05-30 12:00:00")).toEqual({
      day: "30",
      monthShort: "mai",
      time: "12:00",
    });
  });

  it("devolve null para input invalido", () => {
    expect(formatGameDateTimeParts(null)).toBeNull();
    expect(formatGameDateTimeParts(undefined)).toBeNull();
    expect(formatGameDateTimeParts("  ")).toBeNull();
    expect(formatGameDateTimeParts("not-a-date")).toBeNull();
  });
});

describe("parseGameDateTime — wall-clock PT -> instante UTC correcto", () => {
  it("Maio em PT (DST UTC+1): 12:00 wall-clock = 11:00 UTC", () => {
    const d = parseGameDateTime("2026-05-30T12:00:00");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-05-30T11:00:00.000Z");
  });

  it("Janeiro em PT (WET UTC+0): 08:00 wall-clock = 08:00 UTC", () => {
    const d = parseGameDateTime("2026-01-15T08:00:00");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("devolve null para input invalido", () => {
    expect(parseGameDateTime(null)).toBeNull();
    expect(parseGameDateTime("garbage")).toBeNull();
  });
});

describe("toPortugalWallClock — Date -> string PT", () => {
  it("12:00 UTC em maio = 13:00 PT", () => {
    const date = new Date("2026-05-30T12:00:00.000Z");
    expect(toPortugalWallClock(date)).toBe("2026-05-30T13:00:00");
  });

  it("08:00 UTC em janeiro = 08:00 PT (sem DST)", () => {
    const date = new Date("2026-01-15T08:00:00.000Z");
    expect(toPortugalWallClock(date)).toBe("2026-01-15T08:00:00");
  });
});

describe("toPortugalDateKey", () => {
  it("23:30 UTC em maio = dia seguinte em PT", () => {
    // 2026-05-30T23:30:00Z = 2026-05-31T00:30 PT (DST +1)
    const date = new Date("2026-05-30T23:30:00.000Z");
    expect(toPortugalDateKey(date)).toBe("2026-05-31");
  });
});
