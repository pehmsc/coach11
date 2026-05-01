import { describe, expect, it } from "vitest";
import { canEditPlayer } from "./can-edit-player";

describe("canEditPlayer", () => {
  it("devolve true quando accessibleAgeGroupIds inclui o ageGroupId do atleta", () => {
    expect(
      canEditPlayer(
        { accessibleAgeGroupIds: ["ag-1", "ag-2", "ag-3"] },
        "ag-2",
      ),
    ).toBe(true);
  });

  it("devolve false quando accessibleAgeGroupIds não inclui o ageGroupId", () => {
    expect(
      canEditPlayer(
        { accessibleAgeGroupIds: ["ag-1", "ag-2"] },
        "ag-other",
      ),
    ).toBe(false);
  });

  it("devolve false quando a lista de escalões acessíveis é vazia", () => {
    expect(
      canEditPlayer({ accessibleAgeGroupIds: [] }, "ag-1"),
    ).toBe(false);
  });
});
