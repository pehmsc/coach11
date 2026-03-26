-- Normaliza os valores de role em club_memberships, age_group_staff e team_staff:
--   'coordinator' → 'club_coordinator' em club_memberships
--   'coordinator' → 'age_group_coordinator' em age_group_staff
--   'coordinator' → 'age_group_coordinator' em team_staff
--
-- Recria repair_club_membership_state para inserir 'club_coordinator' (era 'coordinator').
-- Remove 'coordinator' e 'club_admin' dos CHECK constraints de club_memberships.
-- Remove 'coordinator' do CHECK constraint de age_group_staff.
-- Remove 'coordinator' e 'coach' do CHECK constraint de team_staff.

-- ─── 1. Normalizar dados existentes ────────────────────────────────────────

UPDATE public.club_memberships
  SET role = 'club_coordinator'
  WHERE role = 'coordinator';

UPDATE public.age_group_staff
  SET role = 'age_group_coordinator'
  WHERE role = 'coordinator';

-- team_staff: 'coordinator' → 'age_group_coordinator'; 'coach' → 'head_coach'
UPDATE public.team_staff
  SET role = 'age_group_coordinator'
  WHERE role = 'coordinator';

UPDATE public.team_staff
  SET role = 'head_coach'
  WHERE role = 'coach';

-- ─── 2. Recriar repair_club_membership_state com 'club_coordinator' ────────
-- (era 'coordinator'; usado pelos triggers age_groups_sync_coordinator_membership
--  e age_group_staff_sync_club_membership definidos em 20260307203000)

CREATE OR REPLACE FUNCTION public.repair_club_membership_state(
  p_club_id uuid,
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_coordinator boolean := false;
  v_is_staff boolean := false;
BEGIN
  IF p_club_id IS NULL OR p_profile_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.age_groups ag
    WHERE ag.club_id = p_club_id
      AND ag.coordinator_id = p_profile_id
  )
  INTO v_is_coordinator;

  SELECT EXISTS (
    SELECT 1
    FROM public.age_group_staff ags
    WHERE ags.club_id = p_club_id
      AND ags.profile_id = p_profile_id
  )
  INTO v_is_staff;

  IF v_is_coordinator THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (p_club_id, p_profile_id, 'club_coordinator')
    ON CONFLICT (club_id, profile_id)
    DO UPDATE SET role =
      CASE
        WHEN public.club_memberships.role IN ('owner', 'admin') THEN public.club_memberships.role
        ELSE 'club_coordinator'
      END;
    RETURN;
  END IF;

  IF v_is_staff THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (p_club_id, p_profile_id, 'staff')
    ON CONFLICT (club_id, profile_id)
    DO UPDATE SET role =
      CASE
        WHEN public.club_memberships.role IN ('owner', 'admin', 'club_coordinator') THEN public.club_memberships.role
        ELSE 'staff'
      END;
    RETURN;
  END IF;

  -- Não é coordinator nem staff: remover membership residual
  DELETE FROM public.club_memberships
  WHERE club_id = p_club_id
    AND profile_id = p_profile_id
    AND role NOT IN ('owner', 'admin', 'club_coordinator');
END;
$$;

-- ─── 3. Atualizar CHECK constraints ────────────────────────────────────────

-- club_memberships: remover 'coordinator' e 'club_admin'
ALTER TABLE public.club_memberships
  DROP CONSTRAINT IF EXISTS club_memberships_role_check;

ALTER TABLE public.club_memberships
  ADD CONSTRAINT club_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'club_coordinator', 'staff'));

-- age_group_staff: remover 'coordinator'
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
    'age_group_coordinator'
  ));

-- team_staff: remover 'coordinator' e 'coach'
ALTER TABLE public.team_staff
  DROP CONSTRAINT IF EXISTS team_staff_role_check;

ALTER TABLE public.team_staff
  ADD CONSTRAINT team_staff_role_check
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
    'age_group_coordinator'
  ));
