-- Forensic C1: verificacao pos-teste concorrente do redeem.

do $$
declare
  v_user_a uuid := '948c5a37-77b4-4a74-934f-e092d3fa4955';
  v_code text := 'FORENSICC1RACE2';
  v_team_id uuid;
  v_max_count integer := 0;
  v_invite record;
begin
  select t.id
    into v_team_id
  from public.teams t
  join public.age_groups ag on ag.id = t.age_group_id
  where ag.name = 'Forensic C1 Race'
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  select coalesce(max(x.cnt), 0)
    into v_max_count
  from (
    select count(*)::integer as cnt
    from public.team_staff ts
    where ts.profile_id = v_user_a
      and ts.team_id = v_team_id
    group by ts.profile_id, ts.team_id
  ) x;

  select invite_code, accepted_at, accepted_by, status
    into v_invite
  from public.staff_invites
  where invite_code = v_code
  limit 1;

  raise notice 'A2_RACE_VERIFY|profile_id=%|team_id=%|max_count=%',
    v_user_a, v_team_id, v_max_count;
  raise notice 'A2_RACE_INVITE|invite_code=%|accepted_at=%|accepted_by=%|status=%',
    v_invite.invite_code, v_invite.accepted_at, v_invite.accepted_by, v_invite.status;
end $$;

