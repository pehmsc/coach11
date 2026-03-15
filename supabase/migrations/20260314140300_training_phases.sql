create table if not exists public.training_phases (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,

  phase_type text not null check (phase_type in ('initial', 'main', 'final', 'custom')),
  phase_name text,
  phase_order integer not null default 0,
  duration_minutes integer,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (training_session_id, phase_order)
);

create or replace function public.training_phases_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select ts.club_id
    into v_club_id
  from public.training_sessions ts
  where ts.id = new.training_session_id;

  if v_club_id is null then
    raise exception 'training_phases.training_session_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_training_phases_assign_club_id on public.training_phases;
create trigger trg_training_phases_assign_club_id
before insert or update of training_session_id, club_id
on public.training_phases
for each row
execute function public.training_phases_assign_club_id();

alter table public.training_phases enable row level security;

drop policy if exists training_phases_club_access on public.training_phases;
create policy training_phases_club_access
on public.training_phases
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop trigger if exists trg_training_phases_set_updated_at on public.training_phases;
create trigger trg_training_phases_set_updated_at
before update on public.training_phases
for each row
execute function public.set_updated_at();

create index if not exists training_phases_training_session_id_idx
  on public.training_phases(training_session_id);

create index if not exists training_phases_club_id_idx
  on public.training_phases(club_id);
