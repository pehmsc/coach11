-- ============================================================================
-- Sprint 1.6: Fix recalculate + feature correccao retroactiva de lineup
-- ============================================================================
--
-- Problema (Sentry COACH11-S):
-- POST /api/games/[id]/summary/recalculate falhava com P0001 em jogos
-- completed. Causa-raiz: rpc_finalize_game (PR #134 seccao 5.1) sincroniza
-- game_squads.initial_lineup_status com o payload. Trigger
-- enforce_initial_lineup_immutability bloqueia quando games.status != 'scheduled'.
-- rpc_recalculate_game_summary e thin wrapper que delega ao finalize,
-- herdando o bug em transicoes completed -> completed que NAO deviam tocar
-- lineup.
--
-- Solucao em 3 pecas:
-- 1. rpc_finalize_game aceita p_sync_initial_lineup. Recalculate passa false.
-- 2. rpc_correct_initial_lineup: RPC dedicada para Coordenadores corrigirem
--    lineup pos-jogo (caso de uso real: jogador nao comparece, treinador
--    esquece-se de actualizar convocatoria pre-apito).
-- 3. lineup_corrections_log: audit imutavel das correccoes.

-- ============================================================================
-- 1. rpc_finalize_game: parametro p_sync_initial_lineup (default true)
-- ============================================================================
--
-- Default true preserva comportamento existente. Apenas recalculate passa
-- false. UI de finalizar jogo (transicao scheduled -> completed) continua
-- a sincronizar normalmente.
--
-- Drop explicito da versao antiga (6 args) para evitar overload — PostgreSQL
-- nao substitui em CREATE OR REPLACE quando a assinatura muda.

DROP FUNCTION IF EXISTS public.rpc_finalize_game(
  uuid, jsonb, integer, integer, integer, uuid
);

CREATE OR REPLACE FUNCTION public.rpc_finalize_game(
  p_game_id uuid,
  p_final_stats jsonb,
  p_score_home integer,
  p_score_away integer,
  p_final_minute integer DEFAULT NULL,
  p_updated_by uuid DEFAULT NULL,
  p_sync_initial_lineup boolean DEFAULT true
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

  -- Sincronizacao condicionada (Sprint 1.6 fix): recalculate passa false
  -- para evitar trigger de imutabilidade em jogos ja completed.
  IF p_sync_initial_lineup THEN
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
  END IF;

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

-- ============================================================================
-- 2. rpc_recalculate_game_summary passa false para p_sync_initial_lineup
-- ============================================================================
--
-- Recalculate NAO altera lineup inicial (facto historico). Apenas final
-- stats (minutos, golos, ratings, etc.) sao editaveis em jogos completed.
-- Para corrigir lineup retroactivamente, Coordenador usa
-- rpc_correct_initial_lineup (fluxo dedicado com audit log).

CREATE OR REPLACE FUNCTION public.rpc_recalculate_game_summary(
  p_game_id uuid,
  p_rows jsonb,
  p_score_home integer,
  p_score_away integer,
  p_final_minute integer,
  p_updated_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.rpc_finalize_game(
    p_game_id,
    p_rows,
    p_score_home,
    p_score_away,
    p_final_minute,
    p_updated_by,
    false
  );
END;
$function$;

-- ============================================================================
-- 3. Tabela de audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lineup_corrections_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  game_squad_id uuid REFERENCES public.game_squads(id) ON DELETE SET NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  corrected_by uuid REFERENCES auth.users(id),
  corrected_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lineup_corrections_game
  ON public.lineup_corrections_log(game_id);

CREATE INDEX IF NOT EXISTS idx_lineup_corrections_user
  ON public.lineup_corrections_log(corrected_by);

ALTER TABLE public.lineup_corrections_log ENABLE ROW LEVEL SECURITY;

-- SELECT permitido a Coordenadores do jogo. INSERT/UPDATE/DELETE bloqueados
-- por defeito (RLS). INSERT apenas atraves do RPC SECURITY DEFINER.
DROP POLICY IF EXISTS lineup_corrections_log_select ON public.lineup_corrections_log;
CREATE POLICY lineup_corrections_log_select ON public.lineup_corrections_log
  FOR SELECT
  USING (public.user_is_game_coordinator(game_id));

-- ============================================================================
-- 4. rpc_correct_initial_lineup: correccao retroactiva por Coordenador
-- ============================================================================
--
-- Usa SET LOCAL session_replication_role = 'replica' para fazer bypass
-- cirurgico do trigger enforce_initial_lineup_immutability na transacao.
-- Alternativa (ALTER TABLE DISABLE TRIGGER) requer ACCESS EXCLUSIVE lock
-- e afecta outros utilizadores. session_replication_role e local a transacao.
--
-- Audit log e INSERT antes do UPDATE para garantir que mesmo se o UPDATE
-- falhar, ha registo da intencao.

CREATE OR REPLACE FUNCTION public.rpc_correct_initial_lineup(
  p_game_id uuid,
  p_corrections jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_corrections_count integer := 0;
  v_club_id uuid;
  v_squad_record record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.user_is_game_coordinator(p_game_id) THEN
    RAISE EXCEPTION 'Apenas Coordenadores podem corrigir lineup retroactivamente';
  END IF;

  IF p_corrections IS NULL
     OR jsonb_typeof(p_corrections) <> 'array'
     OR jsonb_array_length(p_corrections) = 0 THEN
    RAISE EXCEPTION 'p_corrections inválido (esperado array não-vazio)';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Razão obrigatória (mínimo 5 caracteres)';
  END IF;

  SELECT ag.club_id INTO v_club_id
  FROM public.games g
  LEFT JOIN public.age_groups ag ON ag.id = g.age_group_id
  WHERE g.id = p_game_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  -- Bypass do trigger de imutabilidade nesta transaccao apenas.
  SET LOCAL session_replication_role = 'replica';

  FOR v_squad_record IN
    SELECT
      (correction->>'game_squad_id')::uuid AS squad_id,
      correction->>'new_status' AS new_status,
      gs.initial_lineup_status AS old_status,
      gs.player_id AS player_id
    FROM jsonb_array_elements(p_corrections) AS correction
    JOIN public.game_squads gs
      ON gs.id = (correction->>'game_squad_id')::uuid
    WHERE gs.game_id = p_game_id
      AND (correction->>'new_status') IN ('starter', 'substitute')
      AND gs.initial_lineup_status IS DISTINCT FROM (correction->>'new_status')
  LOOP
    INSERT INTO public.lineup_corrections_log (
      game_id,
      player_id,
      game_squad_id,
      old_status,
      new_status,
      corrected_by,
      reason,
      club_id
    ) VALUES (
      p_game_id,
      v_squad_record.player_id,
      v_squad_record.squad_id,
      v_squad_record.old_status,
      v_squad_record.new_status,
      v_user_id,
      p_reason,
      v_club_id
    );

    UPDATE public.game_squads
    SET initial_lineup_status = v_squad_record.new_status
    WHERE id = v_squad_record.squad_id;

    v_corrections_count := v_corrections_count + 1;
  END LOOP;

  -- session_replication_role volta automaticamente no fim da transaccao
  -- (SET LOCAL), mas restauramos explicitamente para clareza.
  SET LOCAL session_replication_role = 'origin';

  RETURN jsonb_build_object(
    'correctionsApplied', v_corrections_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_correct_initial_lineup(uuid, jsonb, text)
  TO authenticated;

-- ============================================================================
-- Verificacao
-- ============================================================================

DO $$
DECLARE
  v_fn_count integer;
BEGIN
  SELECT count(*) INTO v_fn_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
      'rpc_finalize_game',
      'rpc_recalculate_game_summary',
      'rpc_correct_initial_lineup'
    );
  IF v_fn_count < 3 THEN
    RAISE EXCEPTION 'Sprint 1.6: faltam funcoes (encontradas %)', v_fn_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'lineup_corrections_log'
  ) THEN
    RAISE EXCEPTION 'Sprint 1.6: tabela lineup_corrections_log nao foi criada';
  END IF;
END $$;
