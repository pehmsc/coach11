create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Atualiza automaticamente a coluna updated_at para now().';

create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.team_staff(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,

  area text not null check (area in (
    'players',
    'trainings',
    'attendance',
    'games',
    'convocations',
    'live_events',
    'statistics',
    'exercises',
    'documents',
    'registrations'
  )),

  can_read boolean not null default true,
  can_write boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (staff_id, area)
);

create or replace function public.staff_permissions_assign_club_id()
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
  from public.team_staff ts
  where ts.id = new.staff_id;

  if v_club_id is null then
    raise exception 'staff_permissions.staff_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_staff_permissions_assign_club_id on public.staff_permissions;
create trigger trg_staff_permissions_assign_club_id
before insert or update of staff_id, club_id
on public.staff_permissions
for each row
execute function public.staff_permissions_assign_club_id();

alter table public.staff_permissions enable row level security;

drop policy if exists staff_permissions_club_access on public.staff_permissions;
create policy staff_permissions_club_access
on public.staff_permissions
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop trigger if exists trg_staff_permissions_set_updated_at on public.staff_permissions;
create trigger trg_staff_permissions_set_updated_at
before update on public.staff_permissions
for each row
execute function public.set_updated_at();

create index if not exists staff_permissions_staff_id_idx
  on public.staff_permissions(staff_id);

create index if not exists staff_permissions_staff_id_area_idx
  on public.staff_permissions(staff_id, area);

create index if not exists staff_permissions_club_id_idx
  on public.staff_permissions(club_id);

comment on table public.staff_permissions is
  'Permissoes granulares por area funcional. Configuradas pelo Coordenador do Clube. Treinador Principal tem RWED automatico em tudo (verificado no codigo, nao na tabela).';
