-- Move a autorização funcional de club_id para age_group/team nas áreas críticas.
-- Mantém clubs/club_memberships como compatibilidade técnica temporária.

create or replace function public.user_can_access_age_group(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_age_group_v2(p_age_group_id);
$$;

create or replace function public.user_is_age_group_coordinator(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_manage_age_group_v2(p_age_group_id);
$$;

create or replace function public.user_can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_team_v2(p_team_id);
$$;

create or replace function public.user_is_team_coordinator(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and public.user_can_manage_age_group_v2(t.age_group_id)
  );
$$;

create or replace function public.user_can_access_training_session_v2(
  p_training_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = p_training_session_id
      and (
        (ts.team_id is not null and public.user_can_access_team_v2(ts.team_id))
        or (ts.age_group_id is not null and public.user_can_access_age_group_v2(ts.age_group_id))
        or (
          ts.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_access_age_group_v2(t.age_group_id)
        )
      )
  );
$$;

create or replace function public.user_is_training_session_coordinator(
  p_training_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = p_training_session_id
      and (
        (ts.age_group_id is not null and public.user_can_manage_age_group_v2(ts.age_group_id))
        or (
          ts.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_manage_age_group_v2(t.age_group_id)
        )
      )
  );
$$;

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
    left join public.teams t
      on t.id = g.team_id
    where g.id = p_game_id
      and (
        (g.team_id is not null and public.user_can_access_team(g.team_id))
        or (g.age_group_id is not null and public.user_can_access_age_group(g.age_group_id))
        or (
          g.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_access_age_group(t.age_group_id)
        )
      )
  );
$$;

create or replace function public.user_is_game_coordinator(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    left join public.teams t
      on t.id = g.team_id
    where g.id = p_game_id
      and (
        (g.age_group_id is not null and public.user_can_manage_age_group_v2(g.age_group_id))
        or (
          g.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_manage_age_group_v2(t.age_group_id)
        )
      )
  );
$$;

create or replace function public.user_can_write_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_game(p_game_id);
$$;

create or replace function public.user_can_write_live_game(p_game_id uuid)
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
      and public.user_can_write_game(g.id)
      and (
        coalesce(g.status, 'scheduled') <> 'completed'
        or public.user_is_game_coordinator(g.id)
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

create or replace function public.user_can_write_convocation(p_convocation_id uuid)
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
      and public.user_can_write_game(c.game_id)
  );
$$;

create or replace function public.convocation_player_matches_game_scope(
  p_convocation_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.convocations c
    join public.games g
      on g.id = c.game_id
    left join public.teams t
      on t.id = g.team_id
    join public.players p
      on p.id = p_player_id
    where c.id = p_convocation_id
      and (
        coalesce(g.age_group_id, t.age_group_id) is null
        or p.age_group_id = coalesce(g.age_group_id, t.age_group_id)
      )
  );
$$;

create or replace function public.user_can_access_notification_scope_v2(
  p_age_group_id uuid,
  p_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      (p_team_id is not null and public.user_can_access_team_v2(p_team_id))
      or (p_age_group_id is not null and public.user_can_access_age_group_v2(p_age_group_id))
    )
    and (
      p_team_id is null
      or exists (
        select 1
        from public.teams t
        where t.id = p_team_id
          and (p_age_group_id is null or t.age_group_id = p_age_group_id)
      )
    );
$$;

create or replace function public.user_matches_notification_recipient_scope_v2(
  p_user_id uuid,
  p_age_group_id uuid,
  p_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_age_group_id is not null
    and (
      exists (
        select 1
        from public.age_groups ag
        where ag.id = p_age_group_id
          and ag.coordinator_id = p_user_id
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.age_group_id = p_age_group_id
          and ags.profile_id = p_user_id
      )
    )
    and (
      p_team_id is null
      or exists (
        select 1
        from public.teams t
        where t.id = p_team_id
          and t.age_group_id = p_age_group_id
      )
    );
$$;

create or replace function public.user_can_access_notification_context(
  p_notification_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and public.user_can_access_notification_scope_v2(n.age_group_id, n.team_id)
  );
$$;

create or replace function public.profile_has_conflicting_age_group_membership(
  p_profile_id uuid,
  p_allowed_age_group_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.coordinator_id = p_profile_id
      and (
        p_allowed_age_group_id is null
        or ag.id is distinct from p_allowed_age_group_id
      )
    union all
    select 1
    from public.age_group_staff ags
    where ags.profile_id = p_profile_id
      and (
        p_allowed_age_group_id is null
        or ags.age_group_id is distinct from p_allowed_age_group_id
      )
  );
$$;

create or replace function public.rpc_training_session_access_context(
  p_training_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session record;
begin
  select
    ts.id,
    ts.status,
    ts.team_id,
    ts.age_group_id,
    ts.club_id,
    ts.session_date,
    ts.start_time,
    ts.end_time
  into v_session
  from public.training_sessions ts
  where ts.id = p_training_session_id
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'exists', false,
      'canAccess', false,
      'isCoordinator', false,
      'status', null,
      'teamId', null,
      'ageGroupId', null,
      'clubId', null,
      'sessionDate', null,
      'startTime', null,
      'endTime', null
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'exists', true,
      'canAccess', false,
      'isCoordinator', false,
      'status', v_session.status,
      'teamId', v_session.team_id,
      'ageGroupId', v_session.age_group_id,
      'clubId', v_session.club_id,
      'sessionDate', v_session.session_date,
      'startTime', v_session.start_time,
      'endTime', v_session.end_time
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'canAccess', public.user_can_access_training_session_v2(p_training_session_id),
    'isCoordinator', public.user_is_training_session_coordinator(p_training_session_id),
    'status', v_session.status,
    'teamId', v_session.team_id,
    'ageGroupId', v_session.age_group_id,
    'clubId', v_session.club_id,
    'sessionDate', v_session.session_date,
    'startTime', v_session.start_time,
    'endTime', v_session.end_time
  );
end;
$$;

revoke all on function public.rpc_training_session_access_context(uuid) from public;
revoke all on function public.rpc_training_session_access_context(uuid) from anon;
revoke all on function public.rpc_training_session_access_context(uuid) from authenticated;
grant execute on function public.rpc_training_session_access_context(uuid) to authenticated;
grant execute on function public.rpc_training_session_access_context(uuid) to service_role;

create or replace function public.rpc_redeem_staff_invite(
  p_invite_code text,
  p_user_id uuid,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_user_email text := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%rowtype;
  v_team_id uuid;
  v_invite_club_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_profile_full_name text;
  v_profile_exists boolean := false;
  v_already_linked boolean := false;
  v_profile_role text;
begin
  if p_user_id is null then
    raise exception 'p_user_id e obrigatorio';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('redeem_staff_invite:' || v_code, 0));

  begin
    select si.*
      into v_invite
    from public.staff_invites si
    where upper(trim(si.invite_code)) = v_code
    limit 1
    for update;
  exception
    when others then
      return jsonb_build_object('ok', false, 'error_code', 'invite_lookup_failed');
  end;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  end if;

  if v_invite.email is not null
     and v_user_email is not null
     and lower(trim(v_invite.email)) <> v_user_email then
    return jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  end if;

  if v_invite.accepted_at is not null
     and v_invite.accepted_by is not null
     and v_invite.accepted_by <> p_user_id
     and not (
       v_invite.email is not null
       and v_user_email is not null
       and lower(trim(v_invite.email)) = v_user_email
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  end if;

  v_invite_club_id := v_invite.club_id;

  if v_invite_club_id is null then
    select ag.club_id
      into v_invite_club_id
    from public.age_groups ag
    where ag.id = v_invite.age_group_id
    limit 1;
  end if;

  if public.profile_has_conflicting_age_group_membership(p_user_id, v_invite.age_group_id) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_age_group_forbidden');
  end if;

  select ag.name, ag.club_name
    into v_age_group_name, v_age_group_club_name
  from public.age_groups ag
  where ag.id = v_invite.age_group_id
  limit 1;

  if v_age_group_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'age_group_not_found');
  end if;

  select t.id
    into v_team_id
  from public.teams t
  where t.age_group_id = v_invite.age_group_id
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_id is null then
    begin
      insert into public.teams (
        age_group_id,
        name,
        is_competitive
      )
      values (
        v_invite.age_group_id,
        trim(coalesce(v_age_group_club_name, '') || ' ' || coalesce(v_age_group_name, '')),
        true
      )
      returning id into v_team_id;
    exception
      when others then
        return jsonb_build_object('ok', false, 'error_code', 'team_create_failed');
    end;
  end if;

  select p.full_name
    into v_profile_full_name
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  v_profile_exists := found;
  v_profile_role := case when v_invite.role = 'coordinator' then 'coordinator' else 'coach' end;

  if not v_profile_exists then
    begin
      insert into public.profiles (
        id,
        full_name,
        role
      )
      values (
        p_user_id,
        coalesce(
          nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
          nullif(split_part(coalesce(v_user_email, ''), '@', 1), ''),
          'Utilizador'
        ),
        v_profile_role
      );
    exception
      when others then
        update public.profiles
        set role = v_profile_role
        where id = p_user_id;
    end;
  else
    update public.profiles
    set role = v_profile_role
    where id = p_user_id;
  end if;

  if v_profile_exists
     and coalesce(nullif(trim(v_profile_full_name), ''), '') = ''
     and v_invite.first_name is not null then
    update public.profiles
    set full_name = nullif(
      trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')),
      ''
    )
    where id = p_user_id;
  end if;

  select exists (
    select 1
    from public.age_group_staff ags
    where ags.profile_id = p_user_id
      and ags.age_group_id = v_invite.age_group_id
  )
  into v_already_linked;

  if not v_already_linked then
    begin
      perform set_config('coach11.current_staff_invite_id', v_invite.id::text, true);

      insert into public.age_group_staff (
        age_group_id,
        club_id,
        profile_id,
        linked_team_id,
        role
      )
      values (
        v_invite.age_group_id,
        coalesce(v_invite.club_id, v_invite_club_id),
        p_user_id,
        v_team_id,
        v_invite.role
      );
    exception
      when unique_violation then
        v_already_linked := true;
      when others then
        if SQLERRM = 'technical_staff_limit_reached' then
          return jsonb_build_object('ok', false, 'error_code', 'technical_staff_limit_reached');
        end if;

        return jsonb_build_object('ok', false, 'error_code', 'team_staff_insert_failed');
    end;
  end if;

  update public.staff_invites
  set
    accepted_at = now(),
    accepted_by = p_user_id,
    status = 'accepted'
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'already_linked', v_already_linked,
    'role', v_invite.role,
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
end;
$$;

create or replace function public.rpc_redeem_staff_invite_auth(
  p_invite_code text,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_effective_email text := nullif(lower(trim(coalesce(p_user_email, v_claim_email, ''))), '');
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_invite_age_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  select si.age_group_id
    into v_invite_age_group_id
  from public.staff_invites si
  where upper(trim(si.invite_code)) = v_code
  limit 1;

  if v_invite_age_group_id is not null
     and public.profile_has_conflicting_age_group_membership(v_uid, v_invite_age_group_id) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_age_group_forbidden');
  end if;

  return public.rpc_redeem_staff_invite(v_code, v_uid, v_effective_email);
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
    select ags.age_group_id, ags.linked_team_id
      into v_age_group_id, v_team_id
    from public.age_group_staff ags
    where ags.profile_id = v_user_id
    order by ags.created_at asc nulls last, ags.id asc
    limit 1;

    if v_age_group_id is not null then
      select ag.name, ag.club_name, ag.club_logo_url
        into v_age_group_name, v_age_group_club_name, v_age_group_logo_url
      from public.age_groups ag
      where ag.id = v_age_group_id
      limit 1;
    end if;

    if v_age_group_id is not null and v_team_id is null then
      select t.id
        into v_team_id
      from public.teams t
      where t.age_group_id = v_age_group_id
      order by t.created_at asc nulls last, t.id asc
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
  v_session_status text;
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

  select ts.age_group_id, ts.status
    into v_session_age_group_id, v_session_status
  from public.training_sessions ts
  where ts.id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  end if;

  v_is_coordinator := public.user_is_training_session_coordinator(p_session_id);
  v_has_access := public.user_can_access_training_session_v2(p_session_id);

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

drop policy if exists games_club_boundary_v1 on public.games;
create policy games_domain_boundary_v2
on public.games
as restrictive
for all
to authenticated
using (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
)
with check (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
);

drop policy if exists training_sessions_club_boundary_v1 on public.training_sessions;
create policy training_sessions_domain_boundary_v2
on public.training_sessions
as restrictive
for all
to authenticated
using (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
)
with check (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
);

do $$
declare
  v_table text;
  v_old_policy text;
  v_new_policy text;
begin
  foreach v_table in array array[
    'convocations',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    v_old_policy := format('%s_club_boundary_v1', v_table);
    v_new_policy := format('%s_domain_boundary_v2', v_table);

    execute format('drop policy if exists %I on public.%I', v_old_policy, v_table);
    execute format('drop policy if exists %I on public.%I', v_new_policy, v_table);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.user_can_access_game(game_id)) with check (public.user_can_access_game(game_id))',
      v_new_policy,
      v_table
    );
  end loop;
end $$;

drop policy if exists convocation_players_club_boundary_v1 on public.convocation_players;
drop policy if exists convocation_players_domain_boundary_v2 on public.convocation_players;
create policy convocation_players_domain_boundary_v2
on public.convocation_players
as restrictive
for all
to authenticated
using (public.user_can_access_convocation(convocation_id))
with check (public.user_can_access_convocation(convocation_id));

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
with check (public.user_can_access_game(game_id));

do $$
declare
  v_expr text := null;
begin
  if to_regclass('public.training_attendance') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'training_attendance'
        and column_name = 'training_session_id'
    ) then
      v_expr := '(training_session_id is not null and public.user_can_access_training_session_v2(training_session_id))';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'training_attendance'
        and column_name = 'session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(session_id is not null and public.user_can_access_training_session_v2(session_id))';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'training_attendance'
        and column_name = 'training_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(training_id is not null and public.user_can_access_training_session_v2(training_id))';
    end if;

    if v_expr is null then
      v_expr := 'false';
    end if;

    execute 'drop policy if exists training_attendance_club_boundary_v1 on public.training_attendance';
    execute 'drop policy if exists training_attendance_domain_boundary_v2 on public.training_attendance';
    execute format(
      'create policy training_attendance_domain_boundary_v2 on public.training_attendance as restrictive for all to authenticated using (%s) with check (%s)',
      v_expr,
      v_expr
    );
  end if;

  if to_regclass('public.attendance_records') is not null then
    v_expr := null;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attendance_records'
        and column_name = 'training_session_id'
    ) then
      v_expr := '(training_session_id is not null and public.user_can_access_training_session_v2(training_session_id))';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attendance_records'
        and column_name = 'session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(session_id is not null and public.user_can_access_training_session_v2(session_id))';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attendance_records'
        and column_name = 'training_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(training_id is not null and public.user_can_access_training_session_v2(training_id))';
    end if;

    if v_expr is null then
      v_expr := 'false';
    end if;

    execute 'drop policy if exists attendance_records_club_boundary_v1 on public.attendance_records';
    execute 'drop policy if exists attendance_records_domain_boundary_v2 on public.attendance_records';
    execute format(
      'create policy attendance_records_domain_boundary_v2 on public.attendance_records as restrictive for all to authenticated using (%s) with check (%s)',
      v_expr,
      v_expr
    );
  end if;
end $$;

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
      '(training_session_id is not null and public.user_can_access_training_session_v2(training_session_id))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'session_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(session_id is not null and public.user_can_access_training_session_v2(session_id))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_id'
  ) then
    v_expr := coalesce(v_expr || ' or ', '') ||
      '(training_id is not null and public.user_can_access_training_session_v2(training_id))';
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
           and public.user_can_access_age_group(p.age_group_id)
       ))';
  end if;

  if v_expr is null then
    v_expr := 'false';
  end if;

  execute 'drop policy if exists pse_records_club_boundary_v1 on public.pse_records';
  execute 'drop policy if exists pse_records_domain_boundary_v2 on public.pse_records';
  execute format(
    'create policy pse_records_domain_boundary_v2 on public.pse_records as restrictive for all to authenticated using (%s) with check (%s)',
    v_expr,
    v_expr
  );

  execute 'drop policy if exists pse_records_read_v1 on public.pse_records';
  execute format(
    'create policy pse_records_read_v1 on public.pse_records for select to authenticated using (%s)',
    v_expr
  );
end $$;

drop policy if exists notifications_club_boundary_v1 on public.notifications;
drop policy if exists notifications_domain_boundary_v2 on public.notifications;
create policy notifications_domain_boundary_v2
on public.notifications
as restrictive
for all
to authenticated
using (public.user_can_access_notification_scope_v2(age_group_id, team_id))
with check (public.user_can_access_notification_scope_v2(age_group_id, team_id));

drop policy if exists notifications_actor_insert_v1 on public.notifications;
create policy notifications_actor_insert_v1
on public.notifications
for insert
to authenticated
with check (
  (actor_id is null or actor_id = auth.uid())
  and public.user_can_access_notification_scope_v2(age_group_id, team_id)
  and (
    user_id is null
    or public.user_matches_notification_recipient_scope_v2(user_id, age_group_id, team_id)
  )
);
