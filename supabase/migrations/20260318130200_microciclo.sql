-- Microciclo: weekly training plan
create table if not exists public.microciclos (
  id uuid primary key default gen_random_uuid(),
  age_group_id uuid not null references public.age_groups(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  week_start_date date not null,
  week_number int,
  objective text,
  intensity text check (intensity in ('low', 'medium', 'high', 'recovery')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (age_group_id, week_start_date)
);

create or replace function public.microciclos_assign_club_id()
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
    raise exception 'microciclos.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_microciclos_assign_club_id on public.microciclos;
create trigger trg_microciclos_assign_club_id
before insert or update of age_group_id, club_id
on public.microciclos
for each row
execute function public.microciclos_assign_club_id();

alter table public.microciclos enable row level security;

drop policy if exists microciclos_domain_boundary_v1 on public.microciclos;
create policy microciclos_domain_boundary_v1
on public.microciclos
as restrictive
for all
to authenticated
using (public.user_can_read_club_scope(club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists microciclos_select_v1 on public.microciclos;
create policy microciclos_select_v1
on public.microciclos
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

drop policy if exists microciclos_insert_v1 on public.microciclos;
create policy microciclos_insert_v1
on public.microciclos
for insert
to authenticated
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists microciclos_update_v1 on public.microciclos;
create policy microciclos_update_v1
on public.microciclos
for update
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

drop policy if exists microciclos_delete_v1 on public.microciclos;
create policy microciclos_delete_v1
on public.microciclos
for delete
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id));

drop trigger if exists trg_microciclos_set_updated_at on public.microciclos;
create trigger trg_microciclos_set_updated_at
before update on public.microciclos
for each row
execute function public.set_updated_at();

create index if not exists microciclos_age_group_week_idx
  on public.microciclos(age_group_id, week_start_date);
