create table if not exists public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  season text not null,
  registration_type text not null check (registration_type in (
    'club',
    'competition',
    'transfer_in',
    'transfer_out'
  )),
  registration_date date not null,
  exit_date date,
  status text not null default 'active' check (status in ('active', 'inactive', 'transferred')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.player_registrations_assign_validate_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_club_id uuid;
  v_team_club_id uuid;
begin
  select p.club_id
    into v_player_club_id
  from public.players p
  where p.id = new.player_id;

  if v_player_club_id is null then
    raise exception 'player_registrations.player_id invalido';
  end if;

  if new.team_id is not null then
    select t.club_id
      into v_team_club_id
    from public.teams t
    where t.id = new.team_id;

    if v_team_club_id is null then
      raise exception 'player_registrations.team_id invalido';
    end if;

    if v_team_club_id is distinct from v_player_club_id then
      raise exception 'player_registrations.team_id deve pertencer ao mesmo club do player';
    end if;
  end if;

  new.club_id := v_player_club_id;
  return new;
end;
$$;

drop trigger if exists trg_player_registrations_assign_validate_club_id on public.player_registrations;
create trigger trg_player_registrations_assign_validate_club_id
before insert or update of player_id, team_id, club_id
on public.player_registrations
for each row
execute function public.player_registrations_assign_validate_club_id();

alter table public.player_registrations enable row level security;

drop policy if exists pr_club_access on public.player_registrations;
drop policy if exists player_registrations_domain_boundary_v2 on public.player_registrations;
create policy player_registrations_domain_boundary_v2
on public.player_registrations
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

drop policy if exists player_registrations_select_v1 on public.player_registrations;
create policy player_registrations_select_v1
on public.player_registrations
for select
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
);

drop policy if exists player_registrations_insert_v1 on public.player_registrations;
create policy player_registrations_insert_v1
on public.player_registrations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

drop policy if exists player_registrations_update_v1 on public.player_registrations;
create policy player_registrations_update_v1
on public.player_registrations
for update
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

drop policy if exists player_registrations_delete_v1 on public.player_registrations;
create policy player_registrations_delete_v1
on public.player_registrations
for delete
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

drop trigger if exists trg_player_registrations_set_updated_at on public.player_registrations;
create trigger trg_player_registrations_set_updated_at
before update on public.player_registrations
for each row
execute function public.set_updated_at();

create index if not exists player_registrations_player_id_season_idx
  on public.player_registrations(player_id, season);

create index if not exists player_registrations_club_id_idx
  on public.player_registrations(club_id);

create index if not exists player_registrations_team_id_idx
  on public.player_registrations(team_id);
