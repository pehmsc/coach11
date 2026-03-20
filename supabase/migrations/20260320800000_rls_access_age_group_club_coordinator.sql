-- Fix: user_can_access_age_group_v2 não reconhecia club_coordinators.
-- Um coordenador de clube (via club_memberships) não conseguia aceder
-- a players, games, trainings dos escalões do seu clube.

CREATE OR REPLACE FUNCTION public.user_can_access_age_group_v2(p_age_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.age_groups ag
    WHERE ag.id = p_age_group_id
      AND (
        public.user_is_super_coordinator()
        OR ag.coordinator_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.age_group_staff ags
          WHERE ags.age_group_id = ag.id
            AND ags.profile_id = auth.uid()
        )
        -- Club coordinator: acesso a todos os escalões do clube
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE cm.club_id = ag.club_id
            AND cm.profile_id = auth.uid()
        )
      )
  );
$$;
