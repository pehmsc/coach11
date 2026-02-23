-- COACH11 C6 runtime forensics
-- Execute in Supabase SQL Editor (project linked to Coach11).
-- 1) Replace UUID constants below with real values.
-- 2) Run as a single script.
-- 3) Copy NOTICE/output blocks to the audit report.

begin;

-- ============================================================================
-- CONFIG (replace with real UUIDs before running)
-- ============================================================================
do $$
begin
  if '00000000-0000-0000-0000-000000000001'::uuid is null then
    raise exception 'Replace CONFIG UUIDs before running';
  end if;
end $$;

-- ============================================================================
-- A1) Snapshot: RLS enabled / force flag
-- ============================================================================
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'teams', 'age_groups', 'games', 'players',
    'convocations', 'convocation_players', 'game_live_checkpoints',
    'game_events', 'game_stats_live', 'game_final_stats',
    'pse_records', 'training_attendance'
  )
order by c.relname;

-- ============================================================================
-- A2) Snapshot: policies in effect
-- ============================================================================
select tablename, policyname, permissive, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'teams', 'age_groups', 'games', 'players',
    'convocations', 'convocation_players', 'game_live_checkpoints',
    'game_events', 'game_stats_live', 'game_final_stats',
    'pse_records', 'training_attendance', 'notifications'
  )
order by tablename, policyname;

-- ============================================================================
-- A3/A4/A5) Runtime asserts with authenticated role + JWT sub
-- ============================================================================
do $$
declare
  v_user_a uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_user_b uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_club_a uuid := '00000000-0000-0000-0000-00000000000a'::uuid;
  v_club_b uuid := '00000000-0000-0000-0000-00000000000b'::uuid;
  v_game_a uuid := '00000000-0000-0000-0000-0000000000a1'::uuid;
  v_game_b uuid := '00000000-0000-0000-0000-0000000000b1'::uuid;

  v_convocation_a uuid;
  v_convocation_b uuid;
  v_player_a uuid;
  v_player_b uuid;
  v_event_id uuid;
  v_cnt bigint;
  v_rows int;
  v_rpc jsonb;
begin
  -- Resolve convocation/player context with elevated role first.
  select c.id
    into v_convocation_a
  from public.convocations c
  where c.game_id = v_game_a
  order by c.created_at desc nulls last, c.id desc
  limit 1;

  if v_convocation_a is null then
    insert into public.convocations (game_id, status)
    values (v_game_a, 'draft')
    returning id into v_convocation_a;
  end if;

  select c.id
    into v_convocation_b
  from public.convocations c
  where c.game_id = v_game_b
  order by c.created_at desc nulls last, c.id desc
  limit 1;

  if v_convocation_b is null then
    insert into public.convocations (game_id, status)
    values (v_game_b, 'draft')
    returning id into v_convocation_b;
  end if;

  select p.id
    into v_player_a
  from public.players p
  where p.club_id = v_club_a
  order by p.created_at asc nulls last, p.id asc
  limit 1;

  select p.id
    into v_player_b
  from public.players p
  where p.club_id = v_club_b
  order by p.created_at asc nulls last, p.id asc
  limit 1;

  if v_player_a is null or v_player_b is null then
    raise exception 'Missing players in club_a/club_b (create at least one player per club before running).';
  end if;

  -- --------------------------------------------------------------------------
  -- A3) Cross-club NEGATIVE (user_a must not touch club_b)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  select count(*) into v_cnt from public.games where club_id = v_club_b;
  raise notice 'A3|user_a_select_games_club_b=%', v_cnt;

  select count(*) into v_cnt from public.convocations where club_id = v_club_b;
  raise notice 'A3|user_a_select_convocations_club_b=%', v_cnt;

  select count(*) into v_cnt from public.game_events where club_id = v_club_b;
  raise notice 'A3|user_a_select_game_events_club_b=%', v_cnt;

  begin
    insert into public.game_events (game_id, event_type, minute, is_opponent_event)
    values (v_game_b, 'goal', 1, false);
    raise notice 'A3|cross_insert_game_event=UNEXPECTED_SUCCESS';
  exception
    when others then
      raise notice 'A3|cross_insert_game_event=EXPECTED_ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  begin
    insert into public.game_live_checkpoints (
      game_id, phase, base_seconds, running_since_ms, updated_at, updated_by
    )
    values (
      v_game_b, 'first_half', 60, null, now(), v_user_a
    )
    on conflict (game_id) do update
      set phase = excluded.phase,
          base_seconds = excluded.base_seconds,
          running_since_ms = excluded.running_since_ms,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by;
    raise notice 'A3|cross_upsert_checkpoint=UNEXPECTED_SUCCESS';
  exception
    when others then
      raise notice 'A3|cross_upsert_checkpoint=EXPECTED_ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  begin
    insert into public.convocation_players (convocation_id, player_id)
    values (v_convocation_b, v_player_b);
    raise notice 'A3|cross_toggle_convocation_player=UNEXPECTED_SUCCESS';
  exception
    when others then
      raise notice 'A3|cross_toggle_convocation_player=EXPECTED_ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  execute 'reset role';

  -- --------------------------------------------------------------------------
  -- A4) Within-club POSITIVE (user_b can write in club_a)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  -- toggle convocation player (insert then delete)
  insert into public.convocation_players (convocation_id, player_id)
  values (v_convocation_a, v_player_a)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  raise notice 'A4|toggle_insert_rows=%', v_rows;

  delete from public.convocation_players
  where convocation_id = v_convocation_a
    and player_id = v_player_a;
  get diagnostics v_rows = row_count;
  raise notice 'A4|toggle_delete_rows=%', v_rows;

  -- checkpoint upsert
  insert into public.game_live_checkpoints (
    game_id, phase, base_seconds, running_since_ms, updated_at, updated_by
  )
  values (
    v_game_a, 'first_half', 120, null, now(), v_user_b
  )
  on conflict (game_id) do update
    set phase = excluded.phase,
        base_seconds = excluded.base_seconds,
        running_since_ms = excluded.running_since_ms,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  get diagnostics v_rows = row_count;
  raise notice 'A4|checkpoint_upsert_rows=%', v_rows;

  -- live event insert/delete
  insert into public.game_events (game_id, event_type, minute, is_opponent_event)
  values (v_game_a, 'goal', 2, false)
  returning id into v_event_id;
  raise notice 'A4|event_insert_id=%', v_event_id;

  delete from public.game_events where id = v_event_id;
  get diagnostics v_rows = row_count;
  raise notice 'A4|event_delete_rows=%', v_rows;

  -- game_stats_live upsert
  insert into public.game_stats_live (
    game_id, player_id, status, start_minute, end_minute
  )
  values (
    v_game_a, v_player_a, 'starter', 0, null
  )
  on conflict (game_id, player_id) do update
    set status = excluded.status,
        start_minute = excluded.start_minute,
        end_minute = excluded.end_minute;
  get diagnostics v_rows = row_count;
  raise notice 'A4|stats_upsert_rows=%', v_rows;

  execute 'reset role';

  -- --------------------------------------------------------------------------
  -- A5) RPC wrappers (positive and negative)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  begin
    v_rpc := public.rpc_finalize_game_auth(
      v_game_a,
      jsonb_build_array(
        jsonb_build_object(
          'player_id', v_player_a,
          'lineup_type', 'starter',
          'minutes_played', 90,
          'goals', 0,
          'own_goals', 0,
          'assists', 0,
          'yellow_cards', 0,
          'red_cards', 0,
          'coach_rating', 7,
          'notes', null,
          'is_mvp', false,
          'is_finalized', true
        )
      ),
      0,
      0,
      90,
      v_user_b
    );
    raise notice 'A5|rpc_finalize_game_auth_user_b=%', v_rpc;
  exception
    when others then
      raise notice 'A5|rpc_finalize_game_auth_user_b=ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  begin
    v_rpc := public.rpc_recalculate_game_summary_auth(
      v_game_a,
      jsonb_build_array(
        jsonb_build_object(
          'player_id', v_player_a,
          'lineup_type', 'starter',
          'minutes_played', 90,
          'goals', 0,
          'own_goals', 0,
          'assists', 0,
          'yellow_cards', 0,
          'red_cards', 0,
          'coach_rating', 7,
          'notes', null,
          'is_mvp', false,
          'is_finalized', true
        )
      ),
      0,
      0,
      90,
      v_user_b
    );
    raise notice 'A5|rpc_recalculate_game_summary_auth_user_b=%', v_rpc;
  exception
    when others then
      raise notice 'A5|rpc_recalculate_game_summary_auth_user_b=ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  begin
    perform public.rpc_finalize_game_auth(
      v_game_b,
      jsonb_build_array(
        jsonb_build_object(
          'player_id', v_player_b,
          'lineup_type', 'starter',
          'minutes_played', 90,
          'goals', 0,
          'own_goals', 0,
          'assists', 0,
          'yellow_cards', 0,
          'red_cards', 0,
          'coach_rating', 7,
          'notes', null,
          'is_mvp', false,
          'is_finalized', true
        )
      ),
      0,
      0,
      90,
      v_user_a
    );
    raise notice 'A5|rpc_finalize_game_auth_user_a_on_game_b=UNEXPECTED_SUCCESS';
  exception
    when others then
      raise notice 'A5|rpc_finalize_game_auth_user_a_on_game_b=EXPECTED_ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  begin
    perform public.rpc_recalculate_game_summary_auth(
      v_game_b,
      jsonb_build_array(
        jsonb_build_object(
          'player_id', v_player_b,
          'lineup_type', 'starter',
          'minutes_played', 90,
          'goals', 0,
          'own_goals', 0,
          'assists', 0,
          'yellow_cards', 0,
          'red_cards', 0,
          'coach_rating', 7,
          'notes', null,
          'is_mvp', false,
          'is_finalized', true
        )
      ),
      0,
      0,
      90,
      v_user_a
    );
    raise notice 'A5|rpc_recalculate_game_summary_auth_user_a_on_game_b=UNEXPECTED_SUCCESS';
  exception
    when others then
      raise notice 'A5|rpc_recalculate_game_summary_auth_user_a_on_game_b=EXPECTED_ERROR|%|%', SQLSTATE, SQLERRM;
  end;

  execute 'reset role';
end $$;

rollback;
