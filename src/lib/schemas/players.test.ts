import { describe, expect, it } from "vitest";
import { playerUpdateSchema } from "./players";

describe("playerUpdateSchema", () => {
  it("[1] payload completo válido faz parse OK", () => {
    const result = playerUpdateSchema.safeParse({
      first_name: "João",
      last_name: "Silva",
      birth_date: "2010-04-15",
      preferred_position: "MC",
      secondary_position: "MO",
      jersey_number: 7,
      phone: "910000000",
      email: "joao@example.com",
      notes: "Observação curta.",
      parent_email: "pai@example.com",
      parent_phone: "920000000",
      status: "active",
      photo_consent_given: true,
    });
    expect(result.success).toBe(true);
  });

  it("[2] email inválido produz erro no campo email", () => {
    const result = playerUpdateSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("[3] email string vazia é transformado para null", () => {
    const result = playerUpdateSchema.safeParse({ email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeNull();
  });

  it("[4] parent_email string vazia é transformado para null", () => {
    const result = playerUpdateSchema.safeParse({ parent_email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parent_email).toBeNull();
  });

  it("[5] jersey_number = 100 produz erro", () => {
    const result = playerUpdateSchema.safeParse({ jersey_number: 100 });
    expect(result.success).toBe(false);
  });

  it("[6] birth_date com formato errado produz erro", () => {
    const result = playerUpdateSchema.safeParse({
      birth_date: "2024-13-01-bad",
    });
    expect(result.success).toBe(false);
  });

  it("[7] preferred_position fora do enum produz erro", () => {
    const result = playerUpdateSchema.safeParse({
      preferred_position: "XX",
    });
    expect(result.success).toBe(false);
  });

  it("[8] notes com 2001 caracteres produz erro", () => {
    const result = playerUpdateSchema.safeParse({
      notes: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("[9] status inválido produz erro", () => {
    const result = playerUpdateSchema.safeParse({ status: "retired" });
    expect(result.success).toBe(false);
  });

  it("[10] strict mode rejeita campos desconhecidos", () => {
    const result = playerUpdateSchema.safeParse({
      avatar_url: "https://example.com/x.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("invite_* fields preservados (compat com flow existente)", () => {
    const result = playerUpdateSchema.safeParse({
      invite_code: "ABC12345",
      invite_method: "email",
      invite_sent_at: "2026-04-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("photo_consent_given boolean válido", () => {
    expect(
      playerUpdateSchema.safeParse({ photo_consent_given: false }).success,
    ).toBe(true);
    expect(
      playerUpdateSchema.safeParse({ photo_consent_given: "yes" }).success,
    ).toBe(false);
  });

  it("payload vazio é aceite (handler lida com 'sem alterações')", () => {
    expect(playerUpdateSchema.safeParse({}).success).toBe(true);
  });
});
