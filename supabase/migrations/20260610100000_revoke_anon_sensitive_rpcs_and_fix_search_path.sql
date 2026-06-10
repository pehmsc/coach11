-- SEC-02: RPCs SECURITY DEFINER executaveis por anon (auditoria 2026-06-10).
-- Revogar EXECUTE de anon nas 7 funcoes sensiveis. As funcoes utilitarias de
-- migracao/manutencao nao tem nenhum chamador em src/ (verificado por grep na
-- Fase 1) e passam a ser exclusivas do service_role: revogar tambem de
-- authenticated. O service_role nao e afectado por estes REVOKEs.

-- RPCs de jogo
REVOKE EXECUTE ON FUNCTION public.rpc_correct_initial_lineup(uuid, jsonb, text) FROM anon;

-- rpc_finalize_game nunca e chamada directamente pela app (apenas via wrapper
-- SECURITY DEFINER rpc_finalize_game_auth, cuja chamada interna e verificada
-- contra o owner da funcao) -> revogar de anon E de authenticated.
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean) FROM anon, authenticated;

-- Funcoes utilitarias de manutencao (so service_role)
REVOKE EXECUTE ON FUNCTION public.repair_club_membership_state(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_rows_club_id_by_ids(text, text, uuid[], uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_rows_club_id_by_age_group(text, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rehome_age_group_to_dedicated_technical_club(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_rows_by_ids(text, text, uuid[]) FROM anon, authenticated;

-- SEC-03: funcoes de trigger sem search_path fixo (proconfig = null).
-- Apenas ALTER SET search_path; corpo das funcoes intocado.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_initial_lineup_immutability() SET search_path = public, pg_temp;
