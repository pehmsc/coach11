import { describe, expect, it } from "vitest";
import {
  getExternalConvocationIdFromLivePlayerId,
  isExternalLivePlayerId,
  toExternalLivePlayerId,
} from "./live-player-ids";

describe("live-player-ids", () => {
  it('encodes and decodes player IDs for jogadores "Outro"', () => {
    const livePlayerId = toExternalLivePlayerId("external-row-1");

    expect(livePlayerId).toBe("external:external-row-1");
    expect(isExternalLivePlayerId(livePlayerId)).toBe(true);
    expect(getExternalConvocationIdFromLivePlayerId(livePlayerId)).toBe(
      "external-row-1",
    );
  });

  it("ignores regular plantel player IDs", () => {
    expect(isExternalLivePlayerId("player-uuid")).toBe(false);
    expect(getExternalConvocationIdFromLivePlayerId("player-uuid")).toBeNull();
  });
});
