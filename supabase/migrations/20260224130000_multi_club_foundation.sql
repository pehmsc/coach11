-- Fase 2A: fundacao multi-clube (tenant boundary) + RLS-first faseado.
-- Objetivo: bloquear cross-club sem alterar fluxos internos do clube.

create extension if not exists pgcrypto;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists clubs_slug_unique_idx
  on public.clubs(slug);

create table if not exists public.club_memberships (
  club_id uuid not null,
  profile_id uuid not null,
  role text not null default 'staff' check (role in ('owner', 'admin', 'coordinator', 'staff')),
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id),
  constraint club_memberships_club_id_fkey
    foreign key (club_id) references public.clubs(id) on delete cascade,
  constraint club_memberships_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade
);

create index if not exists club_memberships_profile_id_idx
  on public.club_memberships(profile_id);

create index if not exists club_memberships_club_id_idx
  on public.club_memberships(club_id);

create or replace function public.user_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.club_id
  from public.club_memberships cm
  where cm.profile_id = auth.uid();
$$;

create or replace function public.user_can_access_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_club_id is not null
    and exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = p_club_id
        and cm.profile_id = auth.uid()
    );
$$;

create or replace function public.user_can_manage_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_club_id is not null
    and exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = p_club_id
        and cm.profile_id = auth.uid()
        and cm.role in ('owner', 'admin', 'coordinator')
    );
$$;

create or replace function public.user_default_club_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select cm.club_id
    into v_club_id
  from public.club_memberships cm
  where cm.profile_id = auth.uid()
  order by
    case cm.role
      when 'owner' then 1
      when 'admin' then 2
      when 'coordinator' then 3
      else 4
    end,
    cm.created_at asc
  limit 1;

  if v_club_id is null then
    select c.id
      into v_club_id
    from public.clubs c
    where c.slug = 'default'
    limit 1;
  end if;

  return v_club_id;
end;
$$;

alter table if exists public.age_groups
  add column if not exists club_id uuid;

alter table if exists public.teams
  add column if not exists club_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'age_groups_club_id_fkey'
      and conrelid = 'public.age_groups'::regclass
  ) then
    alter table public.age_groups
      add constraint age_groups_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_club_id_fkey'
      and conrelid = 'public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;
end $$;

do $$
declare
  v_default_club_id uuid;
begin
  insert into public.clubs (name, slug)
  values ('Default Club', 'default')
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_default_club_id;

  update public.age_groups ag
  set club_id = v_default_club_id
  where ag.club_id is null;

  update public.teams t
  set club_id = ag.club_id
  from public.age_groups ag
  where t.age_group_id = ag.id
    and (t.club_id is null or t.club_id is distinct from ag.club_id);

  update public.teams t
  set club_id = v_default_club_id
  where t.club_id is null;
end $$;

insert into public.club_memberships (club_id, profile_id, role)
select distinct
  ag.club_id,
  ag.coordinator_id,
  'coordinator'
from public.age_groups ag
where ag.coordinator_id is not null
  and ag.club_id is not null
on conflict (club_id, profile_id)
do update set role =
  case
    when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
    else 'coordinator'
  end;

insert into public.club_memberships (club_id, profile_id, role)
select distinct
  t.club_id,
  ts.profile_id,
  case
    when ts.role = 'coordinator' then 'coordinator'
    else 'staff'
  end
from public.team_staff ts
join public.teams t on t.id = ts.team_id
where ts.profile_id is not null
  and t.club_id is not null
on conflict (club_id, profile_id)
do update set role =
  case
    when public.club_memberships.role in ('owner', 'admin', 'coordinator') then public.club_memberships.role
    when excluded.role = 'coordinator' then 'coordinator'
    else public.club_memberships.role
  end;

-- Rede de seguranca para perfis que ainda nao tenham membership.
insert into public.club_memberships (club_id, profile_id, role)
select
  c.id as club_id,
  p.id as profile_id,
  case when p.role = 'coordinator' then 'coordinator' else 'staff' end as role
from public.profiles p
cross join lateral (
  select id
  from public.clubs
  where slug = 'default'
  limit 1
) c
on conflict (club_id, profile_id) do nothing;

create or replace function public.age_groups_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.club_id is null then
    new.club_id := public.user_default_club_id();
  end if;

  if new.club_id is null then
    select c.id
      into new.club_id
    from public.clubs c
    where c.slug = 'default'
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_age_groups_assign_club_id on public.age_groups;
create trigger trg_age_groups_assign_club_id
before insert or update of club_id
on public.age_groups
for each row
execute function public.age_groups_assign_club_id();

create or replace function public.teams_assign_validate_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_group_club_id uuid;
begin
  if new.age_group_id is not null then
    select ag.club_id
      into v_age_group_club_id
    from public.age_groups ag
    where ag.id = new.age_group_id;

    if v_age_group_club_id is null then
      raise exception 'teams.age_group_id invalido ou sem club_id associado';
    end if;

    if new.club_id is null then
      new.club_id := v_age_group_club_id;
    elsif new.club_id is distinct from v_age_group_club_id then
      raise exception 'teams.club_id deve corresponder ao club_id do age_group';
    end if;
  elsif new.club_id is null then
    new.club_id := public.user_default_club_id();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_teams_assign_validate_club_id on public.teams;
create trigger trg_teams_assign_validate_club_id
before insert or update of age_group_id, club_id
on public.teams
for each row
execute function public.teams_assign_validate_club_id();

create or replace function public.profiles_auto_default_club_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_club_id uuid;
begin
  insert into public.clubs (name, slug)
  values ('Default Club', 'default')
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_default_club_id;

  insert into public.club_memberships (club_id, profile_id, role)
  values (
    v_default_club_id,
    new.id,
    case when new.role = 'coordinator' then 'coordinator' else 'staff' end
  )
  on conflict (club_id, profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_default_club_membership on public.profiles;
create trigger trg_profiles_auto_default_club_membership
after insert on public.profiles
for each row
execute function public.profiles_auto_default_club_membership();

create or replace function public.team_staff_sync_club_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select t.club_id
    into v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is not null and new.profile_id is not null then
    insert into public.club_memberships (club_id, profile_id, role)
    values (
      v_club_id,
      new.profile_id,
      case when new.role = 'coordinator' then 'coordinator' else 'staff' end
    )
    on conflict (club_id, profile_id)
    do update set role =
      case
        when public.club_memberships.role in ('owner', 'admin', 'coordinator') then public.club_memberships.role
        when excluded.role = 'coordinator' then 'coordinator'
        else public.club_memberships.role
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_team_staff_sync_club_membership on public.team_staff;
create trigger trg_team_staff_sync_club_membership
after insert or update of team_id, profile_id, role
on public.team_staff
for each row
execute function public.team_staff_sync_club_membership();

create or replace function public.age_groups_sync_coordinator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coordinator_id is not null and new.club_id is not null then
    insert into public.club_memberships (club_id, profile_id, role)
    values (new.club_id, new.coordinator_id, 'coordinator')
    on conflict (club_id, profile_id)
    do update set role =
      case
        when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
        else 'coordinator'
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_age_groups_sync_coordinator_membership on public.age_groups;
create trigger trg_age_groups_sync_coordinator_membership
after insert or update of coordinator_id, club_id
on public.age_groups
for each row
execute function public.age_groups_sync_coordinator_membership();

-- Defaults para inserts legados que nao enviam club_id explicitamente.
alter table public.age_groups
  alter column club_id set default public.user_default_club_id();

alter table public.teams
  alter column club_id set default public.user_default_club_id();

create index if not exists age_groups_club_id_idx
  on public.age_groups(club_id);

create index if not exists teams_club_id_idx
  on public.teams(club_id);

alter table public.age_groups
  alter column club_id set not null;

alter table public.teams
  alter column club_id set not null;

create or replace function public.user_can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and public.user_can_access_club(t.club_id)
      and (
        exists (
          select 1
          from public.team_staff ts
          where ts.team_id = t.id
            and ts.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.age_groups ag
          where ag.id = t.age_group_id
            and ag.coordinator_id = auth.uid()
        )
      )
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
      and public.user_can_access_club(t.club_id)
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
      and public.user_can_access_club(ag.club_id)
      and (
        ag.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.teams t
          join public.team_staff ts on ts.team_id = t.id
          where t.age_group_id = ag.id
            and ts.profile_id = auth.uid()
        )
      )
  );
$$;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.age_groups enable row level security;
alter table public.teams enable row level security;

drop policy if exists clubs_member_select_v1 on public.clubs;
create policy clubs_member_select_v1
on public.clubs
for select
using (public.user_can_access_club(id));

drop policy if exists clubs_member_update_v1 on public.clubs;
create policy clubs_member_update_v1
on public.clubs
for update
using (public.user_can_manage_club(id))
with check (public.user_can_manage_club(id));

drop policy if exists club_memberships_self_or_admin_select_v1 on public.club_memberships;
create policy club_memberships_self_or_admin_select_v1
on public.club_memberships
for select
using (
  profile_id = auth.uid()
  or public.user_can_manage_club(club_id)
);

drop policy if exists club_memberships_admin_insert_v1 on public.club_memberships;
create policy club_memberships_admin_insert_v1
on public.club_memberships
for insert
with check (public.user_can_manage_club(club_id));

drop policy if exists club_memberships_admin_update_v1 on public.club_memberships;
create policy club_memberships_admin_update_v1
on public.club_memberships
for update
using (public.user_can_manage_club(club_id))
with check (public.user_can_manage_club(club_id));

drop policy if exists club_memberships_admin_delete_v1 on public.club_memberships;
create policy club_memberships_admin_delete_v1
on public.club_memberships
for delete
using (public.user_can_manage_club(club_id));

drop policy if exists age_groups_club_select_v1 on public.age_groups;
create policy age_groups_club_select_v1
on public.age_groups
for select
using (public.user_can_access_club(club_id));

drop policy if exists age_groups_club_insert_v1 on public.age_groups;
create policy age_groups_club_insert_v1
on public.age_groups
for insert
with check (
  public.user_can_access_club(club_id)
  and coordinator_id = auth.uid()
);

drop policy if exists age_groups_club_update_v1 on public.age_groups;
create policy age_groups_club_update_v1
on public.age_groups
for update
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists age_groups_club_delete_v1 on public.age_groups;
create policy age_groups_club_delete_v1
on public.age_groups
for delete
using (public.user_can_access_club(club_id));

drop policy if exists teams_club_select_v1 on public.teams;
create policy teams_club_select_v1
on public.teams
for select
using (public.user_can_access_club(club_id));

drop policy if exists teams_club_insert_v1 on public.teams;
create policy teams_club_insert_v1
on public.teams
for insert
with check (
  public.user_can_access_club(club_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = teams.age_group_id
      and ag.club_id = teams.club_id
  )
);

drop policy if exists teams_club_update_v1 on public.teams;
create policy teams_club_update_v1
on public.teams
for update
using (public.user_can_access_club(club_id))
with check (
  public.user_can_access_club(club_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = teams.age_group_id
      and ag.club_id = teams.club_id
  )
);

drop policy if exists teams_club_delete_v1 on public.teams;
create policy teams_club_delete_v1
on public.teams
for delete
using (public.user_can_access_club(club_id));
