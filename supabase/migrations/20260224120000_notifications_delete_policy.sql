-- Permite ao próprio utilizador limpar notificações (row delete).

alter table public.notifications enable row level security;

drop policy if exists notifications_owner_delete_v1 on public.notifications;
create policy notifications_owner_delete_v1
on public.notifications
for delete
using (
  user_id = auth.uid()
  and (team_id is null or public.user_can_access_team(team_id))
  and public.user_can_access_age_group(age_group_id)
);
