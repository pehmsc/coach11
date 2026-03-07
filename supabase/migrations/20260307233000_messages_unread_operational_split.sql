-- Separate team message unread state from operational notifications.

create table if not exists public.team_message_reads (
  team_id uuid not null
    references public.teams(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_message_reads_user_team_idx
  on public.team_message_reads(user_id, team_id);

create index if not exists team_message_reads_team_updated_idx
  on public.team_message_reads(team_id, updated_at desc);

with team_members as (
  select distinct
    t.id as team_id,
    ag.coordinator_id as user_id
  from public.teams t
  join public.age_groups ag
    on ag.id = t.age_group_id
  where ag.coordinator_id is not null

  union

  select distinct
    ts.team_id,
    ts.profile_id as user_id
  from public.team_staff ts
  where ts.profile_id is not null
),
message_notification_state as (
  select
    n.team_id,
    nr.user_id,
    max(case when nr.read_at is not null then n.created_at end) as max_read_message_at,
    min(
      case
        when nr.read_at is null and nr.cleared_at is null then n.created_at
        else null
      end
    ) as first_unread_message_at,
    max(n.created_at) as latest_message_notification_at
  from public.notifications n
  join public.notification_recipients nr
    on nr.notification_id = n.id
  where n.type = 'message'
    and n.team_id is not null
  group by n.team_id, nr.user_id
),
latest_team_message as (
  select
    tm.team_id,
    max(tm.created_at) as latest_message_at
  from public.team_messages tm
  group by tm.team_id
)
insert into public.team_message_reads (
  team_id,
  user_id,
  last_read_at,
  created_at,
  updated_at
)
select
  tm.team_id,
  tm.user_id,
  coalesce(
    mns.max_read_message_at,
    case
      when mns.first_unread_message_at is not null
        then mns.first_unread_message_at - interval '1 microsecond'
      else null
    end,
    mns.latest_message_notification_at,
    ltm.latest_message_at,
    now()
  ) as last_read_at,
  now(),
  now()
from team_members tm
left join message_notification_state mns
  on mns.team_id = tm.team_id
 and mns.user_id = tm.user_id
left join latest_team_message ltm
  on ltm.team_id = tm.team_id
where tm.user_id is not null
on conflict (team_id, user_id) do nothing;

alter table public.team_message_reads enable row level security;

drop policy if exists team_message_reads_owner_select_v1 on public.team_message_reads;
create policy team_message_reads_owner_select_v1
on public.team_message_reads
for select
using (
  user_id = auth.uid()
  and public.user_can_access_team(team_id)
);

drop policy if exists team_message_reads_owner_insert_v1 on public.team_message_reads;
create policy team_message_reads_owner_insert_v1
on public.team_message_reads
for insert
with check (
  user_id = auth.uid()
  and public.user_can_access_team(team_id)
);

drop policy if exists team_message_reads_owner_update_v1 on public.team_message_reads;
create policy team_message_reads_owner_update_v1
on public.team_message_reads
for update
using (
  user_id = auth.uid()
  and public.user_can_access_team(team_id)
)
with check (
  user_id = auth.uid()
  and public.user_can_access_team(team_id)
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.team_message_reads;
  exception
    when duplicate_object then null;
  end;
end $$;

update public.notification_recipients nr
set
  read_at = coalesce(nr.read_at, now()),
  cleared_at = coalesce(nr.cleared_at, now())
from public.notifications n
where n.id = nr.notification_id
  and n.type = 'message'
  and nr.cleared_at is null;
