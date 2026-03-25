-- Expande o constraint de role em team_staff para incluir todos os cargos
-- técnicos actuais. O constraint original era ('coach', 'assistant_coach').
-- team_staff é tabela legada mantida para compatibilidade; age_group_staff
-- é a fonte de verdade funcional.

ALTER TABLE public.team_staff
  DROP CONSTRAINT IF EXISTS team_staff_role_check;

ALTER TABLE public.team_staff
  ADD CONSTRAINT team_staff_role_check
  CHECK (role IN (
    'coach',
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
