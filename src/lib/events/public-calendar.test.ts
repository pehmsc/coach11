import { describe, expect, it } from "vitest";
import {
  getPublicGameSection,
  sortPublicCurrentGames,
} from "./public-calendar";

describe("public-calendar", () => {
  it("keeps a delayed scheduled game in the current section until completed", () => {
    expect(getPublicGameSection("scheduled")).toBe("current");
    expect(getPublicGameSection("live")).toBe("current");
    expect(getPublicGameSection("completed")).toBe("recent");
  });

  it("sorts live games ahead of other current games", () => {
    expect(
      sortPublicCurrentGames([
        {
          status: "scheduled",
          game_datetime: "2026-03-08T10:00:00.000Z",
        },
        {
          status: "live",
          game_datetime: "2026-03-07T10:00:00.000Z",
        },
      ])[0],
    ).toMatchObject({
      status: "live",
    });
  });
});
