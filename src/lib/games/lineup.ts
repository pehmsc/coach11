export type UiLineupStatus = "on_field" | "substitute";

type LiveStatsStarterRow = {
  player_id?: string | null;
  status?: string | null;
  start_minute?: number | null;
};

export function normalizeLiveStatusForUi(
  value: string | null | undefined,
): UiLineupStatus | null {
  if (!value) return null;

  if (
    value === "on_field" ||
    value === "starter" ||
    value === "playing" ||
    value === "titular"
  ) {
    return "on_field";
  }

  if (
    value === "substitute" ||
    value === "on_bench" ||
    value === "substituted_out" ||
    value === "bench" ||
    value === "suplente"
  ) {
    return "substitute";
  }

  return null;
}

export function getStarterPlayerIdsFromLiveStats(rows: LiveStatsStarterRow[]) {
  const starterIds = new Set<string>();

  rows.forEach((row) => {
    if (!row.player_id) return;
    if (row.start_minute === 0 || row.status === "starter") {
      starterIds.add(row.player_id);
    }
  });

  if (starterIds.size > 0) {
    return starterIds;
  }

  rows.forEach((row) => {
    if (!row.player_id) return;
    if (normalizeLiveStatusForUi(row.status) === "on_field") {
      starterIds.add(row.player_id);
    }
  });

  return starterIds;
}
