export type UserRole = "coordinator" | "coach" | "player" | "parent";
export type PlayerStatus = "active" | "injured" | "suspended" | "inactive";
export type AttendanceStatus = "present" | "absent" | "injured";
export type FootballFormat = "5" | "7" | "9" | "11";
export type EventStatus = "scheduled" | "completed" | "cancelled";
export type ConvocationStatus = "draft" | "confirmed" | "closed";
export type GameEventType =
  | "goal"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "penalty_goal"
  | "own_goal";
export type LineupType = "starter" | "substitute";
export type CompetitionType = "league" | "cup" | "friendly";
export type KitNumber = 1 | 2 | 3;
export type PlayerType = "field" | "goalkeeper";
export type PieceType = "shirt" | "shorts" | "socks";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

export interface AgeGroup {
  id: string;
  coordinator_id: string;
  club_name: string;
  club_logo_url?: string;
  name: string;
  football_format: FootballFormat;
  season: string;
  created_at: string;
}

export interface Team {
  id: string;
  age_group_id: string;
  name: string;
  is_competitive: boolean;
  tactical_system?: string;
  home_ground_id?: string;
  created_at: string;
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
  avatar_url?: string;
  status: PlayerStatus;
  profile_id?: string;
  invite_code?: string;
  invite_method?: string;
  invite_sent_at?: string;
  invite_accepted_at?: string;
  created_at: string;
}

export interface TrainingSession {
  id: string;
  age_group_id?: string;
  team_id: string;
  title?: string;
  session_date: string;
  start_time: string;
  end_time?: string;
  location?: string;
  location_address?: string;
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
  opponent_name?: string;
  opponent_id?: string;
  location?: string;
  location_address?: string;
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
  created_at: string;
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
  name: string;
  short_name?: string;
  logo_url?: string;
  created_at: string;
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

export interface GameFinalStats {
  id: string;
  game_id: string;
  player_id: string;
  lineup_type: LineupType;
  minutes_played?: number;
  goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  coach_rating?: number;
  is_finalized: boolean;
  created_at: string;
}

export interface TeamStaff {
  id: string;
  team_id: string;
  profile_id: string;
  role: string;
  created_at: string;
}
