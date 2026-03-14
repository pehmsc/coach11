import type { SupabaseClient } from "@supabase/supabase-js";

type CalendarDbClient = SupabaseClient;

type TrainingWritePayload = {
  age_group_id: string;
  team_id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string | null | undefined;
  location: string | null | undefined;
  location_address: string | null | undefined;
  formatted_address: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  osm_place_id: string | null | undefined;
  location_source: string | null | undefined;
  notes: string | null | undefined;
  image_url: string | null | undefined;
};

type GameWritePayload = {
  age_group_id: string;
  team_id: string;
  title: string;
  game_datetime: string;
  end_time: string | null | undefined;
  competition_id: string | null;
  opponent_name: string | null | undefined;
  opponent_short_name: string | null | undefined;
  location: string | null | undefined;
  location_address: string | null | undefined;
  formatted_address: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  osm_place_id: string | null | undefined;
  location_source: string | null | undefined;
  is_home: boolean;
  notes: string | null | undefined;
  image_url: string | null | undefined;
};

export async function getAgeGroupLabelById(
  db: CalendarDbClient,
  ageGroupId: string,
) {
  return db
    .from("age_groups")
    .select("club_name, name")
    .eq("id", ageGroupId)
    .maybeSingle();
}

// Perf: campos específicos — evitar transferir club_id, updated_at e outros
// campos internos não usados pela UI do calendário.
const TRAINING_SESSION_CALENDAR_FIELDS =
  "id, age_group_id, team_id, title, session_date, start_time, end_time, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, image_url, status, created_at";

// Perf: campos específicos — evitar transferir club_id e outros campos
// internos não usados pela UI do calendário.
const GAME_CALENDAR_FIELDS =
  "id, age_group_id, team_id, competition_id, title, game_datetime, end_time, opponent_name, opponent_short_name, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, is_home, notes, image_url, status, score_home, score_away, created_at";

export async function listTrainingSessionsInRange(
  db: CalendarDbClient,
  ageGroupId: string,
  from: string,
  to: string,
) {
  return db
    .from("training_sessions")
    .select(TRAINING_SESSION_CALENDAR_FIELDS)
    .eq("age_group_id", ageGroupId)
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
}

export async function listGamesInRange(
  db: CalendarDbClient,
  ageGroupId: string,
  from: string,
  to: string,
) {
  return db
    .from("games")
    .select(GAME_CALENDAR_FIELDS)
    .eq("age_group_id", ageGroupId)
    .gte("game_datetime", `${from}T00:00:00`)
    .lte("game_datetime", `${to}T23:59:59`)
    .order("game_datetime", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function isCoordinatorForAgeGroup(
  db: CalendarDbClient,
  ageGroupId: string,
  userId: string,
) {
  return db
    .from("age_groups")
    .select("id")
    .eq("id", ageGroupId)
    .eq("coordinator_id", userId)
    .maybeSingle();
}

export async function getAgeGroupFromTeamId(
  db: CalendarDbClient,
  teamId: string,
) {
  return db
    .from("teams")
    .select("age_group_id")
    .eq("id", teamId)
    .maybeSingle();
}

export async function getCompetitionForTeam(
  db: CalendarDbClient,
  competitionId: string,
  teamId: string,
) {
  return db
    .from("competitions")
    .select("id")
    .eq("id", competitionId)
    .eq("team_id", teamId)
    .maybeSingle();
}

export async function insertTrainingSession(
  db: CalendarDbClient,
  payload: TrainingWritePayload,
) {
  return db
    .from("training_sessions")
    .insert({
      ...payload,
      status: "scheduled",
    })
    // Perf: campos específicos — mesma projecção que listTrainingSessionsInRange.
    .select(TRAINING_SESSION_CALENDAR_FIELDS)
    .single();
}

export async function insertGame(
  db: CalendarDbClient,
  payload: GameWritePayload,
) {
  return db
    .from("games")
    .insert({
      ...payload,
      status: "scheduled",
      game_type: "league",
    })
    // Perf: campos específicos — mesma projecção que listGamesInRange.
    .select(GAME_CALENDAR_FIELDS)
    .single();
}

export async function getTrainingSessionAccessRow(
  db: CalendarDbClient,
  id: string,
) {
  return db
    .from("training_sessions")
    .select("id, age_group_id, team_id")
    .eq("id", id)
    .maybeSingle();
}

export async function updateTrainingSession(
  db: CalendarDbClient,
  id: string,
  payload: TrainingWritePayload,
) {
  return db
    .from("training_sessions")
    .update(payload)
    .eq("id", id)
    // Perf: campos específicos — mesma projecção que listTrainingSessionsInRange.
    .select(TRAINING_SESSION_CALENDAR_FIELDS)
    .single();
}

export async function getGameAccessRow(
  db: CalendarDbClient,
  id: string,
) {
  return db
    .from("games")
    .select("id, age_group_id, team_id, status")
    .eq("id", id)
    .maybeSingle();
}

export async function updateGame(
  db: CalendarDbClient,
  id: string,
  payload: GameWritePayload,
) {
  return db
    .from("games")
    .update(payload)
    .eq("id", id)
    // Perf: campos específicos — mesma projecção que listGamesInRange.
    .select(GAME_CALENDAR_FIELDS)
    .single();
}
