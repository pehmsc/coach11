import { describe, expect, it } from "vitest";
import { getLiveKickoffState } from "./live-kickoff";

describe("live-kickoff", () => {
  it("allows kickoff when there is at least one internal starter", () => {
    expect(
      getLiveKickoffState({
        starters: [{ isExternal: false }],
      }),
    ).toEqual({
      canStart: true,
      reason: null,
    });
  });

  it("blocks kickoff with a clear reason when an external starter is selected", () => {
    expect(
      getLiveKickoffState({
        starters: [{ isExternal: true }],
      }),
    ).toMatchObject({
      canStart: false,
    });
  });
});
