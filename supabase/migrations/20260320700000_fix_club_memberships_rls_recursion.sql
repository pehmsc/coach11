-- Remove policies recursivas que causavam infinite recursion em club_memberships.
-- Subqueries na própria tabela club_memberships causavam loop infinito,
-- resultando em auth.uid() a retornar null silenciosamente e a query
-- a devolver zero rows — bloqueando o acesso de club_coordinators.

DROP POLICY IF EXISTS "club_members_can_read_memberships" ON club_memberships;
DROP POLICY IF EXISTS "club_admins_can_manage_memberships" ON club_memberships;

-- Policy simples e não-recursiva para leitura própria
DROP POLICY IF EXISTS "club_memberships_own_select" ON club_memberships;
CREATE POLICY "club_memberships_own_select"
ON club_memberships FOR SELECT
USING (profile_id = auth.uid());
