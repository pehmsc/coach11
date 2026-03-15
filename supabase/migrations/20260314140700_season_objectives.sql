create table if not exists public.season_objectives (
  id uuid primary key default gen_random_uuid(),
  age_group_id uuid not null references public.age_groups(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season text not null,
  objectives_text text not null,
  review_notes text,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (age_group_id, season)
);

create or replace function public.season_objectives_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'season_objectives.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_season_objectives_assign_club_id on public.season_objectives;
create trigger trg_season_objectives_assign_club_id
before insert or update of age_group_id, club_id
on public.season_objectives
for each row
execute function public.season_objectives_assign_club_id();

alter table public.season_objectives enable row level security;

drop policy if exists so_club_access on public.season_objectives;
drop policy if exists season_objectives_domain_boundary_v2 on public.season_objectives;
create policy season_objectives_domain_boundary_v2
on public.season_objectives
as restrictive
for all
to authenticated
using (public.user_can_access_age_group(age_group_id))
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

drop policy if exists season_objectives_select_v1 on public.season_objectives;
create policy season_objectives_select_v1
on public.season_objectives
for select
to authenticated
using (public.user_can_access_age_group(age_group_id));

drop policy if exists season_objectives_insert_v1 on public.season_objectives;
create policy season_objectives_insert_v1
on public.season_objectives
for insert
to authenticated
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

drop policy if exists season_objectives_update_v1 on public.season_objectives;
create policy season_objectives_update_v1
on public.season_objectives
for update
to authenticated
using (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
)
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

drop policy if exists season_objectives_delete_v1 on public.season_objectives;
create policy season_objectives_delete_v1
on public.season_objectives
for delete
to authenticated
using (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

drop trigger if exists trg_season_objectives_set_updated_at on public.season_objectives;
create trigger trg_season_objectives_set_updated_at
before update on public.season_objectives
for each row
execute function public.set_updated_at();

create index if not exists season_objectives_club_id_idx
  on public.season_objectives(club_id);
