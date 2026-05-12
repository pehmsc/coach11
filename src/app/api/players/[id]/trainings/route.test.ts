/**
 * Testes de regressão para a ordenacao do endpoint de historico de treinos.
 *
 * Antes destes testes (PR #137), o endpoint usava
 * `.order(col, { referencedTable: 'training_sessions' })` que apenas ordena
 * dentro do embed (no-op em m2o). O fix usa a sintaxe PostgREST 11+ de
 * top-level ordering por coluna do embed: `'training_sessions(session_date)'`.
 *
 * Como nao temos infra de mock para supabase-js + route handlers, os
 * testes verificam (a) o parser de query params e (b) o ficheiro da rota
 * usa a sintaxe correcta. Validacao end-to-end fica para teste manual.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_FILE = join(
  import.meta.dirname,
  "route.ts",
);

const ROUTE_SRC = readFileSync(ROUTE_FILE, "utf-8");

describe("[regression] api/players/[id]/trainings ordering", () => {
  it("usa top-level ordering pela coluna do embed (PostgREST 11+)", () => {
    expect(ROUTE_SRC).toMatch(
      /\.order\(\s*["']training_sessions\(session_date\)["']/,
    );
  });

  it("NAO usa o anti-padrao referencedTable na chamada de order", () => {
    // O bug original era usar referencedTable: 'training_sessions' que
    // apenas ordena rows dentro do embed (no-op porque m2o tem 1 row).
    // Validamos so a chamada .order(...) — comentarios com a palavra
    // referencedTable sao OK.
    const orderCalls = ROUTE_SRC.match(/\.order\([\s\S]*?\)/g) ?? [];
    for (const call of orderCalls) {
      expect(call).not.toMatch(/referencedTable:\s*["']training_sessions["']/);
    }
  });

  it("default sort e DESC quando o param sort esta ausente", () => {
    // parseSort devolve 'date_desc' por default; ascending: sort === 'date_asc'
    // garante que default = false (descendente).
    expect(ROUTE_SRC).toMatch(/return\s+"date_desc"/);
    expect(ROUTE_SRC).toMatch(/ascending:\s*sort\s*===\s*"date_asc"/);
  });

  it("aceita apenas valores conhecidos no sort", () => {
    expect(ROUTE_SRC).toMatch(
      /VALID_SORTS\s*=\s*new\s+Set\(\["date_desc",\s*"date_asc"\]\)/,
    );
  });
});

const GAMES_ROUTE_FILE = join(
  import.meta.dirname,
  "..",
  "games",
  "route.ts",
);

const GAMES_ROUTE_SRC = readFileSync(GAMES_ROUTE_FILE, "utf-8");

describe("[regression] api/players/[id]/games ordering", () => {
  it("usa top-level ordering por games(game_datetime)", () => {
    expect(GAMES_ROUTE_SRC).toMatch(
      /\.order\(\s*["']games\(game_datetime\)["']/,
    );
  });

  it("ordem default e DESC (ascending: false)", () => {
    expect(GAMES_ROUTE_SRC).toMatch(
      /\.order\(\s*["']games\(game_datetime\)["']\s*,\s*\{\s*ascending:\s*false/,
    );
  });

  it("NAO usa o anti-padrao referencedTable na chamada de order", () => {
    const orderCalls = GAMES_ROUTE_SRC.match(/\.order\([\s\S]*?\)/g) ?? [];
    for (const call of orderCalls) {
      expect(call).not.toMatch(/referencedTable:\s*["']games["']/);
    }
  });
});
