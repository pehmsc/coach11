-- Sincroniza game_squads.initial_lineup_status a partir do payload de
-- rpc_finalize_game.
--
-- Razão: o coach pode alterar quem foi titular no momento de finalizar
-- (ou no "Editar Final Stats" posterior). O lineup_type que envia é
-- a fonte de verdade humana. Em modelo unificado, isto tem que reflectir
-- em game_squads.initial_lineup_status.
--
-- Ordem de operações importante: o UPDATE em game_squads acontece ANTES
-- do UPDATE em games.status (que muda para 'completed'), porque o trigger
-- enforce_initial_lineup_immutability bloqueia alterações quando status
-- já não é 'scheduled'/'live'. Sequência:
--   1. DELETE em game_final_stats
--   2. INSERT em game_final_stats
--   3. UPDATE game_squads.initial_lineup_status  ← novo
--   4. UPDATE games (status='completed', scores)
--   5. INSERT em game_live_checkpoints

CREATE OR REPLACE FUNCTION public.rpc_finalize_game(
  p_game_id uuid,
  p_final_stats jsonb,
  p_score_home integer,
  p_score_away integer,
  p_final_minute integer DEFAULT NULL,
  p_updated_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_inserted_rows integer := 0;
  v_squads_synced integer := 0;
  v_base_seconds integer := 0;
  v_current_status text;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'p_game_id é obrigatório';
  END IF;

  IF p_final_stats IS NULL OR jsonb_typeof(p_final_stats) <> 'array' THEN
    RAISE EXCEPTION 'p_final_stats inválido (esperado array json)';
  END IF;

  IF p_score_home IS NULL OR p_score_away IS NULL THEN
    RAISE EXCEPTION 'score final inválido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  PERFORM 1
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo não encontrado';
  END IF;

  DELETE FROM public.game_final_stats
  WHERE game_id = p_game_id;

  INSERT INTO public.game_final_stats (
    game_id,
    player_id,
    lineup_type,
    minutes_played,
    goals,
    own_goals,
    assists,
    yellow_cards,
    red_cards,
    coach_rating,
    notes,
    is_mvp,
    is_finalized,
    finalized_at,
    edited_manually
  )
  SELECT
    p_game_id,
    r.player_id,
    r.lineup_type,
    GREATEST(0, COALESCE(r.minutes_played, 0)),
    GREATEST(0, COALESCE(r.goals, 0)),
    GREATEST(0, COALESCE(r.own_goals, 0)),
    GREATEST(0, COALESCE(r.assists, 0)),
    GREATEST(0, COALESCE(r.yellow_cards, 0)),
    GREATEST(0, COALESCE(r.red_cards, 0)),
    CASE
      WHEN r.coach_rating IS NULL THEN NULL
      WHEN r.coach_rating < 0 THEN 0
      WHEN r.coach_rating > 10 THEN 10
      ELSE r.coach_rating
    END,
    NULLIF(TRIM(COALESCE(r.notes, '')), ''),
    COALESCE(r.is_mvp, false),
    COALESCE(r.is_finalized, true),
    COALESCE(r.finalized_at, v_now),
    COALESCE(r.edited_manually, false)
  FROM jsonb_to_recordset(p_final_stats) AS r(
    player_id uuid,
    lineup_type text,
    minutes_played integer,
    goals integer,
    own_goals integer,
    assists integer,
    yellow_cards integer,
    red_cards integer,
    coach_rating numeric,
    notes text,
    is_mvp boolean,
    is_finalized boolean,
    finalized_at timestamptz,
    edited_manually boolean
  );

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  -- NOVO: Sincronizar game_squads.initial_lineup_status com o payload do
  -- coach. ANTES de mudar games.status (que activaria o trigger de
  -- imutabilidade). Apenas actualiza linhas que mudam de valor.
  UPDATE public.game_squads gs
  SET initial_lineup_status = r.lineup_type
  FROM jsonb_to_recordset(p_final_stats) AS r(
    player_id uuid,
    lineup_type text
  )
  WHERE gs.game_id = p_game_id
    AND gs.player_id = r.player_id
    AND r.lineup_type IN ('starter', 'substitute')
    AND gs.initial_lineup_status IS DISTINCT FROM r.lineup_type;

  GET DIAGNOSTICS v_squads_synced = ROW_COUNT;

  -- AGORA mudar games.status — após game_squads já estar sincronizado.
  -- Preservar status terminal não-completed (cancelled, postponed).
  SELECT status INTO v_current_status
  FROM public.games
  WHERE id = p_game_id;

  UPDATE public.games
  SET
    status = CASE
      WHEN v_current_status IN ('cancelled', 'postponed') THEN v_current_status
      ELSE 'completed'
    END,
    score_home = GREATEST(0, p_score_home),
    score_away = GREATEST(0, p_score_away)
  WHERE id = p_game_id;

  IF p_final_minute IS NOT NULL THEN
    v_base_seconds := GREATEST(0, (GREATEST(1, p_final_minute) - 1) * 60);
  ELSE
    SELECT COALESCE(MAX(GREATEST(0, COALESCE(minutes_played, 0)) * 60), 0)
      INTO v_base_seconds
    FROM public.game_final_stats
    WHERE game_id = p_game_id;
  END IF;

  INSERT INTO public.game_live_checkpoints (
    game_id,
    phase,
    base_seconds,
    running_since_ms,
    updated_at,
    updated_by
  )
  VALUES (
    p_game_id,
    'completed',
    v_base_seconds,
    NULL,
    v_now,
    p_updated_by
  )
  ON CONFLICT (game_id)
  DO UPDATE
    SET
      phase = excluded.phase,
      base_seconds = excluded.base_seconds,
      running_since_ms = excluded.running_since_ms,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  RETURN jsonb_build_object(
    'insertedRows', v_inserted_rows,
    'squadsSynced', v_squads_synced,
    'baseSeconds', v_base_seconds
  );
END;
$function$;
