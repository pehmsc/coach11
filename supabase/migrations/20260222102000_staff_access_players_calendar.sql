-- Permissões para equipa técnica em plantel/calendário.
-- Mantém exceção: jogos completed só podem ser alterados pelo coordenador.

create or replace function public.user_can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_staff ts
    where ts.team_id = p_team_id
      and ts.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.teams t
    join public.age_groups ag on ag.id = t.age_group_id
    where t.id = p_team_id
      and ag.coordinator_id = auth.uid()
  );
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
    join public.age_groups ag on ag.id = t.age_group_id
    where t.id = p_team_id
      and ag.coordinator_id = auth.uid()
  );
$$;

create or replace function public.user_can_access_age_group(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.id = p_age_group_id
      and ag.coordinator_id = auth.uid()
  )
  or exists (
    select 1
    from public.teams t
    join public.team_staff ts on ts.team_id = t.id
    where t.age_group_id = p_age_group_id
      and ts.profile_id = auth.uid()
  );
$$;

alter table public.players enable row level security;
alter table public.training_sessions enable row level security;
alter table public.games enable row level security;

drop policy if exists players_staff_select_v1 on public.players;
create policy players_staff_select_v1
on public.players
for select
using (public.user_can_access_age_group(age_group_id));

drop policy if exists players_staff_insert_v1 on public.players;
create policy players_staff_insert_v1
on public.players
for insert
with check (public.user_can_access_age_group(age_group_id));

drop policy if exists players_staff_update_v1 on public.players;
create policy players_staff_update_v1
on public.players
for update
using (public.user_can_access_age_group(age_group_id))
with check (public.user_can_access_age_group(age_group_id));

drop policy if exists training_sessions_staff_select_v1 on public.training_sessions;
create policy training_sessions_staff_select_v1
on public.training_sessions
for select
using (
  public.user_can_access_team(team_id)
);

drop policy if exists training_sessions_staff_insert_v1 on public.training_sessions;
create policy training_sessions_staff_insert_v1
on public.training_sessions
for insert
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = training_sessions.team_id
      and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)
  )
);

drop policy if exists training_sessions_staff_update_v1 on public.training_sessions;
create policy training_sessions_staff_update_v1
on public.training_sessions
for update
using (public.user_can_access_team(team_id))
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = training_sessions.team_id
      and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)
  )
);

drop policy if exists training_sessions_staff_delete_v1 on public.training_sessions;
create policy training_sessions_staff_delete_v1
on public.training_sessions
for delete
using (public.user_can_access_team(team_id));

drop policy if exists games_staff_select_v1 on public.games;
create policy games_staff_select_v1
on public.games
for select
using (public.user_can_access_team(team_id));

drop policy if exists games_staff_insert_v1 on public.games;
create policy games_staff_insert_v1
on public.games
for insert
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = games.team_id
      and (games.age_group_id is null or games.age_group_id = t.age_group_id)
  )
);

drop policy if exists games_staff_update_v1 on public.games;
create policy games_staff_update_v1
on public.games
for update
using (
  public.user_can_access_team(team_id)
  and (
    coalesce(status, 'scheduled') <> 'completed'
    or public.user_is_team_coordinator(team_id)
  )
)
with check (
  public.user_can_access_team(team_id)
  and (
    coalesce(status, 'scheduled') <> 'completed'
    or public.user_is_team_coordinator(team_id)
  )
  and exists (
    select 1
    from public.teams t
    where t.id = games.team_id
      and (games.age_group_id is null or games.age_group_id = t.age_group_id)
  )
);

drop policy if exists games_staff_delete_v1 on public.games;
create policy games_staff_delete_v1
on public.games
for delete
using (
  public.user_can_access_team(team_id)
  and (
    coalesce(status, 'scheduled') <> 'completed'
    or public.user_is_team_coordinator(team_id)
  )
);
