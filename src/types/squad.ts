/**
 * Tipos para a tabela unificada `game_squads`.
 *
 * Separação Public vs Internal é deliberada — `PublicSquadEntry` exclui
 * campos sensíveis (`initial_lineup_status`, `is_present`, `data_quality`,
 * `evaluation_*`, `is_mvp`) para defender endpoints públicos contra leak.
 *
 * Lista canónica de colunas em `src/lib/games/squad-projections.ts`.
 */

export type LineupStatus = "starter" | "substitute";

export type DataQuality =
  | "authoritative"
  | "inferred_from_final_stats"
  | "inferred_default_substitute";

export type ResponseStatus = "pending" | "confirmed" | "declined";

export interface GameSquadEntry {
  id: string;
  game_id: string;
  club_id: string;
  player_id: string | null;
  external_name: string | null;
  external_jersey_number: number | null;
  external_position: string | null;
  source_age_group_id: string | null;
  is_present: boolean | null;
  response_status: ResponseStatus | null;
  response_at: string | null;
  initial_lineup_status: LineupStatus;
  jersey_number: number | null;
  evaluation_rating: number | null;
  evaluation_notes: string | null;
  is_mvp: boolean;
  data_quality: DataQuality;
  created_at: string;
  updated_at: string;
}

/**
 * Payload público — NUNCA inclui `initial_lineup_status`, `is_present`,
 * `data_quality`, `evaluation_*`, `is_mvp`.
 */
export type PublicSquadEntry = Pick<
  GameSquadEntry,
  | "id"
  | "game_id"
  | "player_id"
  | "external_name"
  | "external_jersey_number"
  | "external_position"
  | "jersey_number"
  | "response_status"
>;

export type InternalSquadEntry = GameSquadEntry;

const BANNED_PUBLIC_FIELDS = [
  "initial_lineup_status",
  "lineup_status",
  "is_present",
  "data_quality",
  "evaluation_rating",
  "evaluation_notes",
  "is_mvp",
] as const;

/**
 * Garante que um objecto não tem campos sensíveis. Útil em testes
 * anti-leak.
 */
export function assertNoSensitiveFields(
  obj: unknown,
): asserts obj is PublicSquadEntry {
  if (typeof obj !== "object" || obj === null) return;
  for (const key of BANNED_PUBLIC_FIELDS) {
    if (key in obj) {
      throw new Error(`Payload publico contem campo sensivel: ${key}`);
    }
  }
}

export const PUBLIC_SQUAD_BANNED_FIELDS = BANNED_PUBLIC_FIELDS;
