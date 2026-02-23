-- Forensic C1 post-fix: validar bloqueio cross-club e mapeamentos de erro.

do $$
declare
  r record;
begin
  raise notice 'A1_POST_BEGIN';
  for r in
    select routine_name, grantee, privilege_type
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'rpc_redeem_staff_invite'
    order by grantee, privilege_type
  loop
    raise notice 'A1_POST|routine_name=%|grantee=%|privilege_type=%',
      r.routine_name, r.grantee, r.privilege_type;
  end loop;
  raise notice 'A1_POST_END';
end $$;

do $$
declare
  v_user_a uuid := '948c5a37-77b4-4a74-934f-e092d3fa4955';
  v_user_a_email text := 'pedrohmscampos@gmail.com';
  v_cross jsonb;
  v_mail jsonb;
  v_cross_team_rows integer := 0;
begin
  v_cross := public.rpc_redeem_staff_invite('FORENSICC1XCLUB', v_user_a, v_user_a_email);
  raise notice 'A3_POST_CROSS_CLUB|result=%', v_cross;

  select count(*)::integer
    into v_cross_team_rows
  from public.team_staff ts
  join public.teams t on t.id = ts.team_id
  join public.age_groups ag on ag.id = t.age_group_id
  join public.clubs c on c.id = ag.club_id
  where ts.profile_id = v_user_a
    and c.slug = 'forensic-c1-club-b';

  raise notice 'A3_POST_TEAM_STAFF_ROWS|profile_id=%|club_slug=forensic-c1-club-b|rows=%',
    v_user_a, v_cross_team_rows;

  v_mail := public.rpc_redeem_staff_invite('FORENSICC1MAIL', v_user_a, v_user_a_email);
  raise notice 'A4_POST_EMAIL_MISMATCH|result=%', v_mail;
end $$;

