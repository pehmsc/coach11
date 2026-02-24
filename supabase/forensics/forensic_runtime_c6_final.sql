-- COACH11 - C6 FINAL FORENSIC RUNTIME SCRIPT
-- SQL Editor safe:
-- - no schema changes
-- - no helper tables
-- - no CREATE FUNCTION / CREATE PROCEDURE
-- - no INSERT/UPDATE/DELETE em tabelas de dominio
--
-- Usage:
-- 1) Optional: override defaults via set_config lines below.
-- 2) Run as one script in Supabase SQL Editor.
-- 3) Copy exactly:
--    - ACTIVE CONTEXT
--    - A1
--    - A2
--    - role_routine_grants snapshot
--    - NOTICE A3/A4/A5
-- 4) Script uses BEGIN/ROLLBACK; no data persistence.
-- 5) Runtime write-tests (cross-club deny / within-club allow) were proven previously and are
--    intentionally not repeated here to keep this script read-only and reproducible.

begin;

-- ============================================================================
-- OPTIONAL OVERRIDES (uncomment and change if needed)
-- ============================================================================
-- select set_config('coach11.user_a',  '82940522-a8f8-4f8d-8484-7c295869a469', false);
-- select set_config('coach11.user_b',  'f34231ce-18e7-4f7b-9c9e-a54aaf4e74c4', false);
-- select set_config('coach11.user_c',  '735dc163-770d-4abb-9add-b3c415394b13', false);
-- select set_config('coach11.club_a',  '5f9c34ee-d13d-4788-9f68-69ee537419bd', false);
-- select set_config('coach11.club_b',  'bcc6b967-2baa-41de-9a0d-2edd835d750a', false);
-- select set_config('coach11.game_a',  '7e9eb19a-2d43-4bb1-9a17-717b31484f7d', false);
-- select set_config('coach11.game_b',  '32e3543b-f5a6-4180-93f4-62581ab5fef6', false);
-- select set_config('coach11.conv_a',  'f66e94aa-7a1d-4713-aa81-24f7eb633f70', false);
-- select set_config('coach11.conv_b',  '7f0fe6a9-1821-48af-b097-4f13f06fc2dc', false);
-- select set_config('coach11.player_a','66d723b7-fa19-44e9-aa90-24e3afaa8174', false);
-- select set_config('coach11.player_b','5bbd6e4e-16f3-4553-a629-a617045c7240', false);

-- ============================================================================
-- ACTIVE CONTEXT (result set)
-- ============================================================================
with cfg as (
  select
    coalesce(nullif(current_setting('coach11.user_a', true), '')::uuid, '82940522-a8f8-4f8d-8484-7c295869a469'::uuid) as user_a,
    coalesce(nullif(current_setting('coach11.user_b', true), '')::uuid, 'f34231ce-18e7-4f7b-9c9e-a54aaf4e74c4'::uuid) as user_b,
    coalesce(nullif(current_setting('coach11.user_c', true), '')::uuid, '735dc163-770d-4abb-9add-b3c415394b13'::uuid) as user_c,
    coalesce(nullif(current_setting('coach11.club_a', true), '')::uuid, '5f9c34ee-d13d-4788-9f68-69ee537419bd'::uuid) as club_a,
    coalesce(nullif(current_setting('coach11.club_b', true), '')::uuid, 'bcc6b967-2baa-41de-9a0d-2edd835d750a'::uuid) as club_b,
    coalesce(nullif(current_setting('coach11.game_a', true), '')::uuid, '7e9eb19a-2d43-4bb1-9a17-717b31484f7d'::uuid) as game_a,
    coalesce(nullif(current_setting('coach11.game_b', true), '')::uuid, '32e3543b-f5a6-4180-93f4-62581ab5fef6'::uuid) as game_b,
    coalesce(nullif(current_setting('coach11.conv_a', true), '')::uuid, 'f66e94aa-7a1d-4713-aa81-24f7eb633f70'::uuid) as conv_a,
    coalesce(nullif(current_setting('coach11.conv_b', true), '')::uuid, '7f0fe6a9-1821-48af-b097-4f13f06fc2dc'::uuid) as conv_b,
    coalesce(nullif(current_setting('coach11.player_a', true), '')::uuid, '66d723b7-fa19-44e9-aa90-24e3afaa8174'::uuid) as player_a,
    coalesce(nullif(current_setting('coach11.player_b', true), '')::uuid, '5bbd6e4e-16f3-4553-a629-a617045c7240'::uuid) as player_b
)
select
  user_a,
  user_b,
  user_c,
  club_a,
  club_b,
  game_a,
  game_b,
  conv_a,
  conv_b,
  player_a,
  player_b
from cfg;

-- ============================================================================
-- A1) Snapshot - RLS flags (result set)
-- ============================================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
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
-- A2) Snapshot - policies (result set)
-- ============================================================================
select
  p.tablename,
  p.policyname,
  p.permissive,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in (
    'teams', 'age_groups', 'games', 'players',
    'convocations', 'convocation_players', 'game_live_checkpoints',
    'game_events', 'game_stats_live', 'game_final_stats',
    'pse_records', 'training_attendance', 'notifications',
    'clubs', 'club_memberships', 'staff_invites', 'team_staff', 'kit_pieces'
  )
order by p.tablename, p.policyname;

-- Optional grant snapshot for wrapper RPCs (result set)
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'rpc_game_access_context',
    'rpc_finalize_game_auth',
    'rpc_recalculate_game_summary_auth',
    'rpc_redeem_staff_invite'
  )
order by routine_name, grantee, privilege_type;

-- ============================================================================
-- A3/A4/A5) Runtime checks (read-only) using authenticated + jwt claims
-- Notes:
-- - No inserts/updates/deletes.
-- - Uses SELECT counts + rpc_game_access_context(jsonb).
-- - Guardrails abort with explicit setup messages if IDs are invalid/out of scope.
-- ============================================================================
do $$
declare
  v_user_a uuid := coalesce(nullif(current_setting('coach11.user_a', true), '')::uuid, '82940522-a8f8-4f8d-8484-7c295869a469'::uuid);
  v_user_b uuid := coalesce(nullif(current_setting('coach11.user_b', true), '')::uuid, 'f34231ce-18e7-4f7b-9c9e-a54aaf4e74c4'::uuid);
  v_user_c uuid := coalesce(nullif(current_setting('coach11.user_c', true), '')::uuid, '735dc163-770d-4abb-9add-b3c415394b13'::uuid);
  v_club_a uuid := coalesce(nullif(current_setting('coach11.club_a', true), '')::uuid, '5f9c34ee-d13d-4788-9f68-69ee537419bd'::uuid);
  v_club_b uuid := coalesce(nullif(current_setting('coach11.club_b', true), '')::uuid, 'bcc6b967-2baa-41de-9a0d-2edd835d750a'::uuid);
  v_game_a uuid := coalesce(nullif(current_setting('coach11.game_a', true), '')::uuid, '7e9eb19a-2d43-4bb1-9a17-717b31484f7d'::uuid);
  v_game_b uuid := coalesce(nullif(current_setting('coach11.game_b', true), '')::uuid, '32e3543b-f5a6-4180-93f4-62581ab5fef6'::uuid);
  v_conv_a uuid := coalesce(nullif(current_setting('coach11.conv_a', true), '')::uuid, 'f66e94aa-7a1d-4713-aa81-24f7eb633f70'::uuid);
  v_conv_b uuid := coalesce(nullif(current_setting('coach11.conv_b', true), '')::uuid, '7f0fe6a9-1821-48af-b097-4f13f06fc2dc'::uuid);
  v_player_a uuid := coalesce(nullif(current_setting('coach11.player_a', true), '')::uuid, '66d723b7-fa19-44e9-aa90-24e3afaa8174'::uuid);
  v_player_b uuid := coalesce(nullif(current_setting('coach11.player_b', true), '')::uuid, '5bbd6e4e-16f3-4553-a629-a617045c7240'::uuid);
  v_cnt bigint;
  v_ctx jsonb;
begin
  -- Guardrails: existing references only; do not create fallback rows.
  perform 1 from public.games where id = v_game_a and club_id = v_club_a;
  if not found then
    raise exception 'A3/A5 setup invalid: game_a % not found in club_a %', v_game_a, v_club_a;
  end if;

  perform 1 from public.games where id = v_game_b and club_id = v_club_b;
  if not found then
    raise exception 'A3/A5 setup invalid: game_b % not found in club_b %', v_game_b, v_club_b;
  end if;

  perform 1 from public.convocations where id = v_conv_a and game_id = v_game_a and club_id = v_club_a;
  if not found then
    raise exception 'A3/A5 setup invalid: conv_a % not scoped to game_a %', v_conv_a, v_game_a;
  end if;

  perform 1 from public.convocations where id = v_conv_b and game_id = v_game_b and club_id = v_club_b;
  if not found then
    raise exception 'A3/A5 setup invalid: conv_b % not scoped to game_b %', v_conv_b, v_game_b;
  end if;

  perform 1 from public.players where id = v_player_a and club_id = v_club_a;
  if not found then
    raise exception 'A3/A5 setup invalid: player_a % not in club_a %', v_player_a, v_club_a;
  end if;

  perform 1 from public.players where id = v_player_b and club_id = v_club_b;
  if not found then
    raise exception 'A3/A5 setup invalid: player_b % not in club_b %', v_player_b, v_club_b;
  end if;

  -- --------------------------------------------------------------------------
  -- A3) Cross-club negative checks for user_a (staff club_a)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  select count(*) into v_cnt from public.games where club_id = v_club_b;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'select_games_club_b',
    'count', v_cnt,
    'expected', 0
  );

  select count(*) into v_cnt from public.convocations where club_id = v_club_b;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'select_convocations_club_b',
    'count', v_cnt,
    'expected', 0
  );

  select count(*) into v_cnt from public.game_events where club_id = v_club_b;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'select_game_events_club_b',
    'count', v_cnt,
    'expected', 0
  );

  select count(*) into v_cnt from public.game_live_checkpoints where club_id = v_club_b;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'select_game_live_checkpoints_club_b',
    'count', v_cnt,
    'expected', 0
  );

  select count(*) into v_cnt from public.game_stats_live where club_id = v_club_b;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'select_game_stats_live_club_b',
    'count', v_cnt,
    'expected', 0
  );

  select public.rpc_game_access_context(v_game_b) into v_ctx;
  raise notice '%', jsonb_build_object(
    'section', 'A3',
    'actor', 'user_a',
    'check', 'rpc_game_access_context_game_b',
    'context', v_ctx,
    'expected', jsonb_build_object('exists', true, 'canAccess', false, 'canWrite', false)
  );

  execute 'reset role';

  -- --------------------------------------------------------------------------
  -- A4) Within-club positive checks for user_b (coordinator club_a)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  select count(*) into v_cnt from public.games where club_id = v_club_a;
  raise notice '%', jsonb_build_object(
    'section', 'A4',
    'actor', 'user_b',
    'check', 'select_games_club_a',
    'count', v_cnt,
    'expected_min', 1
  );

  select count(*) into v_cnt from public.convocations where id = v_conv_a;
  raise notice '%', jsonb_build_object(
    'section', 'A4',
    'actor', 'user_b',
    'check', 'select_conv_a',
    'count', v_cnt,
    'expected', 1
  );

  select count(*) into v_cnt from public.players where id = v_player_a;
  raise notice '%', jsonb_build_object(
    'section', 'A4',
    'actor', 'user_b',
    'check', 'select_player_a',
    'count', v_cnt,
    'expected', 1
  );

  select public.rpc_game_access_context(v_game_a) into v_ctx;
  raise notice '%', jsonb_build_object(
    'section', 'A4',
    'actor', 'user_b',
    'check', 'rpc_game_access_context_game_a',
    'context', v_ctx,
    'expected', jsonb_build_object('exists', true, 'canAccess', true, 'canWrite', true)
  );

  execute 'reset role';

  -- --------------------------------------------------------------------------
  -- A5) Wrapper authorization matrix (read-only inspection)
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select public.rpc_game_access_context(v_game_b) into v_ctx;
  raise notice '%', jsonb_build_object(
    'section', 'A5',
    'actor', 'user_a',
    'check', 'wrapper_precheck_game_b',
    'context', v_ctx,
    'expectation', 'cross_club_must_not_write'
  );
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select public.rpc_game_access_context(v_game_a) into v_ctx;
  raise notice '%', jsonb_build_object(
    'section', 'A5',
    'actor', 'user_b',
    'check', 'wrapper_precheck_game_a',
    'context', v_ctx,
    'expectation', 'same_club_coordinator_can_write'
  );
  execute 'reset role';

  -- Optional extra context (club_b coordinator)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  select public.rpc_game_access_context(v_game_b) into v_ctx;
  raise notice '%', jsonb_build_object(
    'section', 'A5',
    'actor', 'user_c',
    'check', 'control_game_b',
    'context', v_ctx,
    'expectation', 'club_b_coordinator_write_path'
  );
  execute 'reset role';
end $$;

rollback;
