import { describe, expect, it } from "vitest";
import {
  buildStoredGameEventParticipantFields,
  normalizeStoredGameEventRowForClient,
} from "./live-event-participants";

describe("live-event-participants", () => {
  it('maps jogadores "Outro" to dedicated stored fields and back to external:* for the UI', () => {
    expect(
      buildStoredGameEventParticipantFields({
        playerId: "external:ext-1",
        relatedPlayerId: "player-2",
      }),
    ).toEqual({
      player_id: null,
      related_player_id: "player-2",
      external_player_convocation_id: "ext-1",
      external_related_player_convocation_id: null,
    });

    expect(
      normalizeStoredGameEventRowForClient({
        id: "event-1",
        player_id: null,
        related_player_id: "player-2",
        external_player_convocation_id: "ext-1",
        external_related_player_convocation_id: null,
      }),
    ).toMatchObject({
      id: "event-1",
      player_id: "external:ext-1",
      related_player_id: "player-2",
    });
  });

  it("keeps regular plantel player IDs untouched", () => {
    expect(
      normalizeStoredGameEventRowForClient({
        id: "event-2",
        player_id: "player-1",
        related_player_id: "player-2",
        external_player_convocation_id: null,
        external_related_player_convocation_id: null,
      }),
    ).toMatchObject({
      id: "event-2",
      player_id: "player-1",
      related_player_id: "player-2",
    });
  });
});
