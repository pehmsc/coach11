import {
  getExternalConvocationIdFromLivePlayerId,
  isExternalLivePlayerId,
  toExternalLivePlayerId,
} from "./live-player-ids";

export const GAME_EVENT_SELECT_COLUMNS =
  "id, game_id, event_type, player_id, related_player_id, external_player_convocation_id, external_related_player_convocation_id, minute, is_opponent_event, created_at";

export type StoredGameEventParticipantFields = {
  player_id?: string | null;
  related_player_id?: string | null;
  external_player_convocation_id?: string | null;
  external_related_player_convocation_id?: string | null;
};

function normalizeInternalParticipantId(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveStoredGameEventParticipantId(params: {
  playerId?: string | null;
  externalPlayerConvocationId?: string | null;
}) {
  const internalPlayerId = normalizeInternalParticipantId(params.playerId);
  if (internalPlayerId) return internalPlayerId;

  const externalPlayerConvocationId = normalizeInternalParticipantId(
    params.externalPlayerConvocationId,
  );
  if (!externalPlayerConvocationId) return null;

  return toExternalLivePlayerId(externalPlayerConvocationId);
}

export function buildStoredGameEventParticipantFields(params: {
  playerId?: string | null;
  relatedPlayerId?: string | null;
}) {
  const normalizedPlayerId = normalizeInternalParticipantId(params.playerId);
  const normalizedRelatedPlayerId = normalizeInternalParticipantId(
    params.relatedPlayerId,
  );

  const externalPlayerConvocationId =
    getExternalConvocationIdFromLivePlayerId(normalizedPlayerId);
  const externalRelatedPlayerConvocationId =
    getExternalConvocationIdFromLivePlayerId(normalizedRelatedPlayerId);

  return {
    player_id:
      normalizedPlayerId && !isExternalLivePlayerId(normalizedPlayerId)
        ? normalizedPlayerId
        : null,
    related_player_id:
      normalizedRelatedPlayerId &&
      !isExternalLivePlayerId(normalizedRelatedPlayerId)
        ? normalizedRelatedPlayerId
        : null,
    external_player_convocation_id: externalPlayerConvocationId,
    external_related_player_convocation_id: externalRelatedPlayerConvocationId,
  };
}

export function normalizeStoredGameEventRowForClient<
  T extends StoredGameEventParticipantFields,
>(row: T) {
  const rest = { ...row };
  delete rest.external_player_convocation_id;
  delete rest.external_related_player_convocation_id;

  return {
    ...rest,
    player_id: resolveStoredGameEventParticipantId({
      playerId: row.player_id,
      externalPlayerConvocationId: row.external_player_convocation_id,
    }),
    related_player_id: resolveStoredGameEventParticipantId({
      playerId: row.related_player_id,
      externalPlayerConvocationId: row.external_related_player_convocation_id,
    }),
  };
}

export function normalizeStoredGameEventRowsForClient<
  T extends StoredGameEventParticipantFields,
>(rows: T[]) {
  return rows.map((row) => normalizeStoredGameEventRowForClient(row));
}
