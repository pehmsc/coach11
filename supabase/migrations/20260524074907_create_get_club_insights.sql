-- RPC get_club_insights: agrega KPIs de Insights por clube (todos os escalões
-- do clube). SECURITY INVOKER + validação explícita via user_can_access_club
-- garantem que apenas utilizadores com acesso ao clube alvo vêem os dados.
--
-- Fontes:
--   * presenças/atletas/minutos de jogo/assists/cartões → view player_season_stats
--     (Fase 0 / PR #219 corrigiu o fan-out — sem isso os valores vinham 35× inflacionados).
--   * treinos concluídos e minutos de treino → training_sessions directamente
--     (a view não tem essas métricas).
--   * jogos disputados, V-E-D, golos marcados/sofridos → games.score_* + is_home
--     (fonte do scoreboard, coerente com /games).
--
-- A coluna `season` é text em age_groups, daí p_season text (não uuid).

CREATE OR REPLACE FUNCTION public.get_club_insights(
  p_club_id uuid,
  p_season text DEFAULT NULL
) RETURNS TABLE(
  club_id uuid,
  age_groups_count integer,
  players_count integer,
  trainings_completed integer,
  trainings_total integer,
  trainings_present bigint,
  training_minutes bigint,
  games_played integer,
  games_won integer,
  games_drawn integer,
  games_lost integer,
  game_minutes bigint,
  goals_for bigint,
  goals_against bigint,
  assists bigint,
  yellow_cards bigint,
  red_cards bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.user_can_access_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden: user does not have access to club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped_age_groups AS (
    SELECT ag.id
    FROM public.age_groups ag
    WHERE ag.club_id = p_club_id
      AND (p_season IS NULL OR ag.season = p_season)
  ),
  players_stats AS (
    SELECT
      COUNT(DISTINCT pss.player_id)::integer AS players_count,
      COALESCE(SUM(pss.trainings_present), 0)::bigint AS trainings_present,
      COALESCE(SUM(pss.total_minutes), 0)::bigint AS game_minutes,
      COALESCE(SUM(pss.assists), 0)::bigint AS assists,
      COALESCE(SUM(pss.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(SUM(pss.red_cards), 0)::bigint AS red_cards
    FROM public.player_season_stats pss
    WHERE pss.age_group_id IN (SELECT id FROM scoped_age_groups)
  ),
  trainings_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE ts.status = 'completed')::integer AS trainings_completed,
      COUNT(*)::integer AS trainings_total,
      COALESCE(
        SUM(
          EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 60.0
        ) FILTER (
          WHERE ts.status = 'completed'
            AND ts.start_time IS NOT NULL
            AND ts.end_time IS NOT NULL
        ),
        0
      )::bigint AS training_minutes
    FROM public.training_sessions ts
    WHERE ts.age_group_id IN (SELECT id FROM scoped_age_groups)
  ),
  games_stats AS (
    SELECT
      COUNT(*)::integer AS games_played,
      COUNT(*) FILTER (
        WHERE (g.is_home AND g.score_home > g.score_away)
           OR (NOT g.is_home AND g.score_away > g.score_home)
      )::integer AS games_won,
      COUNT(*) FILTER (WHERE g.score_home = g.score_away)::integer AS games_drawn,
      COUNT(*) FILTER (
        WHERE (g.is_home AND g.score_home < g.score_away)
           OR (NOT g.is_home AND g.score_away < g.score_home)
      )::integer AS games_lost,
      COALESCE(
        SUM(CASE WHEN g.is_home THEN g.score_home ELSE g.score_away END),
        0
      )::bigint AS goals_for,
      COALESCE(
        SUM(CASE WHEN g.is_home THEN g.score_away ELSE g.score_home END),
        0
      )::bigint AS goals_against
    FROM public.games g
    WHERE g.age_group_id IN (SELECT id FROM scoped_age_groups)
      AND g.score_home IS NOT NULL
      AND g.score_away IS NOT NULL
  ),
  ag_count AS (
    SELECT COUNT(*)::integer AS n FROM scoped_age_groups
  )
  SELECT
    p_club_id AS club_id,
    ag_count.n AS age_groups_count,
    players_stats.players_count,
    trainings_stats.trainings_completed,
    trainings_stats.trainings_total,
    players_stats.trainings_present,
    trainings_stats.training_minutes,
    games_stats.games_played,
    games_stats.games_won,
    games_stats.games_drawn,
    games_stats.games_lost,
    players_stats.game_minutes,
    games_stats.goals_for,
    games_stats.goals_against,
    players_stats.assists,
    players_stats.yellow_cards,
    players_stats.red_cards
  FROM ag_count, players_stats, trainings_stats, games_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_insights(uuid, text) TO authenticated;
