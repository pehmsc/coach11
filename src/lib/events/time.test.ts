import { describe, expect, it } from "vitest";
import {
  extractTimeFromDateTime,
  formatGameDateTime,
  formatGameDateTimeParts,
} from "./time";

describe("extractTimeFromDateTime", () => {
  describe("ISO com timezone — converte para Europe/Lisbon (default)", () => {
    it("converte UTC para Lisbon DST (Mai = UTC+1)", () => {
      expect(extractTimeFromDateTime("2026-05-23T08:00:00+00:00")).toBe(
        "09:00",
      );
    });

    it("converte UTC para Lisbon winter (Jan = UTC+0)", () => {
      expect(extractTimeFromDateTime("2026-01-15T08:00:00+00:00")).toBe(
        "08:00",
      );
    });

    it("aceita sufixo Z", () => {
      expect(extractTimeFromDateTime("2026-05-23T08:00:00.000Z")).toBe("09:00");
    });

    it("aceita +HHMM (sem dois pontos)", () => {
      expect(extractTimeFromDateTime("2026-05-23T08:00:00+0000")).toBe("09:00");
    });

    it("aceita offset positivo (já em Lisbon)", () => {
      expect(extractTimeFromDateTime("2026-05-23T09:00:00+01:00")).toBe(
        "09:00",
      );
    });

    it("aceita offset negativo", () => {
      expect(extractTimeFromDateTime("2026-05-23T03:00:00-05:00")).toBe(
        "09:00",
      );
    });

    it("respeita timezone explícito passado como parâmetro", () => {
      expect(
        extractTimeFromDateTime("2026-05-23T08:00:00+00:00", "UTC"),
      ).toBe("08:00");
      expect(
        extractTimeFromDateTime("2026-05-23T08:00:00+00:00", "America/New_York"),
      ).toBe("04:00");
    });
  });

  describe("Sem timezone — fallback legacy (extracção literal)", () => {
    it("extrai HH:MM de ISO naive", () => {
      expect(extractTimeFromDateTime("2026-05-23T08:00:00")).toBe("08:00");
    });

    it("normaliza string HH:MM", () => {
      expect(extractTimeFromDateTime("08:00")).toBe("08:00");
    });

    it("normaliza string HH:MM:SS", () => {
      expect(extractTimeFromDateTime("08:00:00")).toBe("08:00");
    });
  });

  describe("Edge cases", () => {
    it("devolve null para input null", () => {
      expect(extractTimeFromDateTime(null)).toBeNull();
    });

    it("devolve null para input undefined", () => {
      expect(extractTimeFromDateTime(undefined)).toBeNull();
    });

    it("devolve null para input não-string", () => {
      // @ts-expect-error testando defensivamente
      expect(extractTimeFromDateTime(123)).toBeNull();
    });
  });
});

describe("formatGameDateTime", () => {
  // 2026-05-24T17:20:00Z = 2026-05-24 18:20 Lisboa (DST WEST +1)
  const DST_INPUT = "2026-05-24T17:20:00+00:00";
  // 2026-01-15T08:00:00Z = 2026-01-15 08:00 Lisboa (WET +0)
  const WINTER_INPUT = "2026-01-15T08:00:00+00:00";

  describe("variantes — DST (Mai = UTC+1)", () => {
    it("longWithoutYear", () => {
      expect(formatGameDateTime(DST_INPUT, "longWithoutYear")).toBe(
        "domingo, 24 de maio · 18:20",
      );
    });

    it("longWithYear", () => {
      expect(formatGameDateTime(DST_INPUT, "longWithYear")).toBe(
        "domingo, 24 de maio de 2026 · 18:20",
      );
    });

    it("shortWithYear", () => {
      // Intl pt-PT (Node ICU) produz formato dd/mm/yyyy para month: "short".
      // Aceitamos este desvio vs antigo date-fns "d MMM yyyy" para ganhar
      // consistencia de timezone — diferenca minima em PT.
      expect(formatGameDateTime(DST_INPUT, "shortWithYear")).toBe(
        "24/05/2026 · 18:20",
      );
    });

    it("shortWithoutYear", () => {
      expect(formatGameDateTime(DST_INPUT, "shortWithoutYear")).toBe(
        "24/05 · 18:20",
      );
    });

    it("monthYear", () => {
      expect(formatGameDateTime(DST_INPUT, "monthYear")).toBe("maio de 2026");
    });
  });

  describe("variantes — Winter (Jan = UTC+0)", () => {
    it("longWithoutYear sem shift quando WET", () => {
      expect(formatGameDateTime(WINTER_INPUT, "longWithoutYear")).toBe(
        "quinta-feira, 15 de janeiro · 08:00",
      );
    });
  });

  describe("Edge case — meia-noite UTC em Lisboa DST cai no dia seguinte", () => {
    // 2026-05-24T23:30:00Z = 2026-05-25 00:30 Lisboa
    it("agrupa correctamente no dia local, nao no dia UTC", () => {
      expect(
        formatGameDateTime("2026-05-24T23:30:00+00:00", "shortWithoutYear"),
      ).toBe("25/05 · 00:30");
    });
  });

  describe("Edge cases — null/undefined/invalid", () => {
    it("devolve fallback para input null", () => {
      expect(formatGameDateTime(null, "longWithoutYear")).toBe("Data por definir");
    });

    it("devolve fallback para input undefined", () => {
      expect(formatGameDateTime(undefined, "longWithoutYear")).toBe(
        "Data por definir",
      );
    });

    it("devolve fallback para string vazia", () => {
      expect(formatGameDateTime("   ", "longWithoutYear")).toBe(
        "Data por definir",
      );
    });

    it("devolve o input original quando parse falha", () => {
      expect(formatGameDateTime("not-a-date", "longWithoutYear")).toBe(
        "not-a-date",
      );
    });
  });

  describe("timeZone parametrizado", () => {
    it("respeita timezone explicito", () => {
      expect(
        formatGameDateTime(DST_INPUT, "shortWithoutYear", "UTC"),
      ).toBe("24/05 · 17:20");
    });
  });
});

describe("formatGameDateTimeParts", () => {
  // 2026-05-24T17:20:00Z = 2026-05-24 18:20 Lisboa (DST)
  const DST_INPUT = "2026-05-24T17:20:00+00:00";

  it("decompoe em day/monthShort/time com TZ Lisbon (DST)", () => {
    expect(formatGameDateTimeParts(DST_INPUT)).toEqual({
      day: "24",
      monthShort: "mai",
      time: "18:20",
    });
  });

  it("aplica shift de dia quando UTC cai no dia seguinte em Lisbon DST", () => {
    // 2026-05-24T23:30Z = 2026-05-25 00:30 Lisboa
    expect(formatGameDateTimeParts("2026-05-24T23:30:00+00:00")).toEqual({
      day: "25",
      monthShort: "mai",
      time: "00:30",
    });
  });

  it("respeita timezone explicito (UTC mantem o numero raw)", () => {
    expect(formatGameDateTimeParts(DST_INPUT, "UTC")).toEqual({
      day: "24",
      monthShort: "mai",
      time: "17:20",
    });
  });

  it("devolve null para input null/undefined/invalid", () => {
    expect(formatGameDateTimeParts(null)).toBeNull();
    expect(formatGameDateTimeParts(undefined)).toBeNull();
    expect(formatGameDateTimeParts("  ")).toBeNull();
    expect(formatGameDateTimeParts("not-a-date")).toBeNull();
  });
});
