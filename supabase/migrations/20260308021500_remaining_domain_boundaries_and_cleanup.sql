-- Concluir a migração do boundary funcional de club para domínio real
-- nas áreas remanescentes e limpar legado confirmado.

drop policy if exists players_club_boundary_v1 on public.players;
drop policy if exists players_domain_boundary_v2 on public.players;
create policy players_domain_boundary_v2
on public.players
as restrictive
for all
to authenticated
using (public.user_can_access_age_group(age_group_id))
with check (public.user_can_access_age_group(age_group_id));

drop policy if exists competitions_club_boundary_v1 on public.competitions;
drop policy if exists competitions_domain_boundary_v2 on public.competitions;
create policy competitions_domain_boundary_v2
on public.competitions
as restrictive
for all
to authenticated
using (
  public.user_can_access_team(team_id)
)
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = competitions.team_id
      and t.club_id = competitions.club_id
  )
);

drop policy if exists team_staff_club_boundary_v1 on public.team_staff;
drop policy if exists team_staff_domain_boundary_v2 on public.team_staff;
create policy team_staff_domain_boundary_v2
on public.team_staff
as restrictive
for all
to authenticated
using (
  profile_id = auth.uid()
  or public.user_can_access_team(team_id)
)
with check (
  public.user_is_team_coordinator(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = team_staff.team_id
      and t.club_id = team_staff.club_id
  )
);

drop policy if exists team_messages_club_boundary_v1 on public.team_messages;
drop policy if exists team_messages_domain_boundary_v2 on public.team_messages;
create policy team_messages_domain_boundary_v2
on public.team_messages
as restrictive
for all
to authenticated
using (
  public.user_can_access_team(team_id)
  and public.user_can_access_age_group(age_group_id)
  and exists (
    select 1
    from public.teams t
    where t.id = team_messages.team_id
      and t.age_group_id = team_messages.age_group_id
  )
)
with check (
  public.user_can_access_team(team_id)
  and public.user_can_access_age_group(age_group_id)
  and exists (
    select 1
    from public.teams t
    where t.id = team_messages.team_id
      and t.age_group_id = team_messages.age_group_id
      and t.club_id = team_messages.club_id
  )
);

drop policy if exists kit_pieces_club_boundary_v1 on public.kit_pieces;
drop policy if exists kit_pieces_domain_boundary_v2 on public.kit_pieces;
create policy kit_pieces_domain_boundary_v2
on public.kit_pieces
as restrictive
for all
to authenticated
using (
  public.user_can_access_team(team_id)
)
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = kit_pieces.team_id
      and t.club_id = kit_pieces.club_id
  )
);

do $$
declare
  v_orphan_convocation_ids uuid[];
  v_deleted_convocation_players integer := 0;
  v_deleted_convocations integer := 0;
  v_deleted_message_notifications integer := 0;
begin
  select coalesce(array_agg(c.id), '{}'::uuid[])
    into v_orphan_convocation_ids
  from public.convocations c
  where not exists (
    select 1
    from public.games g
    where g.id = c.game_id
  );

  if coalesce(array_length(v_orphan_convocation_ids, 1), 0) > 0 then
    with deleted_convocation_players as (
      delete from public.convocation_players cp
      where cp.convocation_id = any(v_orphan_convocation_ids)
      returning 1
    )
    select count(*) into v_deleted_convocation_players
    from deleted_convocation_players;

    with deleted_convocations as (
      delete from public.convocations c
      where c.id = any(v_orphan_convocation_ids)
      returning 1
    )
    select count(*) into v_deleted_convocations
    from deleted_convocations;
  end if;

  with deleted_stray_convocation_players as (
    delete from public.convocation_players cp
    where not exists (
      select 1
      from public.convocations c
      where c.id = cp.convocation_id
    )
    returning 1
  )
  select v_deleted_convocation_players + count(*)
    into v_deleted_convocation_players
  from deleted_stray_convocation_players;

  with deleted_message_notifications as (
    delete from public.notifications n
    where n.type = 'message'
    returning 1
  )
  select count(*) into v_deleted_message_notifications
  from deleted_message_notifications;

  raise notice
    'cleanup_remaining_domain_v2|orphan_convocations=%|orphan_convocation_players=%|message_notifications=%',
    v_deleted_convocations,
    v_deleted_convocation_players,
    v_deleted_message_notifications;
end $$;
