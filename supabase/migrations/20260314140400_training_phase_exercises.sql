create table if not exists public.training_phase_exercises (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.training_phases(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  club_id uuid not null references public.clubs(id) on delete cascade,

  exercise_order integer not null default 0,

  custom_name text,
  custom_description text,
  custom_objectives text,
  custom_game_format text,
  custom_duration_minutes integer,
  custom_rest_minutes integer,
  custom_num_players integer,
  custom_field_dimensions text,
  custom_material text,
  custom_diagram_url text,

  planned_time_minutes integer,
  repetitions integer not null default 1,
  total_athletes integer,

  notes text,
  created_at timestamptz not null default now(),

  unique (phase_id, exercise_order)
);

create or replace function public.training_phase_exercises_assign_validate_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_club_id uuid;
  v_exercise_club_id uuid;
begin
  select tp.club_id
    into v_phase_club_id
  from public.training_phases tp
  where tp.id = new.phase_id;

  if v_phase_club_id is null then
    raise exception 'training_phase_exercises.phase_id invalido';
  end if;

  if new.exercise_id is not null then
    select e.club_id
      into v_exercise_club_id
    from public.exercises e
    where e.id = new.exercise_id;

    if v_exercise_club_id is null then
      raise exception 'training_phase_exercises.exercise_id invalido';
    end if;

    if v_exercise_club_id is distinct from v_phase_club_id then
      raise exception 'training_phase_exercises.exercise_id deve pertencer ao mesmo club da fase';
    end if;
  end if;

  new.club_id := v_phase_club_id;
  return new;
end;
$$;

drop trigger if exists trg_training_phase_exercises_assign_validate_club_id on public.training_phase_exercises;
create trigger trg_training_phase_exercises_assign_validate_club_id
before insert or update of phase_id, exercise_id, club_id
on public.training_phase_exercises
for each row
execute function public.training_phase_exercises_assign_validate_club_id();

alter table public.training_phase_exercises enable row level security;

drop policy if exists tpe_club_access on public.training_phase_exercises;
drop policy if exists training_phase_exercises_domain_boundary_v2 on public.training_phase_exercises;
create policy training_phase_exercises_domain_boundary_v2
on public.training_phase_exercises
as restrictive
for all
to authenticated
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

drop policy if exists training_phase_exercises_select_v1 on public.training_phase_exercises;
create policy training_phase_exercises_select_v1
on public.training_phase_exercises
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

drop policy if exists training_phase_exercises_insert_v1 on public.training_phase_exercises;
create policy training_phase_exercises_insert_v1
on public.training_phase_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

drop policy if exists training_phase_exercises_update_v1 on public.training_phase_exercises;
create policy training_phase_exercises_update_v1
on public.training_phase_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

drop policy if exists training_phase_exercises_delete_v1 on public.training_phase_exercises;
create policy training_phase_exercises_delete_v1
on public.training_phase_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

create index if not exists training_phase_exercises_phase_id_idx
  on public.training_phase_exercises(phase_id);

create index if not exists training_phase_exercises_exercise_id_idx
  on public.training_phase_exercises(exercise_id);

create index if not exists training_phase_exercises_club_id_idx
  on public.training_phase_exercises(club_id);
