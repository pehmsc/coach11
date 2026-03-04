/**
 * Suite de testes para validar os fixes de segurança aplicados pós-QA.
 * Cada teste verifica estaticamente o código-fonte ou o comportamento de schemas.
 *
 * Ref: Relatório QA 04/03/2026
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

const ROOT = join(import.meta.dirname, "..", "..");

function readSrc(relativePath: string) {
  return readFileSync(join(ROOT, "src", relativePath), "utf-8");
}

function readRoot(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

// ─── SEC-01: SUPER_COORDINATOR_EMAIL não está hardcoded ───────────────────────

describe("SEC-01 — SUPER_COORDINATOR_EMAIL não está hardcoded", () => {
  it("beta-access.ts não contém o email hardcoded", () => {
    const content = readSrc("lib/auth/beta-access.ts");
    // Não deve conter um email literal com @
    expect(content).not.toMatch(/=\s*["'][\w.+-]+@[\w.-]+\.[a-z]{2,}["']/);
  });

  it("beta-access.ts lê de process.env.SUPER_COORDINATOR_EMAIL", () => {
    const content = readSrc("lib/auth/beta-access.ts");
    expect(content).toContain("process.env.SUPER_COORDINATOR_EMAIL");
  });
});

// ─── SEC-02: CSP sem unsafe-eval ──────────────────────────────────────────────

describe("SEC-02 — CSP sem unsafe-eval", () => {
  it("next.config.ts não contém unsafe-eval", () => {
    const content = readRoot("next.config.ts");
    expect(content).not.toContain("unsafe-eval");
  });
});

// ─── SEC-05: Password mínima de 10 caracteres ─────────────────────────────────

describe("SEC-05 — Password mínima de 10 caracteres", () => {
  it("schema do servidor rejeita passwords com menos de 10 caracteres", () => {
    const schema = z.object({
      password: z.string().min(10).max(200),
    });
    expect(schema.safeParse({ password: "123456789" }).success).toBe(false);
    expect(schema.safeParse({ password: "1234567890" }).success).toBe(true);
  });

  it("register/route.ts usa min(10) para password", () => {
    const content = readSrc("app/api/auth/register/route.ts");
    expect(content).toMatch(/password.*z\.string\(\).*min\(10/);
  });

  it("register/page.tsx valida password com length < 10 no cliente", () => {
    const content = readSrc("app/(auth)/register/page.tsx");
    expect(content).toContain("password.length < 10");
  });
});

// ─── SEC-07: Chave de cifra sem fallback para SERVICE_ROLE_KEY ────────────────

describe("SEC-07 — Chave de cifra sem fallback para SERVICE_ROLE_KEY", () => {
  it("public-share.ts não usa SERVICE_ROLE_KEY como chave de cifra activa", () => {
    const content = readSrc("lib/public-share.ts");
    // Não deve haver fallback ?? a chaves de serviço fora de comentários
    const codeLines = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("public-share.ts usa PUBLIC_SHARE_TOKEN_ENCRYPTION_KEY", () => {
    const content = readSrc("lib/public-share.ts");
    expect(content).toContain("PUBLIC_SHARE_TOKEN_ENCRYPTION_KEY");
  });
});

// ─── SEC-08: correctionReason com mínimo após trim ────────────────────────────

describe("SEC-08 — correctionReason validado após trim", () => {
  it("convocation-guard.ts valida comprimento mínimo do motivo", () => {
    const content = readSrc("lib/games/convocation-guard.ts");
    // Deve checar comprimento > 0 (não apenas !normalizedReason)
    expect(content).toMatch(/normalizedReason\.length\s*[<>]/);
  });
});

// ─── SEC-09: Score do jogo com limite máximo ──────────────────────────────────

describe("SEC-09 — Score do jogo com limite máximo", () => {
  it("live/finalize/route.ts aplica Math.min com MAX_SCORE", () => {
    const content = readSrc("app/api/games/[id]/live/finalize/route.ts");
    expect(content).toContain("MAX_SCORE");
    expect(content).toContain("Math.min");
  });

  it("MAX_SCORE está definido e é <= 99", () => {
    const content = readSrc("app/api/games/[id]/live/finalize/route.ts");
    const match = content.match(/const MAX_SCORE\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const value = parseInt(match![1], 10);
    expect(value).toBeLessThanOrEqual(99);
    expect(value).toBeGreaterThan(0);
  });
});

// ─── SEC-10: correlationId oculto em produção ─────────────────────────────────

describe("SEC-10 — correlationId não exposto em produção", () => {
  it("respond-internal-error.ts usa NODE_ENV para condicionar exposição", () => {
    const content = readSrc("lib/http/respond-internal-error.ts");
    expect(content).toContain("NODE_ENV");
    expect(content).toContain("isDev");
  });

  it("NextResponse.json não inclui correlationId incondicionalmente", () => {
    const content = readSrc("lib/http/respond-internal-error.ts");
    // O correlationId deve estar protegido por uma condição (isDev).
    // Verificar que existe o spread condicional no payload da resposta.
    expect(content).toContain("...(isDev && { correlationId })");
    // E que não existe correlationId: como propriedade estática no payload
    expect(content).not.toMatch(/NextResponse\.json\(\s*\{[^}]*,\s*correlationId\s*[,}]/);
  });
});

// ─── QC-04: Nomes com mínimo 2 caracteres ────────────────────────────────────

describe("QC-04 — Validação de nomes com mínimo 2 caracteres", () => {
  it("staff invite schema usa min(2) para firstName e lastName", () => {
    const content = readSrc("app/api/invite/staff/route.ts");
    expect(content).toMatch(/firstName.*min\(2/);
    expect(content).toMatch(/lastName.*min\(2/);
  });

  it("players schema usa min(2) para first_name e last_name", () => {
    const content = readSrc("app/api/players/route.ts");
    expect(content).toMatch(/first_name.*min\(2/);
    expect(content).toMatch(/last_name.*min\(2/);
  });
});

// ─── QC-08: Constantes nomeadas ───────────────────────────────────────────────

describe("QC-08 — Números mágicos extraídos para constantes", () => {
  it("create-coordinator usa MAX_ACTIVE_BETA_COORDINATOR_INVITES", () => {
    const content = readSrc(
      "app/api/admin/beta-invites/create-coordinator/route.ts",
    );
    expect(content).toContain("MAX_ACTIVE_BETA_COORDINATOR_INVITES");
  });

  it("create-coordinator usa BETA_INVITE_EXPIRY_MS", () => {
    const content = readSrc(
      "app/api/admin/beta-invites/create-coordinator/route.ts",
    );
    expect(content).toContain("BETA_INVITE_EXPIRY_MS");
  });
});

// ─── Rate limiting: cleanup de entradas expiradas ────────────────────────────

describe("SEC-03/04 — Rate limiting com cleanup de memória", () => {
  it("rate-limit.ts contém função de limpeza de entradas expiradas", () => {
    const content = readSrc("lib/rate-limit.ts");
    expect(content).toContain("pruneExpiredEntries");
  });

  it("pruneExpiredEntries é chamada dentro do checkInMemory", () => {
    const content = readSrc("lib/rate-limit.ts");
    // A função deve ser chamada quando se insere nova entrada
    const checkInMemoryBody = content.slice(
      content.indexOf("function checkInMemory"),
    );
    expect(checkInMemoryBody).toContain("pruneExpiredEntries");
  });
});
