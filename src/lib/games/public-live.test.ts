import { describe, expect, it } from "vitest";
import {
  computePublicLiveScore,
  filterPublicLiveEvents,
  hasPublicGameLiveData,
  type PublicGameLiveEvent,
} from "./public-live";

describe("public-live", () => {
  it("computes the public live score from goals and own goals", () => {
    const events: PublicGameLiveEvent[] = [
      {
        id: "1",
        minute: 10,
        eventType: "goal",
        isOpponentEvent: false,
        playerLabel: "#9 Avancado",
        relatedPlayerLabel: null,
        createdAt: "2026-03-06T18:10:00.000Z",
      },
      {
        id: "2",
        minute: 30,
        eventType: "own_goal",
        isOpponentEvent: true,
        playerLabel: null,
        relatedPlayerLabel: null,
        createdAt: "2026-03-06T18:30:00.000Z",
      },
      {
        id: "3",
        minute: 60,
        eventType: "penalty_goal",
        isOpponentEvent: true,
        playerLabel: null,
        relatedPlayerLabel: null,
        createdAt: "2026-03-06T19:00:00.000Z",
      },
    ];

    expect(
      computePublicLiveScore({
        isHome: true,
        events,
      }),
    ).toEqual({ scoreHome: 2, scoreAway: 1 });
  });

  it("filters mirrored substitution_in rows out of the public timeline", () => {
    const events = filterPublicLiveEvents([
      {
        id: "sub-out",
        event_type: "substitution_out",
        player_id: "player-out",
        related_player_id: "player-in",
        minute: 55,
        is_opponent_event: false,
        created_at: "2026-03-06T18:55:00.000Z",
      },
      {
        id: "sub-in",
        event_type: "substitution_in",
        player_id: "player-in",
        related_player_id: "player-out",
        minute: 55,
        is_opponent_event: false,
        created_at: "2026-03-06T18:55:01.000Z",
      },
      {
        id: "assist",
        event_type: "assist",
        player_id: "player-in",
        related_player_id: "player-out",
        minute: 56,
        is_opponent_event: false,
        created_at: "2026-03-06T18:56:00.000Z",
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "sub-out",
      eventType: "substitution_out",
      playerLabel: "player-out",
      relatedPlayerLabel: "player-in",
    });
  });

  it("treats live status or persisted live data as enough to replace the public cover", () => {
    expect(
      hasPublicGameLiveData({
        status: "live",
        scoreHome: 0,
        scoreAway: 0,
        checkpoint: null,
        events: [],
      }),
    ).toBe(true);

    expect(
      hasPublicGameLiveData({
        status: "scheduled",
        scoreHome: 0,
        scoreAway: 0,
        checkpoint: null,
        events: [],
      }),
    ).toBe(false);
  });
});
