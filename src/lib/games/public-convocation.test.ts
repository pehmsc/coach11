import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildPublicConvocationEntries } from "./public-convocation";

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
});
