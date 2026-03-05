create extension if not exists pgcrypto;

create table if not exists public.external_player_convocations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  jersey_number integer not null,
  position text not null,
  lineup_status text not null default 'substitute',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.external_player_convocations
  alter column club_id set default public.user_default_club_id();

do $$
begin
  alter table public.external_player_convocations
    drop constraint if exists external_player_convocations_lineup_status_check;
  alter table public.external_player_convocations
    add constraint external_player_convocations_lineup_status_check
      check (lineup_status in ('on_field', 'substitute'));

  alter table public.external_player_convocations
    drop constraint if exists external_player_convocations_name_check;
  alter table public.external_player_convocations
    add constraint external_player_convocations_name_check
      check (char_length(trim(name)) >= 2);

  alter table public.external_player_convocations
    drop constraint if exists external_player_convocations_jersey_number_check;
  alter table public.external_player_convocations
    add constraint external_player_convocations_jersey_number_check
      check (jersey_number >= 0 and jersey_number <= 99);

  alter table public.external_player_convocations
    drop constraint if exists external_player_convocations_position_check;
  alter table public.external_player_convocations
    add constraint external_player_convocations_position_check
      check (char_length(trim(position)) >= 1);
end $$;

create index if not exists external_player_convocations_club_id_idx
  on public.external_player_convocations(club_id);

create index if not exists external_player_convocations_game_id_idx
  on public.external_player_convocations(game_id, created_at);

drop trigger if exists trg_external_player_convocations_sync_club_id
  on public.external_player_convocations;

create trigger trg_external_player_convocations_sync_club_id
before insert or update on public.external_player_convocations
for each row
execute function public.sync_club_id_from_domain_refs();

alter table public.external_player_convocations enable row level security;

drop policy if exists external_player_convocations_club_boundary_v1
  on public.external_player_convocations;
create policy external_player_convocations_club_boundary_v1
on public.external_player_convocations
as restrictive
for all
to authenticated
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists external_player_convocations_read_v1
  on public.external_player_convocations;
create policy external_player_convocations_read_v1
on public.external_player_convocations
for select
to authenticated
using (public.user_can_access_game(game_id));

drop policy if exists external_player_convocations_write_insert_v1
  on public.external_player_convocations;
create policy external_player_convocations_write_insert_v1
on public.external_player_convocations
for insert
to authenticated
with check (public.user_can_write_game(game_id));

drop policy if exists external_player_convocations_write_update_v1
  on public.external_player_convocations;
create policy external_player_convocations_write_update_v1
on public.external_player_convocations
for update
to authenticated
using (public.user_can_write_game(game_id))
with check (public.user_can_write_game(game_id));

drop policy if exists external_player_convocations_write_delete_v1
  on public.external_player_convocations;
create policy external_player_convocations_write_delete_v1
on public.external_player_convocations
for delete
to authenticated
using (public.user_can_write_game(game_id));
