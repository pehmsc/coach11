-- Insights: separa metricas de TREINO e de JOGO no ranking de atletas.
--
-- Antes: p_metric in (goals, assists, minutes, trainings) — uma unica metrica
-- de treino (presencas) misturada com metricas de jogo.
--
-- Agora: as 4 metricas de treino (present/absent/injured/late) e as 4 metricas
-- de jogo (goals/assists/minutes/matches) sao parametros distintos. A pagina
-- /insights mostra rankings adequados ao contexto da tab (Treinos vs Jogos).
--
-- Mudancas na coluna retornada:
--   - + trainings_late (novo na view; ja exposto)
--   - + matches_played (matches_started + matches_substitute) — usado pela
--     metrica 'matches'.
--   - O retorno acrescenta colunas, pelo que se faz DROP+CREATE.

DROP FUNCTION IF EXISTS public.get_club_player_rankings(uuid, text, text, uuid, int);

CREATE OR REPLACE FUNCTION public.get_club_player_rankings(
  p_club_id uuid,
  p_metric text,
  p_season text DEFAULT NULL,
  p_age_group_id uuid DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  player_id uuid,
  full_name text,
  preferred_position text,
  jersey_number integer,
  age_group_id uuid,
  age_group_name text,
  avatar_url text,
  photo_consent_given boolean,
  goals bigint,
  assists bigint,
  total_minutes bigint,
  matches_played bigint,
  trainings_present bigint,
  trainings_absent bigint,
  trainings_injured bigint,
  trainings_late bigint,
  metric_value bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_effective_limit int;
BEGIN
  IF NOT public.user_can_access_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden: user does not have access to club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF p_metric NOT IN (
    'goals', 'assists', 'minutes', 'matches',
    'trainings_present', 'trainings_absent', 'trainings_injured', 'trainings_late'
  ) THEN
    RAISE EXCEPTION 'invalid metric: % (expected one of goals|assists|minutes|matches|trainings_present|trainings_absent|trainings_injured|trainings_late)', p_metric
      USING ERRCODE = '22023';
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

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));

  RETURN QUERY
  SELECT
    pss.player_id,
    pss.full_name,
    pss.preferred_position,
    pss.jersey_number,
    pss.age_group_id,
    ag.name AS age_group_name,
    pl.avatar_url,
    pl.photo_consent_given,
    pss.goals,
    pss.assists,
    pss.total_minutes,
    (pss.matches_started + pss.matches_substitute)::bigint AS matches_played,
    pss.trainings_present,
    pss.trainings_absent,
    pss.trainings_injured,
    pss.trainings_late,
    CASE p_metric
      WHEN 'goals' THEN pss.goals
      WHEN 'assists' THEN pss.assists
      WHEN 'minutes' THEN pss.total_minutes
      WHEN 'matches' THEN (pss.matches_started + pss.matches_substitute)::bigint
      WHEN 'trainings_present' THEN pss.trainings_present
      WHEN 'trainings_absent' THEN pss.trainings_absent
      WHEN 'trainings_injured' THEN pss.trainings_injured
      WHEN 'trainings_late' THEN pss.trainings_late
    END AS metric_value
  FROM public.player_season_stats pss
  JOIN public.age_groups ag ON ag.id = pss.age_group_id
  JOIN public.players pl ON pl.id = pss.player_id
  WHERE ag.club_id = p_club_id
    AND (p_season IS NULL OR ag.season = p_season)
    AND (p_age_group_id IS NULL OR ag.id = p_age_group_id)
  ORDER BY metric_value DESC NULLS LAST, pss.full_name ASC
  LIMIT v_effective_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_player_rankings(uuid, text, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_player_rankings(uuid, text, text, uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_club_player_rankings(uuid, text, text, uuid, int) IS
  'Insights: top-N atletas de um clube por metrica. Metricas de jogo: goals, assists, minutes, matches. Metricas de treino: trainings_present, trainings_absent, trainings_injured, trainings_late. Quando p_age_group_id preenchido, restringe ao escalao (validando pertenca ao clube). Inclui avatar_url e photo_consent_given para a UI decidir foto vs iniciais.';
