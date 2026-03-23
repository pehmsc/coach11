-- Fix: user_can_manage_age_group_v2 não incluía club_coordinators.
-- Um coordenador de clube (via club_memberships com role='club_coordinator')
-- deve poder gerir (editar/apagar) qualquer escalão do seu clube.

CREATE OR REPLACE FUNCTION public.user_can_manage_age_group_v2(p_age_group_id uuid)
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
        -- Club coordinator: pode gerir todos os escalões do seu clube
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE cm.club_id = ag.club_id
            AND cm.profile_id = auth.uid()
            AND cm.role = 'club_coordinator'
        )
      )
  );
$$;
