-- RLS policies permissivas para as tabelas core que estavam a forçar createAdminClient.
-- Usa os helpers SECURITY DEFINER existentes para verificação de acesso.

---------------------------------------------------------------------------
-- 1. training_sessions — NÃO tinha RLS de todo
---------------------------------------------------------------------------
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Restrictive boundary: só membros do clube
CREATE POLICY training_sessions_domain_boundary_v1
  ON training_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.user_can_read_club_scope(club_id)
  )
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

-- Permissive SELECT: coordinator ou staff do age_group
CREATE POLICY training_sessions_select_v1
  ON training_sessions FOR SELECT TO authenticated
  USING (
    public.user_can_access_age_group(age_group_id)
  );

-- Permissive INSERT
CREATE POLICY training_sessions_insert_v1
  ON training_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

-- Permissive UPDATE
CREATE POLICY training_sessions_update_v1
  ON training_sessions FOR UPDATE TO authenticated
  USING (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  )
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

-- Permissive DELETE
CREATE POLICY training_sessions_delete_v1
  ON training_sessions FOR DELETE TO authenticated
  USING (
    public.user_can_manage_age_group_v2(age_group_id)
  );

---------------------------------------------------------------------------
-- 2. games — NÃO tinha RLS na tabela (só nas filhas)
---------------------------------------------------------------------------
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY games_domain_boundary_v1
  ON games AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.user_can_read_club_scope(club_id)
  )
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

CREATE POLICY games_select_v1
  ON games FOR SELECT TO authenticated
  USING (
    public.user_can_access_age_group(age_group_id)
  );

CREATE POLICY games_insert_v1
  ON games FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

CREATE POLICY games_update_v1
  ON games FOR UPDATE TO authenticated
  USING (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  )
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

CREATE POLICY games_delete_v1
  ON games FOR DELETE TO authenticated
  USING (
    public.user_can_manage_age_group_v2(age_group_id)
  );

---------------------------------------------------------------------------
-- 3. players — tinha RESTRICTIVE-only, faltavam permissive policies
---------------------------------------------------------------------------
DROP POLICY IF EXISTS players_select_v1 ON players;
CREATE POLICY players_select_v1
  ON players FOR SELECT TO authenticated
  USING (
    public.user_can_access_age_group(age_group_id)
  );

DROP POLICY IF EXISTS players_insert_v1 ON players;
CREATE POLICY players_insert_v1
  ON players FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

DROP POLICY IF EXISTS players_update_v1 ON players;
CREATE POLICY players_update_v1
  ON players FOR UPDATE TO authenticated
  USING (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  )
  WITH CHECK (
    public.user_can_write_age_group_scope(age_group_id, club_id)
  );

DROP POLICY IF EXISTS players_delete_v1 ON players;
CREATE POLICY players_delete_v1
  ON players FOR DELETE TO authenticated
  USING (
    public.user_can_manage_age_group_v2(age_group_id)
  );

---------------------------------------------------------------------------
-- 4. competitions — tinha RESTRICTIVE-only
---------------------------------------------------------------------------
DROP POLICY IF EXISTS competitions_select_v1 ON competitions;
CREATE POLICY competitions_select_v1
  ON competitions FOR SELECT TO authenticated
  USING (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS competitions_insert_v1 ON competitions;
CREATE POLICY competitions_insert_v1
  ON competitions FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS competitions_update_v1 ON competitions;
CREATE POLICY competitions_update_v1
  ON competitions FOR UPDATE TO authenticated
  USING (
    public.user_can_access_team(team_id)
  )
  WITH CHECK (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS competitions_delete_v1 ON competitions;
CREATE POLICY competitions_delete_v1
  ON competitions FOR DELETE TO authenticated
  USING (
    public.user_can_access_team(team_id)
  );

---------------------------------------------------------------------------
-- 5. kit_pieces — tinha RESTRICTIVE-only
---------------------------------------------------------------------------
DROP POLICY IF EXISTS kit_pieces_select_v1 ON kit_pieces;
CREATE POLICY kit_pieces_select_v1
  ON kit_pieces FOR SELECT TO authenticated
  USING (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS kit_pieces_insert_v1 ON kit_pieces;
CREATE POLICY kit_pieces_insert_v1
  ON kit_pieces FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS kit_pieces_update_v1 ON kit_pieces;
CREATE POLICY kit_pieces_update_v1
  ON kit_pieces FOR UPDATE TO authenticated
  USING (
    public.user_can_access_team(team_id)
  )
  WITH CHECK (
    public.user_can_access_team(team_id)
  );

DROP POLICY IF EXISTS kit_pieces_delete_v1 ON kit_pieces;
CREATE POLICY kit_pieces_delete_v1
  ON kit_pieces FOR DELETE TO authenticated
  USING (
    public.user_can_access_team(team_id)
  );
