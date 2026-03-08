-- Consolidar a camada técnica de club no domínio real e congelar team_staff
-- como projeção compatível de age_group_staff.

comment on table public.clubs is
  'Camada técnica de tenancy/compatibilidade. Não é raiz funcional do produto; a autorização deve derivar de age_groups, age_group_staff e teams.';

comment on table public.club_memberships is
  'Metadado técnico de compatibilidade para clubs. Não é fonte de verdade funcional para autorização.';

comment on table public.team_staff is
  'Projeção compatível derivada de age_group_staff. Não escrever diretamente a partir de fluxos de produto.';

comment on table public.age_group_staff is
  'Fonte de verdade funcional da equipa técnica por escalão.';

create or replace function public.user_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ag.club_id
  from public.age_groups ag
  where ag.club_id is not null
    and public.user_can_access_age_group_v2(ag.id)

  union

  select c.id
  from public.clubs c
  where public.user_is_super_coordinator();
$$;

comment on function public.user_club_ids() is
  'Compatibilidade: devolve clubs técnicos acessíveis a partir do domínio real age_group/team.';

create or replace function public.user_can_access_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and public.user_can_access_age_group_v2(ag.id)
      )
    );
$$;

comment on function public.user_can_access_club(uuid) is
  'Wrapper de compatibilidade. O acesso é derivado do domínio real age_group/team e não de club_memberships.';

create or replace function public.user_can_manage_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and public.user_can_manage_age_group_v2(ag.id)
      )
    );
$$;

comment on function public.user_can_manage_club(uuid) is
  'Wrapper de compatibilidade. A gestão é derivada do coordenador do age_group, não de club_memberships.';

create or replace function public.guard_team_staff_projection_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or auth.role() = 'service_role'
     or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  raise exception 'team_staff_projection_only'
    using errcode = '42501',
          detail = 'team_staff é uma projeção compatível derivada de age_group_staff.',
          hint = 'Escreve em age_group_staff em vez de team_staff.';
end;
$$;

comment on function public.guard_team_staff_projection_only() is
  'Bloqueia writes diretos de authenticated em team_staff; apenas service_role e projeções internas podem escrever.';

drop trigger if exists trg_team_staff_sync_age_group_staff on public.team_staff;

drop trigger if exists trg_team_staff_projection_only_guard on public.team_staff;
create trigger trg_team_staff_projection_only_guard
before insert or update or delete
on public.team_staff
for each row
execute function public.guard_team_staff_projection_only();

drop policy if exists external_player_convocations_club_boundary_v1
  on public.external_player_convocations;
drop policy if exists external_player_convocations_domain_boundary_v2
  on public.external_player_convocations;
create policy external_player_convocations_domain_boundary_v2
on public.external_player_convocations
as restrictive
for all
to authenticated
using (public.user_can_access_game(game_id))
with check (public.user_can_write_game(game_id));

create or replace function public.rpc_update_game_tactical_auth(
  p_game_id uuid,
  p_tactical_system text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_exists boolean := false;
  v_has_access boolean := false;
  v_normalized_tactical text := nullif(trim(coalesce(p_tactical_system, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
  )
  into v_game_exists;

  if not v_game_exists then
    return jsonb_build_object('ok', false, 'error_code', 'game_not_found');
  end if;

  select public.user_can_write_game(p_game_id)
    into v_has_access;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  update public.games
  set additional_info = v_normalized_tactical
  where id = p_game_id;

  return jsonb_build_object('ok', true, 'tactical_system', v_normalized_tactical);
end;
$$;

create or replace function public.rpc_statistics_players(
  p_age_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean := false;
  v_players jsonb := '[]'::jsonb;
  v_player_ids uuid[] := '{}'::uuid[];
  v_session_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_attendance_rows jsonb := '[]'::jsonb;
  v_final_stats jsonb := '[]'::jsonb;
  v_convocations jsonb := '[]'::jsonb;
  v_convocation_players jsonb := '[]'::jsonb;
  v_game_events jsonb := '[]'::jsonb;
begin
  if p_age_group_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'missing_age_group_id');
  end if;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  select public.user_can_access_age_group_v2(p_age_group_id)
    into v_has_access;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(p) order by p.first_name asc, p.last_name asc), '[]'::jsonb),
    coalesce(array_agg(p.id), '{}'::uuid[])
  into v_players, v_player_ids
  from public.players p
  where p.age_group_id = p_age_group_id
    and p.status = 'active';

  select coalesce(array_agg(ts.id), '{}'::uuid[])
    into v_session_ids
  from public.training_sessions ts
  where ts.age_group_id = p_age_group_id;

  if cardinality(v_session_ids) > 0 and cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'player_id', ta.player_id,
          'status', ta.status
        )
      ),
      '[]'::jsonb
    )
    into v_attendance_rows
    from public.training_attendance ta
    where ta.training_session_id = any(v_session_ids)
      and ta.player_id = any(v_player_ids);
  end if;

  if cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(to_jsonb(fs)),
      '[]'::jsonb
    )
    into v_final_stats
    from (
      select
        gfs.player_id,
        gfs.goals,
        gfs.own_goals,
        gfs.assists,
        gfs.minutes_played,
        gfs.lineup_type,
        gfs.yellow_cards,
        gfs.red_cards,
        gfs.coach_rating,
        gfs.is_mvp,
        gfs.is_finalized,
        gfs.game_id
      from public.game_final_stats gfs
      where gfs.player_id = any(v_player_ids)
        and gfs.is_finalized = true
    ) fs;
  end if;

  select coalesce(array_agg(g.id), '{}'::uuid[])
    into v_game_ids
  from public.games g
  where g.age_group_id = p_age_group_id;

  if cardinality(v_game_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'game_id', c.game_id
        )
      ),
      '[]'::jsonb
    )
    into v_convocations
    from public.convocations c
    where c.game_id = any(v_game_ids);

    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_convocation_ids
    from public.convocations c
    where c.game_id = any(v_game_ids);

    if cardinality(v_convocation_ids) > 0 and cardinality(v_player_ids) > 0 then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_id', cp.player_id,
            'convocation_id', cp.convocation_id
          )
        ),
        '[]'::jsonb
      )
      into v_convocation_players
      from public.convocation_players cp
      where cp.convocation_id = any(v_convocation_ids)
        and cp.player_id = any(v_player_ids);
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'game_id', ge.game_id,
          'player_id', ge.player_id,
          'event_type', ge.event_type,
          'is_opponent_event', ge.is_opponent_event
        )
      ),
      '[]'::jsonb
    )
    into v_game_events
    from public.game_events ge
    where ge.game_id = any(v_game_ids)
      and ge.event_type = any(array['goal', 'penalty_goal', 'own_goal']);
  end if;

  return jsonb_build_object(
    'ok', true,
    'players', v_players,
    'attendanceRows', v_attendance_rows,
    'finalStats', v_final_stats,
    'convocations', v_convocations,
    'convocationPlayers', v_convocation_players,
    'gameIds', to_jsonb(v_game_ids),
    'gameEvents', v_game_events
  );
end;
$$;

create or replace function public.rpc_attendance_today_get(
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := coalesce(p_date, current_date);
  v_age_group_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_age_group_logo_url text;
  v_team_id uuid;
  v_players jsonb := '[]'::jsonb;
  v_session jsonb := null;
  v_attendance_default jsonb := '{}'::jsonb;
  v_attendance_saved jsonb := '{}'::jsonb;
  v_attendance jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  select ag.id, ag.name, ag.club_name, ag.club_logo_url
    into v_age_group_id, v_age_group_name, v_age_group_club_name, v_age_group_logo_url
  from public.age_groups ag
  where ag.coordinator_id = v_user_id
  order by ag.created_at asc nulls last, ag.id asc
  limit 1;

  if v_age_group_id is not null then
    select t.id
      into v_team_id
    from public.teams t
    where t.age_group_id = v_age_group_id
    order by t.created_at asc nulls last, t.id asc
    limit 1;
  else
    select
      ag.id,
      ag.name,
      ag.club_name,
      ag.club_logo_url,
      coalesce(
        ags.linked_team_id,
        (
          select t.id
          from public.teams t
          where t.age_group_id = ag.id
          order by t.created_at asc nulls last, t.id asc
          limit 1
        )
      )
    into
      v_age_group_id,
      v_age_group_name,
      v_age_group_club_name,
      v_age_group_logo_url,
      v_team_id
    from public.age_group_staff ags
    join public.age_groups ag
      on ag.id = ags.age_group_id
    where ags.profile_id = v_user_id
    order by ags.created_at asc nulls last, ags.id asc
    limit 1;
  end if;

  if v_age_group_id is null then
    return jsonb_build_object(
      'success', true,
      'linked', false,
      'noSession', true,
      'ageGroup', null,
      'players', jsonb_build_array(),
      'session', null,
      'attendance', jsonb_build_object()
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.first_name asc, p.last_name asc), '[]'::jsonb)
    into v_players
  from public.players p
  where p.age_group_id = v_age_group_id
    and p.status = 'active';

  select to_jsonb(s)
    into v_session
  from (
    select
      ts.id,
      ts.age_group_id,
      ts.team_id,
      ts.session_date,
      ts.start_time,
      ts.end_time,
      ts.status,
      ts.created_at
    from public.training_sessions ts
    where ts.session_date = v_date
      and (
        (v_team_id is not null and ts.team_id = v_team_id)
        or (v_team_id is null and ts.age_group_id = v_age_group_id)
      )
    order by
      case when ts.status <> 'completed' then 0 else 1 end,
      ts.start_time asc nulls last,
      ts.created_at asc
    limit 1
  ) s;

  select coalesce(
    jsonb_object_agg(
      p_elem ->> 'id',
      to_jsonb('present'::text)
    ),
    '{}'::jsonb
  )
  into v_attendance_default
  from jsonb_array_elements(v_players) p_elem;

  if v_session is null then
    return jsonb_build_object(
      'success', true,
      'linked', true,
      'noSession', true,
      'date', to_char(v_date, 'YYYY-MM-DD'),
      'ageGroup', jsonb_build_object(
        'id', v_age_group_id,
        'name', v_age_group_name,
        'club_name', v_age_group_club_name,
        'club_logo_url', v_age_group_logo_url
      ),
      'players', v_players,
      'session', null,
      'attendance', v_attendance_default
    );
  end if;

  select coalesce(
    jsonb_object_agg(ta.player_id::text, to_jsonb(ta.status)),
    '{}'::jsonb
  )
  into v_attendance_saved
  from public.training_attendance ta
  where ta.training_session_id = (v_session ->> 'id')::uuid
    and ta.status in ('present', 'late', 'absent', 'injured');

  v_attendance := v_attendance_default || v_attendance_saved;

  return jsonb_build_object(
    'success', true,
    'linked', true,
    'noSession', false,
    'date', to_char(v_date, 'YYYY-MM-DD'),
    'ageGroup', jsonb_build_object(
      'id', v_age_group_id,
      'name', v_age_group_name,
      'club_name', v_age_group_club_name,
      'club_logo_url', v_age_group_logo_url
    ),
    'players', v_players,
    'session', v_session,
    'attendance', v_attendance,
    'attendanceTable', 'training_attendance'
  );
end;
$$;

create or replace function public.rpc_attendance_today_save(
  p_session_id uuid,
  p_attendance jsonb,
  p_finalize boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_age_group_id uuid;
  v_session_team_id uuid;
  v_effective_age_group_id uuid;
  v_session_status text;
  v_session_date date;
  v_session_start_time time;
  v_session_end_time time;
  v_now_local timestamp := timezone('Europe/Lisbon', now());
  v_effective_end_at timestamp;
  v_is_coordinator boolean := false;
  v_has_access boolean := false;
  v_saved_count integer := 0;
  v_has_invalid_player boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  if p_session_id is null or p_attendance is null or jsonb_typeof(p_attendance) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_payload');
  end if;

  select ts.age_group_id, ts.team_id, ts.status, ts.session_date, ts.start_time, ts.end_time
    into
      v_session_age_group_id,
      v_session_team_id,
      v_session_status,
      v_session_date,
      v_session_start_time,
      v_session_end_time
  from public.training_sessions ts
  where ts.id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  end if;

  v_effective_age_group_id := v_session_age_group_id;

  if v_effective_age_group_id is null and v_session_team_id is not null then
    select t.age_group_id
      into v_effective_age_group_id
    from public.teams t
    where t.id = v_session_team_id
    limit 1;
  end if;

  if v_effective_age_group_id is not null then
    select public.user_can_manage_age_group_v2(v_effective_age_group_id)
      into v_is_coordinator;
  end if;

  select public.user_can_access_training_session_v2(p_session_id)
    into v_has_access;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if v_session_status = 'completed' and not v_is_coordinator then
    return jsonb_build_object('ok', false, 'error_code', 'closed_requires_coordinator');
  end if;

  if p_finalize and v_session_status <> 'completed' then
    v_effective_end_at := v_session_date + coalesce(
      v_session_end_time,
      (v_session_start_time + interval '3 hours')::time
    );

    if v_effective_end_at is null or v_now_local < v_effective_end_at then
      return jsonb_build_object('ok', false, 'error_code', 'finalize_before_end');
    end if;
  end if;

  with entries as (
    select key as player_id_text, value as status
    from jsonb_each_text(p_attendance)
    where value in ('present', 'late', 'absent', 'injured')
  )
  select count(*)::integer
    into v_saved_count
  from entries;

  if v_saved_count = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'no_valid_entries');
  end if;

  if v_effective_age_group_id is not null then
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    )
    select exists (
      select 1
      from entries e
      left join public.players p
        on p.id::text = e.player_id_text
       and p.age_group_id = v_effective_age_group_id
      where p.id is null
    )
    into v_has_invalid_player;

    if v_has_invalid_player then
      return jsonb_build_object('ok', false, 'error_code', 'invalid_players');
    end if;
  end if;

  begin
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    ),
    rows_to_save as (
      select
        p_session_id as training_session_id,
        p.id as player_id,
        e.status,
        v_user_id as marked_by,
        now() as marked_at
      from entries e
      join public.players p on p.id::text = e.player_id_text
    )
    insert into public.training_attendance (
      training_session_id,
      player_id,
      status,
      marked_by,
      marked_at
    )
    select
      r.training_session_id,
      r.player_id,
      r.status,
      r.marked_by,
      r.marked_at
    from rows_to_save r
    on conflict (training_session_id, player_id)
    do update
      set
        status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;
  exception
    when sqlstate '42P10' then
      delete from public.training_attendance ta
      where ta.training_session_id = p_session_id;

      with entries as (
        select key as player_id_text, value as status
        from jsonb_each_text(p_attendance)
        where value in ('present', 'late', 'absent', 'injured')
      ),
      rows_to_save as (
        select
          p_session_id as training_session_id,
          p.id as player_id,
          e.status,
          v_user_id as marked_by,
          now() as marked_at
        from entries e
        join public.players p on p.id::text = e.player_id_text
      )
      insert into public.training_attendance (
        training_session_id,
        player_id,
        status,
        marked_by,
        marked_at
      )
      select
        r.training_session_id,
        r.player_id,
        r.status,
        r.marked_by,
        r.marked_at
      from rows_to_save r;
  end;

  if p_finalize and v_session_status <> 'completed' then
    update public.training_sessions
    set status = 'completed'
    where id = p_session_id;

    v_session_status := 'completed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'attendanceTable', 'training_attendance',
    'savedCount', v_saved_count,
    'sessionStatus', v_session_status
  );
end;
$$;
