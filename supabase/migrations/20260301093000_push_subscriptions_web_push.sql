create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_active_seen_idx
  on public.push_subscriptions(user_id, last_seen_at desc)
  where revoked_at is null;

create index if not exists push_subscriptions_active_endpoint_idx
  on public.push_subscriptions(endpoint)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_select_v1 on public.push_subscriptions;
create policy push_subscriptions_owner_select_v1
on public.push_subscriptions
for select
using (user_id = auth.uid());

drop policy if exists push_subscriptions_owner_insert_v1 on public.push_subscriptions;
create policy push_subscriptions_owner_insert_v1
on public.push_subscriptions
for insert
with check (user_id = auth.uid());

drop policy if exists push_subscriptions_owner_update_v1 on public.push_subscriptions;
create policy push_subscriptions_owner_update_v1
on public.push_subscriptions
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists push_subscriptions_owner_delete_v1 on public.push_subscriptions;
create policy push_subscriptions_owner_delete_v1
on public.push_subscriptions
for delete
using (user_id = auth.uid());
