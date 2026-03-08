-- Mover o sistema tático base para age_groups e manter teams como shadow
-- compatível para contexto competitivo/calendário.

alter table public.age_groups
  add column if not exists tactical_system text;

comment on column public.age_groups.tactical_system is
  'Fonte de verdade do sistema tático base do escalão.';

comment on column public.teams.tactical_system is
  'Shadow compatível derivado de age_groups.tactical_system. Não é fonte de verdade funcional.';

do $$
declare
  v_conflict record;
begin
  for v_conflict in
    select
      normalized.age_group_id,
      array_agg(distinct normalized.tactical_system order by normalized.tactical_system) as tactical_systems
    from (
      select
        t.age_group_id,
        nullif(btrim(t.tactical_system), '') as tactical_system
      from public.teams t
      where t.age_group_id is not null
    ) normalized
    where normalized.tactical_system is not null
    group by normalized.age_group_id
    having count(distinct normalized.tactical_system) > 1
  loop
    raise notice
      'age_group % tem múltiplos tactical_system nas teams: %; será usado o primeiro registo criado com valor.',
      v_conflict.age_group_id,
      v_conflict.tactical_systems;
  end loop;
end;
$$;

with preferred_team_tactical as (
  select distinct on (t.age_group_id)
    t.age_group_id,
    nullif(btrim(t.tactical_system), '') as tactical_system
  from public.teams t
  where t.age_group_id is not null
    and nullif(btrim(t.tactical_system), '') is not null
  order by t.age_group_id, t.created_at asc nulls last, t.id asc
)
update public.age_groups ag
set tactical_system = preferred_team_tactical.tactical_system
from preferred_team_tactical
where ag.id = preferred_team_tactical.age_group_id
  and ag.tactical_system is null;

create or replace function public.sync_team_tactical_system_from_age_group()
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

comment on function public.sync_team_tactical_system_from_age_group() is
  'Mantém teams.tactical_system como shadow compatível do age_groups.tactical_system.';

drop trigger if exists trg_teams_sync_tactical_system_from_age_group
  on public.teams;
create trigger trg_teams_sync_tactical_system_from_age_group
before insert or update of age_group_id, tactical_system
on public.teams
for each row
execute function public.sync_team_tactical_system_from_age_group();

create or replace function public.sync_age_group_tactical_system_to_teams()
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

comment on function public.sync_age_group_tactical_system_to_teams() is
  'Propaga o sistema tático base do escalão para a shadow compatível em teams.';

drop trigger if exists trg_age_groups_sync_tactical_system_to_teams
  on public.age_groups;
create trigger trg_age_groups_sync_tactical_system_to_teams
after insert or update of tactical_system
on public.age_groups
for each row
execute function public.sync_age_group_tactical_system_to_teams();

update public.teams t
set tactical_system = ag.tactical_system
from public.age_groups ag
where ag.id = t.age_group_id
  and t.tactical_system is distinct from ag.tactical_system;
