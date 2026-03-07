-- Super coordinators keep unlimited technical staff for admin/testing.

create or replace function public.age_group_has_unlimited_technical_staff(
  p_age_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    join public.profiles p
      on p.id = ag.coordinator_id
    where ag.id = p_age_group_id
      and p.is_super_coordinator = true
  );
$$;

revoke all on function public.age_group_has_unlimited_technical_staff(uuid) from public;
revoke all on function public.age_group_has_unlimited_technical_staff(uuid) from anon;
revoke all on function public.age_group_has_unlimited_technical_staff(uuid) from authenticated;
grant execute on function public.age_group_has_unlimited_technical_staff(uuid) to service_role;

create or replace function public.assert_age_group_technical_staff_limit(
  p_age_group_id uuid,
  p_exclude_pending_invite_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer := 0;
  v_pending_count integer := 0;
begin
  if p_age_group_id is null then
    return;
  end if;

  if public.age_group_has_unlimited_technical_staff(p_age_group_id) then
    return;
  end if;

  select
    usage.active_technical_staff_count,
    usage.pending_technical_invite_count
  into
    v_active_count,
    v_pending_count
  from public.age_group_technical_staff_usage(
    p_age_group_id,
    p_exclude_pending_invite_id
  ) as usage;

  if coalesce(v_active_count, 0) + coalesce(v_pending_count, 0) + 1 > 1 then
    raise exception 'technical_staff_limit_reached'
      using
        errcode = 'P0001',
        detail = format(
          'age_group_id=%s active=%s pending=%s',
          p_age_group_id,
          coalesce(v_active_count, 0),
          coalesce(v_pending_count, 0)
        );
  end if;
end;
$$;

revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from public;
revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from anon;
revoke all on function public.assert_age_group_technical_staff_limit(uuid, uuid) from authenticated;
grant execute on function public.assert_age_group_technical_staff_limit(uuid, uuid) to service_role;
