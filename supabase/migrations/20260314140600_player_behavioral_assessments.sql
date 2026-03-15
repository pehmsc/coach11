create table if not exists public.player_behavioral_assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season text not null,
  eval_type text not null check (eval_type in ('behavioral', 'performance', 'general')),
  rating integer check (rating >= 0 and rating <= 10),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.player_behavioral_assessments_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select p.club_id
    into v_club_id
  from public.players p
  where p.id = new.player_id;

  if v_club_id is null then
    raise exception 'player_behavioral_assessments.player_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_player_behavioral_assessments_assign_club_id on public.player_behavioral_assessments;
create trigger trg_player_behavioral_assessments_assign_club_id
before insert or update of player_id, club_id
on public.player_behavioral_assessments
for each row
execute function public.player_behavioral_assessments_assign_club_id();

alter table public.player_behavioral_assessments enable row level security;

drop policy if exists player_behavioral_assessments_club_access on public.player_behavioral_assessments;
create policy player_behavioral_assessments_club_access
on public.player_behavioral_assessments
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop trigger if exists trg_player_behavioral_assessments_set_updated_at on public.player_behavioral_assessments;
create trigger trg_player_behavioral_assessments_set_updated_at
before update on public.player_behavioral_assessments
for each row
execute function public.set_updated_at();

create index if not exists player_behavioral_assessments_player_id_season_idx
  on public.player_behavioral_assessments(player_id, season);

create index if not exists player_behavioral_assessments_club_id_idx
  on public.player_behavioral_assessments(club_id);
