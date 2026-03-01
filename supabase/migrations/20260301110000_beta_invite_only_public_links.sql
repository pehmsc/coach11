create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists is_super_coordinator boolean not null default false;

alter table public.profiles
  add column if not exists email text;

update public.profiles
set email = lower(trim(email))
where email is not null
  and email <> lower(trim(email));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_lowercase_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_email_lowercase_chk
      check (email is null or email = lower(trim(email)));
  end if;
end $$;

create index if not exists profiles_email_lookup_idx
  on public.profiles(lower(email));

create unique index if not exists profiles_single_super_idx
  on public.profiles ((1))
  where is_super_coordinator = true;

create or replace function public.profiles_guard_super_coordinator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super_email constant text := 'pedrohmscampos@gmail.com';
begin
  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;

  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.is_super_coordinator := false;
    elsif tg_op = 'UPDATE' then
      new.is_super_coordinator := old.is_super_coordinator;
    end if;
  end if;

  if lower(coalesce(new.email, '')) <> v_super_email then
    new.is_super_coordinator := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_super_coordinator on public.profiles;
create trigger trg_profiles_guard_super_coordinator
before insert or update of email, is_super_coordinator
on public.profiles
for each row
execute function public.profiles_guard_super_coordinator();

update public.profiles
set is_super_coordinator = true
where lower(coalesce(email, '')) = 'pedrohmscampos@gmail.com';

update public.profiles
set is_super_coordinator = false
where lower(coalesce(email, '')) <> 'pedrohmscampos@gmail.com'
  and is_super_coordinator = true;

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invite_type text not null
    check (invite_type in ('staff', 'beta_coordinator')),
  target_age_group_id uuid null
    references public.age_groups(id) on delete cascade,
  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint beta_invites_email_lowercase_chk
    check (email = lower(trim(email))),
  constraint beta_invites_target_age_group_chk
    check (
      (invite_type = 'staff' and target_age_group_id is not null)
      or (invite_type = 'beta_coordinator' and target_age_group_id is null)
    ),
  constraint beta_invites_staff_metadata_role_chk
    check (
      invite_type <> 'staff'
      or metadata ? 'role'
    )
);

create unique index if not exists beta_invites_email_unique_idx
  on public.beta_invites(email);

create index if not exists beta_invites_invite_type_status_idx
  on public.beta_invites(invite_type, status);

create index if not exists beta_invites_target_age_group_idx
  on public.beta_invites(target_age_group_id);

alter table public.beta_invites enable row level security;
revoke all on table public.beta_invites from anon;
revoke all on table public.beta_invites from authenticated;

create table if not exists public.public_share_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  age_group_id uuid not null
    references public.age_groups(id) on delete cascade,
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  last_accessed_at timestamptz null,
  access_count integer not null default 0
    check (access_count >= 0),
  created_at timestamptz not null default now(),
  constraint public_share_tokens_token_hash_len_chk
    check (length(token_hash) = 64)
);

create unique index if not exists public_share_tokens_token_hash_unique_idx
  on public.public_share_tokens(token_hash);

create unique index if not exists public_share_tokens_active_age_group_unique_idx
  on public.public_share_tokens(age_group_id)
  where revoked_at is null;

create index if not exists public_share_tokens_token_hash_active_idx
  on public.public_share_tokens(token_hash)
  where revoked_at is null;

create index if not exists public_share_tokens_age_group_idx
  on public.public_share_tokens(age_group_id);

alter table public.public_share_tokens enable row level security;
revoke all on table public.public_share_tokens from anon;
revoke all on table public.public_share_tokens from authenticated;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null
    references public.profiles(id) on delete set null,
  action text not null,
  game_id uuid null
    references public.games(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_game_created_idx
  on public.audit_logs(game_id, created_at desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs(actor_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon;
revoke all on table public.audit_logs from authenticated;

create table if not exists public.public_rate_limit_counters (
  scope text not null
    check (scope in ('public_share_ip_minute', 'public_share_token_hour')),
  scope_key text not null,
  window_start timestamptz not null,
  count integer not null default 0
    check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, scope_key, window_start)
);

create index if not exists public_rate_limit_counters_window_idx
  on public.public_rate_limit_counters(window_start);

alter table public.public_rate_limit_counters enable row level security;
revoke all on table public.public_rate_limit_counters from anon;
revoke all on table public.public_rate_limit_counters from authenticated;

create or replace function public.consume_public_share_rate_limit(
  p_token_hash text,
  p_ip_hash text,
  p_ip_limit integer default 60,
  p_token_limit integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_ip_window timestamptz := date_trunc('minute', v_now);
  v_token_window timestamptz := date_trunc('hour', v_now);
  v_ip_count integer;
  v_token_count integer;
begin
  if coalesce(length(trim(p_token_hash)), 0) = 0 or coalesce(length(trim(p_ip_hash)), 0) = 0 then
    raise exception 'public_share_rate_limit_missing_key';
  end if;

  insert into public.public_rate_limit_counters as c (
    scope,
    scope_key,
    window_start,
    count,
    created_at,
    updated_at
  )
  values (
    'public_share_ip_minute',
    p_ip_hash,
    v_ip_window,
    1,
    v_now,
    v_now
  )
  on conflict (scope, scope_key, window_start)
  do update
    set count = c.count + 1,
        updated_at = excluded.updated_at
  returning count into v_ip_count;

  insert into public.public_rate_limit_counters as c (
    scope,
    scope_key,
    window_start,
    count,
    created_at,
    updated_at
  )
  values (
    'public_share_token_hour',
    p_token_hash,
    v_token_window,
    1,
    v_now,
    v_now
  )
  on conflict (scope, scope_key, window_start)
  do update
    set count = c.count + 1,
        updated_at = excluded.updated_at
  returning count into v_token_count;

  return jsonb_build_object(
    'ok', v_ip_count <= p_ip_limit and v_token_count <= p_token_limit,
    'ipCount', v_ip_count,
    'ipLimit', p_ip_limit,
    'tokenCount', v_token_count,
    'tokenLimit', p_token_limit
  );
end;
$$;

revoke all on function public.consume_public_share_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_public_share_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_public_share_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.consume_public_share_rate_limit(text, text, integer, integer) to service_role;
