export const EXTERNAL_LIVE_PLAYER_PREFIX = "external:";

export function isExternalLivePlayerId(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" && value.startsWith(EXTERNAL_LIVE_PLAYER_PREFIX)
  );
}

export function toExternalLivePlayerId(externalConvocationId: string) {
  return `${EXTERNAL_LIVE_PLAYER_PREFIX}${externalConvocationId}`;
}

export function getExternalConvocationIdFromLivePlayerId(
  value: string | null | undefined,
) {
  if (!isExternalLivePlayerId(value)) return null;

  const externalId = value.slice(EXTERNAL_LIVE_PLAYER_PREFIX.length).trim();
  return externalId.length > 0 ? externalId : null;
}
