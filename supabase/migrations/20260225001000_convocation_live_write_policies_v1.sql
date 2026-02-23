-- C5 (DB-first): permissões funcionais de escrita para domínio convocation/live.
-- Mantém policies RESTRICTIVE por club_id (2C) e adiciona policies permissivas mínimas.

create or replace function public.game_exists(p_game_id uuid)
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
    left join public.age_groups ag on ag.id = g.age_group_id
    where g.id = p_game_id
      and public.user_can_access_club(g.club_id)
      and (
        (g.age_group_id is not null and ag.coordinator_id = auth.uid())
        or (g.team_id is not null and public.user_is_team_coordinator(g.team_id))
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
    join public.games g on g.id = c.game_id
    join public.players p on p.id = p_player_id
    where c.id = p_convocation_id
      and p.club_id = g.club_id
      and (
        g.age_group_id is null
        or p.age_group_id = g.age_group_id
      )
  );
$$;

create or replace function public.rpc_game_access_context(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  select
    g.id,
    g.status,
    g.team_id,
    g.age_group_id
  into v_game
  from public.games g
  where g.id = p_game_id
  limit 1;

  if v_game.id is null then
    return jsonb_build_object(
      'exists', false,
      'canAccess', false,
      'canWrite', false,
      'canWriteLive', false,
      'isCoordinator', false,
      'status', null,
      'teamId', null,
      'ageGroupId', null
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'exists', true,
      'canAccess', false,
      'canWrite', false,
      'canWriteLive', false,
      'isCoordinator', false,
      'status', v_game.status,
      'teamId', v_game.team_id,
      'ageGroupId', v_game.age_group_id
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'canAccess', public.user_can_access_game(p_game_id),
    'canWrite', public.user_can_write_game(p_game_id),
    'canWriteLive', public.user_can_write_live_game(p_game_id),
    'isCoordinator', public.user_is_game_coordinator(p_game_id),
    'status', v_game.status,
    'teamId', v_game.team_id,
    'ageGroupId', v_game.age_group_id
  );
end;
$$;

revoke all on function public.rpc_game_access_context(uuid) from public;
revoke all on function public.rpc_game_access_context(uuid) from anon;
revoke all on function public.rpc_game_access_context(uuid) from authenticated;
grant execute on function public.rpc_game_access_context(uuid) to authenticated;
grant execute on function public.rpc_game_access_context(uuid) to service_role;

drop policy if exists convocations_write_insert_v1 on public.convocations;
create policy convocations_write_insert_v1
on public.convocations
for insert
to authenticated
with check (public.user_can_write_game(game_id));

drop policy if exists convocations_write_update_v1 on public.convocations;
create policy convocations_write_update_v1
on public.convocations
for update
to authenticated
using (public.user_can_write_game(game_id))
with check (public.user_can_write_game(game_id));

drop policy if exists convocation_players_write_insert_v1 on public.convocation_players;
create policy convocation_players_write_insert_v1
on public.convocation_players
for insert
to authenticated
with check (
  public.user_can_write_convocation(convocation_id)
  and public.convocation_player_matches_game_scope(convocation_id, player_id)
);

drop policy if exists convocation_players_write_update_v1 on public.convocation_players;
create policy convocation_players_write_update_v1
on public.convocation_players
for update
to authenticated
using (public.user_can_write_convocation(convocation_id))
with check (
  public.user_can_write_convocation(convocation_id)
  and public.convocation_player_matches_game_scope(convocation_id, player_id)
);

drop policy if exists convocation_players_write_delete_v1 on public.convocation_players;
create policy convocation_players_write_delete_v1
on public.convocation_players
for delete
to authenticated
using (public.user_can_write_convocation(convocation_id));

drop policy if exists game_live_checkpoints_write_insert_v1 on public.game_live_checkpoints;
create policy game_live_checkpoints_write_insert_v1
on public.game_live_checkpoints
for insert
to authenticated
with check (public.user_can_write_game(game_id));

drop policy if exists game_live_checkpoints_write_update_v1 on public.game_live_checkpoints;
create policy game_live_checkpoints_write_update_v1
on public.game_live_checkpoints
for update
to authenticated
using (public.user_can_write_game(game_id))
with check (public.user_can_write_game(game_id));

drop policy if exists game_events_write_insert_v1 on public.game_events;
create policy game_events_write_insert_v1
on public.game_events
for insert
to authenticated
with check (public.user_can_write_game(game_id));

drop policy if exists game_events_write_delete_v1 on public.game_events;
create policy game_events_write_delete_v1
on public.game_events
for delete
to authenticated
using (public.user_can_write_game(game_id));

drop policy if exists game_stats_live_write_insert_v1 on public.game_stats_live;
create policy game_stats_live_write_insert_v1
on public.game_stats_live
for insert
to authenticated
with check (public.user_can_write_game(game_id));

drop policy if exists game_stats_live_write_update_v1 on public.game_stats_live;
create policy game_stats_live_write_update_v1
on public.game_stats_live
for update
to authenticated
using (public.user_can_write_game(game_id))
with check (public.user_can_write_game(game_id));
