-- Adiciona policies PERMISSIVE para INSERT/UPDATE/DELETE nas 3 tabelas
-- legacy de convocatorias. Antes deste fix, estas tabelas tinham apenas
-- SELECT/PERMISSIVE + ALL/RESTRICTIVE, o que bloqueava silenciosamente
-- todas as escritas via user authenticated (RLS exige pelo menos uma
-- policy PERMISSIVE aplicavel por command, OR entre elas; RESTRICTIVE
-- e AND adicional, nao substituto).
--
-- Sintoma reportado por Pedro a 17 Mai 2026: DELETE /api/games/<id>
-- retornava 500 com "permission denied for table convocation_players"
-- (Sentry COACH11-V) porque deleteGameCascade tentava apagar a
-- convocation antes do game. O modal de "Apagar jogo" nao mostrava
-- toast nem error (bug separado tratado no mesmo PR).
--
-- Padrao alinhado com game_squads:
--  - INSERT permissive com with_check = user_can_write_game / access_convocation
--  - UPDATE permissive com using + check = user_can_write_game / access_convocation
--  - DELETE permissive com using = user_can_write_game / access_convocation
--
-- A policy ALL/RESTRICTIVE existente mantem-se intocada — funciona como
-- camada de defesa em profundidade (AND com a PERMISSIVE).

BEGIN;

-- ============================================================
-- convocations (coluna disponivel: game_id)
-- ============================================================

CREATE POLICY convocations_write_insert_v1
  ON public.convocations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY convocations_write_update_v1
  ON public.convocations
  FOR UPDATE
  TO authenticated
  USING (public.user_can_write_game(game_id))
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY convocations_write_delete_v1
  ON public.convocations
  FOR DELETE
  TO authenticated
  USING (public.user_can_write_game(game_id));

-- ============================================================
-- convocation_players (coluna disponivel: convocation_id)
-- ============================================================

CREATE POLICY convocation_players_write_insert_v1
  ON public.convocation_players
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_convocation(convocation_id));

CREATE POLICY convocation_players_write_update_v1
  ON public.convocation_players
  FOR UPDATE
  TO authenticated
  USING (public.user_can_access_convocation(convocation_id))
  WITH CHECK (public.user_can_access_convocation(convocation_id));

CREATE POLICY convocation_players_write_delete_v1
  ON public.convocation_players
  FOR DELETE
  TO authenticated
  USING (public.user_can_access_convocation(convocation_id));

-- ============================================================
-- external_player_convocations (coluna disponivel: game_id)
-- ============================================================

CREATE POLICY external_player_convocations_write_insert_v1
  ON public.external_player_convocations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY external_player_convocations_write_update_v1
  ON public.external_player_convocations
  FOR UPDATE
  TO authenticated
  USING (public.user_can_write_game(game_id))
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY external_player_convocations_write_delete_v1
  ON public.external_player_convocations
  FOR DELETE
  TO authenticated
  USING (public.user_can_write_game(game_id));

COMMIT;
