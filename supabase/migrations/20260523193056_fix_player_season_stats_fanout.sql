-- Fix fan-out (produto cartesiano) na view public.player_season_stats.
--
-- Bug: a definição anterior fazia LEFT JOIN simultâneo a `training_attendance`
-- e `game_final_stats` a partir de `players`. Como ambos têm cardinalidade N
-- por jogador, isto produz N×M linhas — os COUNT(DISTINCT ...) sobreviviam,
-- mas SUM(...)/avg(...) sobre as colunas de jogos eram somados uma vez por
-- linha de presença, inflacionando minutos/golos/assistências/cartões/own_goals
-- e enviesando o avg_rating.
--
-- Correcção: pre-aggregation em subconsultas por player_id (uma para presenças,
-- outra para jogos) antes do JOIN com players. Cardinalidades verificadas:
-- training_attendance e game_final_stats têm uma linha única por
-- (player_id, training_session_id) e (player_id, game_id) respectivamente,
-- pelo que count(*) FILTER é equivalente ao count(DISTINCT ...) original.
--
-- Mantém colunas, tipos e ordem; preserva security_invoker=true.

CREATE OR REPLACE VIEW public.player_season_stats AS
SELECT
  p.id AS player_id,
  ((p.first_name || ' '::text) || p.last_name) AS full_name,
  p.preferred_position,
  p.jersey_number,
  p.age_group_id,
  COALESCE(ta.trainings_present, 0::bigint) AS trainings_present,
  COALESCE(ta.trainings_absent, 0::bigint) AS trainings_absent,
  COALESCE(ta.trainings_injured, 0::bigint) AS trainings_injured,
  COALESCE(g.matches_started, 0::bigint) AS matches_started,
  COALESCE(g.matches_substitute, 0::bigint) AS matches_substitute,
  COALESCE(g.total_minutes, 0::bigint) AS total_minutes,
  COALESCE(g.goals, 0::bigint) AS goals,
  COALESCE(g.assists, 0::bigint) AS assists,
  COALESCE(g.own_goals, 0::bigint) AS own_goals,
  COALESCE(g.yellow_cards, 0::bigint) AS yellow_cards,
  COALESCE(g.red_cards, 0::bigint) AS red_cards,
  g.avg_rating
FROM public.players p
LEFT JOIN (
  SELECT
    player_id,
    count(*) FILTER (WHERE status = 'present'::text) AS trainings_present,
    count(*) FILTER (WHERE status = 'absent'::text) AS trainings_absent,
    count(*) FILTER (WHERE status = 'injured'::text) AS trainings_injured
  FROM public.training_attendance
  GROUP BY player_id
) ta ON ta.player_id = p.id
LEFT JOIN (
  SELECT
    player_id,
    count(*) FILTER (WHERE lineup_type = 'starter'::text) AS matches_started,
    count(*) FILTER (WHERE lineup_type = 'substitute'::text) AS matches_substitute,
    COALESCE(sum(minutes_played), 0::bigint) AS total_minutes,
    COALESCE(sum(goals), 0::bigint) AS goals,
    COALESCE(sum(assists), 0::bigint) AS assists,
    COALESCE(sum(own_goals), 0::bigint) AS own_goals,
    COALESCE(sum(yellow_cards), 0::bigint) AS yellow_cards,
    COALESCE(sum(red_cards), 0::bigint) AS red_cards,
    round(avg(coach_rating), 1) AS avg_rating
  FROM public.game_final_stats
  WHERE is_finalized = true
  GROUP BY player_id
) g ON g.player_id = p.id;

ALTER VIEW public.player_season_stats SET (security_invoker = true);
