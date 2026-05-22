import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildPublicConvocationEntries,
  hasPublicConvocationContent,
  isConvocationPublic,
  resolveConvocationNotes,
  resolveGamePublicNotes,
} from "./public-convocation";

describe("public-convocation", () => {
  it("keeps all convocated players beyond 15 and groups starters before substitutes", () => {
    const squadPlayers = Array.from({ length: 16 }, (_, index) => ({
      id: `player-${index + 1}`,
      firstName: `Jogador`,
      lastName: `${index + 1}`,
    }));

    const entries = buildPublicConvocationEntries({
      selectedPlayerIds: squadPlayers.map((player) => player.id),
      squadPlayers,
      starterIds: squadPlayers.slice(0, 9).map((player) => player.id),
      externalPlayers: [
        { id: "external-1", name: "Outro A", lineupStatus: "on_field" },
        { id: "external-2", name: "Outro B", lineupStatus: "substitute" },
      ],
    });

    expect(entries).toHaveLength(18);

    const firstSubIndex = entries.findIndex((entry) => !entry.isStarter);
    const lastStarterIndex = entries.findLastIndex((entry) => entry.isStarter);
    expect(firstSubIndex).toBeGreaterThan(-1);
    expect(lastStarterIndex).toBeGreaterThan(-1);
    expect(lastStarterIndex).toBeLessThan(firstSubIndex);

    expect(entries.some((entry) => entry.id === "external:external-1")).toBe(true);
    expect(entries.some((entry) => entry.id === "external:external-2")).toBe(true);
  });

  it("normalises public game notes without falling back to convocation notes", () => {
    expect(resolveGamePublicNotes(" Trazer caneleiras ")).toBe(
      "Trazer caneleiras",
    );
    expect(resolveGamePublicNotes("   ")).toBeNull();
    expect(resolveGamePublicNotes(null)).toBeNull();
    expect(resolveGamePublicNotes(undefined)).toBeNull();
  });

  it("normalises convocation notes without falling back to public game notes", () => {
    expect(resolveConvocationNotes(" Levar equipamento azul ")).toBe(
      "Levar equipamento azul",
    );
    expect(resolveConvocationNotes("   ")).toBeNull();
    expect(resolveConvocationNotes(null)).toBeNull();
    expect(resolveConvocationNotes(undefined)).toBeNull();
  });

  it("keeps public game notes and convocation notes isolated (no cross fallback)", () => {
    // Sanity: as duas funções recebem apenas a sua fonte e devolvem null se
    // vazia — não há partilha implícita entre elas.
    expect(resolveGamePublicNotes(null)).toBeNull();
    expect(resolveConvocationNotes("Notas só da convocatória")).toBe(
      "Notas só da convocatória",
    );
    expect(resolveGamePublicNotes("Notas só do jogo")).toBe("Notas só do jogo");
    expect(resolveConvocationNotes(null)).toBeNull();
  });

  it("treats public convocation notes as valid public content even without players", () => {
    expect(
      hasPublicConvocationContent({
        playerCount: 0,
        notes: "Chegar 15 minutos antes.",
      }),
    ).toBe(true);

    expect(
      hasPublicConvocationContent({
        playerCount: 0,
        notes: "   ",
      }),
    ).toBe(false);
  });

  it("only treats convocation as public when status is 'published'", () => {
    expect(isConvocationPublic("published")).toBe(true);
    expect(isConvocationPublic("draft")).toBe(false);
    expect(isConvocationPublic(null)).toBe(false);
    expect(isConvocationPublic(undefined)).toBe(false);
  });
});
