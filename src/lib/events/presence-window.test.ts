import { describe, expect, it } from "vitest";
import {
  getPresencePromptState,
  portugalDateTimeToUtc,
  shouldShowPresencePrompt,
} from "./presence-window";

describe("presence-window", () => {
  it("converts Portugal local time to UTC consistently", () => {
    const eventStart = portugalDateTimeToUtc("2026-03-03", "18:00");

    expect(eventStart?.toISOString()).toBe("2026-03-03T18:00:00.000Z");
  });

  it("shows the prompt only from ten minutes before the start", () => {
    expect(
      shouldShowPresencePrompt(
        "2026-03-03",
        "18:00",
        "19:30",
        "scheduled",
        new Date("2026-03-03T17:49:00.000Z"),
      ),
    ).toBe(false);

    expect(
      shouldShowPresencePrompt(
        "2026-03-03",
        "18:00",
        "19:30",
        "scheduled",
        new Date("2026-03-03T17:50:00.000Z"),
      ),
    ).toBe(true);
  });

  it("switches from mark to close when the session end is reached", () => {
    expect(
      getPresencePromptState(
        "2026-03-03",
        "18:00",
        "19:30",
        "scheduled",
        new Date("2026-03-03T18:20:00.000Z"),
      ),
    ).toBe("mark");

    expect(
      getPresencePromptState(
        "2026-03-03",
        "18:00",
        "19:30",
        "scheduled",
        new Date("2026-03-03T19:30:00.000Z"),
      ),
    ).toBe("close");
  });

  it("returns closed for completed sessions", () => {
    expect(
      getPresencePromptState(
        "2026-03-03",
        "18:00",
        "19:30",
        "completed",
        new Date("2026-03-03T20:00:00.000Z"),
      ),
    ).toBe("closed");
  });
});
