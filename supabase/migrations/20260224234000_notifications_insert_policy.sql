-- Permite criação de notificações por utilizadores autenticados no mesmo contexto de clube/equipa/escalão.
-- Mantém boundary cross-club via policy restritiva já existente notifications_club_boundary_v1.

alter table public.notifications enable row level security;

drop policy if exists notifications_actor_insert_v1 on public.notifications;
create policy notifications_actor_insert_v1
on public.notifications
for insert
to authenticated
with check (
  (actor_id is null or actor_id = auth.uid())
  and public.user_can_access_club(club_id)
  and public.user_can_access_age_group(age_group_id)
  and (team_id is null or public.user_can_access_team(team_id))
  and exists (
    select 1
    from public.club_memberships cm
    where cm.club_id = notifications.club_id
      and cm.profile_id = notifications.user_id
  )
);
