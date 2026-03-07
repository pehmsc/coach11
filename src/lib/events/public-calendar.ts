export const PUBLIC_CURRENT_GAME_STATUSES = [
  "scheduled",
  "live",
  "cancelled",
] as const;

export const PUBLIC_RECENT_RESULT_STATUSES = ["completed"] as const;

type PublicCurrentGameLike = {
  status: string | null | undefined;
  game_datetime: string;
};

export function getPublicGameSection(status: string | null | undefined) {
  return status === "completed" ? "recent" : "current";
}

export function sortPublicCurrentGames<T extends PublicCurrentGameLike>(games: T[]) {
  return [...games].sort((a, b) => {
    const aIsLive = a.status === "live";
    const bIsLive = b.status === "live";

    if (aIsLive !== bIsLive) {
      return aIsLive ? -1 : 1;
    }

    return a.game_datetime.localeCompare(b.game_datetime);
  });
}
