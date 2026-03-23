CREATE TABLE IF NOT EXISTS athlete_intake_submissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name           TEXT NOT NULL,
  last_name            TEXT,
  dob                  DATE,
  parent_name          TEXT,
  height_cm            NUMERIC(5,1),
  weight_kg            NUMERIC(5,1),
  dominant_foot        TEXT CHECK (dominant_foot IN ('right','left','both')),
  preferred_position   TEXT,
  previous_clubs       TEXT,
  years_federated      TEXT,
  time_without_club    TEXT,
  individual_training  TEXT,
  individual_detail    TEXT,
  heel_pain_level      SMALLINT CHECK (heel_pain_level BETWEEN 0 AND 10),
  heel_when            TEXT[],
  current_injuries     TEXT,
  past_injuries        TEXT,
  physiotherapy_status TEXT,
  self_ball_control    SMALLINT CHECK (self_ball_control BETWEEN 1 AND 5),
  self_speed           SMALLINT CHECK (self_speed BETWEEN 1 AND 5),
  self_dribbling       SMALLINT CHECK (self_dribbling BETWEEN 1 AND 5),
  self_finishing       SMALLINT CHECK (self_finishing BETWEEN 1 AND 5),
  self_aerobic         SMALLINT CHECK (self_aerobic BETWEEN 1 AND 5),
  self_game_reading    SMALLINT CHECK (self_game_reading BETWEEN 1 AND 5),
  strongest_point      TEXT,
  improvement_area     TEXT,
  main_objective       TEXT,
  target_clubs         TEXT,
  idol_player          TEXT,
  idol_reason          TEXT,
  motivation_text      TEXT,
  motivation_level     SMALLINT CHECK (motivation_level BETWEEN 1 AND 10),
  available_days       TEXT[],
  preferred_time       TEXT,
  sessions_per_week    TEXT,
  training_location    TEXT,
  parent_present       TEXT,
  additional_notes     TEXT,
  lang                 TEXT DEFAULT 'pt',
  submitted_at         TIMESTAMPTZ DEFAULT now(),
  reviewed             BOOLEAN DEFAULT false,
  reviewed_at          TIMESTAMPTZ,
  notes_coach          TEXT
);

ALTER TABLE athlete_intake_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_insert_public" ON athlete_intake_submissions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "intake_select_auth" ON athlete_intake_submissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "intake_update_auth" ON athlete_intake_submissions
  FOR UPDATE USING (auth.role() = 'authenticated');
