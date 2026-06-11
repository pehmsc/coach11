/**
 * Testes de regressao do rasto de audit da purga RGPD (Bloco E).
 *
 * A logica pura de decisao ja esta coberta em purge-decision.test.ts; o que
 * falta proteger e o contrato do route handler: o audit e escrito MESMO
 * quando a purga falha a meio, com _status/_error dentro do jsonb
 * deleted_counts, e uma purga falhada NUNCA limpa o agendamento (o cron
 * seguinte volta a tentar). Sem infra de mock para o admin client, os testes
 * verificam o codigo-fonte das garantias criticas (mesmo padrao de
 * lineup-corrections/route.test.ts).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_FILE = join(import.meta.dirname, "route.ts");
const ROUTE_SRC = readFileSync(ROUTE_FILE, "utf-8");

describe("purga RGPD — rasto de audit garantido (_status)", () => {
  it("o status do audit deriva de dry-run e falha: simulated/failed/completed", () => {
    expect(ROUTE_SRC).toMatch(
      /status\s*=\s*dryRun\s*\?\s*["']simulated["']\s*:\s*purgeError\s*\?\s*["']failed["']\s*:\s*["']completed["']/,
    );
  });

  it("o insert em gdpr_purge_audit inclui _status dentro de deleted_counts", () => {
    expect(ROUTE_SRC).toMatch(
      /from\(["']gdpr_purge_audit["']\)\.insert\(\{[\s\S]*?deleted_counts:\s*\{[\s\S]*?_status:\s*status/,
    );
  });

  it("_error so e incluido quando a purga falhou", () => {
    expect(ROUTE_SRC).toMatch(
      /\.\.\.\(purgeError\s*\?\s*\{\s*_error:\s*purgeError\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("falha na purga e capturada sem abortar o audit (try/catch em purgeClubData)", () => {
    expect(ROUTE_SRC).toMatch(
      /try\s*\{[\s\S]*?purgeClubData\([\s\S]*?\}\s*catch[\s\S]*?purgeError\s*=/,
    );
  });

  it("purga falhada ou audit falhado conta como failed e NAO limpa o agendamento", () => {
    expect(ROUTE_SRC).toMatch(
      /if\s*\(purgeError\s*\|\|\s*auditErr\)\s*\{[\s\S]*?failed\s*\+=\s*1;[\s\S]*?continue;/,
    );
  });
});
