-- Expande os cargos de staff disponíveis.
-- Antes: apenas 'coach' e 'assistant_coach'.
-- Agora: lista completa de cargos técnicos.

-- 1. Remover constraints ANTES de migrar dados
alter table public.age_group_staff
  drop constraint if exists age_group_staff_role_check;
alter table public.age_group_staff
  drop constraint if exists team_staff_role_check;

-- Tentar remover constraint de staff_invites (pode ter nomes variados)
do $$
begin
  alter table public.staff_invites drop constraint if exists staff_invites_role_check;
exception when others then null;
end $$;

-- Descobrir e remover qualquer CHECK constraint em staff_invites.role
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'public.staff_invites'::regclass
      and con.contype = 'c'
      and att.attname = 'role'
  loop
    execute format('alter table public.staff_invites drop constraint if exists %I', cname);
  end loop;
end $$;

-- 2. Migrar dados existentes: 'coach' → 'head_coach'
update public.age_group_staff
  set role = 'head_coach'
  where role = 'coach';

update public.staff_invites
  set role = 'head_coach'
  where role = 'coach';

-- 3. Adicionar novas constraints
alter table public.age_group_staff
  add constraint age_group_staff_role_check
  check (role in (
    'head_coach',
    'assistant_coach',
    'intern_coach',
    'goalkeeper_coach',
    'fitness_coach',
    'physiotherapist',
    'doctor',
    'analyst',
    'team_manager'
  ));

alter table public.staff_invites
  add constraint staff_invites_role_check
  check (role in (
    'head_coach',
    'assistant_coach',
    'intern_coach',
    'goalkeeper_coach',
    'fitness_coach',
    'physiotherapist',
    'doctor',
    'analyst',
    'team_manager'
  ));
