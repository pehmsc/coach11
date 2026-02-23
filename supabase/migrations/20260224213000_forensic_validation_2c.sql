-- Forensic validation post-2C: read-only checks with NOTICE output.
-- No schema or functional behavior changes.

-- B1) RLS ativo nas tabelas 2C
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'B1_BEGIN';
  FOR r IN
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'convocations','convocation_players','game_events','game_stats_live',
        'game_final_stats','game_live_checkpoints','attendance_records',
        'training_attendance','pse_records'
      )
    ORDER BY c.relname
  LOOP
    RAISE NOTICE 'B1|relname=%|relrowsecurity=%|relforcerowsecurity=%',
      r.relname, r.relrowsecurity, r.relforcerowsecurity;
  END LOOP;
  RAISE NOTICE 'B1_END';
END $$;

-- B2) Policies existentes nas tabelas 2C
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'B2_BEGIN';
  FOR r IN
    SELECT tablename, policyname, cmd, permissive, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'convocations','convocation_players','game_events','game_stats_live',
        'game_final_stats','game_live_checkpoints','attendance_records',
        'training_attendance','pse_records'
      )
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE 'B2|tablename=%|policyname=%|cmd=%|permissive=%|roles=%',
      r.tablename, r.policyname, r.cmd, r.permissive, r.roles;
  END LOOP;
  RAISE NOTICE 'B2_END';
END $$;

-- B3) Mismatches club_id vs referencia
DO $$
DECLARE
  v_mismatches bigint;
BEGIN
  RAISE NOTICE 'B3_BEGIN';

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.convocations c
  JOIN public.games g ON g.id = c.game_id
  WHERE c.club_id IS DISTINCT FROM g.club_id;
  RAISE NOTICE 'B3|check_name=convocations_vs_games|mismatches=%', v_mismatches;

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.convocation_players cp
  JOIN public.convocations c ON c.id = cp.convocation_id
  WHERE cp.club_id IS DISTINCT FROM c.club_id;
  RAISE NOTICE 'B3|check_name=convocation_players_vs_convocations|mismatches=%', v_mismatches;

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.game_events e
  JOIN public.games g ON g.id = e.game_id
  WHERE e.club_id IS DISTINCT FROM g.club_id;
  RAISE NOTICE 'B3|check_name=game_events_vs_games|mismatches=%', v_mismatches;

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.game_stats_live s
  JOIN public.games g ON g.id = s.game_id
  WHERE s.club_id IS DISTINCT FROM g.club_id;
  RAISE NOTICE 'B3|check_name=game_stats_live_vs_games|mismatches=%', v_mismatches;

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.game_final_stats f
  JOIN public.games g ON g.id = f.game_id
  WHERE f.club_id IS DISTINCT FROM g.club_id;
  RAISE NOTICE 'B3|check_name=game_final_stats_vs_games|mismatches=%', v_mismatches;

  SELECT COUNT(*)::bigint
    INTO v_mismatches
  FROM public.game_live_checkpoints k
  JOIN public.games g ON g.id = k.game_id
  WHERE k.club_id IS DISTINCT FROM g.club_id;
  RAISE NOTICE 'B3|check_name=checkpoints_vs_games|mismatches=%', v_mismatches;

  IF to_regclass('public.attendance_records') IS NULL THEN
    v_mismatches := 0;
  ELSE
    EXECUTE $q$
      SELECT COUNT(*)::bigint
      FROM public.attendance_records ar
      JOIN public.training_sessions ts ON ts.id = ar.training_session_id
      WHERE ar.club_id IS DISTINCT FROM ts.club_id
    $q$ INTO v_mismatches;
  END IF;
  RAISE NOTICE 'B3|check_name=attendance_records_vs_training_sessions|mismatches=%', v_mismatches;

  IF to_regclass('public.training_attendance') IS NULL THEN
    v_mismatches := 0;
  ELSE
    EXECUTE $q$
      SELECT COUNT(*)::bigint
      FROM public.training_attendance ta
      JOIN public.training_sessions ts ON ts.id = ta.training_session_id
      WHERE ta.club_id IS DISTINCT FROM ts.club_id
    $q$ INTO v_mismatches;
  END IF;
  RAISE NOTICE 'B3|check_name=training_attendance_vs_training_sessions|mismatches=%', v_mismatches;

  RAISE NOTICE 'B3_END';
END $$;

-- B4) Grants RPC (não exposto a anon/authenticated)
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'B4_BEGIN';
  FOR r IN
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name IN ('rpc_finalize_game','rpc_recalculate_game_summary')
    ORDER BY routine_name, grantee, privilege_type
  LOOP
    RAISE NOTICE 'B4|routine_name=%|grantee=%|privilege_type=%',
      r.routine_name, r.grantee, r.privilege_type;
  END LOOP;
  RAISE NOTICE 'B4_END';
END $$;

-- B5) Prova cross-club com UUIDs reais (auto-discovery de memberships em clubes distintos)
DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_count bigint;
  v_updated bigint;
BEGIN
  RAISE NOTICE 'B5_BEGIN';

  SELECT cm.profile_id, cm.club_id
    INTO v_user_a, v_club_a
  FROM public.club_memberships cm
  ORDER BY cm.created_at ASC
  LIMIT 1;

  SELECT cm.profile_id, cm.club_id
    INTO v_user_b, v_club_b
  FROM public.club_memberships cm
  WHERE cm.club_id IS DISTINCT FROM v_club_a
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_user_a IS NULL OR v_club_a IS NULL THEN
    RAISE NOTICE 'B5|status=SKIPPED|reason=no_memberships';
    RAISE NOTICE 'B5_END';
    RETURN;
  END IF;

  IF v_user_b IS NULL OR v_club_b IS NULL THEN
    RAISE NOTICE 'B5|status=SKIPPED|reason=single_club_dataset|user_a=%|club_a=%', v_user_a, v_club_a;
    RAISE NOTICE 'B5_END';
    RETURN;
  END IF;

  RAISE NOTICE 'B5|user_a=%|club_a=%|user_b=%|club_b=%', v_user_a, v_club_a, v_user_b, v_club_b;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);

  SELECT COUNT(*)
    INTO v_count
  FROM public.game_events
  WHERE club_id = v_club_b;

  RAISE NOTICE 'B5|select_count_user_a_on_club_b=%', v_count;

  BEGIN
    UPDATE public.game_events
    SET minute = minute
    WHERE club_id = v_club_b;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'B5|update_result=NO_ERROR|updated_rows=%', v_updated;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'B5|update_result=ERROR|sqlstate=%|message=%', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'B5_END';
END $$;
