-- Fecha 3 erros do Supabase Security Advisor:
-- 1) public.notification_inbox: SECURITY DEFINER view -> security_invoker
-- 2) public.player_season_stats: SECURITY DEFINER view -> security_invoker
-- 3) public.age_group_club_rehome_audit: tabela sem RLS + GRANTs perigosos a anon/authenticated
--    -> REVOKE escrita, ENABLE RLS, policy de leitura restrita a super coordinator.
--
-- As tabelas-base das views ja tem RLS por user_id/user_can_access_*; security_invoker
-- e seguro porque os utilizadores legitimos continuam a ver as suas linhas.
--
-- A funcao rehome_age_group_to_dedicated_technical_club continua a escrever na tabela
-- de auditoria sem problema, porque corre como SECURITY DEFINER (ignora RLS e os GRANTs
-- de anon/authenticated).

-- ============================================================
-- Erros 1 e 2: views com security_invoker
-- ============================================================

ALTER VIEW public.notification_inbox SET (security_invoker = true);
ALTER VIEW public.player_season_stats SET (security_invoker = true);

-- ============================================================
-- Erro 3: tabela de auditoria
-- ============================================================

-- Revogar todos os privilegios de anon e authenticated (e excessivo: SELECT/INSERT/UPDATE/DELETE/TRUNCATE).
REVOKE ALL ON TABLE public.age_group_club_rehome_audit FROM anon;
REVOKE ALL ON TABLE public.age_group_club_rehome_audit FROM authenticated;

-- Apenas SELECT a authenticated (RLS a seguir restringe a super coordinator).
GRANT SELECT ON TABLE public.age_group_club_rehome_audit TO authenticated;

-- Activar RLS e criar policy de leitura.
ALTER TABLE public.age_group_club_rehome_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rehome_audit_read_super"
  ON public.age_group_club_rehome_audit
  FOR SELECT
  TO authenticated
  USING (public.user_is_super_coordinator());
