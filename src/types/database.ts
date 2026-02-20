export type UserRole = "coordinator" | "coach" | "player" | "parent";
export type PlayerStatus = "active" | "injured" | "suspended" | "inactive";
export type AttendanceStatus = "present" | "absent" | "injured";
export type FootballFormat = "5" | "7" | "9" | "11";
export type EventStatus = "scheduled" | "completed" | "cancelled";

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
  title?: string;
  game_datetime: string;
  opponent_name?: string;
  location?: string;
  location_address?: string;
  is_home: boolean;
  notes?: string;
  image_url?: string;
  status: EventStatus;
  game_type?: string;
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
