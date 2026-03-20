-- Permitir role 'club_coordinator' em staff_invites.
-- O constraint actual só aceita roles de staff técnico.

ALTER TABLE public.staff_invites
  DROP CONSTRAINT IF EXISTS staff_invites_role_check;

ALTER TABLE public.staff_invites
  ADD CONSTRAINT staff_invites_role_check
  CHECK (role IN (
    'club_coordinator',
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
