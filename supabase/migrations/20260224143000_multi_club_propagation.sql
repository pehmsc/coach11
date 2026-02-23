-- Fase 2B: propagacao de club_id para tabelas sensiveis.
-- Objetivo: manter comportamento intra-clube e impedir cross-club.

create extension if not exists pgcrypto;

-- Garantir clube default para backfills de seguranca.
insert into public.clubs (name, slug)
values ('Default Club', 'default')
on conflict (slug) do update
  set name = excluded.name;

-- 1) Colunas club_id
alter table if exists public.players add column if not exists club_id uuid;
alter table if exists public.training_sessions add column if not exists club_id uuid;
alter table if exists public.games add column if not exists club_id uuid;
alter table if exists public.competitions add column if not exists club_id uuid;
alter table if exists public.team_staff add column if not exists club_id uuid;
alter table if exists public.staff_invites add column if not exists club_id uuid;
alter table if exists public.team_messages add column if not exists club_id uuid;
alter table if exists public.notifications add column if not exists club_id uuid;
alter table if exists public.kit_pieces add column if not exists club_id uuid;

-- 2) Backfill seguro
-- players -> age_groups
update public.players p
set club_id = ag.club_id
from public.age_groups ag
where p.age_group_id = ag.id
  and (p.club_id is null or p.club_id is distinct from ag.club_id);

-- training_sessions -> teams (preferido), fallback age_groups
update public.training_sessions ts
set club_id = t.club_id
from public.teams t
where ts.team_id = t.id
  and (ts.club_id is null or ts.club_id is distinct from t.club_id);

update public.training_sessions ts
set club_id = ag.club_id
from public.age_groups ag
where ts.club_id is null
  and ts.age_group_id = ag.id;

-- games -> teams (preferido), fallback age_groups
update public.games g
set club_id = t.club_id
from public.teams t
where g.team_id = t.id
  and (g.club_id is null or g.club_id is distinct from t.club_id);

update public.games g
set club_id = ag.club_id
from public.age_groups ag
where g.club_id is null
  and g.age_group_id = ag.id;

-- competitions -> teams
update public.competitions c
set club_id = t.club_id
from public.teams t
where c.team_id = t.id
  and (c.club_id is null or c.club_id is distinct from t.club_id);

-- team_staff -> teams
update public.team_staff ts
set club_id = t.club_id
from public.teams t
where ts.team_id = t.id
  and (ts.club_id is null or ts.club_id is distinct from t.club_id);

-- staff_invites -> age_groups
update public.staff_invites si
set club_id = ag.club_id
from public.age_groups ag
where si.age_group_id = ag.id
  and (si.club_id is null or si.club_id is distinct from ag.club_id);

-- team_messages -> teams (preferido), fallback age_groups
update public.team_messages tm
set club_id = t.club_id
from public.teams t
where tm.team_id = t.id
  and (tm.club_id is null or tm.club_id is distinct from t.club_id);

update public.team_messages tm
set club_id = ag.club_id
from public.age_groups ag
where tm.club_id is null
  and tm.age_group_id = ag.id;

-- notifications -> teams (preferido), fallback age_groups
update public.notifications n
set club_id = t.club_id
from public.teams t
where n.team_id = t.id
  and (n.club_id is null or n.club_id is distinct from t.club_id);

update public.notifications n
set club_id = ag.club_id
from public.age_groups ag
where n.club_id is null
  and n.age_group_id = ag.id;

-- kit_pieces -> teams
update public.kit_pieces kp
set club_id = t.club_id
from public.teams t
where kp.team_id = t.id
  and (kp.club_id is null or kp.club_id is distinct from t.club_id);

-- Fallback final para default club
update public.players
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.training_sessions
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.games
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.competitions
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.team_staff
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.staff_invites
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.team_messages
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.notifications
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

update public.kit_pieces
set club_id = (select id from public.clubs where slug = 'default' limit 1)
where club_id is null;

-- 3) FKs club_id -> clubs(id)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_club_id_fkey'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_club_id_fkey'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'games_club_id_fkey'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'competitions_club_id_fkey'
      and conrelid = 'public.competitions'::regclass
  ) then
    alter table public.competitions
      add constraint competitions_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'team_staff_club_id_fkey'
      and conrelid = 'public.team_staff'::regclass
  ) then
    alter table public.team_staff
      add constraint team_staff_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_invites_club_id_fkey'
      and conrelid = 'public.staff_invites'::regclass
  ) then
    alter table public.staff_invites
      add constraint staff_invites_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'team_messages_club_id_fkey'
      and conrelid = 'public.team_messages'::regclass
  ) then
    alter table public.team_messages
      add constraint team_messages_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_club_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'kit_pieces_club_id_fkey'
      and conrelid = 'public.kit_pieces'::regclass
  ) then
    alter table public.kit_pieces
      add constraint kit_pieces_club_id_fkey
      foreign key (club_id) references public.clubs(id) on delete cascade;
  end if;
end $$;

-- 4) Triggers de consistencia
create or replace function public.sync_club_id_from_age_group_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  if new.age_group_id is null then
    if new.club_id is null then
      new.club_id := public.user_default_club_id();
    end if;
    if new.club_id is null then
      select c.id into new.club_id from public.clubs c where c.slug = 'default' limit 1;
    end if;
    return new;
  end if;

  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'age_group_id invalido para sincronizacao de club_id';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

create or replace function public.sync_club_id_from_team_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  if new.team_id is null then
    if new.club_id is null then
      new.club_id := public.user_default_club_id();
    end if;
    if new.club_id is null then
      select c.id into new.club_id from public.clubs c where c.slug = 'default' limit 1;
    end if;
    return new;
  end if;

  select t.club_id
    into v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is null then
    raise exception 'team_id invalido para sincronizacao de club_id';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

create or replace function public.sync_club_id_from_team_or_age_group_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_club_id uuid;
  v_age_group_club_id uuid;
  v_resolved_club_id uuid;
begin
  if new.team_id is not null then
    select t.club_id
      into v_team_club_id
    from public.teams t
    where t.id = new.team_id;

    if v_team_club_id is null then
      raise exception 'team_id invalido para sincronizacao de club_id';
    end if;
  end if;

  if new.age_group_id is not null then
    select ag.club_id
      into v_age_group_club_id
    from public.age_groups ag
    where ag.id = new.age_group_id;

    if v_age_group_club_id is null then
      raise exception 'age_group_id invalido para sincronizacao de club_id';
    end if;
  end if;

  if v_team_club_id is not null and v_age_group_club_id is not null and v_team_club_id is distinct from v_age_group_club_id then
    raise exception 'team_id e age_group_id pertencem a clubes diferentes';
  end if;

  v_resolved_club_id := coalesce(v_team_club_id, v_age_group_club_id, new.club_id, public.user_default_club_id());

  if v_resolved_club_id is null then
    select c.id into v_resolved_club_id from public.clubs c where c.slug = 'default' limit 1;
  end if;

  new.club_id := v_resolved_club_id;
  return new;
end;
$$;

drop trigger if exists trg_players_sync_club_id on public.players;
create trigger trg_players_sync_club_id
before insert or update of age_group_id, club_id
on public.players
for each row
execute function public.sync_club_id_from_age_group_ref();

drop trigger if exists trg_staff_invites_sync_club_id on public.staff_invites;
create trigger trg_staff_invites_sync_club_id
before insert or update of age_group_id, club_id
on public.staff_invites
for each row
execute function public.sync_club_id_from_age_group_ref();

drop trigger if exists trg_competitions_sync_club_id on public.competitions;
create trigger trg_competitions_sync_club_id
before insert or update of team_id, club_id
on public.competitions
for each row
execute function public.sync_club_id_from_team_ref();

drop trigger if exists trg_team_staff_sync_club_id on public.team_staff;
create trigger trg_team_staff_sync_club_id
before insert or update of team_id, club_id
on public.team_staff
for each row
execute function public.sync_club_id_from_team_ref();

drop trigger if exists trg_kit_pieces_sync_club_id on public.kit_pieces;
create trigger trg_kit_pieces_sync_club_id
before insert or update of team_id, club_id
on public.kit_pieces
for each row
execute function public.sync_club_id_from_team_ref();

drop trigger if exists trg_training_sessions_sync_club_id on public.training_sessions;
create trigger trg_training_sessions_sync_club_id
before insert or update of team_id, age_group_id, club_id
on public.training_sessions
for each row
execute function public.sync_club_id_from_team_or_age_group_ref();

drop trigger if exists trg_games_sync_club_id on public.games;
create trigger trg_games_sync_club_id
before insert or update of team_id, age_group_id, club_id
on public.games
for each row
execute function public.sync_club_id_from_team_or_age_group_ref();

drop trigger if exists trg_team_messages_sync_club_id on public.team_messages;
create trigger trg_team_messages_sync_club_id
before insert or update of team_id, age_group_id, club_id
on public.team_messages
for each row
execute function public.sync_club_id_from_team_or_age_group_ref();

drop trigger if exists trg_notifications_sync_club_id on public.notifications;
create trigger trg_notifications_sync_club_id
before insert or update of team_id, age_group_id, club_id
on public.notifications
for each row
execute function public.sync_club_id_from_team_or_age_group_ref();

-- Re-alinhar apos triggers
update public.players p
set club_id = ag.club_id
from public.age_groups ag
where p.age_group_id = ag.id
  and p.club_id is distinct from ag.club_id;

update public.training_sessions ts
set club_id = t.club_id
from public.teams t
where ts.team_id = t.id
  and ts.club_id is distinct from t.club_id;

update public.games g
set club_id = t.club_id
from public.teams t
where g.team_id = t.id
  and g.club_id is distinct from t.club_id;

update public.competitions c
set club_id = t.club_id
from public.teams t
where c.team_id = t.id
  and c.club_id is distinct from t.club_id;

update public.team_staff ts
set club_id = t.club_id
from public.teams t
where ts.team_id = t.id
  and ts.club_id is distinct from t.club_id;

update public.staff_invites si
set club_id = ag.club_id
from public.age_groups ag
where si.age_group_id = ag.id
  and si.club_id is distinct from ag.club_id;

update public.team_messages tm
set club_id = t.club_id
from public.teams t
where tm.team_id = t.id
  and tm.club_id is distinct from t.club_id;

update public.notifications n
set club_id = t.club_id
from public.teams t
where n.team_id = t.id
  and n.club_id is distinct from t.club_id;

update public.notifications n
set club_id = ag.club_id
from public.age_groups ag
where n.team_id is null
  and n.age_group_id = ag.id
  and n.club_id is distinct from ag.club_id;

update public.kit_pieces kp
set club_id = t.club_id
from public.teams t
where kp.team_id = t.id
  and kp.club_id is distinct from t.club_id;

-- Defaults e NOT NULL (fase final)
alter table public.players alter column club_id set default public.user_default_club_id();
alter table public.training_sessions alter column club_id set default public.user_default_club_id();
alter table public.games alter column club_id set default public.user_default_club_id();
alter table public.competitions alter column club_id set default public.user_default_club_id();
alter table public.team_staff alter column club_id set default public.user_default_club_id();
alter table public.staff_invites alter column club_id set default public.user_default_club_id();
alter table public.team_messages alter column club_id set default public.user_default_club_id();
alter table public.notifications alter column club_id set default public.user_default_club_id();
alter table public.kit_pieces alter column club_id set default public.user_default_club_id();

alter table public.players alter column club_id set not null;
alter table public.training_sessions alter column club_id set not null;
alter table public.games alter column club_id set not null;
alter table public.competitions alter column club_id set not null;
alter table public.team_staff alter column club_id set not null;
alter table public.staff_invites alter column club_id set not null;
alter table public.team_messages alter column club_id set not null;
alter table public.notifications alter column club_id set not null;
alter table public.kit_pieces alter column club_id set not null;

-- 5) Indices
create index if not exists players_club_id_idx on public.players(club_id);
create index if not exists players_club_age_group_idx on public.players(club_id, age_group_id);

create index if not exists training_sessions_club_id_idx on public.training_sessions(club_id);
create index if not exists training_sessions_club_team_idx on public.training_sessions(club_id, team_id);

create index if not exists games_club_id_idx on public.games(club_id);
create index if not exists games_club_team_idx on public.games(club_id, team_id);

create index if not exists competitions_club_id_idx on public.competitions(club_id);
create index if not exists competitions_club_team_idx on public.competitions(club_id, team_id);

create index if not exists team_staff_club_id_idx on public.team_staff(club_id);
create index if not exists team_staff_club_profile_idx on public.team_staff(club_id, profile_id);

create index if not exists staff_invites_club_id_idx on public.staff_invites(club_id);
create index if not exists staff_invites_club_age_group_idx on public.staff_invites(club_id, age_group_id);

create index if not exists team_messages_club_id_idx on public.team_messages(club_id);
create index if not exists team_messages_club_team_created_idx on public.team_messages(club_id, team_id, created_at desc);

create index if not exists notifications_club_id_idx on public.notifications(club_id);
create index if not exists notifications_club_user_created_idx on public.notifications(club_id, user_id, created_at desc);

create index if not exists kit_pieces_club_id_idx on public.kit_pieces(club_id);
create index if not exists kit_pieces_club_team_idx on public.kit_pieces(club_id, team_id);

-- 6) RLS/policies
alter table public.players enable row level security;
alter table public.training_sessions enable row level security;
alter table public.games enable row level security;
alter table public.competitions enable row level security;
alter table public.team_staff enable row level security;
alter table public.staff_invites enable row level security;
alter table public.team_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.kit_pieces enable row level security;

-- Restrictive boundary by club_id (AND com policies existentes/permissivas)
drop policy if exists players_club_boundary_v1 on public.players;
create policy players_club_boundary_v1
on public.players
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists training_sessions_club_boundary_v1 on public.training_sessions;
create policy training_sessions_club_boundary_v1
on public.training_sessions
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists games_club_boundary_v1 on public.games;
create policy games_club_boundary_v1
on public.games
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists competitions_club_boundary_v1 on public.competitions;
create policy competitions_club_boundary_v1
on public.competitions
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists team_staff_club_boundary_v1 on public.team_staff;
create policy team_staff_club_boundary_v1
on public.team_staff
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists staff_invites_club_boundary_v1 on public.staff_invites;
create policy staff_invites_club_boundary_v1
on public.staff_invites
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists team_messages_club_boundary_v1 on public.team_messages;
create policy team_messages_club_boundary_v1
on public.team_messages
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists notifications_club_boundary_v1 on public.notifications;
create policy notifications_club_boundary_v1
on public.notifications
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists kit_pieces_club_boundary_v1 on public.kit_pieces;
create policy kit_pieces_club_boundary_v1
on public.kit_pieces
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

-- Competitions: manter acesso por equipa (modelo atual)
drop policy if exists competitions_staff_select_v1 on public.competitions;
create policy competitions_staff_select_v1
on public.competitions
for select
using (public.user_can_access_team(team_id));

drop policy if exists competitions_staff_insert_v1 on public.competitions;
create policy competitions_staff_insert_v1
on public.competitions
for insert
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = competitions.team_id
      and t.club_id = competitions.club_id
  )
);

drop policy if exists competitions_staff_update_v1 on public.competitions;
create policy competitions_staff_update_v1
on public.competitions
for update
using (public.user_can_access_team(team_id))
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = competitions.team_id
      and t.club_id = competitions.club_id
  )
);

drop policy if exists competitions_staff_delete_v1 on public.competitions;
create policy competitions_staff_delete_v1
on public.competitions
for delete
using (public.user_can_access_team(team_id));

-- Team staff
drop policy if exists team_staff_member_select_v1 on public.team_staff;
create policy team_staff_member_select_v1
on public.team_staff
for select
using (
  profile_id = auth.uid()
  or public.user_can_access_team(team_id)
);

drop policy if exists team_staff_coordinator_insert_v1 on public.team_staff;
create policy team_staff_coordinator_insert_v1
on public.team_staff
for insert
with check (
  public.user_is_team_coordinator(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = team_staff.team_id
      and t.club_id = team_staff.club_id
  )
);

drop policy if exists team_staff_coordinator_update_v1 on public.team_staff;
create policy team_staff_coordinator_update_v1
on public.team_staff
for update
using (public.user_is_team_coordinator(team_id))
with check (
  public.user_is_team_coordinator(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = team_staff.team_id
      and t.club_id = team_staff.club_id
  )
);

drop policy if exists team_staff_coordinator_delete_v1 on public.team_staff;
create policy team_staff_coordinator_delete_v1
on public.team_staff
for delete
using (public.user_is_team_coordinator(team_id));

-- Staff invites
create or replace function public.user_is_age_group_coordinator(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.id = p_age_group_id
      and ag.coordinator_id = auth.uid()
      and public.user_can_access_club(ag.club_id)
  );
$$;

drop policy if exists staff_invites_select_v1 on public.staff_invites;
create policy staff_invites_select_v1
on public.staff_invites
for select
using (
  public.user_can_access_age_group(age_group_id)
  or (
    email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists staff_invites_coordinator_insert_v1 on public.staff_invites;
create policy staff_invites_coordinator_insert_v1
on public.staff_invites
for insert
with check (
  public.user_is_age_group_coordinator(age_group_id)
  and (invited_by is null or invited_by = auth.uid())
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = staff_invites.age_group_id
      and ag.club_id = staff_invites.club_id
  )
);

drop policy if exists staff_invites_coordinator_update_v1 on public.staff_invites;
create policy staff_invites_coordinator_update_v1
on public.staff_invites
for update
using (public.user_is_age_group_coordinator(age_group_id))
with check (
  public.user_is_age_group_coordinator(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = staff_invites.age_group_id
      and ag.club_id = staff_invites.club_id
  )
);

drop policy if exists staff_invites_coordinator_delete_v1 on public.staff_invites;
create policy staff_invites_coordinator_delete_v1
on public.staff_invites
for delete
using (public.user_is_age_group_coordinator(age_group_id));

-- Kit pieces
drop policy if exists kit_pieces_staff_select_v1 on public.kit_pieces;
create policy kit_pieces_staff_select_v1
on public.kit_pieces
for select
using (public.user_can_access_team(team_id));

drop policy if exists kit_pieces_staff_insert_v1 on public.kit_pieces;
create policy kit_pieces_staff_insert_v1
on public.kit_pieces
for insert
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = kit_pieces.team_id
      and t.club_id = kit_pieces.club_id
  )
);

drop policy if exists kit_pieces_staff_update_v1 on public.kit_pieces;
create policy kit_pieces_staff_update_v1
on public.kit_pieces
for update
using (public.user_can_access_team(team_id))
with check (
  public.user_can_access_team(team_id)
  and exists (
    select 1
    from public.teams t
    where t.id = kit_pieces.team_id
      and t.club_id = kit_pieces.club_id
  )
);

drop policy if exists kit_pieces_staff_delete_v1 on public.kit_pieces;
create policy kit_pieces_staff_delete_v1
on public.kit_pieces
for delete
using (public.user_can_access_team(team_id));
