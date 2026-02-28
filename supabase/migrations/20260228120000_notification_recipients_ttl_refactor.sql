-- Refatoracao do sistema de notificacoes:
-- 1) notifications passa a ser a entidade base/broadcast
-- 2) notification_recipients guarda estado por utilizador
-- 3) device_push_tokens prepara push por dispositivo
-- 4) retention/prune usa hard delete por TTL no registo base

alter table if exists public.notifications
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table if exists public.notifications
  alter column user_id drop not null;

alter table if exists public.notifications
  drop constraint if exists notifications_type_check;

create table if not exists public.notification_recipients (
  notification_id uuid not null,
  user_id uuid not null,
  read_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (notification_id, user_id),
  constraint notification_recipients_notification_id_fkey
    foreign key (notification_id) references public.notifications(id) on delete cascade,
  constraint notification_recipients_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_desc_idx
  on public.notifications(created_at desc);

create index if not exists notifications_type_created_at_desc_idx
  on public.notifications(type, created_at desc);

create index if not exists notification_recipients_user_created_active_idx
  on public.notification_recipients(user_id, created_at desc)
  where cleared_at is null;

create index if not exists notification_recipients_user_unread_active_idx
  on public.notification_recipients(user_id, created_at desc)
  where cleared_at is null and read_at is null;

create index if not exists notification_recipients_notification_id_idx
  on public.notification_recipients(notification_id);

create index if not exists device_push_tokens_user_active_seen_idx
  on public.device_push_tokens(user_id, last_seen_at desc)
  where revoked_at is null;

create unique index if not exists device_push_tokens_token_active_idx
  on public.device_push_tokens(token)
  where revoked_at is null;

update public.notifications
set payload = jsonb_strip_nulls(
  coalesce(payload, '{}'::jsonb)
  || jsonb_build_object('type', type, 'title', title)
  || case when body is not null then jsonb_build_object('body', body) else '{}'::jsonb end
  || case when link_path is not null then jsonb_build_object('link_path', link_path) else '{}'::jsonb end
  || case when entity_id is not null then jsonb_build_object('entity_id', entity_id::text) else '{}'::jsonb end
)
where payload is null
   or payload = '{}'::jsonb;

insert into public.notification_recipients (
  notification_id,
  user_id,
  read_at,
  cleared_at,
  created_at
)
select
  n.id,
  n.user_id,
  n.read_at,
  null,
  n.created_at
from public.notifications n
join auth.users u on u.id = n.user_id
where n.user_id is not null
on conflict (notification_id, user_id)
do update set
  read_at = excluded.read_at,
  created_at = excluded.created_at;

create or replace function public.user_can_access_notification_context(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and public.user_can_access_club(n.club_id)
      and public.user_can_access_age_group(n.age_group_id)
      and (n.team_id is null or public.user_can_access_team(n.team_id))
  );
$$;

create or replace function public.prune_notifications_before(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with deleted_rows as (
    delete from public.notifications
    where created_at < p_cutoff
    returning 1
  )
  select count(*) into v_deleted
  from deleted_rows;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.prune_notifications_before(timestamptz)
from public, anon, authenticated;

grant execute on function public.prune_notifications_before(timestamptz)
to service_role;

create or replace view public.notification_inbox as
select
  nr.notification_id as id,
  nr.user_id,
  nr.read_at,
  nr.cleared_at,
  nr.created_at as recipient_created_at,
  n.created_at,
  n.club_id,
  n.team_id,
  n.age_group_id,
  n.actor_id,
  n.type,
  n.entity_id,
  n.payload,
  coalesce(nullif(n.payload->>'title', ''), n.title) as title,
  coalesce(n.payload->>'body', n.body) as body,
  coalesce(n.payload->>'link_path', n.link_path) as link_path
from public.notification_recipients nr
join public.notifications n on n.id = nr.notification_id;

alter table public.notification_recipients enable row level security;
alter table public.device_push_tokens enable row level security;

drop policy if exists notification_recipients_owner_select_v1 on public.notification_recipients;
create policy notification_recipients_owner_select_v1
on public.notification_recipients
for select
using (
  user_id = auth.uid()
  and public.user_can_access_notification_context(notification_id)
);

drop policy if exists notification_recipients_owner_update_v1 on public.notification_recipients;
create policy notification_recipients_owner_update_v1
on public.notification_recipients
for update
using (
  user_id = auth.uid()
  and public.user_can_access_notification_context(notification_id)
)
with check (
  user_id = auth.uid()
  and public.user_can_access_notification_context(notification_id)
);

drop policy if exists device_push_tokens_owner_select_v1 on public.device_push_tokens;
create policy device_push_tokens_owner_select_v1
on public.device_push_tokens
for select
using (user_id = auth.uid());

drop policy if exists device_push_tokens_owner_insert_v1 on public.device_push_tokens;
create policy device_push_tokens_owner_insert_v1
on public.device_push_tokens
for insert
with check (user_id = auth.uid());

drop policy if exists device_push_tokens_owner_update_v1 on public.device_push_tokens;
create policy device_push_tokens_owner_update_v1
on public.device_push_tokens
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists device_push_tokens_owner_delete_v1 on public.device_push_tokens;
create policy device_push_tokens_owner_delete_v1
on public.device_push_tokens
for delete
using (user_id = auth.uid());

do $$
begin
  begin
    alter publication supabase_realtime add table public.notification_recipients;
  exception
    when duplicate_object then null;
  end;
end $$;
