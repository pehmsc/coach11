-- PERF (c)+(d) da auditoria 2026-06-10.
--
-- (c) duplicate_index: 6 pares identicos; dropar apenas os que NAO sao
--     constraints (verificado em pg_constraint.conindid na Fase 1):
--       age_groups: mantem age_groups_club_id_idx
--       club_memberships: mantem club_memberships_club_id_idx e
--         club_memberships_profile_id_idx
--       clubs: mantem clubs_slug_key (UNIQUE constraint)
--       game_stats_live: mantem game_stats_live_game_id_player_id_key (constraint)
--       team_staff: mantem team_staff_profile_id_idx
DROP INDEX IF EXISTS public.idx_age_groups_club;
DROP INDEX IF EXISTS public.idx_club_memberships_club;
DROP INDEX IF EXISTS public.idx_club_memberships_profile;
DROP INDEX IF EXISTS public.clubs_slug_unique_idx;
DROP INDEX IF EXISTS public.idx_game_stats_live_game_player_unique;
DROP INDEX IF EXISTS public.idx_team_staff_profile_id;

-- (d) FKs sem indice no caminho de estatisticas/insights (player_id nunca e
--     coluna lider de nenhum indice existente nestas tabelas — Fase 1).
CREATE INDEX IF NOT EXISTS game_events_player_id_idx ON public.game_events (player_id);
CREATE INDEX IF NOT EXISTS game_events_related_player_id_idx ON public.game_events (related_player_id);
CREATE INDEX IF NOT EXISTS game_final_stats_player_id_idx ON public.game_final_stats (player_id);
CREATE INDEX IF NOT EXISTS game_squads_player_id_idx ON public.game_squads (player_id);
CREATE INDEX IF NOT EXISTS game_stats_live_player_id_idx ON public.game_stats_live (player_id);
CREATE INDEX IF NOT EXISTS convocation_players_player_id_idx ON public.convocation_players (player_id);
