-- Endurecer a semântica SQL do sistema tático.
-- age_groups.tactical_system é a fonte de verdade.
-- teams.tactical_system mantém-se apenas como shadow compatível temporária.

comment on table public.age_groups is
  'Raiz funcional do domínio. age_groups.tactical_system é a fonte de verdade do sistema tático base do escalão.';

comment on table public.teams is
  'Entidade filha de age_groups para contexto competitivo/calendário. teams.tactical_system é shadow compatível temporária e não deve ser usada como fonte funcional.';

comment on column public.age_groups.tactical_system is
  'Fonte funcional de verdade do sistema tático base do escalão. Novas funcionalidades devem ler/escrever aqui.';

comment on column public.teams.tactical_system is
  'SHADOW COMPATÍVEL TEMPORÁRIA. Derivada de age_groups.tactical_system; não usar como fonte funcional em runtime, queries novas ou policies novas. Candidata a remoção após limpeza final do legado.';

create or replace function public.sync_team_tactical_system_shadow_from_age_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tactical_system text;
begin
  if new.age_group_id is null then
    new.tactical_system := null;
    return new;
  end if;

  select ag.tactical_system
  into v_tactical_system
  from public.age_groups ag
  where ag.id = new.age_group_id;

  new.tactical_system := v_tactical_system;
  return new;
end;
$$;

comment on function public.sync_team_tactical_system_shadow_from_age_group() is
  'Mantém teams.tactical_system como shadow compatível temporária derivada de age_groups.tactical_system.';

create or replace function public.sync_age_group_tactical_system_shadow_to_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teams
  set tactical_system = new.tactical_system
  where age_group_id = new.id
    and tactical_system is distinct from new.tactical_system;

  return new;
end;
$$;

comment on function public.sync_age_group_tactical_system_shadow_to_teams() is
  'Propaga age_groups.tactical_system para a shadow compatível teams.tactical_system.';

drop trigger if exists trg_teams_sync_tactical_system_from_age_group
  on public.teams;
drop trigger if exists trg_teams_sync_tactical_system_shadow_from_age_group
  on public.teams;
create trigger trg_teams_sync_tactical_system_shadow_from_age_group
before insert or update of age_group_id, tactical_system
on public.teams
for each row
execute function public.sync_team_tactical_system_shadow_from_age_group();

comment on trigger trg_teams_sync_tactical_system_shadow_from_age_group on public.teams is
  'Shadow compatível: força teams.tactical_system a seguir age_groups.tactical_system.';

drop trigger if exists trg_age_groups_sync_tactical_system_to_teams
  on public.age_groups;
drop trigger if exists trg_age_groups_sync_tactical_system_shadow_to_teams
  on public.age_groups;
create trigger trg_age_groups_sync_tactical_system_shadow_to_teams
after insert or update of tactical_system
on public.age_groups
for each row
execute function public.sync_age_group_tactical_system_shadow_to_teams();

comment on trigger trg_age_groups_sync_tactical_system_shadow_to_teams on public.age_groups is
  'Shadow compatível: propaga o sistema tático do escalão para teams.';

drop function if exists public.sync_team_tactical_system_from_age_group();
drop function if exists public.sync_age_group_tactical_system_to_teams();
