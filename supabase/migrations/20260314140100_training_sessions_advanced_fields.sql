alter table public.training_sessions
  add column if not exists ut_number integer,
  add column if not exists microcycle_number integer,
  add column if not exists mesocycle_number integer,
  add column if not exists period_type text,
  add column if not exists initial_instruction text,
  add column if not exists objective text,
  add column if not exists complementary_objectives text,
  add column if not exists focus text,
  add column if not exists intensity text,
  add column if not exists material text,
  add column if not exists field_area text,
  add column if not exists week_start_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_period_type_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_period_type_check
      check (period_type in ('pre_season', 'competitive', 'transition'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_focus_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_focus_check
      check (focus in ('tactical', 'technical', 'physical', 'mixed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_intensity_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_intensity_check
      check (intensity in ('low', 'medium', 'high', 'very_high'));
  end if;
end;
$$;

update public.training_sessions
set week_start_date = date_trunc('week', session_date::timestamp)::date
where week_start_date is null
  and session_date is not null;

create index if not exists training_sessions_club_id_week_start_date_idx
  on public.training_sessions(club_id, week_start_date);

create index if not exists training_sessions_club_id_ut_number_idx
  on public.training_sessions(club_id, ut_number);
