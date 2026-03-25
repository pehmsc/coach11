-- Fix: remover user_can_access_club da função user_is_game_coordinator.
-- A função anterior usava user_can_access_club como boundary funcional,
-- o que viola as regras de arquitectura (club-first via club_memberships/age_groups).
-- As condições OR já garantem o scope correcto sem wrapper de clube.

CREATE OR REPLACE FUNCTION public.user_is_game_coordinator(p_game_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1
    from public.games g
    left join public.age_groups ag on ag.id = g.age_group_id
    where g.id = p_game_id
      and (
        -- Super coordenador
        public.user_is_super_coordinator()
        -- Coordenador directo do escalão
        or (g.age_group_id is not null and ag.coordinator_id = auth.uid())
        -- Coordenador da equipa
        or (g.team_id is not null and public.user_is_team_coordinator(g.team_id))
        -- Coordenador funcional do escalão via age_group_staff
        or (g.age_group_id is not null and exists (
          select 1 from public.age_group_staff ags
          where ags.age_group_id = g.age_group_id
            and ags.profile_id = auth.uid()
            and ags.role = 'age_group_coordinator'
        ))
        -- Coordenador do clube via club_memberships
        or (ag.club_id is not null and exists (
          select 1 from public.club_memberships cm
          where cm.club_id = ag.club_id
            and cm.profile_id = auth.uid()
            and cm.role = 'club_coordinator'
        ))
      )
  );
$$;
