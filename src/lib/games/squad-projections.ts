/**
 * Listas canónicas de colunas para SELECT em `game_squads`.
 *
 * - `PUBLIC_SQUAD_COLUMNS` é usado por TODOS os endpoints/RSCs públicos.
 *   NÃO inclui campos sensíveis (initial_lineup_status, is_present,
 *   data_quality, evaluation_*, is_mvp).
 *
 * - `INTERNAL_SQUAD_COLUMNS` é usado por endpoints autenticados.
 *
 * Mudar a projecção pública aqui = mudar em todos os endpoints públicos
 * de uma só vez. Code review deve estranhar se alguém adicionar coluna
 * sensível à projecção pública.
 */

export const PUBLIC_SQUAD_COLUMNS =
  "id, game_id, player_id, external_name, external_jersey_number, external_position, jersey_number, response_status";

export const INTERNAL_SQUAD_COLUMNS =
  "id, game_id, club_id, player_id, external_name, external_jersey_number, external_position, source_age_group_id, is_present, response_status, response_at, initial_lineup_status, jersey_number, evaluation_rating, evaluation_notes, is_mvp, data_quality, created_at, updated_at";
