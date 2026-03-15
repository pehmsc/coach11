create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  age_group_id uuid not null references public.age_groups(id) on delete cascade,
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

create or replace function public.exercises_assign_club_id()
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
    raise exception 'exercises.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_exercises_assign_club_id on public.exercises;
create trigger trg_exercises_assign_club_id
before insert or update of age_group_id, club_id
on public.exercises
for each row
execute function public.exercises_assign_club_id();

alter table public.exercises enable row level security;

drop policy if exists exercises_club_access on public.exercises;
drop policy if exists exercises_domain_boundary_v2 on public.exercises;
create policy exercises_domain_boundary_v2
on public.exercises
as restrictive
for all
to authenticated
using (public.user_can_read_club_scope(club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists exercises_select_v1 on public.exercises;
create policy exercises_select_v1
on public.exercises
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

drop policy if exists exercises_insert_v1 on public.exercises;
create policy exercises_insert_v1
on public.exercises
for insert
to authenticated
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists exercises_update_v1 on public.exercises;
create policy exercises_update_v1
on public.exercises
for update
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists exercises_delete_v1 on public.exercises;
create policy exercises_delete_v1
on public.exercises
for delete
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id));

drop trigger if exists trg_exercises_set_updated_at on public.exercises;
create trigger trg_exercises_set_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

create index if not exists exercises_club_id_idx
  on public.exercises(club_id);

create index if not exists exercises_age_group_id_idx
  on public.exercises(age_group_id);

create index if not exists exercises_club_id_category_idx
  on public.exercises(club_id, category);
