-- Fronteira de DB (hard backstop) para o limite de escaloes do plano individual.
--
-- O helper POST /api/age-groups ja aplica o limite (getPlanEntitlements), mas e
-- contornavel por insert directo (PostgREST/SQL cru). Este trigger garante a
-- regra mesmo nesse caminho: e a fronteira incontornavel onde ha faturacao a
-- mistura.
--
-- Duplicacao assumida: a regra vive em DOIS sitios — TypeScript
-- (src/lib/billing/plan-entitlements.ts, fonte CANONICA) e aqui em SQL. Mantem-se
-- o SQL MINIMO (individual -> 1 escalao). Tiers futuros / add-ons sobem o limite
-- na fonte canonica; se algum dia precisarem de backstop em DB, alterar aqui.
--
-- Ordem dos triggers BEFORE INSERT (execucao alfabetica por nome):
--   trg_age_groups_assign_club_id   -> popula NEW.club_id quando nulo
--   trg_age_groups_enforce_plan_limit -> corre DEPOIS, ja com club_id resolvido
-- 'enforce' > 'assign' alfabeticamente, pelo que NEW.club_id esta sempre definido.

create or replace function public.age_groups_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_type text;
  v_existing_count integer;
begin
  -- Plano do clube do novo escalao (NEW.club_id ja resolvido pelo assign trigger).
  select c.plan_type into v_plan_type
  from public.clubs c
  where c.id = new.club_id;

  -- So o plano 'individual' tem limite. 'club', NULL e tiers futuros nao limitam
  -- (mesmo default conservador de getPlanEntitlements).
  if v_plan_type = 'individual' then
    select count(*) into v_existing_count
    from public.age_groups ag
    where ag.club_id = new.club_id;

    -- count 0 (primeiro escalao) e sempre permitido — nao parte onboarding.
    if v_existing_count >= 1 then
      raise exception
        'O teu plano inclui 1 equipa. Equipa adicional como add-on em breve.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_age_groups_enforce_plan_limit on public.age_groups;

create trigger trg_age_groups_enforce_plan_limit
  before insert on public.age_groups
  for each row
  execute function public.age_groups_enforce_plan_limit();
