/**
 * Testes do schema partilhado de password (fonte única do mínimo — SEC-05).
 * Usado no registo e na definição de nova password (/auth/update-password).
 */

import { describe, it, expect } from "vitest";
import { passwordSchema } from "../lib/auth/password-schema";

describe("passwordSchema", () => {
  it("rejeita passwords com menos de 10 caracteres", () => {
    expect(passwordSchema.safeParse("").success).toBe(false);
    expect(passwordSchema.safeParse("123456789").success).toBe(false);
  });

  it("aceita passwords com 10 ou mais caracteres", () => {
    expect(passwordSchema.safeParse("1234567890").success).toBe(true);
    expect(passwordSchema.safeParse("uma password bem comprida").success).toBe(true);
  });

  it("rejeita passwords com mais de 200 caracteres", () => {
    expect(passwordSchema.safeParse("a".repeat(200)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(201)).success).toBe(false);
  });

  it("devolve mensagem de erro em português no mínimo", () => {
    const result = passwordSchema.safeParse("curta");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "A password deve ter pelo menos 10 caracteres.",
      );
    }
  });
});
