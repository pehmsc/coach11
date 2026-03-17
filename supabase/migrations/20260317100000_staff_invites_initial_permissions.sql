-- Adiciona coluna initial_permissions à tabela staff_invites
-- para guardar o snapshot de permissões definido pelo coordenador no momento do convite.
-- A RPC rpc_redeem_staff_invite aplica estas permissões ao criar o registo em age_group_staff.

alter table public.staff_invites
  add column if not exists initial_permissions jsonb null;

comment on column public.staff_invites.initial_permissions is
  'Snapshot de permissões definido pelo coordenador no convite. '
  'Formato: array de {area, can_read, can_write, can_edit, can_delete}. '
  'Aplicado automaticamente em staff_permissions quando o convite é aceite.';

-- Atualiza rpc_redeem_staff_invite para aplicar initial_permissions ao criar age_group_staff.
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
  v_age_group_staff_id uuid;
  v_perm jsonb;
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
      )
      returning id into v_age_group_staff_id;
    exception
      when unique_violation then
        v_already_linked := true;
      when others then
        if SQLERRM = 'technical_staff_limit_reached' then
          return jsonb_build_object('ok', false, 'error_code', 'technical_staff_limit_reached');
        end if;

        return jsonb_build_object('ok', false, 'error_code', 'team_staff_insert_failed');
    end;

    -- Aplicar permissões iniciais do convite (se definidas pelo coordenador)
    if v_age_group_staff_id is not null
       and v_invite.initial_permissions is not null
       and jsonb_typeof(v_invite.initial_permissions) = 'array'
       and jsonb_array_length(v_invite.initial_permissions) > 0 then
      for v_perm in select * from jsonb_array_elements(v_invite.initial_permissions) loop
        begin
          insert into public.staff_permissions (
            staff_id,
            area,
            can_read,
            can_write,
            can_edit,
            can_delete
          )
          values (
            v_age_group_staff_id,
            v_perm->>'area',
            true,
            coalesce((v_perm->>'can_write')::boolean, false),
            coalesce((v_perm->>'can_edit')::boolean, false),
            coalesce((v_perm->>'can_delete')::boolean, false)
          )
          on conflict (staff_id, area) do nothing;
        exception
          when others then
            null; -- Permissão inválida ignorada silenciosamente
        end;
      end loop;
    end if;
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
