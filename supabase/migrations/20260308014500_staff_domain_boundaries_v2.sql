-- Remove boundaries restritivas herdadas de club nas tabelas centrais de staff.
-- Mantém club_id apenas como coluna técnica de consistência / FK.

drop policy if exists age_group_staff_club_boundary_v1 on public.age_group_staff;
drop policy if exists age_group_staff_domain_boundary_v2 on public.age_group_staff;
create policy age_group_staff_domain_boundary_v2
on public.age_group_staff
as restrictive
for all
to authenticated
using (
  profile_id = auth.uid()
  or public.user_can_access_age_group(age_group_id)
)
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = age_group_staff.age_group_id
      and ag.club_id = age_group_staff.club_id
  )
);

drop policy if exists staff_invites_club_boundary_v1 on public.staff_invites;
drop policy if exists staff_invites_domain_boundary_v2 on public.staff_invites;
create policy staff_invites_domain_boundary_v2
on public.staff_invites
as restrictive
for all
to authenticated
using (
  public.user_can_access_age_group(age_group_id)
  or (
    email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = staff_invites.age_group_id
      and ag.club_id = staff_invites.club_id
  )
);
