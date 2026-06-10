-- SEC-01: a policy profiles_read_authenticated_v1 tinha qual = true, expondo
-- todos os perfis (nome, email, telefone) a qualquer utilizador autenticado de
-- qualquer clube. Substituir por "proprio perfil OU partilha de clube OU super
-- coordinator".
--
-- Cobertura verificada na Fase 1: todos os registos de team_staff e
-- age_group_staff tem club_membership no clube respectivo, por isso os dois
-- consumidores session-client de perfis de terceiros (/api/me/context e
-- StaffSection) continuam a funcionar.

-- Helper SECURITY DEFINER para evitar recursao de RLS em club_memberships
-- (mesma regra dos helpers user_can_access_*). Nao existe funcao previa com
-- este nome (verificado em pg_proc na Fase 1).
CREATE FUNCTION public.user_shares_club_with(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM club_memberships me
    JOIN club_memberships them ON them.club_id = me.club_id
    WHERE me.profile_id = (select auth.uid())
      AND them.profile_id = target_profile_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_shares_club_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_shares_club_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_read_authenticated_v1" ON public.profiles;

CREATE POLICY "profiles_read_same_club_v1" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = id
    OR public.user_shares_club_with(id)
    OR public.user_is_super_coordinator()
  );
