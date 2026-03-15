create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid not null references auth.users(id),

  name text not null,
  description text,
  objectives text,
  success_criteria text,

  category text not null check (category in (
    'warmup',
    'technical',
    'tactical',
    'formal_game',
    'finishing',
    'defensive_org',
    'offensive_org',
    'transition',
    'physical',
    'set_pieces',
    'strategy',
    'cooldown',
    'other'
  )),
  subcategory text,

  game_format text,
  duration_minutes integer,
  rest_minutes integer not null default 0,
  min_players integer,
  max_players integer,
  field_dimensions text,
  material text,

  diagram_url text,

  is_shared boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

drop policy if exists exercises_club_access on public.exercises;
create policy exercises_club_access
on public.exercises
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop trigger if exists trg_exercises_set_updated_at on public.exercises;
create trigger trg_exercises_set_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

create index if not exists exercises_club_id_idx
  on public.exercises(club_id);

create index if not exists exercises_club_id_category_idx
  on public.exercises(club_id, category);
