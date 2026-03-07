-- Enforce do limite beta: cada escalão pode ter no máximo 1 membro técnico
-- adicional ao coordenador, contando staff ativo + convites pendentes.

create or replace function public.age_group_technical_staff_usage(
  p_age_group_id uuid,
  p_exclude_pending_invite_id uuid default null
)
returns table (
  coordinator_id uuid,
  active_technical_staff_count integer,
  pending_technical_invite_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with age_group_row as (
    select ag.id, ag.coordinator_id
    from public.age_groups ag
    where ag.id = p_age_group_id
  ),
  active_staff as (
    select count(distinct ts.profile_id)::integer as count_value
    from public.team_staff ts
    join public.teams t
      on t.id = ts.team_id
    join age_group_row ag
      on ag.id = t.age_group_id
    where ts.role in ('coach', 'head_coach', 'assistant_coach')
      and ts.profile_id is distinct from ag.coordinator_id
  ),
  pending_invites as (
    select count(*)::integer as count_value
    from public.staff_invites si
    where si.age_group_id = p_age_group_id
      and si.accepted_at is null
      and si.role in ('coach', 'assistant_coach')
      and (
        p_exclude_pending_invite_id is null
        or si.id <> p_exclude_pending_invite_id
      )
  )
  select
    ag.coordinator_id,
    coalesce(active_staff.count_value, 0) as active_technical_staff_count,
    coalesce(pending_invites.count_value, 0) as pending_technical_invite_count
  from age_group_row ag
  cross join active_staff
  cross join pending_invites;
$$;

revoke all on function public.age_group_technical_staff_usage(uuid, uuid) from public;
revoke all on function public.age_group_technical_staff_usage(uuid, uuid) from anon;
revoke all on function public.age_group_technical_staff_usage(uuid, uuid) from authenticated;
grant execute on function public.age_group_technical_staff_usage(uuid, uuid) to service_role;

create or replace function public.assert_age_group_technical_staff_limit(
  p_age_group_id uuid,
  p_exclude_pending_invite_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer := 0;
  v_pending_count integer := 0;
begin
  if p_age_group_id is null then
    return;
  end if;

  select
    usage.active_technical_staff_count,
    usage.pending_technical_invite_count
  into
    v_active_count,
    v_pending_count
  from public.age_group_technical_staff_usage(
    p_age_group_id,
    p_exclude_pending_invite_id
  ) as usage;

  if coalesce(v_active_count, 0) + coalesce(v_pending_count, 0) + 1 > 1 then
    raise exception 'technical_staff_limit_reached'
      using
        errcode = 'P0001',
        detail = format(
          'age_group_id=%s active=%s pending=%s',
          p_age_group_id,
          coalesce(v_active_count, 0),
          coalesce(v_pending_count, 0)
        );
  end if;
end;
$$;

revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from public;
revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from anon;
revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from authenticated;
grant execute on function public.assert_age_group_technical_staff_limit(uuid, uuid) to service_role;

create or replace function public.enforce_staff_invite_technical_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_consumes_slot boolean := false;
  v_new_consumes_slot boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old_consumes_slot :=
      old.accepted_at is null
      and old.role in ('coach', 'assistant_coach');
  end if;

  v_new_consumes_slot :=
    new.accepted_at is null
    and new.role in ('coach', 'assistant_coach');

  if not v_new_consumes_slot then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_old_consumes_slot
     and old.age_group_id is not distinct from new.age_group_id then
    return new;
  end if;

  perform public.assert_age_group_technical_staff_limit(new.age_group_id, null);
  return new;
end;
$$;

drop trigger if exists trg_staff_invites_limit_technical_staff on public.staff_invites;
create trigger trg_staff_invites_limit_technical_staff
before insert or update of age_group_id, role, accepted_at
on public.staff_invites
for each row
execute function public.enforce_staff_invite_technical_limit();

create or replace function public.enforce_team_staff_technical_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_age_group_id uuid := null;
  v_new_age_group_id uuid := null;
  v_old_coordinator_id uuid := null;
  v_new_coordinator_id uuid := null;
  v_old_consumes_slot boolean := false;
  v_new_consumes_slot boolean := false;
  v_pending_invite_id_text text := nullif(
    current_setting('coach11.current_staff_invite_id', true),
    ''
  );
  v_pending_invite_id uuid := null;
begin
  select t.age_group_id
    into v_new_age_group_id
  from public.teams t
  where t.id = new.team_id;

  if v_new_age_group_id is null then
    return new;
  end if;

  select ag.coordinator_id
    into v_new_coordinator_id
  from public.age_groups ag
  where ag.id = v_new_age_group_id;

  v_new_consumes_slot :=
    new.role in ('coach', 'head_coach', 'assistant_coach')
    and new.profile_id is distinct from v_new_coordinator_id;

  if not v_new_consumes_slot then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select t.age_group_id
      into v_old_age_group_id
    from public.teams t
    where t.id = old.team_id;

    if v_old_age_group_id is not null then
      select ag.coordinator_id
        into v_old_coordinator_id
      from public.age_groups ag
      where ag.id = v_old_age_group_id;
    end if;

    v_old_consumes_slot :=
      old.role in ('coach', 'head_coach', 'assistant_coach')
      and old.profile_id is distinct from v_old_coordinator_id;

    if v_old_consumes_slot
       and v_old_age_group_id is not distinct from v_new_age_group_id then
      return new;
    end if;
  end if;

  if v_pending_invite_id_text is not null then
    begin
      v_pending_invite_id := v_pending_invite_id_text::uuid;
    exception
      when others then
        v_pending_invite_id := null;
    end;
  end if;

  perform public.assert_age_group_technical_staff_limit(
    v_new_age_group_id,
    v_pending_invite_id
  );
  return new;
end;
$$;

drop trigger if exists trg_team_staff_limit_technical_staff on public.team_staff;
create trigger trg_team_staff_limit_technical_staff
before insert or update of team_id, profile_id, role
on public.team_staff
for each row
execute function public.enforce_team_staff_technical_limit();

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
  v_age_group_name text;
  v_age_group_club_name text;
  v_profile_full_name text;
  v_profile_exists boolean := false;
  v_already_linked boolean := false;
  v_profile_role text;
  v_team_staff_role text;
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
    from public.team_staff ts
    where ts.profile_id = p_user_id
      and ts.team_id = v_team_id
  )
  into v_already_linked;

  if not v_already_linked then
    v_team_staff_role := case when v_invite.role = 'coach' then 'head_coach' else v_invite.role end;

    begin
      perform set_config('coach11.current_staff_invite_id', v_invite.id::text, true);

      insert into public.team_staff (
        profile_id,
        team_id,
        role
      )
      values (
        p_user_id,
        v_team_id,
        v_team_staff_role
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

revoke all on function public.rpc_redeem_staff_invite(text, uuid, text) from public;
revoke all on function public.rpc_redeem_staff_invite(text, uuid, text) from anon;
revoke all on function public.rpc_redeem_staff_invite(text, uuid, text) from authenticated;
grant execute on function public.rpc_redeem_staff_invite(text, uuid, text) to service_role;
