-- Insights Fase 2: RPC de rankings de atletas do clube.
--
-- Devolve uma lista ordenada por uma metrica seleccionada, com o avatar e o
-- consentimento de uso de imagem (a UI decide se mostra foto ou iniciais).
--
-- Parametros (segue o mesmo padrao da get_club_insights pos-#231):
--   p_club_id        uuid              - clube alvo (gate user_can_access_club)
--   p_metric         text              - 'goals' | 'assists' | 'minutes' | 'trainings'
--   p_season         text DEFAULT NULL - filtra age_groups.season (NULL = todas)
--   p_age_group_id   uuid DEFAULT NULL - quando preenchido, restringe a esse escalao
--                                        (validado contra p_club_id)
--   p_limit          int  DEFAULT 10   - top N
--
-- Notas:
--   - SECURITY INVOKER (RLS aplica-se aos joins; a view player_season_stats
--     traz dados que o utilizador ja podia ler em /statistics).
--   - Devolve todos os contadores (goals, assists, total_minutes,
--     trainings_present) para o cliente ter contexto na UI sem chamadas extra.
--   - Cada linha representa um (player, age_group) — um jogador em multiplos
--     escaloes do mesmo clube aparece em multiplas linhas com o escalao
--     respectivo (raro mas legitimo).

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
  trainings_present bigint,
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

  IF p_metric NOT IN ('goals', 'assists', 'minutes', 'trainings') THEN
    RAISE EXCEPTION 'invalid metric: % (expected goals|assists|minutes|trainings)', p_metric
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
    pss.trainings_present,
    CASE p_metric
      WHEN 'goals' THEN pss.goals
      WHEN 'assists' THEN pss.assists
      WHEN 'minutes' THEN pss.total_minutes
      WHEN 'trainings' THEN pss.trainings_present
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
  'Insights Fase 2: top-N atletas de um clube por metrica (goals/assists/minutes/trainings). Quando p_age_group_id preenchido, restringe ao escalao (validando pertenca ao clube). Inclui avatar_url e photo_consent_given para a UI decidir foto vs iniciais.';
