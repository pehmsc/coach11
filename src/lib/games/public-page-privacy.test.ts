import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regressao: os 6 campos da "Ficha do jogo" sao conteudo interno e nunca
 * devem aparecer em codigo de paginas/helpers publicos. Este teste valida
 * via leitura estatica que esses identificadores nao existem em nenhum
 * dos ficheiros listados.
 *
 * Limitacao aceite: o match e literal — falha tambem se aparecer em
 * comentario. Restricao estrita e propositada (defesa em profundidade).
 */

const FORBIDDEN_FIELDS = [
  "tactical_system",
  "positive_aspects",
  "negative_aspects",
  "aspects_to_improve",
  "team_notes",
  "coach_notes",
] as const;

const PUBLIC_FILES = [
  "src/app/public/[token]/games/[gameId]/page.tsx",
  "src/lib/games/public-live.ts",
  "src/lib/games/public-convocation.ts",
] as const;

describe("public page privacy: ficha do jogo nunca aparece em codigo publico", () => {
  for (const relativePath of PUBLIC_FILES) {
    it(`${relativePath} nao menciona campos privados da ficha`, () => {
      const fullPath = join(process.cwd(), relativePath);
      const content = readFileSync(fullPath, "utf-8");

      for (const field of FORBIDDEN_FIELDS) {
        const regex = new RegExp(`\\b${field}\\b`);
        if (regex.test(content)) {
          throw new Error(
            `Ficheiro ${relativePath} menciona campo privado "${field}". ` +
              `Os 6 campos da ficha do jogo (tactical_system, positive_aspects, ` +
              `negative_aspects, aspects_to_improve, team_notes, coach_notes) ` +
              `nao devem aparecer em codigo de paginas/helpers publicos. ` +
              `Se a mencao for legitima (e.g. comentario a explicar que esta ` +
              `excluido), refactorar o teste para parsear AST.`,
          );
        }
      }
    });
  }
});
