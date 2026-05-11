-- Adiciona FK game_final_stats.game_id -> games.id.
--
-- Motivo: GET /api/players/[id]/games faz join PostgREST entre game_final_stats
-- e games (ex: select '*, games(*)'). Sem FK declarada, PostgREST devolve
-- PGRST200 "Could not find a relationship". Sentry issue COACH11-R.
--
-- Verificado em producao: 345 rows, 0 nulls, 0 orfaos. FK pode ser aplicada
-- sem necessidade de back-fill ou limpeza.

ALTER TABLE public.game_final_stats
ADD CONSTRAINT game_final_stats_game_id_fkey
FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

DO $$
DECLARE
  fk_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_final_stats_game_id_fkey'
      AND conrelid = 'public.game_final_stats'::regclass
  ) INTO fk_exists;

  IF NOT fk_exists THEN
    RAISE EXCEPTION 'FK game_final_stats_game_id_fkey nao foi criada';
  END IF;
END $$;
