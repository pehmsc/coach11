import { describe, expect, it } from "vitest";
import { extractTimeFromDateTime } from "./time";

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
