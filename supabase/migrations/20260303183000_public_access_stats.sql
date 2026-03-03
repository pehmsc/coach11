alter table public.age_groups
  add column if not exists public_access_count integer not null default 0
    check (public_access_count >= 0),
  add column if not exists public_last_accessed_at timestamptz null;

comment on column public.age_groups.public_access_count is
  'Número total de acessos registados para o link público fixo do escalão.';

comment on column public.age_groups.public_last_accessed_at is
  'Momento do último acesso ao link público fixo do escalão.';

create or replace function public.register_public_age_group_access(
  p_age_group_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.age_groups
  set public_access_count = coalesce(public_access_count, 0) + 1,
      public_last_accessed_at = now()
  where id = p_age_group_id
    and public_slug is not null;
$$;

revoke all on function public.register_public_age_group_access(uuid) from public;
grant execute on function public.register_public_age_group_access(uuid) to service_role;
