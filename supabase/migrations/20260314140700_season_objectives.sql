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

drop policy if exists season_objectives_club_access on public.season_objectives;
create policy season_objectives_club_access
on public.season_objectives
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop trigger if exists trg_season_objectives_set_updated_at on public.season_objectives;
create trigger trg_season_objectives_set_updated_at
before update on public.season_objectives
for each row
execute function public.set_updated_at();

create index if not exists season_objectives_club_id_idx
  on public.season_objectives(club_id);
