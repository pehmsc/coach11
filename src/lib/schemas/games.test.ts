import { describe, expect, it } from "vitest";
import { gameUpdateSchema } from "./games";

describe("gameUpdateSchema", () => {
  describe("game_datetime (wall-clock PT, sem indicador de fuso)", () => {
    it("aceita YYYY-MM-DDTHH:MM:SS", () => {
      const result = gameUpdateSchema.safeParse({
        game_datetime: "2026-05-30T12:00:00",
      });
      expect(result.success).toBe(true);
    });

    it("aceita YYYY-MM-DDTHH:MM (sem segundos)", () => {
      const result = gameUpdateSchema.safeParse({
        game_datetime: "2026-05-30T12:00",
      });
      expect(result.success).toBe(true);
    });

    it("rejeita ISO com Z (UTC) — coluna ja nao e timestamptz", () => {
      const result = gameUpdateSchema.safeParse({
        game_datetime: "2024-06-15T14:45:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejeita ISO com offset", () => {
      const result = gameUpdateSchema.safeParse({
        game_datetime: "2024-06-15T15:45:00+01:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejeita string vazia", () => {
      const result = gameUpdateSchema.safeParse({ game_datetime: "" });
      expect(result.success).toBe(false);
    });

    it("rejeita o bug 'nullT...'", () => {
      const result = gameUpdateSchema.safeParse({
        game_datetime: "nullT15:00:00",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("end_time", () => {
    it("accepts HH:mm format", () => {
      const result = gameUpdateSchema.safeParse({ end_time: "14:30" });
      expect(result.success).toBe(true);
    });

    it("accepts HH:mm:ss format", () => {
      const result = gameUpdateSchema.safeParse({ end_time: "14:30:00" });
      expect(result.success).toBe(true);
    });

    it("accepts null", () => {
      const result = gameUpdateSchema.safeParse({ end_time: null });
      expect(result.success).toBe(true);
    });

    it("rejects ISO datetime for end_time", () => {
      const result = gameUpdateSchema.safeParse({
        end_time: "2024-06-15T14:30:00.000Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode", () => {
    it("rejects unknown fields (game_date_time typo)", () => {
      const result = gameUpdateSchema.safeParse({
        game_date_time: "2026-05-30T15:00:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields (start_time — belongs to calendar service)", () => {
      const result = gameUpdateSchema.safeParse({
        start_time: "15:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields (date — belongs to calendar service)", () => {
      const result = gameUpdateSchema.safeParse({
        date: "2026-05-30",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("valid full payload", () => {
    it("accepts a complete edit payload", () => {
      const result = gameUpdateSchema.safeParse({
        title: "Jornada 5",
        game_datetime: "2026-05-30T15:45:00",
        end_time: "17:30",
        opponent_name: "SL Benfica",
        opponent_short_name: "SLB",
        competition_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        location: "Estádio da Luz",
        latitude: 38.7527,
        longitude: -9.1847,
        is_home: false,
        notes: "Jogo importante",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.game_datetime).toBe("2026-05-30T15:45:00");
        expect(result.data.end_time).toBe("17:30");
      }
    });

    it("accepts empty object (no fields to update)", () => {
      const result = gameUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.data as Record<string, unknown>).length).toBe(0);
      }
    });
  });
});
