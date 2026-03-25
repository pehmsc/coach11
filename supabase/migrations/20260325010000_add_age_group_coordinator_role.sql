-- Adiciona roles de coordenador ao constraint de age_group_staff.
-- Necessário para permitir inserção de 'age_group_coordinator' via
-- rpc_redeem_age_coordinator_invite e convites de coordenador de escalão.

ALTER TABLE public.age_group_staff
  DROP CONSTRAINT IF EXISTS age_group_staff_role_check;

ALTER TABLE public.age_group_staff
  ADD CONSTRAINT age_group_staff_role_check
  CHECK (role IN (
    'head_coach',
    'assistant_coach',
    'intern_coach',
    'goalkeeper_coach',
    'fitness_coach',
    'physiotherapist',
    'doctor',
    'analyst',
    'team_manager',
    'coordinator',
    'age_group_coordinator'
  ));
