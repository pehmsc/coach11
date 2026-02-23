-- Forensic C1: setup v2 para teste concorrente limpo.

do $$
declare
  v_club_a uuid;
  v_user_a uuid;
  v_user_a_email text;
  v_age_group_r uuid;
  v_team_r uuid;
  v_code text := 'FORENSICC1RACE2';
begin
  select cm.club_id
    into v_club_a
  from public.club_memberships cm
  group by cm.club_id
  order by count(*) desc, min(cm.created_at) asc
  limit 1;

  select cm.profile_id, au.email
    into v_user_a, v_user_a_email
  from public.club_memberships cm
  left join auth.users au on au.id = cm.profile_id
  where cm.club_id = v_club_a
  order by cm.created_at asc
  limit 1;

  if v_user_a is null then
    raise notice 'A2_RACE2_SETUP|status=SKIPPED|reason=no_user';
    return;
  end if;

  if v_user_a_email is null then
    v_user_a_email := 'forensic-user-a@coach11.invalid';
  end if;

  select ag.id
    into v_age_group_r
  from public.age_groups ag
  where ag.club_id = v_club_a
    and ag.name = 'Forensic C1 Race'
  limit 1;

  if v_age_group_r is null then
    insert into public.age_groups (
      club_id,
      coordinator_id,
      club_name,
      name,
      football_format,
      season
    )
    values (
      v_club_a,
      v_user_a,
      'Forensic Club A',
      'Forensic C1 Race',
      '11',
      '2025/2026'
    )
    returning id into v_age_group_r;
  end if;

  select t.id
    into v_team_r
  from public.teams t
  where t.age_group_id = v_age_group_r
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_r is null then
    insert into public.teams (club_id, age_group_id, name, is_competitive)
    values (v_club_a, v_age_group_r, 'Forensic C1 Race Team', true)
    returning id into v_team_r;
  end if;

  delete from public.team_staff
  where profile_id = v_user_a
    and team_id = v_team_r;

  delete from public.staff_invites
  where invite_code = v_code;

  insert into public.staff_invites (
    age_group_id,
    invited_by,
    first_name,
    last_name,
    email,
    phone,
    role,
    invite_code
  )
  values (
    v_age_group_r,
    v_user_a,
    'Forensic',
    'Race2',
    v_user_a_email,
    null,
    'coach',
    v_code
  );

  raise notice 'A2_RACE2_SETUP|status=READY|user_a=%|user_a_email=%|team_r=%|code=%',
    v_user_a, v_user_a_email, v_team_r, v_code;
end $$;

