import { describe, expect, it } from "vitest";
import {
  getDashboardPriorityWindowStartIndex,
  getGameDashboardPriorityState,
  getTrainingDashboardPriorityState,
} from "./dashboard-priority";

describe("dashboard-priority", () => {
  it("keeps an expired training with pending attendance inside the priority window", () => {
    const now = new Date("2026-03-06T20:00:00.000Z");
    const trainingPriority = getTrainingDashboardPriorityState(
      "2026-03-06",
      "18:00",
      "19:30",
      "scheduled",
      now,
    );

    expect(trainingPriority.presencePromptState).toBe("close");
    expect(trainingPriority.isPriority).toBe(true);

    const startIndex = getDashboardPriorityWindowStartIndex(
      [
        { sortTs: Date.parse("2026-03-05T10:00:00.000Z"), isPriority: false },
        { sortTs: Date.parse("2026-03-06T18:00:00.000Z"), isPriority: true },
        { sortTs: Date.parse("2026-03-07T09:00:00.000Z"), isPriority: false },
        { sortTs: Date.parse("2026-03-08T09:00:00.000Z"), isPriority: false },
        { sortTs: Date.parse("2026-03-09T09:00:00.000Z"), isPriority: false },
        { sortTs: Date.parse("2026-03-10T09:00:00.000Z"), isPriority: false },
      ],
      now.getTime(),
    );

    expect(startIndex).toBe(1);
  });

  it("keeps a game priority after kickoff while convocation is still pending", () => {
    const state = getGameDashboardPriorityState(
      "2026-03-06T19:00:00.000Z",
      "scheduled",
      false,
      new Date("2026-03-06T20:00:00.000Z"),
    );

    expect(state.isPriority).toBe(true);
    expect(state.needsConvocation).toBe(true);
    expect(state.convocationCtaMode).toBe("overdue");
  });

  it("drops resolved events out of priority when no pending actions remain", () => {
    expect(
      getTrainingDashboardPriorityState(
        "2026-03-06",
        "18:00",
        "19:30",
        "completed",
        new Date("2026-03-06T20:00:00.000Z"),
      ).isPriority,
    ).toBe(false);

    expect(
      getGameDashboardPriorityState(
        "2026-03-06T19:00:00.000Z",
        "scheduled",
        true,
        new Date("2026-03-06T20:00:00.000Z"),
      ).isPriority,
    ).toBe(false);
  });
});
