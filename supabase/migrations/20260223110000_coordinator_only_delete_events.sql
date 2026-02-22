-- Deletes de jogos/treinos apenas para coordenador.
-- Mantém criação/edição para restante equipa técnica conforme policies existentes.

create or replace function public.user_is_team_coordinator(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.age_groups ag on ag.id = t.age_group_id
    where t.id = p_team_id
      and ag.coordinator_id = auth.uid()
  );
$$;

drop policy if exists training_sessions_staff_delete_v1 on public.training_sessions;
create policy training_sessions_staff_delete_v1
on public.training_sessions
for delete
using (
  team_id is not null
  and public.user_is_team_coordinator(team_id)
);

drop policy if exists games_staff_delete_v1 on public.games;
create policy games_staff_delete_v1
on public.games
for delete
using (
  team_id is not null
  and public.user_is_team_coordinator(team_id)
);

