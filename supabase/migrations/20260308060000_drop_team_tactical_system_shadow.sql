-- Remover a shadow compatível teams.tactical_system.
-- A fonte de verdade tática fica apenas em age_groups.tactical_system.

drop trigger if exists trg_teams_sync_tactical_system_shadow_from_age_group
  on public.teams;
drop trigger if exists trg_age_groups_sync_tactical_system_shadow_to_teams
  on public.age_groups;
drop trigger if exists trg_teams_sync_tactical_system_from_age_group
  on public.teams;
drop trigger if exists trg_age_groups_sync_tactical_system_to_teams
  on public.age_groups;

drop function if exists public.sync_team_tactical_system_shadow_from_age_group();
drop function if exists public.sync_age_group_tactical_system_shadow_to_teams();
drop function if exists public.sync_team_tactical_system_from_age_group();
drop function if exists public.sync_age_group_tactical_system_to_teams();

alter table public.teams
  drop column if exists tactical_system;

comment on table public.age_groups is
  'Raiz funcional do domínio. age_groups.tactical_system é a fonte de verdade do sistema tático base do escalão.';

comment on table public.teams is
  'Entidade filha de age_groups para contexto competitivo/calendário. Não tem configuração tática própria.';
