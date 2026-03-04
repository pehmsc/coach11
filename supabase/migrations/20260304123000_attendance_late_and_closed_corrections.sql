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
    select ts.team_id
      into v_team_id
    from public.team_staff ts
    where ts.profile_id = v_user_id
    order by ts.created_at asc nulls last, ts.team_id asc
    limit 1;

    if v_team_id is not null then
      select ag.id, ag.name, ag.club_name, ag.club_logo_url
        into v_age_group_id, v_age_group_name, v_age_group_club_name, v_age_group_logo_url
      from public.teams t
      join public.age_groups ag on ag.id = t.age_group_id
      where t.id = v_team_id
      limit 1;
    end if;
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
  p_attendance jsonb
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
  v_session_status text;
  v_is_coordinator boolean := false;
  v_is_team_staff boolean := false;
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

  select ts.age_group_id, ts.team_id, ts.status
    into v_session_age_group_id, v_session_team_id, v_session_status
  from public.training_sessions ts
  where ts.id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  end if;

  if v_session_age_group_id is not null then
    select exists (
      select 1
      from public.age_groups ag
      where ag.id = v_session_age_group_id
        and ag.coordinator_id = v_user_id
    )
    into v_is_coordinator;
  end if;

  if v_session_team_id is not null then
    select exists (
      select 1
      from public.team_staff ts
      where ts.team_id = v_session_team_id
        and ts.profile_id = v_user_id
    )
    into v_is_team_staff;
  end if;

  v_has_access := v_is_coordinator or v_is_team_staff;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if v_session_status = 'completed' and not v_is_coordinator then
    return jsonb_build_object('ok', false, 'error_code', 'closed_requires_coordinator');
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

  if v_session_age_group_id is not null then
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
       and p.age_group_id = v_session_age_group_id
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

  update public.training_sessions
  set status = 'completed'
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'attendanceTable', 'training_attendance',
    'savedCount', v_saved_count
  );
end;
$$;
