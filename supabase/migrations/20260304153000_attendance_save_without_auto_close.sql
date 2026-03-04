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
  v_session_status text;
  v_session_date date;
  v_session_start_time time;
  v_session_end_time time;
  v_now_local timestamp := timezone('Europe/Lisbon', now());
  v_effective_end_at timestamp;
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

  select ts.age_group_id, ts.team_id, ts.status, ts.session_date, ts.start_time, ts.end_time
    into v_session_age_group_id, v_session_team_id, v_session_status, v_session_date, v_session_start_time, v_session_end_time
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

revoke all on function public.rpc_attendance_today_save(uuid, jsonb, boolean) from public;
revoke all on function public.rpc_attendance_today_save(uuid, jsonb, boolean) from anon;
revoke all on function public.rpc_attendance_today_save(uuid, jsonb, boolean) from authenticated;
grant execute on function public.rpc_attendance_today_save(uuid, jsonb, boolean) to authenticated;
grant execute on function public.rpc_attendance_today_save(uuid, jsonb, boolean) to service_role;
