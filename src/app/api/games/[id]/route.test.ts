/**
 * Testes de regressao: validacao de competition_id por ESCALAO no PATCH
 * /api/games/[id], no service de calendario e no repository.
 *
 * Cobre o bug "jogo perde a competicao em silencio": a validacao antiga era
 * por team_id (que rejeitava ligacoes legitimas porque A/B/C sao apenas
 * labels — jogadores partilhados). Agora a validacao e por age_group, e o
 * PATCH /api/games/[id] (que era o buraco real — gravava sem validar)
 * passou a validar com a mesma logica.
 *
 * Sem infra de mock para route handlers + supabase-js, os testes verificam
 * o codigo-fonte das alteracoes chave (mesmo padrao de outros testes do
 * projecto, ex: lineup-corrections).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");

const ROUTE_SRC = readFileSync(
  join(REPO_ROOT, "src", "app", "api", "games", "[id]", "route.ts"),
  "utf-8",
);
const SERVICE_SRC = readFileSync(
  join(REPO_ROOT, "src", "lib", "services", "calendar-events.service.ts"),
  "utf-8",
);
const REPOSITORY_SRC = readFileSync(
  join(REPO_ROOT, "src", "lib", "repositories", "calendar-events.repository.ts"),
  "utf-8",
);

const ERROR_MSG = "A competição selecionada não pertence a este escalão.";

describe("repository: getCompetitionForAgeGroup substitui getCompetitionForTeam", () => {
  it("getCompetitionForAgeGroup esta exportado", () => {
    expect(REPOSITORY_SRC).toMatch(/export\s+async\s+function\s+getCompetitionForAgeGroup/);
  });

  it("getCompetitionForAgeGroup faz join com teams via inner para validar age_group_id", () => {
    expect(REPOSITORY_SRC).toMatch(/teams!inner\(age_group_id\)/);
    expect(REPOSITORY_SRC).toMatch(/eq\("teams\.age_group_id",\s*ageGroupId\)/);
  });

  it("getCompetitionForTeam foi removido (orfao apos a refactor)", () => {
    expect(REPOSITORY_SRC).not.toMatch(/function\s+getCompetitionForTeam/);
  });
});

describe("service: resolveCompetitionId valida por escalao em POST e PATCH", () => {
  it("importa getCompetitionForAgeGroup", () => {
    expect(SERVICE_SRC).toMatch(/getCompetitionForAgeGroup/);
  });

  it("nao importa nem chama getCompetitionForTeam", () => {
    expect(SERVICE_SRC).not.toMatch(/getCompetitionForTeam/);
  });

  it("resolveCompetitionId recebe ageGroupId (nao teamId)", () => {
    expect(SERVICE_SRC).toMatch(
      /async\s+function\s+resolveCompetitionId\s*\(\s*db:[^)]*?,\s*ageGroupId:\s*string/,
    );
  });

  it("mensagem de erro indica escalao (nao equipa)", () => {
    expect(SERVICE_SRC).toContain(ERROR_MSG);
    expect(SERVICE_SRC).not.toMatch(/Competição inválida para esta equipa/);
  });

  it("POST passa targetAgeGroupId em vez de targetTeamId", () => {
    const postRegion = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf("handleCalendarEventsPost"),
      SERVICE_SRC.indexOf("handleCalendarEventsPatch"),
    );
    expect(postRegion).toMatch(
      /resolveCompetitionId\(db,\s*targetAgeGroupId,\s*payload\.competition_id\)/,
    );
  });

  it("PATCH passa targetAgeGroupId em vez de targetTeamId", () => {
    const patchRegion = SERVICE_SRC.slice(SERVICE_SRC.indexOf("handleCalendarEventsPatch"));
    expect(patchRegion).toMatch(
      /resolveCompetitionId\(db,\s*targetAgeGroupId,\s*payload\.competition_id\)/,
    );
  });

  it("erro do resolveCompetitionId traduz para 400 (POST e PATCH)", () => {
    const matches = SERVICE_SRC.match(
      /if\s*\(\s*competitionResult\.error\s*\)[\s\S]*?status:\s*400/g,
    );
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("PATCH /api/games/[id]: valida competition_id antes do update", () => {
  it("importa getCompetitionForAgeGroup do repository", () => {
    expect(ROUTE_SRC).toMatch(
      /import\s*\{[^}]*getCompetitionForAgeGroup[^}]*\}\s*from\s*["']@\/lib\/repositories\/calendar-events\.repository["']/,
    );
  });

  it("chama getCompetitionForAgeGroup com access.ageGroupId quando competition_id e enviada", () => {
    expect(ROUTE_SRC).toMatch(/getCompetitionForAgeGroup\(\s*supabase,/);
    expect(ROUTE_SRC).toMatch(/access\.ageGroupId/);
  });

  it("validacao so dispara quando competition_id e string nao vazia (null/undefined sao legitimos)", () => {
    // padrao: typeof ... === "string" && ....length > 0
    expect(ROUTE_SRC).toMatch(
      /typeof\s+parsed\.data\.competition_id\s*===\s*["']string["'][\s\S]*?\.length\s*>\s*0/,
    );
  });

  it("devolve 400 com a mesma mensagem do service quando competicao nao pertence ao escalao", () => {
    expect(ROUTE_SRC).toContain(ERROR_MSG);
    expect(ROUTE_SRC).toMatch(/status:\s*400/);
  });

  it("validacao acontece ANTES do supabase.from('games').update", () => {
    const competitionIdx = ROUTE_SRC.indexOf("getCompetitionForAgeGroup");
    const updateIdx = ROUTE_SRC.indexOf('.from("games")\n      .update');
    expect(competitionIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(competitionIdx);
  });
});
