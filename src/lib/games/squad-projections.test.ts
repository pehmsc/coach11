import { describe, expect, it } from "vitest";
import {
  PUBLIC_SQUAD_COLUMNS,
  INTERNAL_SQUAD_COLUMNS,
} from "./squad-projections";
import { assertNoSensitiveFields } from "../../types/squad";

describe("squad-projections (anti-leak)", () => {
  const BANNED_TERMS_IN_PUBLIC = [
    "initial_lineup_status",
    "lineup_status",
    "is_present",
    "data_quality",
    "evaluation_rating",
    "evaluation_notes",
    "is_mvp",
  ];

  it("[1] PUBLIC_SQUAD_COLUMNS NÃO inclui termos sensíveis", () => {
    const lower = PUBLIC_SQUAD_COLUMNS.toLowerCase();
    for (const term of BANNED_TERMS_IN_PUBLIC) {
      expect(
        lower.includes(term),
        `PUBLIC_SQUAD_COLUMNS leak: contém '${term}'`,
      ).toBe(false);
    }
  });

  it("[2] PUBLIC_SQUAD_COLUMNS contém campos esperados (sanidade)", () => {
    const lower = PUBLIC_SQUAD_COLUMNS.toLowerCase();
    expect(lower).toContain("id");
    expect(lower).toContain("game_id");
    expect(lower).toContain("external_name");
    expect(lower).toContain("jersey_number");
    expect(lower).toContain("response_status");
  });

  it("[3] INTERNAL_SQUAD_COLUMNS inclui campos sensíveis (oposto)", () => {
    const lower = INTERNAL_SQUAD_COLUMNS.toLowerCase();
    expect(lower).toContain("initial_lineup_status");
    expect(lower).toContain("is_present");
    expect(lower).toContain("data_quality");
  });

  it("[4] PUBLIC_SQUAD_COLUMNS é um subset estricto de INTERNAL_SQUAD_COLUMNS", () => {
    const publicCols = new Set(
      PUBLIC_SQUAD_COLUMNS.split(",").map((s) => s.trim().toLowerCase()),
    );
    const internalCols = new Set(
      INTERNAL_SQUAD_COLUMNS.split(",").map((s) => s.trim().toLowerCase()),
    );
    for (const col of publicCols) {
      expect(internalCols.has(col), `Campo '${col}' não está em INTERNAL`).toBe(
        true,
      );
    }
    expect(publicCols.size).toBeLessThan(internalCols.size);
  });
});

describe("assertNoSensitiveFields", () => {
  it("[1] passa para payload público válido", () => {
    expect(() =>
      assertNoSensitiveFields({
        id: "abc",
        game_id: "g1",
        player_id: null,
        external_name: "Outro",
        jersey_number: 7,
      }),
    ).not.toThrow();
  });

  it("[2] throws se incluir initial_lineup_status", () => {
    expect(() =>
      assertNoSensitiveFields({
        id: "abc",
        initial_lineup_status: "starter",
      }),
    ).toThrow(/initial_lineup_status/);
  });

  it("[3] throws se incluir lineup_status (legacy)", () => {
    expect(() =>
      assertNoSensitiveFields({ id: "abc", lineup_status: "on_field" }),
    ).toThrow(/lineup_status/);
  });

  it("[4] throws se incluir is_present", () => {
    expect(() =>
      assertNoSensitiveFields({ id: "abc", is_present: true }),
    ).toThrow(/is_present/);
  });

  it("[5] throws se incluir is_mvp", () => {
    expect(() =>
      assertNoSensitiveFields({ id: "abc", is_mvp: false }),
    ).toThrow(/is_mvp/);
  });

  it("[6] throws se incluir data_quality", () => {
    expect(() =>
      assertNoSensitiveFields({ id: "abc", data_quality: "authoritative" }),
    ).toThrow(/data_quality/);
  });

  it("[7] no-op para null/undefined", () => {
    expect(() => assertNoSensitiveFields(null)).not.toThrow();
    expect(() => assertNoSensitiveFields(undefined)).not.toThrow();
  });
});
