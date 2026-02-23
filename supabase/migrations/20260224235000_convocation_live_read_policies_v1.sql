-- C4 (DB-first): policies funcionais de leitura para domínio convocation/live/summary.
-- Mantém o boundary RESTRICTIVE por club_id já existente e adiciona permissões SELECT para authenticated.

create or replace function public.user_can_access_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and public.user_can_access_club(g.club_id)
      and (
        (g.age_group_id is not null and public.user_can_access_age_group(g.age_group_id))
        or (g.team_id is not null and public.user_can_access_team(g.team_id))
      )
  );
$$;

create or replace function public.user_can_access_convocation(p_convocation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.convocations c
    where c.id = p_convocation_id
      and public.user_can_access_game(c.game_id)
  );
$$;

-- Tabelas com game_id canónico.
do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'convocations',
    'game_live_checkpoints',
    'game_events',
    'game_stats_live',
    'game_final_stats'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    v_policy := format('%s_read_v1', v_table);
    execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.user_can_access_game(game_id))',
      v_policy,
      v_table
    );
  end loop;
end $$;

-- convocation_players resolve via convocation -> game.
do $$
begin
  if to_regclass('public.convocation_players') is null then
    return;
  end if;

  drop policy if exists convocation_players_read_v1 on public.convocation_players;
  create policy convocation_players_read_v1
  on public.convocation_players
  for select
  to authenticated
  using (public.user_can_access_convocation(convocation_id));
end $$;

-- pse_records (schema legacy variável): policy dinâmica apenas para SELECT.
do $$
declare
  v_expr text := null;
begin
  if to_regclass('public.pse_records') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'game_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(game_id is not null and public.user_can_access_game(game_id))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_session_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(training_session_id is not null and exists (
         select 1
         from public.training_sessions ts
         where ts.id = training_session_id
           and public.user_can_access_club(ts.club_id)
           and (
             (ts.age_group_id is not null and public.user_can_access_age_group(ts.age_group_id))
             or (ts.team_id is not null and public.user_can_access_team(ts.team_id))
           )
       ))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'session_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(session_id is not null and exists (
         select 1
         from public.training_sessions ts
         where ts.id = session_id
           and public.user_can_access_club(ts.club_id)
           and (
             (ts.age_group_id is not null and public.user_can_access_age_group(ts.age_group_id))
             or (ts.team_id is not null and public.user_can_access_team(ts.team_id))
           )
       ))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(training_id is not null and exists (
         select 1
         from public.training_sessions ts
         where ts.id = training_id
           and public.user_can_access_club(ts.club_id)
           and (
             (ts.age_group_id is not null and public.user_can_access_age_group(ts.age_group_id))
             or (ts.team_id is not null and public.user_can_access_team(ts.team_id))
           )
       ))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'player_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(player_id is not null and exists (
         select 1
         from public.players p
         where p.id = player_id
           and public.user_can_access_club(p.club_id)
           and public.user_can_access_age_group(p.age_group_id)
       ))';
  end if;

  if v_expr is null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pse_records' and column_name = 'club_id'
    ) then
      v_expr := 'public.user_can_access_club(club_id)';
    else
      v_expr := 'false';
    end if;
  end if;

  execute 'drop policy if exists pse_records_read_v1 on public.pse_records';
  execute format(
    'create policy pse_records_read_v1 on public.pse_records for select to authenticated using (%s)',
    v_expr
  );
end $$;

-- Snapshot forense (B1/B2 equivalent) emitido como NOTICE no deploy.
do $$
declare
  r record;
begin
  raise notice 'SNAPSHOT|RLS_STATUS_BEGIN';
  for r in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'convocations','convocation_players','game_live_checkpoints',
        'game_events','game_stats_live','game_final_stats','pse_records'
      )
    order by c.relname
  loop
    raise notice 'RLS|table=%|enabled=%|force=%', r.relname, r.relrowsecurity, r.relforcerowsecurity;
  end loop;
  raise notice 'SNAPSHOT|RLS_STATUS_END';

  raise notice 'SNAPSHOT|POLICIES_BEGIN';
  for r in
    select tablename, policyname, permissive, cmd, roles
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'convocations','convocation_players','game_live_checkpoints',
        'game_events','game_stats_live','game_final_stats','pse_records'
      )
    order by tablename, policyname
  loop
    raise notice 'POLICY|table=%|name=%|permissive=%|cmd=%|roles=%',
      r.tablename, r.policyname, r.permissive, r.cmd, r.roles;
  end loop;
  raise notice 'SNAPSHOT|POLICIES_END';
end $$;

-- Runtime proof (cross-club read) com UUIDs reais encontrados no dataset.
do $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_cnt bigint;
begin
  select cm1.profile_id, cm2.profile_id, cm1.club_id, cm2.club_id
    into v_user_a, v_user_b, v_club_a, v_club_b
  from public.club_memberships cm1
  join public.club_memberships cm2
    on cm1.profile_id <> cm2.profile_id
   and cm1.club_id <> cm2.club_id
  order by cm1.created_at asc, cm2.created_at asc
  limit 1;

  if v_user_a is null or v_user_b is null then
    raise notice 'ASSERT|cross_club_dataset=NOT_PROVED|reason=insufficient_memberships';
    return;
  end if;

  raise notice 'ASSERT|user_a=%|club_a=%|user_b=%|club_b=%', v_user_a, v_club_a, v_user_b, v_club_b;

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  select count(*)
    into v_cnt
  from public.convocations c
  where c.club_id = v_club_b
    and public.user_can_access_convocation(c.id);
  raise notice 'ASSERT|user_a_select_convocations_club_b=%', v_cnt;

  select count(*)
    into v_cnt
  from public.game_events ge
  join public.games g on g.id = ge.game_id
  where g.club_id = v_club_b
    and public.user_can_access_game(ge.game_id);
  raise notice 'ASSERT|user_a_select_game_events_club_b=%', v_cnt;

  select count(*) into v_cnt
  from public.games g
  where g.club_id = v_club_a
    and public.user_can_access_game(g.id);
  raise notice 'ASSERT|user_a_accessible_games_club_a=%', v_cnt;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  select count(*)
    into v_cnt
  from public.convocations c
  where c.club_id = v_club_a
    and public.user_can_access_convocation(c.id);
  raise notice 'ASSERT|user_b_select_convocations_club_a=%', v_cnt;

  select count(*)
    into v_cnt
  from public.game_events ge
  join public.games g on g.id = ge.game_id
  where g.club_id = v_club_a
    and public.user_can_access_game(ge.game_id);
  raise notice 'ASSERT|user_b_select_game_events_club_a=%', v_cnt;

  select count(*) into v_cnt
  from public.games g
  where g.club_id = v_club_b
    and public.user_can_access_game(g.id);
  raise notice 'ASSERT|user_b_accessible_games_club_b=%', v_cnt;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
