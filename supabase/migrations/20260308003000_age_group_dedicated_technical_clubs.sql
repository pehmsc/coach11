-- Isola cada age_group ativo no seu próprio club técnico,
-- mantendo clubs/club_memberships como camada de compatibilidade.

create table if not exists public.age_group_club_rehome_audit (
  age_group_id uuid primary key,
  coordinator_id uuid,
  old_club_id uuid,
  new_club_id uuid not null,
  old_club_slug text,
  new_club_slug text not null,
  before_summary jsonb not null default '{}'::jsonb,
  after_summary jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now()
);

create index if not exists age_group_club_rehome_audit_new_club_idx
  on public.age_group_club_rehome_audit(new_club_id);

create or replace function public.user_is_super_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_super_coordinator = true
  );
$$;

create or replace function public.user_can_access_age_group_v2(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.id = p_age_group_id
      and (
        public.user_is_super_coordinator()
        or ag.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.age_group_staff ags
          where ags.age_group_id = ag.id
            and ags.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.user_can_manage_age_group_v2(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.id = p_age_group_id
      and (
        public.user_is_super_coordinator()
        or ag.coordinator_id = auth.uid()
      )
  );
$$;

create or replace function public.user_can_access_team_v2(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.age_groups ag
      on ag.id = t.age_group_id
    where t.id = p_team_id
      and (
        public.user_is_super_coordinator()
        or ag.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.age_group_staff ags
          where ags.age_group_id = t.age_group_id
            and ags.profile_id = auth.uid()
            and (
              ags.linked_team_id is null
              or ags.linked_team_id = t.id
            )
        )
      )
  );
$$;

create or replace function public.table_has_column(
  p_table text,
  p_column text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = p_table
      and c.column_name = p_column
  );
$$;

create or replace function public.ensure_age_group_technical_club(
  p_age_group_id uuid,
  p_club_name text,
  p_age_group_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := format('ag-tech-%s', replace(p_age_group_id::text, '-', ''));
  v_name text := trim(
    coalesce(nullif(p_club_name, ''), 'Age Group')
    || ' · '
    || coalesce(nullif(p_age_group_name, ''), p_age_group_id::text)
    || ' [technical]'
  );
  v_club_id uuid;
begin
  if p_age_group_id is null then
    raise exception 'ensure_age_group_technical_club exige p_age_group_id';
  end if;

  insert into public.clubs (name, slug)
  values (v_name, v_slug)
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_club_id;

  return v_club_id;
end;
$$;

create or replace function public.count_rows_by_ids(
  p_table text,
  p_column text,
  p_ids uuid[]
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count bigint := 0;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not public.table_has_column(p_table, p_column) then
    return 0;
  end if;

  execute format(
    'select count(*) from public.%I where %I = any($1)',
    p_table,
    p_column
  )
  into v_count
  using p_ids;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.update_rows_club_id_by_ids(
  p_table text,
  p_column text,
  p_ids uuid[],
  p_new_club_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_club_id is null then
    return;
  end if;

  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  if not public.table_has_column(p_table, 'club_id') then
    return;
  end if;

  if not public.table_has_column(p_table, p_column) then
    return;
  end if;

  execute format(
    'update public.%I set club_id = $1 where %I = any($2)',
    p_table,
    p_column
  )
  using p_new_club_id, p_ids;
end;
$$;

create or replace function public.update_rows_club_id_by_age_group(
  p_table text,
  p_age_group_id uuid,
  p_new_club_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_club_id is null or p_age_group_id is null then
    return;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  if not public.table_has_column(p_table, 'club_id') then
    return;
  end if;

  if not public.table_has_column(p_table, 'age_group_id') then
    return;
  end if;

  execute format(
    'update public.%I set club_id = $1 where age_group_id = $2',
    p_table
  )
  using p_new_club_id, p_age_group_id;
end;
$$;

create or replace function public.age_group_subtree_summary(
  p_age_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_training_session_ids uuid[] := '{}'::uuid[];
  v_competition_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_player_ids uuid[] := '{}'::uuid[];
  v_team_messages_count bigint := 0;
  v_notifications_count bigint := 0;
  v_training_attendance_count bigint := 0;
  v_attendance_records_count bigint := 0;
  v_pse_records_count bigint := 0;
begin
  select coalesce(array_agg(t.id order by t.created_at asc, t.id asc), '{}'::uuid[])
    into v_team_ids
  from public.teams t
  where t.age_group_id = p_age_group_id;

  select coalesce(array_agg(g.id order by g.created_at asc, g.id asc), '{}'::uuid[])
    into v_game_ids
  from public.games g
  where g.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and g.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(ts.id order by ts.created_at asc, ts.id asc), '{}'::uuid[])
    into v_training_session_ids
  from public.training_sessions ts
  where ts.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and ts.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_competition_ids
  from public.competitions c
  where coalesce(array_length(v_team_ids, 1), 0) > 0
    and c.team_id = any(v_team_ids);

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_convocation_ids
  from public.convocations c
  where coalesce(array_length(v_game_ids, 1), 0) > 0
    and c.game_id = any(v_game_ids);

  select coalesce(array_agg(p.id order by p.created_at asc, p.id asc), '{}'::uuid[])
    into v_player_ids
  from public.players p
  where p.age_group_id = p_age_group_id;

  if to_regclass('public.team_messages') is not null then
    select count(*)
      into v_team_messages_count
    from public.team_messages tm
    where tm.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and tm.team_id = any(v_team_ids)
       );
  end if;

  if to_regclass('public.notifications') is not null then
    select count(*)
      into v_notifications_count
    from public.notifications n
    where n.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and n.team_id = any(v_team_ids)
       );
  end if;

  if public.table_has_column('training_attendance', 'training_session_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('training_attendance', 'session_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('training_attendance', 'training_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'training_id',
      v_training_session_ids
    );
  end if;

  if public.table_has_column('attendance_records', 'training_session_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('attendance_records', 'session_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('attendance_records', 'training_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'training_id',
      v_training_session_ids
    );
  end if;

  if public.table_has_column('pse_records', 'player_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'player_id',
      v_player_ids
    );
  end if;
  if public.table_has_column('pse_records', 'game_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'game_id',
      v_game_ids
    );
  end if;
  if public.table_has_column('pse_records', 'training_session_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('pse_records', 'session_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('pse_records', 'training_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'training_id',
      v_training_session_ids
    );
  end if;

  return jsonb_build_object(
    'teams', coalesce(array_length(v_team_ids, 1), 0),
    'age_group_staff', (
      select count(*) from public.age_group_staff ags where ags.age_group_id = p_age_group_id
    ),
    'team_staff', public.count_rows_by_ids('team_staff', 'team_id', v_team_ids),
    'players', coalesce(array_length(v_player_ids, 1), 0),
    'training_sessions', coalesce(array_length(v_training_session_ids, 1), 0),
    'games', coalesce(array_length(v_game_ids, 1), 0),
    'competitions', coalesce(array_length(v_competition_ids, 1), 0),
    'staff_invites', (
      select count(*) from public.staff_invites si where si.age_group_id = p_age_group_id
    ),
    'team_messages', v_team_messages_count,
    'notifications', v_notifications_count,
    'convocations', coalesce(array_length(v_convocation_ids, 1), 0),
    'convocation_players', public.count_rows_by_ids(
      'convocation_players',
      'convocation_id',
      v_convocation_ids
    ),
    'game_events', public.count_rows_by_ids('game_events', 'game_id', v_game_ids),
    'game_stats_live', public.count_rows_by_ids('game_stats_live', 'game_id', v_game_ids),
    'game_final_stats', public.count_rows_by_ids('game_final_stats', 'game_id', v_game_ids),
    'game_live_checkpoints', public.count_rows_by_ids(
      'game_live_checkpoints',
      'game_id',
      v_game_ids
    ),
    'training_attendance', v_training_attendance_count,
    'attendance_records', v_attendance_records_count,
    'pse_records', v_pse_records_count,
    'external_player_convocations', public.count_rows_by_ids(
      'external_player_convocations',
      'game_id',
      v_game_ids
    )
  );
end;
$$;

create or replace function public.rehome_age_group_to_dedicated_technical_club(
  p_age_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_group record;
  v_old_club_id uuid;
  v_new_club_id uuid;
  v_old_club_slug text;
  v_new_club_slug text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_team_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_training_session_ids uuid[] := '{}'::uuid[];
  v_competition_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_player_ids uuid[] := '{}'::uuid[];
  v_candidate_profile_ids uuid[] := '{}'::uuid[];
  v_profile_id uuid;
begin
  select ag.id,
         ag.club_id,
         ag.coordinator_id,
         ag.club_name,
         ag.name
    into v_age_group
  from public.age_groups ag
  where ag.id = p_age_group_id
  limit 1
  for update;

  if v_age_group.id is null then
    raise exception 'age_group % não encontrado para re-home', p_age_group_id;
  end if;

  v_before := public.age_group_subtree_summary(p_age_group_id);
  v_old_club_id := v_age_group.club_id;

  if v_old_club_id is not null then
    select c.slug
      into v_old_club_slug
    from public.clubs c
    where c.id = v_old_club_id
    limit 1;
  end if;

  v_new_club_id := public.ensure_age_group_technical_club(
    p_age_group_id,
    v_age_group.club_name,
    v_age_group.name
  );

  select c.slug
    into v_new_club_slug
  from public.clubs c
  where c.id = v_new_club_id
  limit 1;

  update public.age_groups
  set club_id = v_new_club_id
  where id = p_age_group_id;

  select coalesce(array_agg(t.id order by t.created_at asc, t.id asc), '{}'::uuid[])
    into v_team_ids
  from public.teams t
  where t.age_group_id = p_age_group_id;

  select coalesce(array_agg(g.id order by g.created_at asc, g.id asc), '{}'::uuid[])
    into v_game_ids
  from public.games g
  where g.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and g.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(ts.id order by ts.created_at asc, ts.id asc), '{}'::uuid[])
    into v_training_session_ids
  from public.training_sessions ts
  where ts.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and ts.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_competition_ids
  from public.competitions c
  where coalesce(array_length(v_team_ids, 1), 0) > 0
    and c.team_id = any(v_team_ids);

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_convocation_ids
  from public.convocations c
  where coalesce(array_length(v_game_ids, 1), 0) > 0
    and c.game_id = any(v_game_ids);

  select coalesce(array_agg(p.id order by p.created_at asc, p.id asc), '{}'::uuid[])
    into v_player_ids
  from public.players p
  where p.age_group_id = p_age_group_id;

  select coalesce(
    array_agg(distinct profile_id),
    '{}'::uuid[]
  )
    into v_candidate_profile_ids
  from (
    select v_age_group.coordinator_id as profile_id
    where v_age_group.coordinator_id is not null

    union

    select ags.profile_id
    from public.age_group_staff ags
    where ags.age_group_id = p_age_group_id
  ) q;

  perform public.update_rows_club_id_by_ids('teams', 'id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_age_group('age_group_staff', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids('team_staff', 'team_id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_age_group('players', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'training_sessions',
    'id',
    v_training_session_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids('games', 'id', v_game_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'competitions',
    'id',
    v_competition_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_age_group('staff_invites', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids('kit_pieces', 'team_id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'convocations',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'convocation_players',
    'convocation_id',
    v_convocation_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids('game_events', 'game_id', v_game_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'game_stats_live',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'game_final_stats',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'game_live_checkpoints',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'external_player_convocations',
    'game_id',
    v_game_ids,
    v_new_club_id
  );

  if to_regclass('public.team_messages') is not null and public.table_has_column('team_messages', 'club_id') then
    update public.team_messages tm
    set club_id = v_new_club_id
    where tm.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and tm.team_id = any(v_team_ids)
       );
  end if;

  if to_regclass('public.notifications') is not null and public.table_has_column('notifications', 'club_id') then
    update public.notifications n
    set club_id = v_new_club_id
    where n.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and n.team_id = any(v_team_ids)
       );
  end if;

  if public.table_has_column('training_attendance', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('training_attendance', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('training_attendance', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;

  if public.table_has_column('attendance_records', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('attendance_records', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('attendance_records', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;

  if public.table_has_column('pse_records', 'game_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'game_id',
      v_game_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'player_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'player_id',
      v_player_ids,
      v_new_club_id
    );
  end if;

  foreach v_profile_id in array v_candidate_profile_ids loop
    perform public.repair_club_membership_state(v_new_club_id, v_profile_id);
    if v_old_club_id is not null and v_old_club_id is distinct from v_new_club_id then
      perform public.repair_club_membership_state(v_old_club_id, v_profile_id);
    end if;
  end loop;

  v_after := public.age_group_subtree_summary(p_age_group_id);

  insert into public.age_group_club_rehome_audit (
    age_group_id,
    coordinator_id,
    old_club_id,
    new_club_id,
    old_club_slug,
    new_club_slug,
    before_summary,
    after_summary,
    executed_at
  )
  values (
    p_age_group_id,
    v_age_group.coordinator_id,
    v_old_club_id,
    v_new_club_id,
    v_old_club_slug,
    v_new_club_slug,
    v_before,
    v_after,
    now()
  )
  on conflict (age_group_id) do update
    set coordinator_id = excluded.coordinator_id,
        old_club_id = excluded.old_club_id,
        new_club_id = excluded.new_club_id,
        old_club_slug = excluded.old_club_slug,
        new_club_slug = excluded.new_club_slug,
        before_summary = excluded.before_summary,
        after_summary = excluded.after_summary,
        executed_at = excluded.executed_at;

  return jsonb_build_object(
    'age_group_id', p_age_group_id,
    'old_club_id', v_old_club_id,
    'new_club_id', v_new_club_id,
    'old_club_slug', v_old_club_slug,
    'new_club_slug', v_new_club_slug,
    'before_summary', v_before,
    'after_summary', v_after
  );
end;
$$;

create or replace function public.age_groups_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.club_id is null then
    new.club_id := public.ensure_age_group_technical_club(
      new.id,
      new.club_name,
      new.name
    );
  end if;

  return new;
end;
$$;

create or replace function public.user_default_club_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.coordinator_id = auth.uid()
    and ag.club_id is not null
  order by ag.created_at asc, ag.id asc
  limit 1;

  if v_club_id is null then
    select ags.club_id
      into v_club_id
    from public.age_group_staff ags
    where ags.profile_id = auth.uid()
      and ags.club_id is not null
    order by ags.created_at asc, ags.id asc
    limit 1;
  end if;

  if v_club_id is null then
    select cm.club_id
      into v_club_id
    from public.club_memberships cm
    where cm.profile_id = auth.uid()
    order by
      case cm.role
        when 'owner' then 1
        when 'admin' then 2
        when 'coordinator' then 3
        else 4
      end,
      cm.created_at asc
    limit 1;
  end if;

  if v_club_id is null then
    select c.id
      into v_club_id
    from public.clubs c
    where c.slug = 'default'
    limit 1;
  end if;

  return v_club_id;
end;
$$;

create or replace function public.profiles_auto_default_club_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

drop policy if exists age_groups_club_select_v1 on public.age_groups;
create policy age_groups_club_select_v1
on public.age_groups
for select
using (public.user_can_access_age_group_v2(id));

drop policy if exists age_groups_club_insert_v1 on public.age_groups;
create policy age_groups_club_insert_v1
on public.age_groups
for insert
with check (
  coordinator_id = auth.uid()
  or public.user_is_super_coordinator()
);

drop policy if exists age_groups_club_update_v1 on public.age_groups;
create policy age_groups_club_update_v1
on public.age_groups
for update
using (public.user_can_manage_age_group_v2(id))
with check (public.user_can_manage_age_group_v2(id));

drop policy if exists age_groups_club_delete_v1 on public.age_groups;
create policy age_groups_club_delete_v1
on public.age_groups
for delete
using (public.user_can_manage_age_group_v2(id));

drop policy if exists teams_club_select_v1 on public.teams;
create policy teams_club_select_v1
on public.teams
for select
using (public.user_can_access_team_v2(id));

drop policy if exists teams_club_insert_v1 on public.teams;
create policy teams_club_insert_v1
on public.teams
for insert
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = teams.age_group_id
      and ag.club_id = teams.club_id
  )
);

drop policy if exists teams_club_update_v1 on public.teams;
create policy teams_club_update_v1
on public.teams
for update
using (public.user_can_manage_age_group_v2(age_group_id))
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = teams.age_group_id
      and ag.club_id = teams.club_id
  )
);

drop policy if exists teams_club_delete_v1 on public.teams;
create policy teams_club_delete_v1
on public.teams
for delete
using (public.user_can_manage_age_group_v2(age_group_id));

drop policy if exists age_group_staff_select_v1 on public.age_group_staff;
create policy age_group_staff_select_v1
on public.age_group_staff
for select
using (
  profile_id = auth.uid()
  or public.user_can_access_age_group_v2(age_group_id)
);

drop policy if exists age_group_staff_coordinator_insert_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_insert_v1
on public.age_group_staff
for insert
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = age_group_staff.age_group_id
      and ag.club_id = age_group_staff.club_id
  )
);

drop policy if exists age_group_staff_coordinator_update_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_update_v1
on public.age_group_staff
for update
using (public.user_can_manage_age_group_v2(age_group_id))
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = age_group_staff.age_group_id
      and ag.club_id = age_group_staff.club_id
  )
);

drop policy if exists age_group_staff_coordinator_delete_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_delete_v1
on public.age_group_staff
for delete
using (public.user_can_manage_age_group_v2(age_group_id));

drop policy if exists staff_invites_select_v1 on public.staff_invites;
create policy staff_invites_select_v1
on public.staff_invites
for select
using (
  public.user_can_access_age_group_v2(age_group_id)
  or (
    email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists staff_invites_coordinator_insert_v1 on public.staff_invites;
create policy staff_invites_coordinator_insert_v1
on public.staff_invites
for insert
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and (invited_by is null or invited_by = auth.uid())
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = staff_invites.age_group_id
      and ag.club_id = staff_invites.club_id
  )
);

drop policy if exists staff_invites_coordinator_update_v1 on public.staff_invites;
create policy staff_invites_coordinator_update_v1
on public.staff_invites
for update
using (public.user_can_manage_age_group_v2(age_group_id))
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = staff_invites.age_group_id
      and ag.club_id = staff_invites.club_id
  )
);

drop policy if exists staff_invites_coordinator_delete_v1 on public.staff_invites;
create policy staff_invites_coordinator_delete_v1
on public.staff_invites
for delete
using (public.user_can_manage_age_group_v2(age_group_id));

select public.rehome_age_group_to_dedicated_technical_club(
  '10036f09-4bf7-4198-9ddf-2ae8f79f418f'::uuid
);

select public.rehome_age_group_to_dedicated_technical_club(
  '757f56aa-1a1b-45c9-a515-a38ece28d9e0'::uuid
);
