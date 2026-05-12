/**
 * Testes de regressao para Sprint 1.6:
 * - Endpoint /api/games/[id]/lineup-corrections (POST + GET)
 * - Migration que adiciona p_sync_initial_lineup e rpc_correct_initial_lineup
 *
 * Sem infra de mock para route handlers + supabase-js, os testes verificam
 * o codigo-fonte das alteracoes criticas: validacoes Zod, chamadas RPC,
 * sintaxe SQL chave da migration. Validacao integrada fica para teste manual.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_FILE = join(import.meta.dirname, "route.ts");
const ROUTE_SRC = readFileSync(ROUTE_FILE, "utf-8");

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const MIGRATION_FILE = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260512005140_sprint_1_6_recalculate_and_lineup_correction.sql",
);
const MIGRATION_SRC = readFileSync(MIGRATION_FILE, "utf-8");

const RECALC_ROUTE_SRC = readFileSync(
  join(
    REPO_ROOT,
    "src",
    "app",
    "api",
    "games",
    "[id]",
    "summary",
    "recalculate",
    "route.ts",
  ),
  "utf-8",
);

describe("[sprint-1.6] migration: rpc_finalize_game + rpc_correct_initial_lineup", () => {
  it("drop explicito da assinatura antiga (6 args) para evitar overload", () => {
    expect(MIGRATION_SRC).toMatch(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.rpc_finalize_game\s*\(\s*uuid,\s*jsonb,\s*integer,\s*integer,\s*integer,\s*uuid\s*\)/,
    );
  });

  it("rpc_finalize_game aceita p_sync_initial_lineup com default true", () => {
    expect(MIGRATION_SRC).toMatch(
      /p_sync_initial_lineup\s+boolean\s+DEFAULT\s+true/,
    );
  });

  it("sincronizacao de game_squads e condicionada a p_sync_initial_lineup", () => {
    expect(MIGRATION_SRC).toMatch(
      /IF\s+p_sync_initial_lineup\s+THEN[\s\S]*?UPDATE\s+public\.game_squads/,
    );
  });

  it("rpc_recalculate_game_summary passa false para p_sync_initial_lineup", () => {
    // Validar que o wrapper passa 7 args terminando em false.
    expect(MIGRATION_SRC).toMatch(
      /rpc_finalize_game\(\s*p_game_id,\s*p_rows,\s*p_score_home,\s*p_score_away,\s*p_final_minute,\s*p_updated_by,\s*false\s*\)/,
    );
  });

  it("tabela lineup_corrections_log criada com campos esperados", () => {
    expect(MIGRATION_SRC).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.lineup_corrections_log/,
    );
    for (const column of [
      "game_id",
      "player_id",
      "game_squad_id",
      "old_status",
      "new_status",
      "corrected_by",
      "corrected_at",
      "reason",
      "club_id",
    ]) {
      expect(MIGRATION_SRC).toContain(column);
    }
  });

  it("RLS activado em lineup_corrections_log; sem policies de INSERT/UPDATE/DELETE", () => {
    expect(MIGRATION_SRC).toMatch(
      /ALTER TABLE public\.lineup_corrections_log ENABLE ROW LEVEL SECURITY/,
    );
    expect(MIGRATION_SRC).toMatch(
      /CREATE POLICY lineup_corrections_log_select[\s\S]*?FOR SELECT/,
    );
    // Sem policies de write na audit table — INSERT so via RPC SECURITY DEFINER.
    // Apanhamos qualquer CREATE POLICY ... ON public.lineup_corrections_log
    // que use FOR INSERT/UPDATE/DELETE.
    const policiesOnTable =
      MIGRATION_SRC.match(
        /CREATE\s+POLICY\s+[\s\S]*?ON\s+public\.lineup_corrections_log[\s\S]*?(?=;|$)/gi,
      ) ?? [];
    for (const policy of policiesOnTable) {
      expect(policy).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE)/i);
    }
  });

  it("rpc_correct_initial_lineup verifica Coordenador e razao minima", () => {
    expect(MIGRATION_SRC).toMatch(
      /NOT\s+public\.user_is_game_coordinator\(p_game_id\)/,
    );
    expect(MIGRATION_SRC).toMatch(/length\(trim\(p_reason\)\)\s*<\s*5/);
  });

  it("rpc_correct_initial_lineup usa session_replication_role = 'replica'", () => {
    expect(MIGRATION_SRC).toMatch(
      /SET\s+LOCAL\s+session_replication_role\s*=\s*'replica'/,
    );
    expect(MIGRATION_SRC).toMatch(
      /SET\s+LOCAL\s+session_replication_role\s*=\s*'origin'/,
    );
  });

  it("rpc_correct_initial_lineup faz INSERT no audit log antes do UPDATE", () => {
    const fnBody =
      MIGRATION_SRC.match(
        /CREATE OR REPLACE FUNCTION public\.rpc_correct_initial_lineup[\s\S]*?\$function\$;/,
      )?.[0] ?? "";
    const insertIdx = fnBody.indexOf("INSERT INTO public.lineup_corrections_log");
    const updateIdx = fnBody.indexOf("UPDATE public.game_squads");
    expect(insertIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(insertIdx);
  });

  it("rpc_correct_initial_lineup ignora correccoes com mesmo status (idempotencia)", () => {
    expect(MIGRATION_SRC).toMatch(
      /gs\.initial_lineup_status\s+IS\s+DISTINCT\s+FROM/,
    );
  });
});

describe("[sprint-1.6] endpoint /api/games/[id]/lineup-corrections", () => {
  it("POST valida payload com Zod (corrections array, reason 5-500)", () => {
    expect(ROUTE_SRC).toMatch(/CorrectionsSchema\s*=\s*z\.object/);
    expect(ROUTE_SRC).toMatch(/z\.string\(\)\.min\(5\)\.max\(500\)/);
    expect(ROUTE_SRC).toMatch(
      /z\.enum\(VALID_STATUSES\)|z\.enum\(\["starter",\s*"substitute"\]\)/,
    );
  });

  it("POST devolve 401 quando user nao esta autenticado", () => {
    expect(ROUTE_SRC).toMatch(/status:\s*401[\s\S]*?Não autenticado/);
  });

  it("POST chama supabase.rpc('rpc_correct_initial_lineup', ...)", () => {
    expect(ROUTE_SRC).toMatch(
      /supabase\.rpc\(\s*["']rpc_correct_initial_lineup["']/,
    );
  });

  it("POST mapeia erros P0001 da RPC para HTTP 400 (nao 500)", () => {
    expect(ROUTE_SRC).toMatch(/code\s*===\s*["']P0001["']/);
  });

  it("GET devolve squad e corrections", () => {
    expect(ROUTE_SRC).toMatch(/lineup_corrections_log/);
    expect(ROUTE_SRC).toMatch(/game_squads/);
    expect(ROUTE_SRC).toMatch(/corrections:\s*corrections/);
    expect(ROUTE_SRC).toMatch(/squad:\s*squadResult\.data/);
  });
});

describe("[sprint-1.6] recalculate endpoint continua a usar a RPC wrapper", () => {
  it("nao chama directamente rpc_finalize_game (so via wrapper)", () => {
    // O wrapper rpc_recalculate_game_summary garante p_sync_initial_lineup=false.
    // Se algum dia o endpoint chamar finalize directamente, perde-se a proteccao.
    expect(RECALC_ROUTE_SRC).not.toMatch(
      /supabase\.rpc\(\s*["']rpc_finalize_game["']/,
    );
  });

  it("usa o wrapper rpc_recalculate_game_summary", () => {
    expect(RECALC_ROUTE_SRC).toMatch(
      /rpc_recalculate_game_summary/,
    );
  });
});
