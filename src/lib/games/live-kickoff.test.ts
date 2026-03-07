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

  it('allows kickoff when the starters are only players "Outro"', () => {
    expect(
      getLiveKickoffState({
        starters: [{ isExternal: true }],
      }),
    ).toEqual({
      canStart: true,
      reason: null,
    });
  });
});
