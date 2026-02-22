-- Mensagens da equipa técnica + notificações.
-- Segurança baseada em pertença à equipa/escalão.

create or replace function public.user_can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_staff ts
    where ts.team_id = p_team_id
      and ts.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.teams t
    join public.age_groups ag on ag.id = t.age_group_id
    where t.id = p_team_id
      and ag.coordinator_id = auth.uid()
  );
$$;

create or replace function public.user_can_access_age_group(p_age_group_id uuid)
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
  )
  or exists (
    select 1
    from public.teams t
    join public.team_staff ts on ts.team_id = t.id
    where t.age_group_id = p_age_group_id
      and ts.profile_id = auth.uid()
  );
$$;

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  age_group_id uuid not null references public.age_groups(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 1200),
  created_at timestamptz not null default now()
);

create index if not exists team_messages_team_created_idx
  on public.team_messages(team_id, created_at desc);

create index if not exists team_messages_age_group_created_idx
  on public.team_messages(age_group_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  age_group_id uuid not null references public.age_groups(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('new_game', 'new_training', 'message')),
  entity_id uuid,
  title text not null,
  body text,
  link_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read_at, created_at desc);

alter table public.team_messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists team_messages_staff_select_v1 on public.team_messages;
create policy team_messages_staff_select_v1
on public.team_messages
for select
using (
  public.user_can_access_team(team_id)
  and public.user_can_access_age_group(age_group_id)
);

drop policy if exists team_messages_staff_insert_v1 on public.team_messages;
create policy team_messages_staff_insert_v1
on public.team_messages
for insert
with check (
  sender_id = auth.uid()
  and public.user_can_access_team(team_id)
  and public.user_can_access_age_group(age_group_id)
);

drop policy if exists notifications_owner_select_v1 on public.notifications;
create policy notifications_owner_select_v1
on public.notifications
for select
using (
  user_id = auth.uid()
  and (team_id is null or public.user_can_access_team(team_id))
  and public.user_can_access_age_group(age_group_id)
);

drop policy if exists notifications_owner_update_v1 on public.notifications;
create policy notifications_owner_update_v1
on public.notifications
for update
using (
  user_id = auth.uid()
  and (team_id is null or public.user_can_access_team(team_id))
  and public.user_can_access_age_group(age_group_id)
)
with check (user_id = auth.uid());

do $$
begin
  begin
    alter publication supabase_realtime add table public.team_messages;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
  end;
end $$;
