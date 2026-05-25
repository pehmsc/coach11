export type UserRole = "coordinator" | "coach" | "player" | "parent";
export type PlayerStatus = "active" | "injured" | "suspended" | "inactive";
export type AttendanceStatus = "present" | "late" | "absent" | "injured";
export type FootballFormat = "5" | "7" | "9" | "11";
export type EventStatus = "scheduled" | "live" | "completed" | "cancelled";
export type ConvocationStatus = "draft" | "confirmed" | "closed";
export type GameEventType =
  | "goal"
  | "penalty_goal"
  | "assist"
  | "own_goal"
  | "yellow_card"
  | "red_card"
  | "substitution_in"
  | "substitution_out";
export type LineupType = "starter" | "substitute";
export type CompetitionType = "league" | "cup" | "friendly";
export type TeamLabel = "A" | "B" | "C";
export type KitNumber = 1 | 2 | 3;
export type PlayerType = "field" | "goalkeeper";
export type PieceType = "shirt" | "shorts" | "socks";
export type LocationSource = "google" | "osm" | "manual";
export type ExerciseCategory =
  | "attb"
  | "esquemas_taticos"
  | "estrategia"
  | "finalizacao"
  | "organizacao_defensiva"
  | "organizacao_ofensiva"
  | "principios_de_jogo"
  | "qualidades_fisicas"
  | "transicao_defensiva"
  | "transicao_ofensiva";
export type ExerciseOrientation = "recovery" | "strength" | "endurance" | "speed" | "flexibility" | "other";
export type ExerciseRegime = "aerobic" | "anaerobic_lactic" | "anaerobic_alactic";
export type ExerciseStatus = "active" | "archived";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  email?: string | null;
  phone?: string;
  avatar_url?: string;
  is_super_coordinator?: boolean;
  created_at: string;
}

export interface AgeGroup {
  id: string;
  coordinator_id: string;
  club_name: string;
  club_short_name?: string;
  club_logo_url?: string;
  /** Nome da equipa, ex: "Infantis A". Historicamente guardava o escalão. */
  name: string;
  /** Escalão/faixa etária, ex: "Sub-13". Campo adicionado em 2026-03-15. */
  age_level?: string | null;
  public_slug?: string | null;
  public_access_enabled?: boolean;
  public_access_count?: number;
  public_last_accessed_at?: string | null;
  football_format: FootballFormat;
  /** Fonte funcional de verdade do sistema tático base do escalão. */
  tactical_system?: string | null;
  season: string;
  created_at: string;
}

export interface Team {
  id: string;
  age_group_id: string;
  name: string;
  is_competitive: boolean;
  home_ground_id?: string;
  created_at: string;
}

export interface AgeGroupStaff {
  id: string;
  age_group_id: string;
  club_id: string;
  profile_id: string;
  linked_team_id?: string | null;
  role: "coach" | "assistant_coach";
  created_at: string;
  updated_at?: string;
}

export interface Player {
  id: string;
  age_group_id: string;
  first_name: string;
  last_name: string;
  birth_date?: string;
  preferred_position?: string;
  secondary_position?: string;
  jersey_number?: number;
  phone?: string;
  email?: string;
  parent_email?: string | null;
  parent_phone?: string | null;
  notes?: string | null;
  photo_consent_given?: boolean;
  /**
   * Path interno no bucket privado players-photos
   * (`{ageGroupId}/{playerId}.webp`). NÃO é URL pública. Para
   * apresentação, usar `avatar_signed_url` (gerada server-side).
   */
  avatar_url?: string | null;
  /**
   * Signed URL temporária (TTL ~1h) gerada server-side em
   * `GET /api/players/[id]` e `PATCH /api/players/[id]`. Não persistida
   * no DB.
   */
  avatar_signed_url?: string | null;
  status: PlayerStatus;
  profile_id?: string;
  invite_code?: string;
  invite_method?: string;
  invite_sent_at?: string;
  invite_accepted_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface TrainingSession {
  id: string;
  age_group_id?: string;
  club_id?: string;
  team_id: string;
  title?: string;
  session_date: string;
  start_time: string;
  end_time?: string;
  location?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string;
  location_source?: LocationSource | null;
  ut_number?: number | null;
  week_start_date?: string | null;
  objective?: string | null;
  complementary_objectives?: string | null;
  focus?: string | null;
  intensity?: string | null;
  material?: string | null;
  field_area?: string | null;
  notes?: string;
  image_url?: string;
  status: EventStatus;
  created_at: string;
}

export interface Game {
  id: string;
  age_group_id?: string;
  team_id?: string;
  competition_id?: string;
  title?: string;
  game_datetime: string;
  end_time?: string | null;
  opponent_name?: string;
  opponent_short_name?: string;
  opponent_id?: string;
  location?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string;
  location_source?: LocationSource | null;
  is_home: boolean;
  notes?: string;
  image_url?: string;
  status: EventStatus;
  /** game_type: "league" | "cup" | "friendly" — use competition for format info */
  game_type?: string;
  score_home?: number;
  score_away?: number;
  concentration_time?: string;
  equipment?: string;
  opponent_tactical_system?: string;
  additional_info?: string;
  /** Sistema táctico do nosso clube neste jogo (ex: "1-4-3-3"). Dropdown filtrado pelo football_format do escalão. Parte da ficha pós-jogo (Sprint 3). */
  tactical_system?: string | null;
  /** Aspectos a melhorar para próximos jogos/treinos. Parte da ficha pós-jogo (Sprint 3). Interno. */
  aspects_to_improve?: string | null;
  /** Notas tácticas e operacionais da equipa sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — visível ao staff do escalão, não ao público. */
  team_notes?: string | null;
  /** Aspectos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno. */
  positive_aspects?: string | null;
  /** Aspectos menos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno. */
  negative_aspects?: string | null;
  /** Notas privadas do treinador sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — privado. */
  coach_notes?: string | null;
  /** Camisola dos jogadores de campo (FK kit_pieces). PR #156a. */
  kit_fp_jersey_id?: string | null;
  /** Calções dos jogadores de campo (FK kit_pieces). PR #156a. */
  kit_fp_shorts_id?: string | null;
  /** Meias dos jogadores de campo (FK kit_pieces). PR #156a. */
  kit_fp_socks_id?: string | null;
  /** Camisola do guarda-redes (FK kit_pieces). PR #156a. */
  kit_gk_jersey_id?: string | null;
  /** Calções do guarda-redes (FK kit_pieces). PR #156a. */
  kit_gk_shorts_id?: string | null;
  /** Meias do guarda-redes (FK kit_pieces). PR #156a. */
  kit_gk_socks_id?: string | null;
  created_at: string;
}

export interface GameOpponentObservation {
  id: string;
  game_id: string;
  opponent_id: string;
  club_id: string;
  observation: string;
  /** Minuto do jogo na captura. NULL se capturada fora do jogo. PR B1. */
  minute?: number | null;
  promoted_to_opponent_at?: string | null;
  promoted_to_field?: "pontos_fortes" | "pontos_fracos" | "atletas_chave" | "notas_gerais" | null;
  promoted_by?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface GameOpponentObservationInsert {
  game_id: string;
  opponent_id: string;
  club_id: string;
  observation: string;
  minute?: number | null;
  created_by?: string | null;
}

export interface GameOpponentObservationUpdate {
  observation?: string;
  promoted_to_opponent_at?: string | null;
  promoted_to_field?: "pontos_fortes" | "pontos_fracos" | "atletas_chave" | "notas_gerais" | null;
  promoted_by?: string | null;
}

export interface AttendanceRecord {
  id: string;
  training_session_id: string;
  player_id: string;
  status: AttendanceStatus;
  justification?: string;
  marked_at: string;
  marked_by?: string;
}

/**
 * Competição — team_id referencia teams(id).
 * O formato (7, 9, 11) é determinado pela age_group associada à equipa.
 */
export interface Competition {
  id: string;
  team_id: string;
  name: string;
  season: string;
  phase?: string;
  team_label?: TeamLabel;
  num_opponents?: number;
  total_rounds?: number;
  has_two_legs?: boolean;
  created_at: string;
}

export interface Matchday {
  id: string;
  competition_id: string;
  number: number;
  date?: string;
  created_at: string;
}

export interface Opponent {
  id: string;
  age_group_id: string;
  club_id: string;
  competition_id?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  tactical_formation?: string | null;
  pontos_fortes?: string | null;
  pontos_fracos?: string | null;
  atletas_chave?: string | null;
  notas_gerais?: string | null;
  home_ground?: string | null;
  home_ground_address?: string | null;
  home_ground_lat?: number | null;
  home_ground_lng?: number | null;
  coach_name?: string | null;
  phone?: string | null;
  contact_info?: string | null;
  youth_academy_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Ground {
  id: string;
  age_group_id: string;
  name: string;
  address?: string;
  created_at: string;
}

export interface KitPiece {
  id: string;
  team_id: string;
  player_type: PlayerType;
  piece_type: PieceType;
  kit_number: KitNumber;
  color_name?: string;
  color_hex?: string;
  image_url?: string;
  created_at: string;
}

export interface Convocation {
  id: string;
  game_id: string;
  concentration_time?: string;
  location?: string;
  ground_id?: string;
  home_kit_id?: string;
  away_kit_id?: string;
  goalkeeper_kit_id?: string;
  notes?: string;
  status: ConvocationStatus;
  created_at: string;
}

export interface ConvocationPlayer {
  id: string;
  convocation_id: string;
  player_id: string;
  is_present?: boolean;
  response_status?: string;
  created_at: string;
}

export interface GameEvent {
  id: string;
  game_id: string;
  event_type: GameEventType;
  player_id?: string;
  related_player_id?: string;
  minute: number;
  is_opponent_event: boolean;
  created_at: string;
}

export interface GameStatsLive {
  id: string;
  game_id: string;
  player_id: string;
  status: string;
  start_minute?: number;
  end_minute?: number;
  stats?: Record<string, unknown>;
  created_at: string;
}

export interface GameLiveCheckpoint {
  game_id: string;
  phase:
    | "pre_match"
    | "first_half"
    | "halftime"
    | "second_half"
    | "review"
    | "completed";
  base_seconds: number;
  running_since_ms?: number | null;
  updated_at: string;
  updated_by?: string | null;
  created_at: string;
}

export interface GameFinalStats {
  id: string;
  game_id: string;
  player_id: string;
  lineup_type: LineupType;
  minutes_played?: number;
  goals?: number;
  own_goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  coach_rating?: number;
  notes?: string;
  is_mvp?: boolean;
  /** TRUE quando ao menos 1 campo numérico foi sobrescrito manualmente. */
  edited_manually?: boolean;
  /** Última alteração da row (mantido por trigger set_updated_at). */
  updated_at?: string;
  is_finalized: boolean;
  finalized_at?: string;
  created_at: string;
}

export interface TeamStaff {
  id: string;
  team_id: string;
  profile_id: string;
  role: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  club_id: string;
  age_group_id: string;
  created_by: string;
  name: string;
  description?: string | null;
  objectives?: string | null;
  success_criteria?: string | null;
  category: ExerciseCategory;
  subcategory?: string | null;
  game_format?: string | null;
  duration_minutes?: number | null;
  rest_minutes: number;
  min_players?: number | null;
  max_players?: number | null;
  field_dimensions?: string | null;
  material?: string | null;
  diagram_url?: string | null;
  orientation?: ExerciseOrientation | null;
  regime?: ExerciseRegime | null;
  notes?: string | null;
  status?: ExerciseStatus;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export type PhaseType = "initial" | "main" | "final" | "custom";

export interface TrainingPhase {
  id: string;
  training_session_id: string;
  club_id: string;
  phase_type: PhaseType;
  phase_name?: string | null;
  phase_order: number;
  duration_minutes?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingPhaseExercise {
  id: string;
  phase_id: string;
  exercise_id?: string | null;
  club_id: string;
  exercise_order: number;
  custom_name?: string | null;
  custom_description?: string | null;
  custom_objectives?: string | null;
  custom_game_format?: string | null;
  custom_duration_minutes?: number | null;
  custom_rest_minutes?: number | null;
  custom_num_players?: number | null;
  custom_field_dimensions?: string | null;
  custom_material?: string | null;
  custom_diagram_url?: string | null;
  planned_time_minutes?: number | null;
  repetitions: number;
  total_athletes?: number | null;
  notes?: string | null;
  created_at: string;
  exercise?: Exercise | null;
}

export type ClubRankingMetric =
  | "goals"
  | "assists"
  | "minutes"
  | "matches"
  | "trainings_present"
  | "trainings_absent"
  | "trainings_injured"
  | "trainings_late";

export interface ClubPlayerRanking {
  player_id: string;
  full_name: string;
  preferred_position: string | null;
  jersey_number: number | null;
  age_group_id: string;
  age_group_name: string;
  avatar_url: string | null;
  photo_consent_given: boolean;
  goals: number;
  assists: number;
  total_minutes: number;
  matches_played: number;
  trainings_present: number;
  trainings_absent: number;
  trainings_injured: number;
  trainings_late: number;
  metric_value: number;
}

export interface ClubInsights {
  club_id: string;
  age_groups_count: number;
  players_count: number;
  trainings_completed: number;
  trainings_total: number;
  trainings_present: number;
  training_minutes: number;
  games_played: number;
  games_won: number;
  games_drawn: number;
  games_lost: number;
  game_minutes: number;
  goals_for: number;
  goals_against: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
}
