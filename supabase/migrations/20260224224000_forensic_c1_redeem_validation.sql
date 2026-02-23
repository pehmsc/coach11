-- Forensic C1 validation: grants, idempotencia e boundary da rpc_redeem_staff_invite.

create extension if not exists pgcrypto;

-- A1) Grants da RPC
do $$
declare
  r record;
begin
  raise notice 'A1_BEGIN';
  for r in
    select routine_name, grantee, privilege_type
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'rpc_redeem_staff_invite'
    order by grantee, privilege_type
  loop
    raise notice 'A1|routine_name=%|grantee=%|privilege_type=%',
      r.routine_name, r.grantee, r.privilege_type;
  end loop;
  raise notice 'A1_END';
end $$;

-- A2/A3/A4) Idempotencia, cross-club e email mismatch
do $$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_user_a uuid;
  v_user_a_email text;
  v_age_group_a uuid;
  v_team_a uuid;
  v_age_group_b uuid;
  v_team_b uuid;
  v_age_group_m uuid;
  v_team_m uuid;
  v_code_ok text := 'FORENSICC1OK';
  v_code_cross text := 'FORENSICC1XCLUB';
  v_code_mismatch text := 'FORENSICC1MAIL';
  v_result_1 jsonb;
  v_result_2 jsonb;
  v_result_cross jsonb;
  v_result_mail jsonb;
  v_duplicates integer := 0;
  v_cross_staff_rows integer := 0;
  v_mismatch_staff_rows integer := 0;
  v_invite record;
begin
  select cm.club_id
    into v_club_a
  from public.club_memberships cm
  group by cm.club_id
  order by count(*) desc, min(cm.created_at) asc
  limit 1;

  if v_club_a is null then
    raise notice 'A2|status=SKIPPED|reason=no_club_memberships';
    return;
  end if;

  select cm.profile_id, au.email
    into v_user_a, v_user_a_email
  from public.club_memberships cm
  left join auth.users au on au.id = cm.profile_id
  where cm.club_id = v_club_a
  order by cm.created_at asc
  limit 1;

  if v_user_a is null then
    raise notice 'A2|status=SKIPPED|reason=no_user_in_club_a';
    return;
  end if;

  if v_user_a_email is null then
    v_user_a_email := 'forensic-user-a@coach11.invalid';
  end if;

  -- Clube B dedicado aos testes de boundary
  insert into public.clubs (name, slug)
  values ('Forensic C1 Club B', 'forensic-c1-club-b')
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_club_b;

  if v_club_b is null then
    select id into v_club_b
    from public.clubs
    where slug = 'forensic-c1-club-b'
    limit 1;
  end if;

  -- Garantir que user_a nao pertence ao club B.
  delete from public.club_memberships
  where club_id = v_club_b
    and profile_id = v_user_a;

  -- Age group/team do club A (para cenario valido)
  select ag.id
    into v_age_group_a
  from public.age_groups ag
  where ag.club_id = v_club_a
  order by ag.created_at asc nulls last, ag.id asc
  limit 1;

  if v_age_group_a is null then
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
      'Forensic A U15',
      '11',
      '2025/2026'
    )
    returning id into v_age_group_a;
  end if;

  select t.id
    into v_team_a
  from public.teams t
  where t.age_group_id = v_age_group_a
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_a is null then
    insert into public.teams (club_id, age_group_id, name, is_competitive)
    values (v_club_a, v_age_group_a, 'Forensic C1 A1', true)
    returning id into v_team_a;
  end if;

  -- Age group/team do club B (para cenario cross-club)
  select ag.id
    into v_age_group_b
  from public.age_groups ag
  where ag.club_id = v_club_b
  order by ag.created_at asc nulls last, ag.id asc
  limit 1;

  if v_age_group_b is null then
    insert into public.age_groups (
      club_id,
      coordinator_id,
      club_name,
      name,
      football_format,
      season
    )
    values (
      v_club_b,
      v_user_a,
      'Forensic Club B',
      'Forensic B U15',
      '11',
      '2025/2026'
    )
    returning id into v_age_group_b;
  end if;

  select t.id
    into v_team_b
  from public.teams t
  where t.age_group_id = v_age_group_b
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_b is null then
    insert into public.teams (club_id, age_group_id, name, is_competitive)
    values (v_club_b, v_age_group_b, 'Forensic C1 B1', true)
    returning id into v_team_b;
  end if;

  -- Age group/team no club A para teste de email mismatch isolado
  select ag.id
    into v_age_group_m
  from public.age_groups ag
  where ag.club_id = v_club_a
    and ag.name = 'Forensic C1 Mail'
  limit 1;

  if v_age_group_m is null then
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
      'Forensic C1 Mail',
      '11',
      '2025/2026'
    )
    returning id into v_age_group_m;
  end if;

  select t.id
    into v_team_m
  from public.teams t
  where t.age_group_id = v_age_group_m
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_m is null then
    insert into public.teams (club_id, age_group_id, name, is_competitive)
    values (v_club_a, v_age_group_m, 'Forensic C1 Mail Team', true)
    returning id into v_team_m;
  end if;

  delete from public.staff_invites
  where invite_code in (v_code_ok, v_code_cross, v_code_mismatch);

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
    v_age_group_a,
    v_user_a,
    'Forensic',
    'OK',
    v_user_a_email,
    null,
    'coach',
    v_code_ok
  );

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
    v_age_group_b,
    v_user_a,
    'Forensic',
    'Cross',
    v_user_a_email,
    null,
    'coach',
    v_code_cross
  );

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
    v_age_group_m,
    v_user_a,
    'Forensic',
    'Mail',
    'forensic-mismatch@coach11.invalid',
    null,
    'coach',
    v_code_mismatch
  );

  raise notice 'A2_SETUP|club_a=%|club_b=%|user_a=%|user_a_email=%|team_a=%|team_b=%|team_m=%|code_ok=%|code_cross=%|code_mismatch=%',
    v_club_a,
    v_club_b,
    v_user_a,
    v_user_a_email,
    v_team_a,
    v_team_b,
    v_team_m,
    v_code_ok,
    v_code_cross,
    v_code_mismatch;

  -- Cenario 1: primeiro redeem valido
  v_result_1 := public.rpc_redeem_staff_invite(v_code_ok, v_user_a, v_user_a_email);
  raise notice 'A2_SCENARIO_1|result=%', v_result_1;

  -- Cenario 2: repetir redeem (idempotencia)
  v_result_2 := public.rpc_redeem_staff_invite(v_code_ok, v_user_a, v_user_a_email);
  raise notice 'A2_SCENARIO_2|result=%', v_result_2;

  select coalesce(max(x.cnt), 0)
    into v_duplicates
  from (
    select count(*)::integer as cnt
    from public.team_staff ts
    where ts.profile_id = v_user_a
      and ts.team_id = v_team_a
    group by ts.profile_id, ts.team_id
  ) x;

  raise notice 'A2_DUPLICATES|profile_id=%|team_id=%|max_count=%', v_user_a, v_team_a, v_duplicates;

  select invite_code, accepted_at, accepted_by, status
    into v_invite
  from public.staff_invites
  where invite_code = v_code_ok
  limit 1;

  raise notice 'A2_INVITE_STATUS|invite_code=%|accepted_at=%|accepted_by=%|status=%',
    v_invite.invite_code, v_invite.accepted_at, v_invite.accepted_by, v_invite.status;

  -- Cenario 3: user_a tenta convite de clube B
  v_result_cross := public.rpc_redeem_staff_invite(v_code_cross, v_user_a, v_user_a_email);
  raise notice 'A3_CROSS_CLUB|result=%', v_result_cross;

  select count(*)::integer
    into v_cross_staff_rows
  from public.team_staff ts
  where ts.profile_id = v_user_a
    and ts.team_id = v_team_b;

  raise notice 'A3_TEAM_STAFF_LINK|profile_id=%|team_b=%|rows=%',
    v_user_a, v_team_b, v_cross_staff_rows;

  -- Cenario 4: email mismatch
  v_result_mail := public.rpc_redeem_staff_invite(v_code_mismatch, v_user_a, v_user_a_email);
  raise notice 'A4_EMAIL_MISMATCH|result=%', v_result_mail;

  select count(*)::integer
    into v_mismatch_staff_rows
  from public.team_staff ts
  where ts.profile_id = v_user_a
    and ts.team_id = v_team_m;

  raise notice 'A4_TEAM_STAFF_LINK|profile_id=%|team_m=%|rows=%',
    v_user_a, v_team_m, v_mismatch_staff_rows;
end $$;

-- A5) Policies nas tabelas criticas da RPC
do $$
declare
  r record;
begin
  raise notice 'A5_BEGIN';
  for r in
    select tablename, policyname, cmd, permissive
    from pg_policies
    where schemaname = 'public'
      and tablename in ('staff_invites', 'team_staff', 'teams', 'age_groups', 'profiles')
    order by tablename, policyname
  loop
    raise notice 'A5|tablename=%|policyname=%|cmd=%|permissive=%',
      r.tablename, r.policyname, r.cmd, r.permissive;
  end loop;
  raise notice 'A5_END';
end $$;

