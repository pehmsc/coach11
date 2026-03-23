-- BUG-3: Corrigir dead code na função rpc_redeem_staff_invite.
--
-- Problema original (linha 113 da 20260224223000):
--   v_profile_role := case when v_invite.role = 'coordinator' then 'coordinator' else 'coach' end;
--
-- staff_invites.role nunca tem o valor 'coordinator' (constraint proíbe esse valor).
-- A condição nunca era verdadeira — staff ficava sempre como 'coach' por acidente.
--
-- Correcção:
--   - Lógica explícita: club_coordinator → 'coordinator', todos os outros roles → 'coach'
--   - Remove o case ambíguo para 'coach' no v_team_staff_role (role 'coach' também não existe
--     em staff_invites; o valor correcto é um dos staff roles definidos na constraint)
--
-- Nota: este ficheiro substitui apenas o body da função; a signature e grants mantêm-se.

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

  -- Lock por codigo para evitar corrida concorrente no mesmo convite.
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

  -- Mapeia o role do convite para o profiles.role correcto.
  -- club_coordinator → 'coordinator' (umbrella em profiles)
  -- Todos os outros roles de staff técnico → 'coach'
  -- (staff_invites.role nunca contém 'coordinator' puro — constraint proíbe)
  v_profile_role := case
    when v_invite.role = 'club_coordinator' then 'coordinator'
    else 'coach'
  end;

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
    -- v_invite.role contém sempre um staff role válido (head_coach, assistant_coach, etc.)
    -- O valor 'coach' não existe em staff_invites — usar o role directamente.
    v_team_staff_role := v_invite.role;

    begin
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
