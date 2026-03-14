import type { Player } from "@/types/database";
import type { AttendanceSortKey, GameSortKey, SortDir } from "./types";

export function isGoalkeeper(player: Player | undefined) {
  if (!player?.preferred_position) return false;
  return /gr|gk|guarda/i.test(player.preferred_position);
}

export function comparePlayersByFirstName(a: Player, b: Player) {
  const firstNameComparison = a.first_name.localeCompare(b.first_name, "pt");
  if (firstNameComparison !== 0) return firstNameComparison;

  const lastNameComparison = a.last_name.localeCompare(b.last_name, "pt");
  if (lastNameComparison !== 0) return lastNameComparison;

  return a.id.localeCompare(b.id);
}

export function defaultSortDirForAttendance(key: AttendanceSortKey): SortDir {
  return key === "player" ? "asc" : "desc";
}

export function defaultSortDirForGame(key: GameSortKey): SortDir {
  return key === "player" ? "asc" : "desc";
}

export function compareNullableNumber(a: number | null, b: number | null, dir: SortDir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}
