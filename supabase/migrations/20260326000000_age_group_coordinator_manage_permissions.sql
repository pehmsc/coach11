-- Fix: user_can_manage_age_group_v2 não reconhecia age_group_coordinator.
-- Um membro do staff com role='age_group_coordinator' em age_group_staff
-- tem permissões equivalentes a coordenador funcional no seu escalão:
--   - pode apagar jogos, treinos, jogadores
--   - isCoordinator = true nos RPCs de acesso (rpc_game_access_context, etc.)
--   - pode editar jogos/treinos terminados

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
        -- Coordenador do clube: pode gerir todos os escalões do seu clube
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE cm.club_id = ag.club_id
            AND cm.profile_id = auth.uid()
            AND cm.role = 'club_coordinator'
        )
        -- Coordenador funcional do escalão: permissões de gestão no seu escalão
        OR EXISTS (
          SELECT 1
          FROM public.age_group_staff ags
          WHERE ags.age_group_id = ag.id
            AND ags.profile_id = auth.uid()
            AND ags.role = 'age_group_coordinator'
        )
      )
  );
$$;
