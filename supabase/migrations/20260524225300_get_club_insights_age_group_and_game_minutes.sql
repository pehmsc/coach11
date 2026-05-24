-- Insights: adicionar filtro opcional por escalao e corrigir minutos de jogo.
--
-- Mudancas:
--   1) Novo parametro p_age_group_id uuid DEFAULT NULL. Quando preenchido,
--      restringe os KPIs a esse escalao (e valida que pertence ao clube).
--      Quando NULL, agrega o clube todo (comportamento anterior).
--   2) game_minutes deixa de ser a soma de minutos-atleta vinda da view
--      player_season_stats e passa a ser a soma da duracao padrao dos jogos
--      disputados, derivada do football_format do escalao (5=40, 7=50, 9=60,
--      11=80; fallback 60). Representa "tempo total de jogo" no sentido humano.
--
-- A assinatura muda (novo parametro), por isso e' necessario DROP explicito da
-- versao antiga antes do CREATE.

DROP FUNCTION IF EXISTS public.get_club_insights(uuid, text);

CREATE OR REPLACE FUNCTION public.get_club_insights(
  p_club_id uuid,
  p_season text,
  p_age_group_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_can_access_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden: user does not have access to club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF p_age_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.age_groups ag
      WHERE ag.id = p_age_group_id AND ag.club_id = p_club_id
    ) THEN
      RAISE EXCEPTION 'forbidden: age_group % does not belong to club %', p_age_group_id, p_club_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH scoped_age_groups AS (
    SELECT ag.id, ag.football_format
    FROM public.age_groups ag
    WHERE ag.club_id = p_club_id
      AND (p_season IS NULL OR ag.season = p_season)
      AND (p_age_group_id IS NULL OR ag.id = p_age_group_id)
  ),
  players_stats AS (
    SELECT
      COUNT(DISTINCT pss.player_id)::integer AS players_count,
      COALESCE(SUM(pss.trainings_present), 0)::bigint AS trainings_present,
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
  games_scoped AS (
    SELECT
      g.id,
      g.is_home,
      g.score_home,
      g.score_away,
      sag.football_format
    FROM public.games g
    JOIN scoped_age_groups sag ON sag.id = g.age_group_id
    WHERE g.score_home IS NOT NULL
      AND g.score_away IS NOT NULL
  ),
  games_stats AS (
    SELECT
      COUNT(*)::integer AS games_played,
      COUNT(*) FILTER (
        WHERE (is_home AND score_home > score_away)
           OR (NOT is_home AND score_away > score_home)
      )::integer AS games_won,
      COUNT(*) FILTER (WHERE score_home = score_away)::integer AS games_drawn,
      COUNT(*) FILTER (
        WHERE (is_home AND score_home < score_away)
           OR (NOT is_home AND score_away < score_home)
      )::integer AS games_lost,
      COALESCE(
        SUM(CASE WHEN is_home THEN score_home ELSE score_away END),
        0
      )::bigint AS goals_for,
      COALESCE(
        SUM(CASE WHEN is_home THEN score_away ELSE score_home END),
        0
      )::bigint AS goals_against,
      COALESCE(
        SUM(
          CASE football_format
            WHEN '5' THEN 40
            WHEN '7' THEN 50
            WHEN '9' THEN 60
            WHEN '11' THEN 80
            ELSE 60
          END
        ),
        0
      )::bigint AS game_minutes
    FROM games_scoped
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
    games_stats.game_minutes,
    games_stats.goals_for,
    games_stats.goals_against,
    players_stats.assists,
    players_stats.yellow_cards,
    players_stats.red_cards
  FROM ag_count, players_stats, trainings_stats, games_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_insights(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_insights(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_club_insights(uuid, text, uuid) IS
  'Agrega KPIs do clube (treinos, jogos, atletas). Quando p_age_group_id e'' fornecido, restringe ao escalao indicado (validando pertenca ao clube). game_minutes = soma da duracao padrao dos jogos disputados, derivada do football_format do escalao.';
