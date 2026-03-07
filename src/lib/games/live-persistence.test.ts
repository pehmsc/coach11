import { describe, expect, it } from "vitest";
import { filterPersistentLiveStatsPlayers } from "./live-persistence";

describe("live-persistence", () => {
  it("keeps only internal players for persisted final stats", () => {
    expect(
      filterPersistentLiveStatsPlayers([
        { isExternal: false, id: "internal-1" },
        { isExternal: true, id: "external-1" },
        { id: "internal-2" },
      ]),
    ).toEqual([
      { isExternal: false, id: "internal-1" },
      { id: "internal-2" },
    ]);
  });
});
